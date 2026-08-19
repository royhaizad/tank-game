const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

const maze = new Maze(16, 12, 40); // 16*40=640, 12*40=480, matches the canvas size
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
    const resolved = maze.resolveCircleCollision(playerTank.x, playerTank.y, playerTank.radius);
    playerTank.x = resolved.x;
    playerTank.y = resolved.y;

    if (Input.justPressed[' '] && activeBulletCount(playerTank) < playerTank.maxActiveBullets) {
      const tip = playerTank.getBarrelTip();
      bullets.push(new Bullet(tip.x, tip.y, playerTank.angle, playerTank));
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
