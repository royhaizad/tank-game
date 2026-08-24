// Land mines, per GAME_SPEC.md section 4. Dropped under the tank (not out
// of the barrel), visible for 1 second, then invisible to everyone —
// including whoever dropped it. An armed mine kills ANY tank that touches
// it, its owner included; that self-risk is the mine's drawback.
//
// The one concession: a mine won't kill the tank that dropped it until
// that tank has driven clear of it once (see ownerHasLeft). Without that,
// dropping a mine while standing still is just suicide 0.35s later, which
// makes the weapon unusable rather than risky. Drive back over your own
// mine afterwards — and you will, because it's invisible by then — and it
// kills you exactly like anyone else's.
class Mine {
  static ARM_DELAY = 0.35; // s, before the mine is live at all
  static VISIBLE_FOR = 1; // s, per GAME_SPEC.md section 4
  static TRIGGER_RADIUS = 6; // px, mine's own body radius (plus the tank's)

  constructor(x, y, owner) {
    this.x = x;
    this.y = y;
    this.owner = owner;
    this.age = 0;
    this.alive = true;
    this.ownerHasLeft = false; // flips once the dropper drives clear
  }

  update(dt) {
    this.age += dt;
    if (!this.ownerHasLeft && this.owner && !this.triggeredBy(this.owner)) {
      this.ownerHasLeft = true;
    }
  }

  isArmed() {
    return this.age >= Mine.ARM_DELAY;
  }

  isVisible() {
    return this.age < Mine.VISIBLE_FOR;
  }

  triggeredBy(tank) {
    const dx = this.x - tank.x;
    const dy = this.y - tank.y;
    const reach = Mine.TRIGGER_RADIUS + tank.radius;
    return dx * dx + dy * dy <= reach * reach;
  }

  killsOnContact(tank) {
    if (!this.triggeredBy(tank)) return false;
    if (tank === this.owner && !this.ownerHasLeft) return false;
    return true;
  }

  draw(ctx) {
    if (!this.isVisible()) return;

    // Fades out over its last half-second rather than popping away, so a
    // player can see roughly where it went without being told forever.
    const fade = Math.max(0, 1 - this.age / Mine.VISIBLE_FOR);
    ctx.save();
    ctx.globalAlpha = fade;
    ctx.fillStyle = '#2b2b2b';
    ctx.beginPath();
    ctx.arc(this.x, this.y, Mine.TRIGGER_RADIUS, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#d94f4f';
    ctx.beginPath();
    ctx.arc(this.x, this.y, 2.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

// Owns every live mine for a match so main.js ticks one object rather
// than hand-rolling another collision pass in the match loop.
class MineField {
  constructor() {
    this.mines = [];
  }

  add(mine) {
    this.mines.push(mine);
  }

  // Returns [{ victim: matchEntry, owner: Tank }] for every tank an armed
  // mine caught this frame. The caller applies the kill so mine deaths go
  // through the same stats path as bullet deaths.
  update(dt, matchTanks) {
    const hits = [];

    this.mines.forEach((mine) => {
      mine.update(dt);
      if (!mine.alive || !mine.isArmed()) return;

      for (const entry of matchTanks) {
        if (entry.tank.destroyed) continue;
        if (!mine.killsOnContact(entry.tank)) continue;
        hits.push({ victim: entry, owner: mine.owner });
        mine.alive = false;
        break;
      }
    });

    this.mines = this.mines.filter((mine) => mine.alive);
    return hits;
  }

  draw(ctx) {
    this.mines.forEach((mine) => mine.draw(ctx));
  }
}
