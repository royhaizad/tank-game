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

// AI difficulty ladder, per GAME_SPEC.md section 5. A tier is just its AI
// class; each class carries its own ammo limits (maxActiveBullets /
// fireCooldownDuration), so adding a tier means adding one line here and
// enabling its button in menu.js — nothing else in main.js changes.
const AI_TIERS = {
  easy: () => new EasyAI(),
  hard: () => new HardAI()
};

let winner = null; // { label, kind } of whoever's left standing, or null for a draw
let pendingConfirmAction = null; // 'rematch' | 'changeDifficulty' | 'quitToTitle', while screen === 'pauseConfirm'
let awaitingRebind = null; // { playerIndex, action } while waiting for a keypress, on briefing or controls screens
let briefingStatsOpen = false; // whether the Session Stats modal is showing on top of the briefing screen

let maze, matchTanks, bullets;

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

const PLAYER_AUTO_FIRE_INTERVAL = 0.5; // s, between auto-fired shots while the fire key is held

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
    const tank = new Tank(spawn.x, spawn.y, Menu.AI_COLORS[i]);
    const tier = AI_TIERS[config.aiDifficulties[i]] || AI_TIERS.easy;
    const ai = tier();
    // AI ammo override, per GAME_SPEC.md section 5 — each tier's own limits.
    tank.maxActiveBullets = ai.maxActiveBullets;
    tank.fireCooldownDuration = ai.fireCooldownDuration;
    matchTanks.push({ tank, kind: 'ai', label: `AI${i + 1}`, ai });
  }

  matchTanks.forEach((entry) => ensureStats(entry.label));

  bullets = [];
  winner = null;
  screen = 'match';
}

function fireIfPossible(tank, angleSource) {
  if (!tank.canFire(activeBulletCount(tank))) return;
  const tip = tank.getBarrelTip();
  bullets.push(new Bullet(tip.x, tip.y, angleSource.angle, tank));
  tank.cooldownRemaining = tank.fireCooldownDuration;
}

function updateMatch(dt) {
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

      if (Input.justPressed[bindings.fire]) {
        if (maze.isBarrelBlocked(entry.tank)) {
          AudioEngine.playEmptyFireClick();
        } else {
          fireIfPossible(entry.tank, entry.tank);
        }
        entry.autoFireTimer = PLAYER_AUTO_FIRE_INTERVAL;
      } else if (Input.keys[bindings.fire]) {
        entry.autoFireTimer -= dt;
        if (entry.autoFireTimer <= 0) {
          if (maze.isBarrelBlocked(entry.tank)) {
            AudioEngine.playEmptyFireClick();
          } else {
            fireIfPossible(entry.tank, entry.tank);
          }
          entry.autoFireTimer = PLAYER_AUTO_FIRE_INTERVAL;
        }
      } else {
        entry.autoFireTimer = 0;
      }
    } else {
      const opponents = matchTanks.filter((other) => other !== entry).map((other) => other.tank);
      // `bullets` is only used by tiers that dodge (see HardAI); EasyAI
      // ignores the extra argument, so it's passed unconditionally.
      const decision = entry.ai.update(dt, entry.tank, opponents, maze, bullets);
      entry.tank.update(dt, decision.keys);
      maze.resolveTankCollision(entry.tank);

      if (decision.wantsToFire && !maze.isBarrelBlocked(entry.tank)) {
        fireIfPossible(entry.tank, entry.tank);
      }
    }
  });

  bullets.forEach((bullet) => bullet.update(dt, maze));

  // Free-for-all, per GAME_SPEC.md section 9: a bullet destroys whatever
  // tank it touches, regardless of who fired it or who's driving either.
  bullets.forEach((bullet) => {
    if (!bullet.alive) return;
    matchTanks.forEach((entry) => {
      if (entry.tank.destroyed) return;
      const dx = bullet.x - entry.tank.x;
      const dy = bullet.y - entry.tank.y;
      const hitDistance = bullet.radius + entry.tank.radius;
      if (dx * dx + dy * dy <= hitDistance * hitDistance) {
        entry.tank.destroyed = true;
        bullet.alive = false;
        ensureStats(entry.label).deaths++;
        // Self-kill via own ricochet is intentional (GAME_SPEC.md section
        // 3.2) but doesn't award the shooter a kill against themselves.
        if (bullet.owner !== entry.tank) {
          const killer = matchTanks.find((other) => other.tank === bullet.owner);
          if (killer) ensureStats(killer.label).kills++;
        }
      }
    });
  });

  bullets = bullets.filter((bullet) => bullet.alive);

  const survivors = matchTanks.filter((entry) => !entry.tank.destroyed);
  if (survivors.length <= 1) {
    winner = survivors.length === 1 ? { label: survivors[0].label, kind: survivors[0].kind } : null;
    if (winner) ensureStats(winner.label).wins++;
    screen = 'result';
  }
}

function drawMatchScene() {
  maze.draw(ctx);

  matchTanks.forEach((entry) => {
    if (entry.tank.destroyed) return;
    entry.tank.draw(ctx);

    ctx.fillStyle = '#fff';
    ctx.font = 'bold 10px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(entry.label, entry.tank.x, entry.tank.y - entry.tank.radius - 6);
  });

  bullets.forEach((bullet) => bullet.draw(ctx));

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
    if (AI_TIERS[tier]) config.aiDifficulties[Number(aiIndex)] = tier;
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
