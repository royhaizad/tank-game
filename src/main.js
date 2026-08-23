const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

const menu = new Menu(canvas);
const hud = new Hud();

let screen = 'title'; // 'title' | 'difficultySelect' | 'match' | 'result'
let difficulty = 'easy';
let matchWon = false;

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
  playerTank.update(dt, Input.keys);
  maze.resolveTankCollision(playerTank);

  if (Input.justPressed[' ']) {
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
  }
}

startLoop(
  (dt) => {
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
      maze.draw(ctx);
      tanks.forEach((tank) => {
        if (!tank.destroyed) tank.draw(ctx);
      });
      bullets.forEach((bullet) => bullet.draw(ctx));
      hud.draw(ctx, canvas, playerTank, activeBulletCount(playerTank), difficulty);
    } else if (screen === 'result') {
      menu.drawResultScreen(ctx, canvas, matchWon);
    }
  }
);
