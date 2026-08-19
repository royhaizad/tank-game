// Bullet fired from a tank's barrel. Bounces off walls at a mirrored angle
// instead of disappearing, per GAME_SPEC.md section 3.2 (the signature
// mechanic). Bounds are passed into update() rather than read from the
// canvas directly, so this still works once real maze walls exist.
class Bullet {
  constructor(x, y, angle, owner) {
    this.x = x;
    this.y = y;
    this.angle = angle;
    this.owner = owner;

    this.speed = 320; // px/s
    this.radius = 3; // px

    this.lifetime = 0; // s elapsed
    this.maxLifetime = 6; // s
    this.bounceCount = 0;
    this.maxBounces = 5;

    this.alive = true;
  }

  update(dt, bounds) {
    this.lifetime += dt;
    if (this.lifetime >= this.maxLifetime) {
      this.alive = false;
      return;
    }

    let nextX = this.x + Math.cos(this.angle) * this.speed * dt;
    let nextY = this.y + Math.sin(this.angle) * this.speed * dt;

    if (nextX - this.radius < bounds.left) {
      nextX = bounds.left + this.radius;
      this.angle = Math.PI - this.angle;
      this.bounceCount++;
    } else if (nextX + this.radius > bounds.right) {
      nextX = bounds.right - this.radius;
      this.angle = Math.PI - this.angle;
      this.bounceCount++;
    }

    if (nextY - this.radius < bounds.top) {
      nextY = bounds.top + this.radius;
      this.angle = -this.angle;
      this.bounceCount++;
    } else if (nextY + this.radius > bounds.bottom) {
      nextY = bounds.bottom - this.radius;
      this.angle = -this.angle;
      this.bounceCount++;
    }

    if (this.bounceCount >= this.maxBounces) {
      this.alive = false;
    }

    this.x = nextX;
    this.y = nextY;
  }

  draw(ctx) {
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(this.angle);

    ctx.fillStyle = '#f2c14e';
    ctx.beginPath();
    ctx.arc(0, 0, this.radius, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }
}
