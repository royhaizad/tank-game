// Easy-tier AI, per GAME_SPEC.md section 5: semi-random movement with
// basic wall-avoidance, ~0.8s reaction delay, ~50% shot accuracy, no
// intentional bank shots.
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
      // Basic wall-avoidance: turn instead of driving into it.
      this.keys[Math.random() < 0.5 ? 'a' : 'd'] = true;
    } else {
      const roll = Math.random();
      if (roll < 0.6) {
        this.keys.w = true; // mostly drive forward
      } else if (roll < 0.85) {
        this.keys.w = true;
        this.keys[Math.random() < 0.5 ? 'a' : 'd'] = true; // forward while turning
      } else {
        this.keys[Math.random() < 0.5 ? 'a' : 'd'] = true; // turn in place
      }
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

    // No bank shots: only ever considers firing when roughly lined up on
    // a direct shot, never aims for a wall-bounce trick shot.
    if (angleDiff > facingThreshold) return false;
    if (maze.isBarrelBlocked(tank)) return false;

    return Math.random() < 0.5; // ~50% accuracy: only pulls the trigger about half the time
  }

  static _normalizeAngle(angle) {
    while (angle > Math.PI) angle -= Math.PI * 2;
    while (angle < -Math.PI) angle += Math.PI * 2;
    return angle;
  }
}
