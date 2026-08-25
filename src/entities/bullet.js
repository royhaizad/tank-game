// Bullet fired from a tank's barrel. Bounces off maze walls at a mirrored
// angle instead of disappearing, per GAME_SPEC.md section 3.2 (the
// signature mechanic). The maze owns the actual reflection math (see
// Maze.reflectOffWalls) since it knows where the walls are.
//
// One class covers every projectile weapon (GAME_SPEC.md section 4) via
// `kind`: the base cannon shot, gatling rounds, shotgun pellets and the
// homing missile all bounce off walls the same way and differ only in the
// tuning below. The laser is NOT a bullet — it's a fast beam with its own
// travel/reflection logic, see laser.js.
class Bullet {
  // Per-kind tuning. Each non-cannon kind's numbers are what give that
  // weapon its drawback: pellets die fast (short range), gatling rounds
  // are small and numerous (ricochet self-risk), the missile flies dumb
  // and fast at first, then slows down once it locks onto the nearest
  // OTHER tank (never its own shooter) — the slowdown is what keeps a
  // homing missile from being an unavoidable instant snipe.
  static KINDS = {
    cannon: { speed: 160, radius: 3, maxLifetime: 6, maxBounces: 5, color: '#f2c14e' },
    gatling: { speed: 190, radius: 2, maxLifetime: 4, maxBounces: 4, color: '#e8eef2' },
    pellet: { speed: 200, radius: 2, maxLifetime: 0.96, maxBounces: 2, color: '#e08a3c' }, // maxLifetime is 20% longer range than the original 0.8s
    missile: {
      speed: 130,
      homingSpeed: 90, // px/s, slower once it starts homing
      radius: 4,
      maxLifetime: 9,
      maxBounces: 3,
      color: '#d94f4f',
      straightTime: 1, // s of dumb straight flight before homing kicks in
      turnRate: 2.2 // rad/s of course correction once homing
    }
  };

  constructor(x, y, angle, owner, kind = 'cannon') {
    this.x = x;
    this.y = y;
    this.angle = angle;
    this.owner = owner;
    this.kind = kind;

    const spec = Bullet.KINDS[kind] || Bullet.KINDS.cannon;
    this.speed = spec.speed; // px/s; cannon's 160 is ~15% faster than tank top speed (140 px/s)
    this.radius = spec.radius; // px
    this.color = spec.color;

    this.lifetime = 0; // s elapsed
    this.maxLifetime = spec.maxLifetime; // s
    this.bounceCount = 0;
    this.maxBounces = spec.maxBounces;

    this.alive = true;
  }

  update(dt, maze, matchTanks) {
    this.lifetime += dt;
    if (this.lifetime >= this.maxLifetime) {
      this.alive = false;
      return;
    }

    if (this.kind === 'missile') this._steerTowardNearestTank(dt, matchTanks);

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

  // Homing missile, per GAME_SPEC.md section 4: flies straight (and
  // fast) for straightTime, then slows down and curves toward whichever
  // OTHER living tank is nearest — the shooter itself is never a valid
  // target. Turn rate is capped, so a missile that overshoots has to
  // swing back around rather than snapping straight onto its target.
  _steerTowardNearestTank(dt, matchTanks) {
    if (this.lifetime < Bullet.KINDS.missile.straightTime) return;

    this.speed = Bullet.KINDS.missile.homingSpeed;
    if (!matchTanks) return;

    let nearest = null;
    let nearestDistSq = Infinity;
    for (const entry of matchTanks) {
      if (entry.tank.destroyed || entry.tank === this.owner) continue;
      const dx = entry.tank.x - this.x;
      const dy = entry.tank.y - this.y;
      const distSq = dx * dx + dy * dy;
      if (distSq < nearestDistSq) {
        nearestDistSq = distSq;
        nearest = entry.tank;
      }
    }
    if (!nearest) return;

    const desired = Math.atan2(nearest.y - this.y, nearest.x - this.x);
    let delta = desired - this.angle;
    while (delta > Math.PI) delta -= Math.PI * 2;
    while (delta < -Math.PI) delta += Math.PI * 2;

    const maxTurn = Bullet.KINDS.missile.turnRate * dt;
    this.angle += Math.max(-maxTurn, Math.min(maxTurn, delta));
  }

  // Bounced off a shield bubble instead of killing its wearer (see
  // GAME_SPEC.md section 4). Reflects off the bubble's surface normal —
  // the same mirror-angle rule walls use — and pushes the bullet clear so
  // it can't immediately re-collide. Counts as a bounce, so a deflected
  // bullet still runs out of bounces eventually.
  deflectOff(tank) {
    const normal = Math.atan2(this.y - tank.y, this.x - tank.x);
    this.angle = 2 * normal - this.angle + Math.PI;
    this.x = tank.x + Math.cos(normal) * (tank.shieldRadius + this.radius + 1);
    this.y = tank.y + Math.sin(normal) * (tank.shieldRadius + this.radius + 1);

    this.bounceCount++;
    if (this.bounceCount >= this.maxBounces) this.alive = false;
  }

  draw(ctx) {
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(this.angle);

    if (this.kind === 'missile') {
      // Drawn as a little dart so its heading (and therefore whether it's
      // currently turning back at you) is readable at a glance.
      ctx.fillStyle = this.color;
      ctx.beginPath();
      ctx.moveTo(this.radius + 2, 0);
      ctx.lineTo(-this.radius, -this.radius);
      ctx.lineTo(-this.radius, this.radius);
      ctx.closePath();
      ctx.fill();
    } else {
      ctx.fillStyle = this.color;
      ctx.beginPath();
      ctx.arc(0, 0, this.radius, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  }
}
