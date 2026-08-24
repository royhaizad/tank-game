// Instant-hit laser beam, per GAME_SPEC.md section 4.
//
// Wall rules: the beam passes through exactly ONE thin interior wall, and
// is stopped dead by the thick outer boundary (maze.js tags boundary wall
// rects with isBoundary for exactly this).
//
// Drawback: a setup delay that is also a telegraph. While the laser is
// equipped, LaserBeam.drawPreview draws a dotted aim line every frame that
// every other player can see. Pressing fire locks the origin and angle
// immediately, then charges for CHARGE_TIME before the beam actually
// lands — so turning to track a moving target after committing does
// nothing, and the target gets half a second of warning to break the line.
class LaserBeam {
  static CHARGE_TIME = 0.5; // s of visible wind-up before the beam lands
  static FLASH_TIME = 0.18; // s the fired beam stays drawn
  static MAX_RANGE = 2000; // px, effectively "until it hits something"
  static STEP = 2; // px per raycast step
  static HIT_RADIUS = 2; // px of beam half-width, added to a tank's radius

  constructor(tank, maze) {
    this.owner = tank;
    this.maze = maze;

    const tip = tank.getBarrelTip();
    this.x = tip.x;
    this.y = tip.y;
    this.angle = tank.angle; // locked at fire time, never re-aimed

    this.chargeRemaining = LaserBeam.CHARGE_TIME;
    this.flashRemaining = LaserBeam.FLASH_TIME;
    this.fired = false;
    this.end = LaserBeam.trace(maze, this.x, this.y, this.angle).end;

    // Tanks the beam caught, drained by main.js so laser kills go through
    // the same stats path as bullet kills.
    this.pendingHits = [];
  }

  get alive() {
    return !this.fired || this.flashRemaining > 0;
  }

  update(dt, matchTanks) {
    if (!this.fired) {
      this.chargeRemaining -= dt;
      // The preview keeps updating during the wind-up only because walls
      // never move; the angle itself stays locked to the firing moment.
      if (this.chargeRemaining <= 0) {
        this.fired = true;
        const result = LaserBeam.trace(this.maze, this.x, this.y, this.angle, matchTanks, this.owner);
        this.end = result.end;
        this.pendingHits = result.hits;
      }
      return;
    }
    this.flashRemaining -= dt;
  }

  // Marches the beam forward. `matchTanks` is optional — the aim preview
  // traces walls only, so it never reveals anything about tank positions
  // the shooter can't already see.
  static trace(maze, startX, startY, angle, matchTanks, owner) {
    const dx = Math.cos(angle) * LaserBeam.STEP;
    const dy = Math.sin(angle) * LaserBeam.STEP;
    let x = startX;
    let y = startY;

    let pierced = 0;
    let insideWall = null; // the wall rect currently being passed through
    const hits = [];

    for (let travelled = 0; travelled < LaserBeam.MAX_RANGE; travelled += LaserBeam.STEP) {
      x += dx;
      y += dy;

      if (x < 0 || y < 0 || x > maze.width || y > maze.height) break;

      const wall = maze.wallAt(x, y);
      if (wall) {
        // Only count a pierce when ENTERING a new wall — a 6px wall spans
        // several steps, and two perpendicular walls can touch at a corner.
        if (wall !== insideWall) {
          if (wall.isBoundary) break; // thick outer wall: hard stop
          pierced++;
          if (pierced > 1) break; // only one thin wall gets pierced
          insideWall = wall;
        }
      } else {
        insideWall = null;
      }

      if (matchTanks) {
        for (const entry of matchTanks) {
          if (entry.tank.destroyed || hits.includes(entry)) continue;
          const tdx = x - entry.tank.x;
          const tdy = y - entry.tank.y;
          const reach = entry.tank.radius + LaserBeam.HIT_RADIUS;
          if (tdx * tdx + tdy * tdy > reach * reach) continue;

          // A shield bubble absorbs the beam outright (it deflects
          // incoming fire, section 4) — but, exactly like bullets, it
          // never protects against its own owner's shot.
          if (entry.tank.hasShield() && entry.tank !== owner) {
            return { end: { x, y }, hits };
          }
          hits.push(entry);
        }
      }
    }

    return { end: { x, y }, hits };
  }

  // Dotted aim line shown while a laser is equipped but not yet fired —
  // the telegraph half of the laser's drawback.
  static drawPreview(ctx, tank, maze) {
    const tip = tank.getBarrelTip();
    const { end } = LaserBeam.trace(maze, tip.x, tip.y, tank.angle);

    ctx.save();
    ctx.strokeStyle = Weapons.defs.laser.color;
    ctx.globalAlpha = 0.55;
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 5]);
    ctx.beginPath();
    ctx.moveTo(tip.x, tip.y);
    ctx.lineTo(end.x, end.y);
    ctx.stroke();
    ctx.restore();
  }

  draw(ctx) {
    ctx.save();
    ctx.strokeStyle = Weapons.defs.laser.color;
    ctx.beginPath();
    ctx.moveTo(this.x, this.y);
    ctx.lineTo(this.end.x, this.end.y);

    if (!this.fired) {
      // Winding up: a brighter, thickening dotted line so everyone can see
      // a laser is about to land, and roughly where.
      const charged = 1 - this.chargeRemaining / LaserBeam.CHARGE_TIME;
      ctx.globalAlpha = 0.5 + charged * 0.4;
      ctx.lineWidth = 1 + charged * 2;
      ctx.setLineDash([3, 4]);
    } else {
      ctx.globalAlpha = Math.max(0, this.flashRemaining / LaserBeam.FLASH_TIME);
      ctx.lineWidth = 4;
      ctx.shadowColor = Weapons.defs.laser.color;
      ctx.shadowBlur = 8;
    }

    ctx.stroke();
    ctx.restore();
  }
}
