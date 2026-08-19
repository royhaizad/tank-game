const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

const playerTank = new Tank(canvas.width / 2, canvas.height / 2, '#3b6ea5');
const tanks = [playerTank];
let bullets = [];

const worldBounds = { left: 0, top: 0, right: canvas.width, bottom: canvas.height };

startLoop(
  (dt) => {
    playerTank.update(dt, Input.keys);
    playerTank.clampToBounds(canvas.width, canvas.height);

    if (Input.justPressed[' '] && playerTank.canFire()) {
      const tip = playerTank.getBarrelTip();
      const bullet = new Bullet(tip.x, tip.y, playerTank.angle, playerTank);
      bullets.push(bullet);
      playerTank.activeBullet = bullet;
    }

    bullets.forEach((bullet) => bullet.update(dt, worldBounds));

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

    bullets = bullets.filter((bullet) => {
      if (bullet.alive) return true;
      bullet.owner.activeBullet = null;
      bullet.owner.cooldownRemaining = bullet.owner.fireCooldownDuration;
      return false;
    });

    Input.update();
  },
  () => {
    ctx.fillStyle = '#4a7a3d';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    tanks.forEach((tank) => {
      if (!tank.destroyed) tank.draw(ctx);
    });

    bullets.forEach((bullet) => bullet.draw(ctx));
  }
);
