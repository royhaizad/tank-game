const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

const menu = new Menu(canvas);
const hud = new Hud();

// 'title' | 'briefing' | 'teamAssign' | 'match' | 'paused' | 'pauseConfirm' | 'controls' | 'result'
let screen = 'title';

// Mission Briefing config, per GAME_SPEC.md section 6.
const config = {
  playerCount: 1,
  aiCount: 1,
  aiDifficulties: ['easy', 'easy', 'easy'], // per AI slot; only the first aiCount are used

  // Team mode, per GAME_SPEC.md section 9.2. All-vs-all (teamMode false) is
  // the default and is untouched by any of this. Assignments are keyed by
  // slot label like `stats` is, so they survive changing the player/AI
  // counts, switching match type, and coming back from a match. Default
  // split is every human on Team 1 vs every AI on Team 2; any tank can be
  // dragged to either team on the Team Setup screen, uneven teams allowed.
  teamMode: false,
  teams: { P1: '1', P2: '1', P3: '1', AI1: '2', AI2: '2', AI3: '2' },

  // Custom names, per GAME_SPEC.md section 9.4. Empty string means "use the
  // default", so P1 stays P1 until someone types something. These live in
  // config rather than alongside `stats` on purpose: they're configuration,
  // which is what makes Reset Stats leave them alone. Stats stay keyed by
  // slot label internally, so renaming a tank keeps its history.
  tankNames: { P1: '', P2: '', P3: '', AI1: '', AI2: '', AI3: '' },
  teamNames: { 1: '', 2: '' }
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
let scoreboardOpen = false; // Scoreboard modal (tank + team tables), over Briefing or the Result screen
let awardsOpen = false; // Awards modal, opened from the Scoreboard modal and drawn over it
let resetConfirmOpen = false; // Yes/No confirmation over the Scoreboard modal, before stats are wiped
let editingName = null; // { kind: 'tank'|'team', key, buffer, original } while typing a name, per GAME_SPEC.md 9.4
let pendingNameConfirm = null; // the just-abandoned editingName, while the Keep/Discard dialog is up

// Credits-scene award reveal (GAME_SPEC.md section 9.3): each context that
// shows awards paces its own reveal independently, so opening the Awards
// modal from a fresh Result screen doesn't inherit its progress.
const resultAwardsReveal = { index: 0, timer: 0 };
const modalAwardsReveal = { index: 0, timer: 0 };
const AWARD_REVEAL_HOLD = 1.5; // s an award holds before auto-advancing to the next
const AWARD_FADE_DURATION = 0.3; // s the newest award takes to fade in

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

// Team tallies (GAME_SPEC.md section 9.2), kept separately from the per-tank
// ones rather than summed from them on demand: teams get reshuffled between
// matches, so a kill has to be credited to whichever team that tank was on
// at the time, which a live sum of the current roster would get wrong.
const teamStats = {};

function ensureStats(label) {
  // selfKills/teamKills feed the awards in src/ui/awards.js; they're extra
  // detail on top of the Win/Kill/Death tallies, not a replacement.
  if (!stats[label]) stats[label] = { kills: 0, deaths: 0, wins: 0, selfKills: 0, teamKills: 0 };
  return stats[label];
}

function ensureTeamStats(teamId) {
  if (!teamStats[teamId]) teamStats[teamId] = { kills: 0, deaths: 0, wins: 0 };
  return teamStats[teamId];
}

function resetStats() {
  for (const label in stats) delete stats[label];
  for (const teamId in teamStats) delete teamStats[teamId];
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

  // `team` is '1'/'2' in team mode and null in all-vs-all, so every place
  // that branches on teams can just check config.teamMode and read it.
  const teamFor = (label) => (config.teamMode ? Menu.teamOf(config, label) : null);

  for (let i = 0; i < config.playerCount; i++) {
    const spawn = spawnPoints[spawnIndex++];
    const tank = new Tank(spawn.x, spawn.y, Menu.PLAYER_COLORS[i]);
    const label = `P${i + 1}`;
    matchTanks.push({ tank, kind: 'player', label, playerIndex: i, autoFireTimer: 0, team: teamFor(label) });
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
    const label = `AI${i + 1}`;
    matchTanks.push({ tank, kind: 'ai', label, ai, team: teamFor(label) });
  }

  matchTanks.forEach((entry) => ensureStats(entry.label));
  if (config.teamMode) Menu.TEAM_IDS.forEach((teamId) => ensureTeamStats(teamId));

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
// per GAME_SPEC.md sections 9.1 and 9.2. Shared by every lethal thing in a
// match (bullets, mine shrapnel, laser beams) so a kill — and a team kill,
// and a self-kill — is credited the same way no matter what caused it. A
// self-kill counts as a death but never as a kill against yourself
// (section 3.2).
function destroyTank(entry, ownerTank) {
  if (entry.tank.destroyed) return;

  entry.tank.destroyed = true;
  explosions.push(new Explosion(entry.tank.x, entry.tank.y));
  ensureStats(entry.label).deaths++;
  if (entry.team) ensureTeamStats(entry.team).deaths++;

  if (ownerTank === entry.tank) {
    ensureStats(entry.label).selfKills++;
  } else if (ownerTank) {
    const killer = matchTanks.find((other) => other.tank === ownerTank);
    if (killer) {
      ensureStats(killer.label).kills++;
      if (killer.team) ensureTeamStats(killer.team).kills++;
      // Friendly fire is ON in team mode (GAME_SPEC.md 9.2), so this is a
      // real and reasonably common event, not a defensive impossibility.
      if (killer.team && killer.team === entry.team) ensureStats(killer.label).teamKills++;
    }
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
      resetReveal(resultAwardsReveal, resultAwardsList().length);
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
      // In team mode an AI only ever *targets* enemies — but friendly fire
      // is ON (GAME_SPEC.md 9.2), so a teammate it never aimed at can still
      // be killed by its ricochet. That's handled in the collision pass
      // below, which stays entirely team-blind.
      const opponents = matchTanks
        .filter((other) => other !== entry && !(config.teamMode && other.team === entry.team))
        .map((other) => other.tank);
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

  // Per GAME_SPEC.md sections 9 and 9.2: a bullet destroys whatever tank it
  // touches, regardless of who fired it, who's driving either, or which
  // team they're on — friendly fire is ON in team mode, so this pass is
  // deliberately identical in both match types.
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

  if (config.teamMode) {
    // Last team standing, per GAME_SPEC.md section 9.2 — the team-level
    // equivalent of the all-vs-all rule below. Zero teams left means both
    // were wiped in the same frame, which is a draw exactly as a mutual
    // kill is in all-vs-all.
    const teamsAlive = Menu.TEAM_IDS.filter((teamId) => survivors.some((entry) => entry.team === teamId));
    if (teamsAlive.length <= 1) {
      winner =
        teamsAlive.length === 1
          ? { label: Menu.teamName(config, teamsAlive[0]), kind: 'team', team: teamsAlive[0] }
          : null;
      if (winner) {
        // The win belongs to the team, so every member is credited —
        // including ones destroyed along the way (GAME_SPEC.md 9.1). The
        // team's own row gets it once, not once per member.
        matchTanks
          .filter((entry) => entry.team === winner.team)
          .forEach((entry) => ensureStats(entry.label).wins++);
        ensureTeamStats(winner.team).wins++;
      }
      matchEndTimer = RESULT_DELAY;
    }
  } else if (survivors.length <= 1) {
    // winner.label is for display, so it's the custom name if there is one;
    // the tally stays keyed by slot label, which is what survives a rename.
    const lastStanding = survivors[0];
    winner = lastStanding ? { label: Menu.displayName(config, lastStanding.label), kind: lastStanding.kind } : null;
    if (lastStanding) ensureStats(lastStanding.label).wins++;
    matchEndTimer = RESULT_DELAY;
  }
}

// Small team flag planted on a tank, drawn as its own pass on top of the
// tank rather than inside Tank.draw() — the tank sprite knows nothing about
// teams, and the flag must stay upright while the tank rotates under it.
// Team mode only; per GAME_SPEC.md section 9.2 the label itself stays white.
function drawTeamFlag(ctx, tank, teamId) {
  const poleX = tank.x + tank.radius - 2;
  const poleTop = tank.y - tank.radius - 14;

  ctx.fillStyle = '#2b2b2b';
  ctx.fillRect(poleX, poleTop, 2, 14);

  ctx.fillStyle = Menu.TEAM_COLORS[teamId];
  ctx.beginPath();
  ctx.moveTo(poleX + 2, poleTop);
  ctx.lineTo(poleX + 12, poleTop + 4);
  ctx.lineTo(poleX + 2, poleTop + 8);
  ctx.closePath();
  ctx.fill();

  ctx.strokeStyle = '#00000066';
  ctx.stroke();
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
    if (entry.team) drawTeamFlag(ctx, entry.tank, entry.team);

    ctx.fillStyle = '#fff';
    ctx.font = 'bold 10px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(Menu.displayName(config, entry.label), entry.tank.x, entry.tank.y - entry.tank.radius - 6);
  });

  bullets.forEach((bullet) => bullet.draw(ctx));
  beams.forEach((beam) => beam.draw(ctx));
  shrapnel.forEach((piece) => piece.draw(ctx));
  explosions.forEach((explosion) => explosion.draw(ctx));

  const playerEntries = matchTanks.filter((entry) => entry.kind === 'player');
  hud.draw(ctx, canvas, playerEntries, activeBulletCount, stats, config);
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

// Custom names, per GAME_SPEC.md section 9.4. Text entry is hand-rolled on
// the canvas — the same "click it, then press keys" idiom as rebinding, and
// for the same reason: this game has no DOM UI and no build step. Typing is
// therefore plain characters and Backspace only, with Enter to commit and
// Escape to cancel; there's no caret movement, selection, or paste.
function startNameEdit(kind, key, current) {
  awaitingRebind = null; // otherwise the rebind capture would eat the same keystrokes
  editingName = { kind, key, buffer: current, original: current };
}

function commitNameEdit() {
  if (!editingName) return;
  const name = editingName.buffer.trim();
  const target = editingName.kind === 'tank' ? config.tankNames : config.teamNames;
  // Clearing the field is how you get the default (P1, Team 1) back.
  target[editingName.key] = name;
  editingName = null;
}

function resolvePendingNameConfirm(keep) {
  if (!pendingNameConfirm) return;
  if (keep) {
    const target = pendingNameConfirm.kind === 'tank' ? config.tankNames : config.teamNames;
    target[pendingNameConfirm.key] = pendingNameConfirm.buffer.trim();
  }
  pendingNameConfirm = null;
}

// Runs before every other click handler. While a name edit is in progress:
//   - clicking the field itself again is a no-op (still editing it)
//   - clicking its checkmark commits immediately, same as Enter
//   - clicking anything else with no actual change just closes the edit
//     silently and lets that click carry on to do whatever it normally does
//   - clicking anything else WITH a change swallows that click and opens
//     the Keep/Discard dialog instead — the original click's own action
//     never runs; the user clicks it again once the name is resolved
// Returns the id to keep processing, or null if this click has been fully
// handled already.
function interceptNameEditClick(clicked) {
  if (!editingName) return clicked;

  const ownFieldId = editingName.kind === 'tank' ? `rename:${editingName.key}` : `renameTeam:${editingName.key}`;
  if (clicked === ownFieldId) return null;

  if (clicked === 'confirmNameEdit') {
    commitNameEdit();
    return null;
  }

  if (editingName.buffer.trim() === editingName.original) {
    editingName = null;
    return clicked;
  }

  pendingNameConfirm = editingName;
  editingName = null;
  return null;
}

window.addEventListener('keydown', (e) => {
  if (!editingName) return;

  if (e.key === 'Enter') {
    commitNameEdit();
  } else if (e.key === 'Escape') {
    editingName = null;
  } else if (e.key === 'Backspace') {
    editingName.buffer = editingName.buffer.slice(0, -1);
  } else if (e.key.length === 1 && editingName.buffer.length < Menu.MAX_NAME_LENGTH) {
    editingName.buffer += e.key;
  } else {
    return;
  }

  // Stops the keystroke from also scrolling the page or triggering a
  // browser shortcut mid-edit; Input still sees it, which is harmless
  // outside a match.
  e.preventDefault();
});

// Session awards (GAME_SPEC.md section 9.3): the lists each reveal context
// paces through, and the reveal-state helpers shared by both contexts.
function resultAwardsList() {
  return Awards.compute(stats).slice(0, 3);
}

function modalAwardsList() {
  return Awards.compute(stats);
}

function resetReveal(state, total) {
  state.index = total > 0 ? 1 : 0; // the first award starts fading in immediately, not after a full hold
  state.timer = 0;
}

function advanceReveal(state, total, dt) {
  if (state.index >= total) return;
  state.timer += dt;
  if (state.timer >= AWARD_REVEAL_HOLD) {
    state.timer = 0;
    state.index++;
  }
}

function skipReveal(state, total) {
  if (state.index < total) {
    state.index++;
    state.timer = 0;
  }
}

function revealView(state) {
  return { index: state.index, fade: Math.min(1, state.timer / AWARD_FADE_DURATION) };
}

// Any key advances the reveal, mirroring the click-to-skip region drawn
// over the award list itself — lets a group hurry the credits along
// instead of waiting out the full pace.
window.addEventListener('keydown', (e) => {
  if (editingName || pendingNameConfirm) return;
  if (['Shift', 'Control', 'Alt', 'Meta'].includes(e.key)) return;

  if (screen === 'result' && !scoreboardOpen) {
    skipReveal(resultAwardsReveal, resultAwardsList().length);
  } else if (awardsOpen) {
    skipReveal(modalAwardsReveal, modalAwardsList().length);
  }
});

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
    editingName = null; // don't leave a name edit swallowing the rebind keystroke
    awaitingRebind = { playerIndex: Number(playerIndex), action };
  } else if (clicked.startsWith('rename:')) {
    const slotLabel = clicked.split(':')[1];
    startNameEdit('tank', slotLabel, config.tankNames[slotLabel]);
  } else if (clicked === 'briefingBack') {
    screen = 'title';
  } else if (clicked === 'battleFfa' && config.playerCount + config.aiCount >= 2) {
    config.teamMode = false;
    startMatch();
  } else if (clicked === 'battleTeams' && config.playerCount + config.aiCount >= 2) {
    // Straight to Team Setup — the split is fixed there, not here, so this
    // doesn't check it. Battle on that screen is what enforces it.
    config.teamMode = true;
    screen = 'teamAssign';
  } else if (clicked === 'viewStats') {
    openScoreboard();
  }
}

// Shared by the Briefing screen's Scoreboard button and the Result screen's,
// since both open the same modal stack over whatever is behind them.
function openScoreboard() {
  awaitingRebind = null; // don't leave a hidden rebind capturing keys behind the modal
  editingName = null;
  scoreboardOpen = true;
}

// The Scoreboard modal, its Awards sub-modal, and the Reset confirmation are
// overlays rather than screens, so they're handled before the screen switch
// in handleMenuClick() — whatever is underneath must not also react.
function handleOverlayClick(clicked) {
  if (pendingNameConfirm) {
    if (clicked === 'keepName') resolvePendingNameConfirm(true);
    else if (clicked === 'discardName') resolvePendingNameConfirm(false);
    return true;
  }

  if (resetConfirmOpen) {
    if (clicked === 'yes') {
      resetStats(); // names are config, not stats, so they deliberately survive this
      resetConfirmOpen = false;
    } else if (clicked === 'no') {
      resetConfirmOpen = false;
    }
    return true;
  }

  if (awardsOpen) {
    if (clicked === 'closeAwards') awardsOpen = false;
    else if (clicked === 'skipAwardReveal') skipReveal(modalAwardsReveal, modalAwardsList().length);
    return true;
  }

  if (scoreboardOpen) {
    if (clicked === 'closeStats') scoreboardOpen = false;
    else if (clicked === 'viewAwards') {
      awardsOpen = true;
      resetReveal(modalAwardsReveal, modalAwardsList().length);
    } else if (clicked === 'resetStats') resetConfirmOpen = true;
    return true;
  }

  return false;
}

// Team Setup screen, per GAME_SPEC.md section 9.2. A finished drag arrives
// here as the same `team:<slot>:<teamId>` id a plain click on a tank
// produces, so dropping and clicking need no separate handling.
function handleTeamAssignClick(clicked) {
  if (clicked.startsWith('mode:')) {
    config.teamMode = clicked.split(':')[1] === 'team';
  } else if (clicked.startsWith('team:')) {
    // Assignments are kept for every slot, even ones the current counts
    // don't use, so they come back if the count does.
    const [, slotLabel, teamId] = clicked.split(':');
    config.teams[slotLabel] = teamId;
  } else if (clicked.startsWith('renameTeam:')) {
    const teamId = clicked.split(':')[1];
    startNameEdit('team', teamId, config.teamNames[teamId]);
  } else if (clicked === 'teamBack') {
    editingName = null;
    screen = 'briefing';
  } else if (clicked === 'battle' && Menu.canStartMatch(config)) {
    editingName = null;
    startMatch();
  }
}

function handleMenuClick() {
  let clicked = menu.consumeClick();
  if (!clicked) return;

  // A name edit in progress gets first say — see interceptNameEditClick's
  // own comment for what each outcome means.
  clicked = interceptNameEditClick(clicked);
  if (!clicked) return;

  // The modal stack sits over every screen, so it gets first refusal on a
  // click — otherwise a button behind it would fire through the overlay.
  if (handleOverlayClick(clicked)) return;

  if (screen === 'title' && clicked === 'play') {
    screen = 'briefing';
  } else if (screen === 'briefing') {
    handleBriefingClick(clicked);
  } else if (screen === 'teamAssign') {
    handleTeamAssignClick(clicked);
  } else if (screen === 'result') {
    if (clicked === 'rematch') startMatch();
    else if (clicked === 'changeDifficulty') screen = 'briefing';
    else if (clicked === 'title') screen = 'title';
    else if (clicked === 'viewStats') openScoreboard();
    else if (clicked === 'skipAwardReveal') skipReveal(resultAwardsReveal, resultAwardsList().length);
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
    if (screen === 'result' && !scoreboardOpen) advanceReveal(resultAwardsReveal, resultAwardsList().length, dt);
    if (awardsOpen) advanceReveal(modalAwardsReveal, modalAwardsList().length, dt);
    Input.update();
  },
  () => {
    // Lets Menu keep its drag handlers inert everywhere except Team Setup.
    menu.setScreen(screen);

    if (screen === 'title') {
      menu.drawTitleScreen(ctx, canvas);
    } else if (screen === 'briefing') {
      menu.drawBriefingScreen(ctx, canvas, config, awaitingRebind, stats, editingName);
    } else if (screen === 'teamAssign') {
      menu.drawTeamAssignScreen(ctx, canvas, config, editingName);
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
      menu.drawResultScreen(ctx, canvas, winner, stats, config, revealView(resultAwardsReveal));
    }

    // Drawn last, over whatever screen is behind them, in the same order
    // handleOverlayClick() consumes them.
    if (scoreboardOpen) menu.drawScoreboardModal(ctx, canvas, stats, teamStats, config);
    if (awardsOpen) menu.drawAwardsModal(ctx, canvas, stats, config, revealView(modalAwardsReveal));
    if (resetConfirmOpen) {
      menu.drawConfirmDialog(ctx, canvas, 'Reset every tally to zero? (Names are kept.)');
    }
    if (pendingNameConfirm) menu.drawNameConfirmDialog(ctx, canvas, pendingNameConfirm);

    menu.drawTooltip(ctx, canvas);
  }
);
