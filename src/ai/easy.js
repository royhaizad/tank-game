// Easy-tier AI, per GAME_SPEC.md section 5.
//
// Movement is a small state machine that reacts to obstacles every frame
// (stop -> turn -> try the new heading -> reverse-and-retry if that also
// fails), rather than blindly holding forward while steering. Which point
// it steers toward (the player directly, or a pathfound waypoint when out
// of sight) is only reconsidered every ~0.8s reaction tick — that's the
// "casual" part; obstacle response itself is immediate so it doesn't lean
// on walls waiting for its next reaction tick.
//
// Firing fires reliably (no random chance) once the player has been
// continuously aimed-at and directly visible for 0.5s, and only ever
// while that line of sight stays clear (no bank shots).
//
// update() produces the same { forward, backward, left, right } action
// shape Tank.update() expects from a human player (see Input.playerBindings
// in input.js), plus a wantsToFire flag — so main.js can drive the AI's
// Tank through the exact same Tank.update()/firing code path players use.
// No changes needed to Tank, Bullet, or Maze for this.
class EasyAI {
  constructor() {
    this.reactionInterval = 0.8; // s, per GAME_SPEC.md section 5 (re-targeting cadence only)
    this.reactionTimer = 0;

    this.keys = { forward: false, backward: false, left: false, right: false };
    this.wantsToFire = false;

    // FFA: whichever other living tank is currently nearest by path
    // distance (see _nearestOpponent). Re-evaluated every reaction tick,
    // or immediately if the current target is destroyed.
    this.target = null;

    // Where to steer toward — the target directly, or a pathfound
    // waypoint — refreshed every reaction tick by _retarget().
    this.steerPoint = null;

    // Movement state machine.
    this.moveState = 'seek'; // 'seek' | 'blockedTurn' | 'attempting' | 'reversing'
    this.turnDirection = 'left';
    this.stateTimer = 0;
    this.blockedTurnTimeout = 1.2; // s, safety cap so it can't spin in place forever
    this.attemptDuration = 0.5; // s, how long it tries the new heading before giving up
    this.reverseDuration = 0.5; // s, how long it backs up before retrying

    // Pathfinding.
    this.waypointCell = null; // cell currently being steered toward, when pathfinding
    this.pathTargetCell = null; // the target's cell the current path was planned for

    // Firing.
    this.sightedTime = 0; // s, how long the player has been continuously aimed-at + visible
    this.requiredSightedTime = 0.5; // s, per GAME_SPEC.md section 5
    this.facingThreshold = 0.26; // ~15 degrees, radians
  }

  // `opponents`: every other tank in the match (living or destroyed —
  // this filters for itself). FFA per GAME_SPEC.md section 5: targets
  // whichever is nearest by path distance, player or AI alike.
  update(dt, tank, opponents, maze) {
    if (!this.target || this.target.destroyed) {
      this.target = this._nearestOpponent(tank, opponents, maze);
      if (this.target) this._retarget(tank, this.target, maze);
    }

    this.reactionTimer -= dt;
    if (this.reactionTimer <= 0) {
      this.reactionTimer = this.reactionInterval;
      const nearest = this._nearestOpponent(tank, opponents, maze);
      if (nearest) {
        this.target = nearest;
        this._retarget(tank, this.target, maze);
      }
    }

    if (this.target) {
      this._updateMovement(dt, tank, maze);
      this._updateFiring(dt, tank, this.target, maze);
    } else {
      this.keys = { forward: false, backward: false, left: false, right: false };
      this.wantsToFire = false;
    }

    return { keys: this.keys, wantsToFire: this.wantsToFire };
  }

  // Nearest other living tank by path distance through the maze (not
  // straight-line) — consistent with "no bank shots"/pathfound-movement
  // philosophy elsewhere in this AI: a straight-line-nearest opponent
  // could be on the far side of a wall while a path-nearer one is actually
  // closer to reach.
  _nearestOpponent(tank, opponents, maze) {
    const alive = opponents.filter((opponent) => !opponent.destroyed);
    if (alive.length === 0) return null;

    const dist = maze._bfsDistances([maze.worldToCell(tank.x, tank.y)]);

    let nearest = null;
    let nearestDist = Infinity;
    for (const opponent of alive) {
      const cell = maze.worldToCell(opponent.x, opponent.y);
      const d = dist[cell.row][cell.col];
      if (d >= 0 && d < nearestDist) {
        nearestDist = d;
        nearest = opponent;
      }
    }
    return nearest || alive[0];
  }

  // Decides WHAT to steer toward: always the next waypoint on a pathfound
  // route through the maze grid, never a raw straight line to the target.
  // A raw line can look clear (a thin sightline through a gap, or across
  // a dead-end alcove) while no walkable path actually follows it — that
  // mismatch is what drove the AI into dead ends before. Line of sight is
  // still used for firing (see _updateFiring), just never for movement.
  _retarget(tank, target, maze) {
    this.steerPoint = this._nextWaypoint(tank, target, maze) || { x: target.x, y: target.y };
  }

  // Executes the current steering point via a stop/turn/try/reverse state
  // machine, reacting to obstacles immediately rather than on the
  // reaction-tick cadence.
  _updateMovement(dt, tank, maze) {
    this.stateTimer += dt;

    const steerAngle = Math.atan2(this.steerPoint.y - tank.y, this.steerPoint.x - tank.x);
    const angleDiff = EasyAI._normalizeAngle(steerAngle - tank.angle);
    const turnDeadzone = 0.15; // radians, avoids jitter when nearly aligned already

    if (this.moveState === 'seek') {
      if (this._isPathBlocked(tank, maze)) {
        this.moveState = 'blockedTurn';
        this.turnDirection = angleDiff >= 0 ? 'right' : 'left'; // bias toward where it actually wants to go
        this.stateTimer = 0;
        this.keys = { forward: false, backward: false, left: false, right: false };
        this.keys[this.turnDirection] = true;
        return;
      }

      this.keys = { forward: true, backward: false, left: false, right: false };
      if (angleDiff > turnDeadzone) this.keys.right = true;
      else if (angleDiff < -turnDeadzone) this.keys.left = true;
      return;
    }

    if (this.moveState === 'blockedTurn') {
      this.keys = { forward: false, backward: false, left: false, right: false };
      this.keys[this.turnDirection] = true;

      if (!this._isPathBlocked(tank, maze) || this.stateTimer >= this.blockedTurnTimeout) {
        this.moveState = 'attempting';
        this.stateTimer = 0;
      }
      return;
    }

    if (this.moveState === 'attempting') {
      if (this._isPathBlocked(tank, maze)) {
        this.moveState = 'reversing';
        this.stateTimer = 0;
        this.keys = { forward: false, backward: true, left: false, right: false };
        return;
      }

      this.keys = { forward: true, backward: false, left: false, right: false };
      if (this.stateTimer >= this.attemptDuration) {
        this.moveState = 'seek';
        this.stateTimer = 0;
      }
      return;
    }

    // 'reversing'
    this.keys = { forward: false, backward: true, left: false, right: false };
    if (this.stateTimer >= this.reverseDuration) {
      this.moveState = 'blockedTurn';
      this.turnDirection = this.turnDirection === 'left' ? 'right' : 'left'; // alternate: try the other way this time
      this.stateTimer = 0;
    }
  }

  // Fires reliably once the player has been continuously aimed-at and
  // directly visible for requiredSightedTime — not a random chance, so it
  // doesn't sit on a sighted player waiting for a lucky roll. Resets the
  // instant that stops being true (player breaks line of sight, or the
  // AI turns away), so it never fires blind.
  _updateFiring(dt, tank, target, maze) {
    if (target.destroyed) {
      this.sightedTime = 0;
      this.wantsToFire = false;
      return;
    }

    const angleToTarget = Math.atan2(target.y - tank.y, target.x - tank.x);
    const angleDiff = Math.abs(EasyAI._normalizeAngle(angleToTarget - tank.angle));
    const aimedAndVisible =
      angleDiff <= this.facingThreshold && this._hasLineOfSight(tank, target, maze) && !maze.isBarrelBlocked(tank);

    this.sightedTime = aimedAndVisible ? this.sightedTime + dt : 0;
    this.wantsToFire = aimedAndVisible && this.sightedTime >= this.requiredSightedTime;
  }

  // The world-space center of the next cell along a BFS-shortest path
  // from the tank's current cell to the target's — i.e. the immediate
  // waypoint to steer toward when there's no direct line to the target.
  //
  // Commits to the same waypoint cell across multiple reaction ticks
  // instead of re-planning every tick: an open maze often has several
  // equally-short routes, so re-planning from scratch each tick could
  // flip-flop between different valid routes and never actually get
  // anywhere. Only re-plans once the tank has actually reached its
  // current waypoint cell, or once the target has moved to a new cell.
  _nextWaypoint(tank, target, maze) {
    const fromCell = maze.worldToCell(tank.x, tank.y);
    const toCell = maze.worldToCell(target.x, target.y);

    const reachedWaypoint =
      !this.waypointCell || (fromCell.row === this.waypointCell.row && fromCell.col === this.waypointCell.col);
    const targetMoved =
      !this.pathTargetCell || this.pathTargetCell.row !== toCell.row || this.pathTargetCell.col !== toCell.col;

    if (reachedWaypoint || targetMoved) {
      const path = maze.findPath(fromCell, toCell);
      this.pathTargetCell = toCell;
      this.waypointCell = path && path.length >= 2 ? path[1] : null;
    }

    return this.waypointCell ? maze._cellCenter(this.waypointCell.row, this.waypointCell.col) : null;
  }

  // Whether something is blocking the tank's path forward. Uses a small
  // rectangular sensor spanning a stretch of ground ahead (rather than a
  // single point at one fixed distance) so a thin wall can't be missed
  // just because it happens to fall between sample points.
  _isPathBlocked(tank, maze) {
    const sensorLength = 24; // px of ground ahead the sensor covers
    const sensorCenterDist = tank.radius + sensorLength / 2;
    const sensor = {
      cx: tank.x + Math.cos(tank.angle) * sensorCenterDist,
      cy: tank.y + Math.sin(tank.angle) * sensorCenterDist,
      halfW: sensorLength / 2,
      halfH: tank.radius * 0.6, // narrower than the full body, just checks roughly straight ahead
      angle: tank.angle
    };

    return maze.wallRects.some((wall) => Maze._satOverlap(sensor, Maze._wallShape(wall)));
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
