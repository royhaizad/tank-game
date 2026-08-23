const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

const menu = new Menu(canvas);
const hud = new Hud();

// 'title' | 'difficultySelect' | 'match' | 'paused' | 'pauseConfirm' | 'controls' | 'result'
let screen = 'title';
let difficulty = 'easy';
let matchWon = false;
let pendingConfirmAction = null; // 'rematch' | 'changeDifficulty' | 'quitToTitle', while screen === 'pauseConfirm'
let awaitingRebindAction = null; // action name currently waiting for a keypress, while screen === 'controls'

let maze, playerTank, aiTank, easyAI, tanks, bullets;

function activeBulletCount(tank) {
  return bullets.reduce((count, bullet) => count + (bullet.alive && bullet.owner === tank ? 1 : 0), 0);
}

function startMatch() {
  maze = new Maze(8, 6, 80); // 8*80=640, 6*80=480, matches the canvas size
  const spawnPoints = maze.getSpawnPoints(2);

  playerTank = new Tank(spawnPoints[0].x, spawnPoints[0].y, '#3b6ea5'); // blue, per GAME_SPEC.md section 2
  aiTank = new Tank(spawnPoints[1].x, spawnPoints[1].y, '#a53b3b'); // red, per GAME_SPEC.md section 2
  aiTank.maxActiveBullets = 1; // AI ammo override, per GAME_SPEC.md section 5
  aiTank.fireCooldownDuration = 1; // s, per GAME_SPEC.md section 5
  easyAI = new EasyAI();
  tanks = [playerTank, aiTank];
  bullets = [];

  screen = 'match';
}

function updateMatch(dt) {
  const playerActions = {
    forward: Input.keys[Input.bindings.forward],
    backward: Input.keys[Input.bindings.backward],
    left: Input.keys[Input.bindings.left],
    right: Input.keys[Input.bindings.right]
  };
  playerTank.update(dt, playerActions);
  maze.resolveTankCollision(playerTank);

  if (Input.justPressed[Input.bindings.fire]) {
    if (maze.isBarrelBlocked(playerTank)) {
      AudioEngine.playEmptyFireClick();
    } else if (playerTank.canFire(activeBulletCount(playerTank))) {
      const tip = playerTank.getBarrelTip();
      bullets.push(new Bullet(tip.x, tip.y, playerTank.angle, playerTank));
      playerTank.cooldownRemaining = playerTank.fireCooldownDuration;
    }
  }

  if (!aiTank.destroyed) {
    const decision = easyAI.update(dt, aiTank, playerTank, maze);
    aiTank.update(dt, decision.keys);
    maze.resolveTankCollision(aiTank);

    if (decision.wantsToFire && !maze.isBarrelBlocked(aiTank) && aiTank.canFire(activeBulletCount(aiTank))) {
      const tip = aiTank.getBarrelTip();
      bullets.push(new Bullet(tip.x, tip.y, aiTank.angle, aiTank));
      aiTank.cooldownRemaining = aiTank.fireCooldownDuration;
    }
  }

  bullets.forEach((bullet) => bullet.update(dt, maze));

  bullets.forEach((bullet) => {
    if (!bullet.alive) return;
    tanks.forEach((tank) => {
      if (tank.destroyed) return;
      const dx = bullet.x - tank.x;
      const dy = bullet.y - tank.y;
      const hitDistance = bullet.radius + tank.radius;
      if (dx * dx + dy * dy <= hitDistance * hitDistance) {
        tank.destroyed = true;
        bullet.alive = false;
      }
    });
  });

  bullets = bullets.filter((bullet) => bullet.alive);

  // Per GAME_SPEC.md section 9: match ends immediately on either tank being hit.
  if (playerTank.destroyed || aiTank.destroyed) {
    matchWon = aiTank.destroyed;
    screen = 'result';
  }
}

function drawMatchScene() {
  maze.draw(ctx);
  tanks.forEach((tank) => {
    if (!tank.destroyed) tank.draw(ctx);
  });
  bullets.forEach((bullet) => bullet.draw(ctx));
  hud.draw(ctx, canvas, playerTank, activeBulletCount(playerTank), difficulty);
}

function confirmMessage(action) {
  if (action === 'rematch') return 'Start a new match?';
  if (action === 'changeDifficulty') return 'Abandon this match and change difficulty?';
  if (action === 'quitToTitle') return 'Abandon this match and return to the title screen?';
  return '';
}

// Esc (or whatever's bound to "pause") toggles pause during a match, and
// otherwise acts as a universal cancel/back for the pause submenus.
function handlePauseToggle() {
  if (!Input.justPressed[Input.bindings.pause]) return;

  if (screen === 'match') {
    screen = 'paused';
  } else if (screen === 'paused') {
    screen = 'match';
  } else if (screen === 'pauseConfirm') {
    pendingConfirmAction = null;
    screen = 'paused';
  } else if (screen === 'controls') {
    if (awaitingRebindAction) {
      awaitingRebindAction = null;
    } else {
      screen = 'paused';
    }
  }
}

// While waiting for a rebind, the next non-Escape key pressed becomes the
// new binding for awaitingRebindAction (handlePauseToggle handles Escape
// as "cancel" before this runs, so by the time we get here awaiting has
// already been cleared if Escape was the key pressed).
function handleRebindCapture() {
  if (screen !== 'controls' || !awaitingRebindAction) return;

  for (const key in Input.justPressed) {
    if (!Input.justPressed[key] || key === 'escape') continue;
    Input.rebind(awaitingRebindAction, key);
    awaitingRebindAction = null;
    break;
  }
}

function handleMenuClick() {
  const clicked = menu.consumeClick();
  if (!clicked) return;

  if (screen === 'title' && clicked === 'play') {
    screen = 'difficultySelect';
  } else if (screen === 'difficultySelect' && clicked === 'easy') {
    difficulty = clicked;
    startMatch();
  } else if (screen === 'result') {
    if (clicked === 'rematch') startMatch();
    else if (clicked === 'changeDifficulty') screen = 'difficultySelect';
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
      else if (pendingConfirmAction === 'changeDifficulty') screen = 'difficultySelect';
      else if (pendingConfirmAction === 'quitToTitle') screen = 'title';
      pendingConfirmAction = null;
    } else if (clicked === 'no') {
      pendingConfirmAction = null;
      screen = 'paused';
    }
  } else if (screen === 'controls') {
    if (clicked === 'back') screen = 'paused';
    else awaitingRebindAction = clicked;
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
    } else if (screen === 'difficultySelect') {
      menu.drawDifficultySelect(ctx, canvas);
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
      menu.drawControlsScreen(ctx, canvas, Input.bindings, awaitingRebindAction);
    } else if (screen === 'result') {
      menu.drawResultScreen(ctx, canvas, matchWon);
    }
  }
);
