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
  teams: { P1: '1', P2: '1', P3: '1', AI1: '2', AI2: '2', AI3: '2' }
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
    const tank = new Tank(spawn.x, spawn.y, Menu.AI_COLORS[i]);
    tank.maxActiveBullets = 1; // AI ammo override, per GAME_SPEC.md section 5
    tank.fireCooldownDuration = 1; // s, per GAME_SPEC.md section 5
    const label = `AI${i + 1}`;
    matchTanks.push({ tank, kind: 'ai', label, ai: new EasyAI(), team: teamFor(label) });
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
      // In team mode an AI only ever *targets* enemies — but friendly fire
      // is ON (GAME_SPEC.md 9.2), so a teammate it never aimed at can still
      // be killed by its ricochet. That's handled in the collision pass
      // below, which stays entirely team-blind.
      const opponents = matchTanks
        .filter((other) => other !== entry && !(config.teamMode && other.team === entry.team))
        .map((other) => other.tank);
      const decision = entry.ai.update(dt, entry.tank, opponents, maze);
      entry.tank.update(dt, decision.keys);
      maze.resolveTankCollision(entry.tank);

      if (decision.wantsToFire && !maze.isBarrelBlocked(entry.tank)) {
        fireIfPossible(entry.tank, entry.tank);
      }
    }
  });

  bullets.forEach((bullet) => bullet.update(dt, maze));

  // Per GAME_SPEC.md sections 9 and 9.2: a bullet destroys whatever tank it
  // touches, regardless of who fired it, who's driving either, or which
  // team they're on — friendly fire is ON in team mode, so this pass is
  // deliberately identical in both match types.
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

  if (config.teamMode) {
    // Last team standing, per GAME_SPEC.md section 9.2 — the team-level
    // equivalent of the all-vs-all rule below. Zero teams left means both
    // were wiped in the same frame, which is a draw exactly as a mutual
    // kill is in all-vs-all.
    const teamsAlive = Menu.TEAM_IDS.filter((teamId) => survivors.some((entry) => entry.team === teamId));
    if (teamsAlive.length <= 1) {
      winner = teamsAlive.length === 1 ? { label: `Team ${teamsAlive[0]}`, kind: 'team', team: teamsAlive[0] } : null;
      if (winner) {
        // The win belongs to the team, so every member is credited —
        // including ones destroyed along the way (GAME_SPEC.md 9.1).
        matchTanks
          .filter((entry) => entry.team === winner.team)
          .forEach((entry) => ensureStats(entry.label).wins++);
      }
      screen = 'result';
    }
  } else if (survivors.length <= 1) {
    winner = survivors.length === 1 ? { label: survivors[0].label, kind: survivors[0].kind } : null;
    if (winner) ensureStats(winner.label).wins++;
    screen = 'result';
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

  matchTanks.forEach((entry) => {
    if (entry.tank.destroyed) return;
    entry.tank.draw(ctx);
    if (entry.team) drawTeamFlag(ctx, entry.tank, entry.team);

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
    if (tier === 'easy') config.aiDifficulties[Number(aiIndex)] = tier;
  } else if (clicked.startsWith('rebind:')) {
    const [, playerIndex, action] = clicked.split(':');
    awaitingRebind = { playerIndex: Number(playerIndex), action };
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
    awaitingRebind = null; // don't leave a hidden rebind capturing keys behind the modal
    briefingStatsOpen = true;
  } else if (clicked === 'closeStats') {
    briefingStatsOpen = false;
  }
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
  } else if (clicked === 'teamBack') {
    screen = 'briefing';
  } else if (clicked === 'battle' && Menu.canStartMatch(config)) {
    startMatch();
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
  } else if (screen === 'teamAssign') {
    handleTeamAssignClick(clicked);
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
    // Lets Menu keep its drag handlers inert everywhere except Team Setup.
    menu.setScreen(screen);

    if (screen === 'title') {
      menu.drawTitleScreen(ctx, canvas);
    } else if (screen === 'briefing') {
      menu.drawBriefingScreen(ctx, canvas, config, awaitingRebind, stats);
      if (briefingStatsOpen) menu.drawStatsModal(ctx, canvas, stats);
    } else if (screen === 'teamAssign') {
      menu.drawTeamAssignScreen(ctx, canvas, config);
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
