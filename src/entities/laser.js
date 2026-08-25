// Fast (but not instant) laser beam, per GAME_SPEC.md section 4.
//
// Purpose: an aiming aid and a fast, long-range shot — not a delayed
// trap. The dotted aim line traces the beam's REAL path, including every
// bounce, so what you see is exactly what fires. Pressing fire locks that
// path immediately, but the beam then visibly travels along it at
// LaserBeam.TRAVEL_SPEED rather than resolving on the spot — a real, if
// brief, window for whoever's in its path to break line of sight before
// the leading edge actually reaches them.
//
// Wall rule: bounces off every wall (interior AND the outer boundary)
// with the same mirror-angle reflection as the cannon, up to
// LaserBeam.MAX_BOUNCES — it reuses Maze.moveWithBounce directly (the
// same function Bullet uses) so the physics are identical, not just
// similar.
//
// Drawback: telegraphed (the aim line is visible to every player, not
// just the shooter), the brief travel time is a genuine dodge window, and
// it's still only 1 shot.
class LaserBeam {
  static MAX_BOUNCES = 5; // matches Bullet.KINDS.cannon.maxBounces
  static TRAVEL_SPEED = 1400; // px/s — fast, but gives a real dodge window
  static FLASH_TIME = 0.15; // s the beam stays drawn once it lands
  static MAX_TRAVEL = 6000; // px, a generous safety ceiling — not a designed limit
  static STEP = 4; // px per raycast substep used to build the bounce path
  static HIT_SUBSTEPS = 4; // per-frame hit-test substeps, so a fast frame can't skip a tank
  static HIT_RADIUS = 2; // px of beam half-width, added to a tank's radius

  constructor(tank, maze) {
    this.owner = tank;

    const tip = tank.getBarrelTip();
    this.originX = tip.x;
    this.originY = tip.y;
    this.angle = tank.angle; // locked at fire time, never re-aimed

    // Geometry only, computed once — walls don't move, so the bounce path
    // is fixed the instant the shot is locked in. Whether it actually
    // catches anyone is resolved progressively in update(), against LIVE
    // tank positions, which is what gives the target a chance to dodge.
    this.points = LaserBeam.traceBounce(maze, this.originX, this.originY, this.angle).points;
    this.totalLength = LaserBeam._pathLength(this.points);

    this.travelled = 0; // px the leading edge has covered so far
    this.landed = false; // true once the leading edge stops (hit or reached the end)
    this.flashRemaining = LaserBeam.FLASH_TIME;

    // Tanks the beam caught, drained by main.js so laser kills go through
    // the same stats path as bullet kills. Filled the instant a hit
    // happens, not necessarily on the frame the beam was fired.
    this.pendingHits = [];
  }

  get alive() {
    return !this.landed || this.flashRemaining > 0;
  }

  update(dt, matchTanks) {
    if (this.landed) {
      this.flashRemaining -= dt;
      return;
    }

    const previousTravelled = this.travelled;
    this.travelled = Math.min(this.totalLength, this.travelled + LaserBeam.TRAVEL_SPEED * dt);

    // Hit-test in substeps across the stretch covered THIS frame, not just
    // the final leading-edge position, so a fast tank or a fast frame
    // can't tunnel through the check.
    for (let s = 1; s <= LaserBeam.HIT_SUBSTEPS; s++) {
      const d = previousTravelled + (this.travelled - previousTravelled) * (s / LaserBeam.HIT_SUBSTEPS);
      const point = LaserBeam._pointAt(this.points, d);
      const hitEntry = LaserBeam._findTankHit(point, matchTanks, this.owner);
      if (hitEntry) {
        // A shield bubble absorbs the beam outright (it deflects incoming
        // fire, section 4) — but, exactly like bullets, it never protects
        // against its own owner's shot.
        if (!(hitEntry.tank.hasShield() && hitEntry.tank !== this.owner)) this.pendingHits.push(hitEntry);
        this.travelled = d;
        this.landed = true;
        return;
      }
    }

    if (this.travelled >= this.totalLength) this.landed = true;
  }

  static _pathLength(points) {
    let total = 0;
    for (let i = 1; i < points.length; i++) {
      total += Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y);
    }
    return total;
  }

  // The point at `distance` along the polyline, clamped to its end.
  static _pointAt(points, distance) {
    let remaining = distance;
    for (let i = 1; i < points.length; i++) {
      const segLen = Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y);
      if (remaining <= segLen || i === points.length - 1) {
        const t = segLen > 0 ? Math.min(1, remaining / segLen) : 1;
        return {
          x: points[i - 1].x + (points[i].x - points[i - 1].x) * t,
          y: points[i - 1].y + (points[i].y - points[i - 1].y) * t
        };
      }
      remaining -= segLen;
    }
    return points[points.length - 1];
  }

  // The polyline vertices from the start up to `distance` along it — used
  // to draw the beam growing toward its target rather than appearing all
  // at once.
  static _truncatedPoints(points, distance) {
    const result = [points[0]];
    let remaining = distance;
    for (let i = 1; i < points.length; i++) {
      const segLen = Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y);
      if (remaining < segLen) {
        const t = segLen > 0 ? remaining / segLen : 0;
        result.push({
          x: points[i - 1].x + (points[i].x - points[i - 1].x) * t,
          y: points[i - 1].y + (points[i].y - points[i - 1].y) * t
        });
        return result;
      }
      result.push(points[i]);
      remaining -= segLen;
    }
    return result;
  }

  static _findTankHit(point, matchTanks, owner) {
    if (!matchTanks) return null;
    for (const entry of matchTanks) {
      if (entry.tank.destroyed) continue;
      const dx = point.x - entry.tank.x;
      const dy = point.y - entry.tank.y;
      const reach = entry.tank.radius + LaserBeam.HIT_RADIUS;
      if (dx * dx + dy * dy <= reach * reach) return entry;
    }
    return null;
  }

  // Marches a wall-only raycast forward, bouncing exactly like a bullet
  // (via Maze.moveWithBounce, reused directly rather than reimplemented)
  // for up to MAX_BOUNCES reflections or the MAX_TRAVEL safety ceiling.
  // Returns { points }: every vertex of the resulting polyline (origin,
  // each bounce, the end). Used both to build a fired beam's fixed path
  // and to draw the aim preview — neither ever takes tank positions into
  // account, so the preview can never reveal anything about opponents the
  // shooter couldn't already see.
  static traceBounce(maze, startX, startY, startAngle) {
    const mover = { x: startX, y: startY, angle: startAngle, radius: LaserBeam.HIT_RADIUS };
    const points = [{ x: mover.x, y: mover.y }];
    let bounces = 0;
    let travelled = 0;

    while (travelled < LaserBeam.MAX_TRAVEL) {
      const dx = Math.cos(mover.angle) * LaserBeam.STEP;
      const dy = Math.sin(mover.angle) * LaserBeam.STEP;
      const result = maze.moveWithBounce(mover, dx, dy);
      mover.x = result.x;
      mover.y = result.y;
      travelled += LaserBeam.STEP;

      if (result.bounced) {
        points.push({ x: mover.x, y: mover.y });
        bounces++;
        if (bounces >= LaserBeam.MAX_BOUNCES) return { points };
      }
    }

    points.push({ x: mover.x, y: mover.y }); // hit the travel safety ceiling
    return { points };
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
    const visible = LaserBeam._truncatedPoints(this.points, this.travelled);

    ctx.save();
    ctx.strokeStyle = Weapons.defs.laser.color;
    ctx.globalAlpha = this.landed ? Math.max(0, this.flashRemaining / LaserBeam.FLASH_TIME) : 0.9;
    ctx.lineWidth = 4;
    ctx.shadowColor = Weapons.defs.laser.color;
    ctx.shadowBlur = 8;

    ctx.beginPath();
    ctx.moveTo(visible[0].x, visible[0].y);
    for (let i = 1; i < visible.length; i++) ctx.lineTo(visible[i].x, visible[i].y);
    ctx.stroke();
    ctx.restore();
  }
}
