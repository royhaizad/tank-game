// Land mines, per GAME_SPEC.md section 4. Dropped under the tank (not out
// of the barrel). Lifecycle: visible for 1s right after being dropped,
// then invisible to everyone — including whoever dropped it — until a
// tank steps on it. Stepping onto a hidden mine reveals it again (with a
// sound); stepping back OFF it detonates it into a spray of shrapnel
// (see shrapnel.js) rather than killing on contact directly. The mine
// itself never hurts anyone — only its shrapnel does.
//
// The one concession: a mine won't detonate on the tank that dropped it
// the FIRST time they step off it (see ownerHasLeft) — otherwise dropping
// one while stationary would explode in the dropper's face 0.35s later,
// making the weapon unusable rather than risky. Step onto your own mine
// again later (you will, since it's invisible again by then) and leave it
// a second time, and it detonates on you exactly like anyone else's.
//
// A real detonation isn't instant either — once a step-off actually
// triggers it, it's a committed FUSE_DELAY away from going off rather
// than blowing the instant the trigger condition is met.
class Mine {
  static ARM_DELAY = 0.35; // s before the mine can be triggered at all
  static VISIBLE_FOR = 1; // s the mine stays visible right after being dropped
  static TRIGGER_RADIUS = 12; // px, mine's own body radius (plus the tank's) — same radius as the drawn black circle, not the small red center dot
  static FUSE_DELAY = 0.5; // s between a real trigger and the actual detonation

  constructor(x, y, owner) {
    this.x = x;
    this.y = y;
    this.owner = owner;
    this.age = 0;
    this.alive = true;
    this.ownerHasLeft = false; // one-time grace: the owner's first departure is safe

    this.revealed = false; // stepped-on visible state, separate from the placement window
    this.occupants = new Set(); // tanks currently touching, refreshed every frame
    this.fuseRemaining = null; // set once triggered; counts down to the actual detonation
  }

  isArmed() {
    return this.age >= Mine.ARM_DELAY;
  }

  // Visible either during its brief placement window, once a tank has
  // stepped on it and revealed it, or while its fuse is burning.
  isVisible() {
    return this.age < Mine.VISIBLE_FOR || this.revealed || this.fuseRemaining !== null;
  }

  triggeredBy(tank) {
    const dx = this.x - tank.x;
    const dy = this.y - tank.y;
    const reach = Mine.TRIGGER_RADIUS + tank.radius;
    return dx * dx + dy * dy <= reach * reach;
  }

  // Advances the reveal/fuse/detonate state machine. Returns { revealed,
  // exploded } so MineField can turn those into sounds and a shrapnel
  // burst — this class only tracks state, it doesn't know about audio or
  // Shrapnel. `exploded` is only ever true on the frame the fuse actually
  // runs out, not the frame that lit it.
  update(dt, matchTanks) {
    this.age += dt;

    // A lit fuse is a done deal — ignore everything else and just count
    // down to the detonation.
    if (this.fuseRemaining !== null) {
      this.fuseRemaining -= dt;
      if (this.fuseRemaining > 0) return { revealed: false, exploded: false };
      this.alive = false;
      return { revealed: false, exploded: true };
    }

    if (!this.isArmed()) return { revealed: false, exploded: false };

    const current = new Set(
      matchTanks
        .filter((entry) => !entry.tank.destroyed && this.triggeredBy(entry.tank))
        .map((entry) => entry.tank)
    );

    let revealedNow = false;
    if (!this.revealed && current.size > 0) {
      this.revealed = true;
      revealedNow = true;
    }

    if (this.revealed) {
      const departed = [...this.occupants].filter((tank) => !current.has(tank));
      let triggered = false;
      for (const tank of departed) {
        if (tank === this.owner && !this.ownerHasLeft) {
          this.ownerHasLeft = true; // one-time grace, used up
        } else {
          triggered = true;
        }
      }

      if (triggered) {
        this.fuseRemaining = Mine.FUSE_DELAY; // lit — detonates in a future update()
      } else if (departed.length > 0 && current.size === 0) {
        // Everyone who was here left harmlessly (via the owner's grace)
        // and nobody new has stepped on yet — go back to waiting.
        this.revealed = false;
      }
    }

    this.occupants = current;
    return { revealed: revealedNow, exploded: false };
  }

  draw(ctx) {
    if (!this.isVisible()) return;

    // Fades out over the placement window only — once revealed by a tank
    // stepping on it, it stays fully visible until it detonates.
    const fadingOut = this.age < Mine.VISIBLE_FOR && !this.revealed;
    const fade = fadingOut ? Math.max(0, 1 - this.age / Mine.VISIBLE_FOR) : 1;
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
// than hand-rolling another state pass in the match loop.
class MineField {
  constructor() {
    this.mines = [];
  }

  add(mine) {
    this.mines.push(mine);
  }

  // Ticks every mine's reveal/detonate state machine. Returns
  // { revealed, exploded, shrapnel } — mines no longer kill directly on
  // contact; only the shrapnel from a detonation does (see shrapnel.js),
  // resolved by main.js the same way bullet collisions are.
  update(dt, matchTanks) {
    let revealed = false;
    let exploded = false;
    const shrapnel = [];

    this.mines.forEach((mine) => {
      const result = mine.update(dt, matchTanks);
      if (result.revealed) revealed = true;
      if (result.exploded) {
        exploded = true;
        shrapnel.push(...Shrapnel.burst(mine.x, mine.y, mine.owner));
      }
    });

    this.mines = this.mines.filter((mine) => mine.alive);
    return { revealed, exploded, shrapnel };
  }

  draw(ctx) {
    this.mines.forEach((mine) => mine.draw(ctx));
  }
}
