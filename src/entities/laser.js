// Instant-hit laser beam, per GAME_SPEC.md section 4.
//
// Purpose: an aiming aid and a long-range instant shot, not a delayed
// trap. The dotted aim line traces the beam's REAL path — including every
// bounce — so what you see is exactly what fires. Pressing fire resolves
// instantly, no charge-up.
//
// Wall rule: bounces off every wall (interior AND the outer boundary)
// with the same mirror-angle reflection as the cannon, up to
// LaserBeam.MAX_BOUNCES — it reuses Maze.moveWithBounce directly (the
// same function Bullet uses) so the physics are identical, not just
// similar. That, plus the long safety-limited travel distance, is what
// makes both the preview line and the fired shot far longer-reaching than
// the old pierce-one-wall version.
//
// Drawback: still telegraphed (the aim line is visible to every player,
// not just the shooter) and still only 1 shot — with the charge delay
// gone, ammo and visibility are the laser's only remaining risk.
class LaserBeam {
  static MAX_BOUNCES = 5; // matches Bullet.KINDS.cannon.maxBounces
  static FLASH_TIME = 0.18; // s the fired beam stays drawn
  static MAX_TRAVEL = 6000; // px, a generous safety ceiling — not a designed limit
  static STEP = 4; // px per raycast substep
  static HIT_RADIUS = 2; // px of beam half-width, added to a tank's radius

  // matchTanks is required now — the shot resolves instantly at
  // construction time rather than lazily after a charge delay.
  constructor(tank, maze, matchTanks) {
    this.owner = tank;

    const tip = tank.getBarrelTip();
    const result = LaserBeam.traceBounce(maze, tip.x, tip.y, tank.angle, matchTanks, tank);
    this.points = result.points; // polyline vertices: origin, every bounce, then the end
    this.flashRemaining = LaserBeam.FLASH_TIME;

    // Tanks the beam caught, drained by main.js so laser kills go through
    // the same stats path as bullet kills.
    this.pendingHits = result.hits;
  }

  get alive() {
    return this.flashRemaining > 0;
  }

  update(dt) {
    this.flashRemaining -= dt;
  }

  // Marches a beam forward, bouncing off walls exactly like a bullet (via
  // Maze.moveWithBounce, reused directly rather than reimplemented) for up
  // to MAX_BOUNCES reflections, a tank hit, or the MAX_TRAVEL safety
  // ceiling — whichever comes first. Returns { points, hits }: points is
  // every vertex of the resulting polyline (origin, each bounce, the
  // end), hits is which tanks it caught.
  //
  // `matchTanks` is optional — the aim preview traces walls only, so it
  // never reveals anything about tank positions the shooter can't already
  // see.
  static traceBounce(maze, startX, startY, startAngle, matchTanks, owner) {
    const mover = { x: startX, y: startY, angle: startAngle, radius: LaserBeam.HIT_RADIUS };
    const points = [{ x: mover.x, y: mover.y }];
    const hits = [];
    let bounces = 0;
    let travelled = 0;

    while (travelled < LaserBeam.MAX_TRAVEL) {
      const dx = Math.cos(mover.angle) * LaserBeam.STEP;
      const dy = Math.sin(mover.angle) * LaserBeam.STEP;
      const result = maze.moveWithBounce(mover, dx, dy);
      mover.x = result.x;
      mover.y = result.y;
      travelled += LaserBeam.STEP;

      if (matchTanks) {
        let caughtSomeone = false;
        for (const entry of matchTanks) {
          if (entry.tank.destroyed || hits.includes(entry)) continue;
          const tdx = mover.x - entry.tank.x;
          const tdy = mover.y - entry.tank.y;
          const reach = entry.tank.radius + LaserBeam.HIT_RADIUS;
          if (tdx * tdx + tdy * tdy > reach * reach) continue;

          // A shield bubble absorbs the beam outright (it deflects
          // incoming fire, section 4) — but, exactly like bullets, it
          // never protects against its own owner's shot.
          if (!(entry.tank.hasShield() && entry.tank !== owner)) hits.push(entry);
          caughtSomeone = true;
          break;
        }
        if (caughtSomeone) {
          points.push({ x: mover.x, y: mover.y });
          return { points, hits };
        }
      }

      if (result.bounced) {
        points.push({ x: mover.x, y: mover.y });
        bounces++;
        if (bounces >= LaserBeam.MAX_BOUNCES) return { points, hits };
      }
    }

    points.push({ x: mover.x, y: mover.y }); // hit the travel safety ceiling
    return { points, hits };
  }

  // Dotted aim line shown while a laser is equipped but not yet fired —
  // traces the exact bounce path so aiming it is a matter of reading the
  // line, not guessing.
  static drawPreview(ctx, tank, maze) {
    const tip = tank.getBarrelTip();
    const { points } = LaserBeam.traceBounce(maze, tip.x, tip.y, tank.angle);

    ctx.save();
    ctx.strokeStyle = Weapons.defs.laser.color;
    ctx.globalAlpha = 0.55;
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 5]);
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) ctx.lineTo(points[i].x, points[i].y);
    ctx.stroke();
    ctx.restore();
  }

  draw(ctx) {
    ctx.save();
    ctx.strokeStyle = Weapons.defs.laser.color;
    ctx.globalAlpha = Math.max(0, this.flashRemaining / LaserBeam.FLASH_TIME);
    ctx.lineWidth = 4;
    ctx.shadowColor = Weapons.defs.laser.color;
    ctx.shadowBlur = 8;

    ctx.beginPath();
    ctx.moveTo(this.points[0].x, this.points[0].y);
    for (let i = 1; i < this.points.length; i++) ctx.lineTo(this.points[i].x, this.points[i].y);
    ctx.stroke();
    ctx.restore();
  }
}
