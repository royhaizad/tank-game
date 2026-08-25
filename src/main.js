const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

const menu = new Menu(canvas);
const hud = new Hud();

// 'title' | 'briefing' | 'match' | 'paused' | 'pauseConfirm' | 'controls' | 'result'
let screen = 'title';

// Mission Briefing config, per GAME_SPEC.md section 6.
const config = {
  playerCount: 1,
  aiCount: 1,
  aiDifficulties: ['easy', 'easy', 'easy'] // per AI slot; only the first aiCount are used
};

// AI difficulty ladder, per GAME_SPEC.md section 5: one factory per built
// tier. A tier missing from this table is one that isn't built yet — the
// Mission Briefing greys those out (see menu.js) and handleBriefingClick
// refuses to select them.
const AI_TIERS = {
  easy: () => new EasyAI(),
  medium: () => new MediumAI(),
  hard: () => new HardAI()
};

// Ammo limits (maxActiveBullets / fireCooldownDuration — see Tank fields)
// are normally owned by the AI class's own constructor (see EasyAI,
// HardAI) so each tier's numbers live in exactly one place. MediumAI
// deliberately doesn't declare its own (see its file header: ammo is "a
// property of the Tank, not the brain"), so its numbers are overridden
// here instead, per GAME_SPEC.md section 5.
const AI_AMMO_OVERRIDES = {
  medium: { maxActiveBullets: 2, fireCooldownDuration: 0.6 }
};

let winner = null; // { label, kind } of whoever's left standing, or null for a draw
let pendingConfirmAction = null; // 'rematch' | 'changeDifficulty' | 'quitToTitle', while screen === 'pauseConfirm'
let awaitingRebind = null; // { playerIndex, action } while waiting for a keypress, on briefing or controls screens
let briefingStatsOpen = false; // whether the Session Stats modal is showing on top of the briefing screen

// Live match state. crates/mines/beams/shrapnel are the power-up side of
// it (GAME_SPEC.md section 4); each is rebuilt fresh every match, per
// section 10's "power-up state fully reset every new match".
let maze, matchTanks, bullets, crates, mines, beams, shrapnel, explosions;

// Seconds left before the match actually switches to the Result screen,
// once a win/draw is detected — null while the match is still live. Lets
// the last kill's explosion play out instead of cutting straight to
// Result.
const RESULT_DELAY = 2; // s
let matchEndTimer = null;

// Session-only Kill/Death/Win tallies per HANDOFF.md "Session B" decisions:
// in-session tallies (not a ranking system), keyed by slot label (P1/AI1/...)
// so they survive Rematch, Change Difficulty, and Back to Title. Only an
// explicit Reset button clears them; a page refresh also clears them since
// nothing is persisted (no localStorage, per the no-backend/no-saves rule).
const stats = {};

function ensureStats(label) {
  if (!stats[label]) stats[label] = { kills: 0, deaths: 0, wins: 0 };
  return stats[label];
}

function resetStats() {
  for (const label in stats) delete stats[label];
}

function activeBulletCount(tank) {
  return bullets.reduce((count, bullet) => count + (bullet.alive && bullet.owner === tank ? 1 : 0), 0);
}

function startMatch() {
  const total = config.playerCount + config.aiCount;
  maze = new Maze(8, 6, 80); // 8*80=640, 6*80=480, matches the canvas size
  const spawnPoints = maze.getSpawnPoints(total);

  matchTanks = [];
  let spawnIndex = 0;

  for (let i = 0; i < config.playerCount; i++) {
    const spawn = spawnPoints[spawnIndex++];
    const tank = new Tank(spawn.x, spawn.y, Menu.PLAYER_COLORS[i]);
    matchTanks.push({ tank, kind: 'player', label: `P${i + 1}`, playerIndex: i, autoFireTimer: 0 });
  }

  for (let i = 0; i < config.aiCount; i++) {
    const spawn = spawnPoints[spawnIndex++];
    const tierId = config.aiDifficulties[i];
    const makeAI = AI_TIERS[tierId] || AI_TIERS.easy;
    const ai = makeAI();
    const ammoOverride = AI_AMMO_OVERRIDES[tierId];
    const tank = new Tank(spawn.x, spawn.y, Menu.AI_COLORS[i]);
    // AI ammo override, per GAME_SPEC.md section 5 — each tier's own limits.
    tank.maxActiveBullets = ammoOverride ? ammoOverride.maxActiveBullets : ai.maxActiveBullets;
    tank.fireCooldownDuration = ammoOverride ? ammoOverride.fireCooldownDuration : ai.fireCooldownDuration;
    matchTanks.push({ tank, kind: 'ai', label: `AI${i + 1}`, ai });
  }

  matchTanks.forEach((entry) => ensureStats(entry.label));

  bullets = [];
  crates = new CrateField(maze);
  mines = new MineField();
  beams = [];
  shrapnel = [];
  explosions = [];
  matchEndTimer = null;
  winner = null;
  screen = 'match';
}

// Single entry point for "this tank pressed fire" — what that actually
// spawns (bullet, pellet spread, mine, laser beam) is the equipped
// weapon's business, see WeaponFire.fire in weapon.js.
// clickWhenBlocked: play the rejected-fire click when a wall is in the
// way. Players get that feedback; AI tanks just silently don't fire.
function tryFire(tank, clickWhenBlocked) {
  // A held shield charge activates the instant fire is pressed, whether
  // or not the actual weapon shot below goes through — pressing shoot is
  // what "uses" it, per GAME_SPEC.md section 4.
  if (tank.tryActivateShieldCharge()) AudioEngine.playShieldActivate();

  if (WeaponFire.needsClearBarrel(tank) && maze.isBarrelBlocked(tank)) {
    if (clickWhenBlocked) AudioEngine.playEmptyFireClick();
    return;
  }
  if (!tank.canFire(activeBulletCount(tank))) return;

  WeaponFire.fire(tank, maze, bullets, mines, beams);
  tank.cooldownRemaining = tank.effectiveFireCooldown();
}

// Removes a tank from play, spawns its explosion, and books the stats,
// per GAME_SPEC.md section 9.1. Shared by every lethal thing in a match
// (bullets, mine shrapnel, laser beams) so a kill is credited the same
// way no matter what caused it. A self-kill counts as a death but never
// as a kill (section 3.2).
function destroyTank(entry, ownerTank) {
  if (entry.tank.destroyed) return;

  entry.tank.destroyed = true;
  explosions.push(new Explosion(entry.tank.x, entry.tank.y));
  ensureStats(entry.label).deaths++;

  if (ownerTank && ownerTank !== entry.tank) {
    const killer = matchTanks.find((other) => other.tank === ownerTank);
    if (killer) ensureStats(killer.label).kills++;
  }
}

function updateMatch(dt) {
  // Once a win/draw is detected, freeze the battlefield exactly as it
  // stood at that moment — only the explosion(s) keep animating — for
  // RESULT_DELAY seconds before actually switching to the Result screen.
  if (matchEndTimer !== null) {
    explosions.forEach((explosion) => explosion.update(dt));
    explosions = explosions.filter((explosion) => explosion.alive);

    matchEndTimer -= dt;
    if (matchEndTimer <= 0) {
      matchEndTimer = null;
      screen = 'result';
    }
    return;
  }

  matchTanks.forEach((entry) => {
    if (entry.tank.destroyed) return;

    if (entry.kind === 'player') {
      const bindings = Input.playerBindings[entry.playerIndex];
      const actions = {
        forward: Input.keys[bindings.forward],
        backward: Input.keys[bindings.backward],
        left: Input.keys[bindings.left],
        right: Input.keys[bindings.right]
      };
      entry.tank.update(dt, actions);
      maze.resolveTankCollision(entry.tank);

      // Hold-to-repeat pacing comes from the equipped weapon: 0.5s for the
      // base cannon (GAME_SPEC.md section 3.2), 0.09s for the gatling, and
      // Infinity for the one-shot weapons so they need a fresh keypress.
      if (Input.justPressed[bindings.fire]) {
        tryFire(entry.tank, true);
        entry.autoFireTimer = entry.tank.autoFireInterval();
      } else if (Input.keys[bindings.fire]) {
        entry.autoFireTimer -= dt;
        if (entry.autoFireTimer <= 0) {
          tryFire(entry.tank, true);
          entry.autoFireTimer = entry.tank.autoFireInterval();
        }
      } else {
        entry.autoFireTimer = 0;
      }
    } else {
      const opponents = matchTanks.filter((other) => other !== entry).map((other) => other.tank);
      // Bullets in flight are passed to every tier uniformly; only tiers
      // that dodge (Medium and up) actually look at them.
      const decision = entry.ai.update(dt, entry.tank, opponents, maze, bullets);
      entry.tank.update(dt, decision.keys);
      maze.resolveTankCollision(entry.tank);

      if (decision.wantsToFire) tryFire(entry.tank, false);
    }
  });

  // Power-ups, per GAME_SPEC.md section 4. Crates handle their own spawn
  // cadence and pickups; laser beams report who they caught so those
  // kills go through the same destroyTank() path as bullet kills.
  const crateEvents = crates.update(dt, matchTanks);
  if (crateEvents.spawned) AudioEngine.playPowerupSpawn();
  if (crateEvents.pickups.length > 0) AudioEngine.playPowerupEquip();

  // Mines no longer kill on contact — stepping on one reveals it, and
  // stepping back off it detonates it into shrapnel (see mine.js), which
  // is the only thing that actually kills anyone.
  const mineEvents = mines.update(dt, matchTanks);
  if (mineEvents.revealed) AudioEngine.playMineReveal();
  if (mineEvents.exploded) AudioEngine.playMineExplode();
  shrapnel.push(...mineEvents.shrapnel);

  beams.forEach((beam) => {
    beam.update(dt, matchTanks);
    beam.pendingHits.forEach((victim) => destroyTank(victim, beam.owner));
    beam.pendingHits = [];
  });
  beams = beams.filter((beam) => beam.alive);

  // matchTanks goes along for the homing missile, which needs every tank's
  // position to pick the nearest one (see Bullet._steerTowardNearestTank).
  bullets.forEach((bullet) => bullet.update(dt, maze, matchTanks));

  shrapnel.forEach((piece) => piece.update(dt, maze));
  shrapnel.forEach((piece) => {
    matchTanks.forEach((entry) => {
      if (!piece.alive || entry.tank.destroyed) return;
      const dx = piece.x - entry.tank.x;
      const dy = piece.y - entry.tank.y;

      // A shield absorbs shrapnel outright at the bubble's edge — shrapnel
      // doesn't bounce off anything (per GAME_SPEC.md section 4), so unlike
      // a deflected bullet it's simply consumed rather than reflected away.
      const shielded = entry.tank.hasShield();
      const hitDistance = piece.radius + (shielded ? entry.tank.shieldRadius : entry.tank.radius);
      if (dx * dx + dy * dy > hitDistance * hitDistance) return;

      piece.alive = false;
      if (!shielded) destroyTank(entry, piece.owner);
    });
  });
  shrapnel = shrapnel.filter((piece) => piece.alive);

  // Free-for-all, per GAME_SPEC.md section 9: a bullet destroys whatever
  // tank it touches, regardless of who fired it or who's driving either.
  bullets.forEach((bullet) => {
    matchTanks.forEach((entry) => {
      // A bullet is consumed by whatever it destroys, so once it's spent
      // it can't go on to hit a second tank later in the same pass.
      if (!bullet.alive || entry.tank.destroyed) return;

      const dx = bullet.x - entry.tank.x;
      const dy = bullet.y - entry.tank.y;

      // A shield deflects ANY bullet off the bubble surface, including its
      // own wearer's returning ricochet (GAME_SPEC.md section 4) — a real
      // mirror, not just an enemy-only ward.
      const shielded = entry.tank.hasShield();
      const hitDistance = bullet.radius + (shielded ? entry.tank.shieldRadius : entry.tank.radius);
      if (dx * dx + dy * dy > hitDistance * hitDistance) return;

      if (shielded) {
        bullet.deflectOff(entry.tank);
        return;
      }

      bullet.alive = false;
      destroyTank(entry, bullet.owner);
    });
  });

  bullets = bullets.filter((bullet) => bullet.alive);

  explosions.forEach((explosion) => explosion.update(dt));
  explosions = explosions.filter((explosion) => explosion.alive);

  const survivors = matchTanks.filter((entry) => !entry.tank.destroyed);
  if (survivors.length <= 1) {
    winner = survivors.length === 1 ? { label: survivors[0].label, kind: survivors[0].kind } : null;
    if (winner) ensureStats(winner.label).wins++;
    matchEndTimer = RESULT_DELAY;
  }
}

function drawMatchScene() {
  maze.draw(ctx);
  crates.draw(ctx);
  mines.draw(ctx); // only the ones still inside their 1s visible window

  matchTanks.forEach((entry) => {
    if (entry.tank.destroyed) return;

    // The laser's dotted aim line is drawn for everyone to see — it's half
    // of the laser's drawback (GAME_SPEC.md section 4).
    if (entry.tank.weapon === Weapons.LASER) LaserBeam.drawPreview(ctx, entry.tank, maze);

    entry.tank.draw(ctx);

    ctx.fillStyle = '#fff';
    ctx.font = 'bold 10px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(entry.label, entry.tank.x, entry.tank.y - entry.tank.radius - 6);
  });

  bullets.forEach((bullet) => bullet.draw(ctx));
  beams.forEach((beam) => beam.draw(ctx));
  shrapnel.forEach((piece) => piece.draw(ctx));
  explosions.forEach((explosion) => explosion.draw(ctx));

  const playerEntries = matchTanks.filter((entry) => entry.kind === 'player');
  hud.draw(ctx, canvas, playerEntries, activeBulletCount, stats);
}

function confirmMessage(action) {
  if (action === 'rematch') return 'Start a new match?';
  if (action === 'changeDifficulty') return 'Abandon this match and reconfigure forces?';
  if (action === 'quitToTitle') return 'Abandon this match and return to the title screen?';
  return '';
}

// Esc (or whatever's bound to "pause") toggles pause during a match, and
// otherwise acts as a universal cancel/back for the pause submenus. Pause
// is fixed to Esc and never rebindable, per GAME_SPEC.md section 7.
function handlePauseToggle() {
  if (!Input.justPressed[Input.pauseKey]) return;

  if (screen === 'match') {
    screen = 'paused';
  } else if (screen === 'paused') {
    screen = 'match';
  } else if (screen === 'pauseConfirm') {
    pendingConfirmAction = null;
    screen = 'paused';
  } else if (screen === 'controls') {
    if (awaitingRebind) {
      awaitingRebind = null;
    } else {
      screen = 'paused';
    }
  }
}

// While waiting for a rebind, the next non-Escape key pressed becomes the
// new binding (handlePauseToggle handles Escape as "cancel" before this
// runs, so by the time we get here awaiting has already been cleared if
// Escape was the key pressed). Active on both the briefing and pause-menu
// controls screens.
function handleRebindCapture() {
  if ((screen !== 'controls' && screen !== 'briefing') || !awaitingRebind) return;

  for (const key in Input.justPressed) {
    if (!Input.justPressed[key] || key === 'escape') continue;
    Input.rebind(awaitingRebind.playerIndex, awaitingRebind.action, key);
    awaitingRebind = null;
    break;
  }
}

function handleBriefingClick(clicked) {
  if (clicked.startsWith('players:')) {
    config.playerCount = Number(clicked.split(':')[1]) + 1;
    if (config.aiCount === 0 && config.playerCount < 2) config.aiCount = 1;
  } else if (clicked.startsWith('ai:')) {
    const count = Number(clicked.split(':')[1]);
    if (count === 0 && config.playerCount < 2) return; // disabled per GAME_SPEC.md section 6
    config.aiCount = count;
  } else if (clicked.startsWith('diff:')) {
    const [, aiIndex, tier] = clicked.split(':');
    if (AI_TIERS[tier]) config.aiDifficulties[Number(aiIndex)] = tier; // unbuilt tiers stay unselectable, per GAME_SPEC.md section 6
  } else if (clicked.startsWith('rebind:')) {
    const [, playerIndex, action] = clicked.split(':');
    awaitingRebind = { playerIndex: Number(playerIndex), action };
  } else if (clicked === 'briefingBack') {
    screen = 'title';
  } else if (clicked === 'battle' && config.playerCount + config.aiCount >= 2) {
    startMatch();
  } else if (clicked === 'viewStats') {
    awaitingRebind = null; // don't leave a hidden rebind capturing keys behind the modal
    briefingStatsOpen = true;
  } else if (clicked === 'closeStats') {
    briefingStatsOpen = false;
  }
}

function handleMenuClick() {
  const clicked = menu.consumeClick();
  if (!clicked) return;

  // Reachable from both the Result screen scoreboard and the Briefing
  // stats modal — same button id, same effect, so handle it once here
  // regardless of which screen it was clicked from.
  if (clicked === 'resetStats') {
    resetStats();
    return;
  }

  if (screen === 'title' && clicked === 'play') {
    screen = 'briefing';
  } else if (screen === 'briefing') {
    handleBriefingClick(clicked);
  } else if (screen === 'result') {
    if (clicked === 'rematch') startMatch();
    else if (clicked === 'changeDifficulty') screen = 'briefing';
    else if (clicked === 'title') screen = 'title';
  } else if (screen === 'paused') {
    if (clicked === 'resume') screen = 'match';
    else if (clicked === 'changeControls') screen = 'controls';
    else if (clicked === 'rematch' || clicked === 'changeDifficulty' || clicked === 'quitToTitle') {
      pendingConfirmAction = clicked;
      screen = 'pauseConfirm';
    }
  } else if (screen === 'pauseConfirm') {
    if (clicked === 'yes') {
      if (pendingConfirmAction === 'rematch') startMatch();
      else if (pendingConfirmAction === 'changeDifficulty') screen = 'briefing';
      else if (pendingConfirmAction === 'quitToTitle') screen = 'title';
      pendingConfirmAction = null;
    } else if (clicked === 'no') {
      pendingConfirmAction = null;
      screen = 'paused';
    }
  } else if (screen === 'controls') {
    if (clicked === 'back') screen = 'paused';
    else if (clicked.startsWith('rebind:')) {
      const [, playerIndex, action] = clicked.split(':');
      awaitingRebind = { playerIndex: Number(playerIndex), action };
    }
  }
}

startLoop(
  (dt) => {
    handlePauseToggle();
    handleRebindCapture();
    handleMenuClick();
    if (screen === 'match') updateMatch(dt);
    Input.update();
  },
  () => {
    if (screen === 'title') {
      menu.drawTitleScreen(ctx, canvas);
    } else if (screen === 'briefing') {
      menu.drawBriefingScreen(ctx, canvas, config, awaitingRebind, stats);
      if (briefingStatsOpen) menu.drawStatsModal(ctx, canvas, stats);
    } else if (screen === 'match') {
      drawMatchScene();
    } else if (screen === 'paused') {
      drawMatchScene();
      menu.drawPauseMenu(ctx, canvas);
    } else if (screen === 'pauseConfirm') {
      drawMatchScene();
      menu.drawPauseMenu(ctx, canvas);
      menu.drawConfirmDialog(ctx, canvas, confirmMessage(pendingConfirmAction));
    } else if (screen === 'controls') {
      menu.drawControlsScreen(ctx, canvas, config.playerCount, awaitingRebind);
    } else if (screen === 'result') {
      menu.drawResultScreen(ctx, canvas, winner, stats);
    }
  }
);
