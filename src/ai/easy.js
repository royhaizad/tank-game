// Easy-tier AI, per GAME_SPEC.md section 5: casually approaches the
// player with basic wall-avoidance, ~0.8s reaction delay, ~50% shot
// accuracy, and only ever fires when it has a direct, unobstructed line
// of sight to the player (no bank shots).
//
// update() produces the same {w,a,s,d} shape Input.keys already produces
// for the human player, plus a wantsToFire flag — so main.js can drive
// the AI's Tank through the exact same Tank.update()/firing code path the
// player uses. No changes needed to Tank, Bullet, or Maze for this.
class EasyAI {
  constructor() {
    this.reactionInterval = 0.8; // s, per GAME_SPEC.md section 5
    this.reactionTimer = 0;
    this.keys = { w: false, a: false, s: false, d: false };
    this.wantsToFire = false;
  }

  // Re-decides movement/firing intent roughly every reactionInterval
  // seconds; in between, it keeps repeating its last decision (this
  // "sluggishness" is the ~0.8s reaction delay from the spec).
  update(dt, tank, target, maze) {
    this.reactionTimer -= dt;
    if (this.reactionTimer <= 0) {
      this.reactionTimer = this.reactionInterval;
      this._decide(tank, target, maze);
    }
    return { keys: this.keys, wantsToFire: this.wantsToFire };
  }

  _decide(tank, target, maze) {
    this.keys = { w: false, a: false, s: false, d: false };

    if (this._isPathBlocked(tank, maze)) {
      // Basic wall-avoidance overrides seeking the player: turn instead
      // of driving into what's ahead.
      this.keys[Math.random() < 0.5 ? 'a' : 'd'] = true;
    } else {
      // Casually approach the player: turn toward their direction while
      // still driving forward, rather than stopping to aim first.
      const angleToTarget = Math.atan2(target.y - tank.y, target.x - tank.x);
      const angleDiff = EasyAI._normalizeAngle(angleToTarget - tank.angle);
      const turnDeadzone = 0.15; // radians, avoids jitter when nearly aligned already

      if (angleDiff > turnDeadzone) this.keys.d = true;
      else if (angleDiff < -turnDeadzone) this.keys.a = true;

      this.keys.w = true;
    }

    this.wantsToFire = this._decideFire(tank, target, maze);
  }

  _isPathBlocked(tank, maze) {
    const lookahead = tank.radius + 20; // px ahead of tank center
    const probeX = tank.x + Math.cos(tank.angle) * lookahead;
    const probeY = tank.y + Math.sin(tank.angle) * lookahead;
    return maze.wallRects.some(
      (wall) => probeX >= wall.left && probeX <= wall.right && probeY >= wall.top && probeY <= wall.bottom
    );
  }

  _decideFire(tank, target, maze) {
    if (target.destroyed) return false;

    const angleToTarget = Math.atan2(target.y - tank.y, target.x - tank.x);
    const angleDiff = Math.abs(EasyAI._normalizeAngle(angleToTarget - tank.angle));
    const facingThreshold = 0.26; // ~15 degrees, radians

    // Only ever considers firing when roughly lined up on a direct shot...
    if (angleDiff > facingThreshold) return false;
    // ...AND nothing is actually in the way along that line (no bank shots).
    if (!this._hasLineOfSight(tank, target, maze)) return false;
    if (maze.isBarrelBlocked(tank)) return false;

    return Math.random() < 0.5; // ~50% accuracy: only pulls the trigger about half the time
  }

  _hasLineOfSight(tank, target, maze) {
    for (const wall of maze.wallRects) {
      if (EasyAI._segmentIntersectsRect(tank.x, tank.y, target.x, target.y, wall)) return false;
    }
    return true;
  }

  // Standard slab-based segment-vs-axis-aligned-rectangle intersection
  // test: clips the parametric segment [0,1] against the rect's x and y
  // slabs; if any valid t-range survives, the segment passes through it.
  static _segmentIntersectsRect(x1, y1, x2, y2, rect) {
    let tMin = 0;
    let tMax = 1;
    const dx = x2 - x1;
    const dy = y2 - y1;

    const axes = [
      { d: dx, p1: x1, lo: rect.left, hi: rect.right },
      { d: dy, p1: y1, lo: rect.top, hi: rect.bottom }
    ];

    for (const axis of axes) {
      if (axis.d === 0) {
        if (axis.p1 < axis.lo || axis.p1 > axis.hi) return false;
        continue;
      }
      let t0 = (axis.lo - axis.p1) / axis.d;
      let t1 = (axis.hi - axis.p1) / axis.d;
      if (t0 > t1) [t0, t1] = [t1, t0];
      tMin = Math.max(tMin, t0);
      tMax = Math.min(tMax, t1);
      if (tMin > tMax) return false;
    }

    return true;
  }

  static _normalizeAngle(angle) {
    while (angle > Math.PI) angle -= Math.PI * 2;
    while (angle < -Math.PI) angle += Math.PI * 2;
    return angle;
  }
}
