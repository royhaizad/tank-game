// Shrapnel sprayed by a mine's detonation, per GAME_SPEC.md section 4.
// Unlike a bullet, a shrapnel piece never reflects off a wall — it flies
// straight from the blast until it hits a tank, hits a wall, or its short
// range runs out, whichever comes first (see Maze.moveStraight).
class Shrapnel {
  static COUNT = 8; // pieces per detonation, spaced evenly around the blast
  static SPREAD_JITTER = 0.14; // rad (~8deg) of random wobble per piece
  static SPEED = 180; // px/s
  static MAX_LIFETIME = 1.1; // s -> ~200px / ~2.5 cells, a medium blast radius
  static RADIUS = 2.5; // px

  constructor(x, y, angle, owner) {
    this.x = x;
    this.y = y;
    this.angle = angle;
    this.owner = owner; // the mine's owner, for kill credit — not who it hits
    this.radius = Shrapnel.RADIUS;
    this.lifetime = 0;
    this.alive = true;
  }

  // Spawns Shrapnel.COUNT pieces around a full circle, evenly spaced with
  // a little jitter so a blast doesn't read as a perfectly mechanical fan.
  static burst(x, y, owner) {
    const pieces = [];
    const step = (Math.PI * 2) / Shrapnel.COUNT;
    for (let i = 0; i < Shrapnel.COUNT; i++) {
      const angle = i * step + (Math.random() - 0.5) * Shrapnel.SPREAD_JITTER;
      pieces.push(new Shrapnel(x, y, angle, owner));
    }
    return pieces;
  }

  update(dt, maze) {
    this.lifetime += dt;
    if (this.lifetime >= Shrapnel.MAX_LIFETIME) {
      this.alive = false;
      return;
    }

    const dx = Math.cos(this.angle) * Shrapnel.SPEED * dt;
    const dy = Math.sin(this.angle) * Shrapnel.SPEED * dt;
    const result = maze.moveStraight(this, dx, dy);
    this.x = result.x;
    this.y = result.y;
    if (result.blocked) this.alive = false; // stops dead, does not bounce
  }

  draw(ctx) {
    ctx.save();
    ctx.fillStyle = '#e8a23c';
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}
