// Placeholder explosion animation played wherever a tank is destroyed —
// a bright flash core plus a few expanding, fading rings drawn with
// canvas primitives. Stands in for assets/sprites/tank_explosion.png,
// which isn't wired into this worktree yet (see feat/sprites).
class Explosion {
  static DURATION = 0.5; // s
  static RINGS = 3;
  static RING_STAGGER = 0.12; // s between each ring starting its expansion
  static RING_COLORS = ['#fff2b0', '#f2a23c', '#c94b1f'];

  constructor(x, y) {
    this.x = x;
    this.y = y;
    this.age = 0;
    this.alive = true;
  }

  update(dt) {
    this.age += dt;
    if (this.age >= Explosion.DURATION) this.alive = false;
  }

  draw(ctx) {
    const t = this.age / Explosion.DURATION; // 0..1
    ctx.save();

    for (let i = 0; i < Explosion.RINGS; i++) {
      const ringT = (t - i * Explosion.RING_STAGGER) / (1 - i * Explosion.RING_STAGGER);
      if (ringT <= 0 || ringT > 1) continue;
      const radius = 6 + ringT * 26;
      ctx.globalAlpha = (1 - ringT) * 0.85;
      ctx.strokeStyle = Explosion.RING_COLORS[i];
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(this.x, this.y, radius, 0, Math.PI * 2);
      ctx.stroke();
    }

    // A brief bright core at the moment of the blast, fading fast.
    const coreT = t / 0.3;
    if (coreT < 1) {
      ctx.globalAlpha = (1 - coreT) * 0.9;
      ctx.fillStyle = '#fff6d8';
      ctx.beginPath();
      ctx.arc(this.x, this.y, 10 * (1 - coreT * 0.4), 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  }
}
