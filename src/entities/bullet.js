// Bullet fired from a tank's barrel. Bounces off maze walls at a mirrored
// angle instead of disappearing, per GAME_SPEC.md section 3.2 (the
// signature mechanic). The maze owns the actual reflection math (see
// Maze.reflectOffWalls) since it knows where the walls are.
class Bullet {
  constructor(x, y, angle, owner) {
    this.x = x;
    this.y = y;
    this.angle = angle;
    this.owner = owner;

    this.speed = 160; // px/s, ~15% faster than tank top forward speed (140 px/s)
    this.radius = 3; // px

    this.lifetime = 0; // s elapsed
    this.maxLifetime = 6; // s
    this.bounceCount = 0;
    this.maxBounces = 5;

    this.alive = true;
  }

  update(dt, maze) {
    this.lifetime += dt;
    if (this.lifetime >= this.maxLifetime) {
      this.alive = false;
      return;
    }

    const dx = Math.cos(this.angle) * this.speed * dt;
    const dy = Math.sin(this.angle) * this.speed * dt;

    const result = maze.moveWithBounce(this, dx, dy);
    if (result.bounced) {
      this.bounceCount++;
      if (this.bounceCount >= this.maxBounces) {
        this.alive = false;
      }
    }

    this.x = result.x;
    this.y = result.y;
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
