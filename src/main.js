const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

const maze = new Maze(8, 6, 80); // 8*80=640, 6*80=480, matches the canvas size
const spawnPoints = maze.getSpawnPoints(2); // only spawnPoints[0] is used until an AI tank exists

const playerTank = new Tank(spawnPoints[0].x, spawnPoints[0].y, '#3b6ea5');
const tanks = [playerTank];
let bullets = [];

function activeBulletCount(tank) {
  return bullets.reduce((count, bullet) => count + (bullet.alive && bullet.owner === tank ? 1 : 0), 0);
}

startLoop(
  (dt) => {
    playerTank.update(dt, Input.keys);
    maze.resolveTankCollision(playerTank);

    if (Input.justPressed[' ']) {
      if (maze.isBarrelBlocked(playerTank)) {
        AudioEngine.playEmptyFireClick();
      } else if (activeBulletCount(playerTank) < playerTank.maxActiveBullets) {
        const tip = playerTank.getBarrelTip();
        bullets.push(new Bullet(tip.x, tip.y, playerTank.angle, playerTank));
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

    Input.update();
  },
  () => {
    maze.draw(ctx);

    tanks.forEach((tank) => {
      if (!tank.destroyed) tank.draw(ctx);
    });

    bullets.forEach((bullet) => bullet.draw(ctx));
  }
);
