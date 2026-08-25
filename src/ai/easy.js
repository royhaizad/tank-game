// Easy-tier AI, per GAME_SPEC.md section 5.
//
// Movement is "hallway driving": the pathfound route is compressed into
// long straight runs (see _nextWaypoint) so the AI commits to one heading
// down a whole corridor instead of re-aiming at every single maze cell —
// that per-cell re-aiming was reading as a zigzag. It only actually turns
// at real corners/junctions, and does so as a deliberate stop-and-pivot
// (the 'cornerTurn' state) rather than swinging through the turn while
// still moving, which was clipping the inside corner. Reactive obstacle
// avoidance (stop -> turn -> try -> reverse-and-retry) still reacts every
// frame on top of this for anything the planned route didn't anticipate
// (another tank in the way, a sensor catching a wall early). Which
// waypoint to steer toward is refreshed every frame (cheap: it only
// recomputes the BFS path when the route actually needs to change); only
// which opponent to target stays on the ~0.8s reaction cadence — that's
// the "casual" part.
//
// Firing fires reliably (no random chance) the instant the player is
// aimed-at and directly visible (0s delay), and only ever while that line
// of sight stays clear (no bank shots).
//
// Reactive obstacle handling turns to align *parallel* with whichever wall
// it hit, picking the parallel direction (of the two) that's closer to the
// waypoint it's trying to reach, then drives forward hugging that wall —
// closer to how Tank Trouble's "Laika" AI reads (A*-driven, discrete
// behaviors, no full random flailing) than a fixed-duration blind turn. If
// it still can't get through after a few blocked/reverse cycles in a row
// (a real loop, e.g. a pocket the waypoint can't actually reach this way),
// it forces a fresh path replan rather than retrying forever.
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

    // Per-tier ammo limits, read by main.js startMatch and applied to this
    // AI's Tank — stricter than the player's 5-bullet/no-cooldown base
    // cannon, per GAME_SPEC.md section 5. Each tier owns its own numbers
    // (see HardAI), so the ladder lives with the AI rather than in main.js.
    this.maxActiveBullets = 1;
    this.fireCooldownDuration = 1; // s

    // FFA: whichever other living tank is currently nearest by path
    // distance (see _nearestOpponent). Re-evaluated every reaction tick,
    // or immediately if the current target is destroyed.
    this.target = null;

    // Where to steer toward — the target directly, or the far end of the
    // current straight pathfound run — refreshed every frame by
    // _nextWaypoint() (see update()).
    this.steerPoint = null;

    // Movement state machine.
    this.moveState = 'seek'; // 'seek' | 'cornerTurn' | 'blockedTurn' | 'attempting' | 'reversing'
    this.turnDirection = 'left';
    this.targetHeading = 0; // rad, the heading blockedTurn/cornerTurn is turning toward
    this.stateTimer = 0;
    this.blockedTurnTimeout = 1.2; // s, safety cap so it can't spin in place forever
    this.attemptDuration = 0.5; // s, how long it tries the new heading before giving up
    this.baseReverseDuration = 0.5; // s, how long it backs up before retrying
    this.reverseDuration = this.baseReverseDuration;
    this.alignThreshold = 0.12; // rad, how close to targetHeading counts as "aligned"

    // A deliberate stop-and-pivot triggered proactively when a fresh
    // waypoint requires a sharp heading change (a real corner), rather
    // than swinging through the turn while still driving forward — that
    // car-style cornering was clipping the inside wall of tight corridors.
    this.cornerTurnThreshold = 0.6; // rad (~34deg): bigger than this -> pivot in place first
    this.cornerTurnTimeout = 1.0; // s, safety cap
    this.pendingCornerHeading = null; // set by _nextWaypoint when a new run starts

    // Stuck detection: counts consecutive blocked/reverse cycles without a
    // real stretch of unobstructed forward progress in between. If it hits
    // the limit, the current waypoint is probably not actually reachable
    // this way (e.g. a pocket), so force a fresh path replan instead of
    // retrying the same turn/reverse dance forever.
    this.seekTimer = 0;
    this.stuckCycles = 0;
    this.stuckCycleLimit = 2;
    this.forceAlternateTurn = false; // flips the wall-heading tie-break once after a forced replan, so a symmetric pocket doesn't just repeat the same losing turn

    // Pathfinding.
    this.waypointCell = null; // far end of the current straight run being steered toward
    this.pathTargetCell = null; // the target's cell the current path was planned for
    this.currentPath = null; // full BFS path the current waypointCell was chosen from, for validity checks

    // Firing.
    this.sightedTime = 0; // s, how long the player has been continuously aimed-at + visible
    this.requiredSightedTime = 0; // s, fires instantly once aimed-at + visible (no delay)
    this.facingThreshold = 0.26; // ~15 degrees, radians
  }

  // `opponents`: the tanks this AI is willing to target (living or
  // destroyed — this filters for itself), and nothing else decides that.
  // Per GAME_SPEC.md section 5 it targets whichever is nearest by path
  // distance, player or AI alike. In all-vs-all the caller passes every
  // other tank; in team mode it passes only the enemy team, which is the
  // whole of team-awareness here — friendly fire is still ON, so a
  // teammate this never aimed at can still die to its ricochet.
  //
  // Which opponent to target stays on the ~0.8s reaction cadence (the
  // "casual" trait). Which waypoint to steer toward is refreshed every
  // frame regardless — it's a cheap cell comparison that only recomputes
  // the actual BFS path when the route needs to change (see
  // _nextWaypoint), so this doesn't reintroduce per-tick flip-flopping;
  // it just means a corner or a newly-unreachable waypoint gets noticed
  // the instant it happens instead of up to 0.8s late.
  update(dt, tank, opponents, maze) {
    if (!this.target || this.target.destroyed) {
      this.target = this._nearestOpponent(tank, opponents, maze);
    }

    this.reactionTimer -= dt;
    if (this.reactionTimer <= 0) {
      this.reactionTimer = this.reactionInterval;
      const nearest = this._nearestOpponent(tank, opponents, maze);
      if (nearest) this.target = nearest;
    }

    if (this.target) {
      this.steerPoint = this._nextWaypoint(tank, this.target, maze) || { x: this.target.x, y: this.target.y };
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

  // Executes the current steering point via a stop/turn/try/reverse state
  // machine, reacting to obstacles immediately rather than on the
  // reaction-tick cadence. The turn itself aligns parallel to whichever
  // wall it hit (see _chooseTurn) rather than turning for a fixed
  // duration, so it comes out of the turn already hugging the wall in the
  // direction that's actually useful, instead of guessing.
  _updateMovement(dt, tank, maze) {
    this.stateTimer += dt;

    const steerAngle = Math.atan2(this.steerPoint.y - tank.y, this.steerPoint.x - tank.x);
    const angleDiff = EasyAI._normalizeAngle(steerAngle - tank.angle);
    // Tight on purpose: waypoints are now far down a straight corridor run
    // (see _nextWaypoint), so even a small angleDiff means real lateral
    // drift off the corridor centerline over that distance — a loose
    // deadzone here was letting that drift go uncorrected long enough to
    // graze the near wall.
    const turnDeadzone = 0.03; // radians, avoids jitter when nearly aligned already

    if (this.moveState === 'seek') {
      this.seekTimer += dt;
      if (this.seekTimer > 0.4) this.stuckCycles = 0; // a real stretch of unobstructed progress -> not stuck

      if (this.pendingCornerHeading !== null) {
        // A fresh waypoint just started a new straight run that requires a
        // real turn (see _nextWaypoint) -> stop and pivot cleanly instead
        // of swinging through it while still driving forward, which was
        // clipping the inside corner.
        this.targetHeading = this.pendingCornerHeading;
        this.pendingCornerHeading = null;
        const rotDiff = EasyAI._normalizeAngle(this.targetHeading - tank.angle);
        this.turnDirection = rotDiff >= 0 ? 'right' : 'left';
        this.moveState = 'cornerTurn';
        this.stateTimer = 0;
        this.keys = { forward: false, backward: false, left: false, right: false };
        this.keys[this.turnDirection] = true;
        return;
      }

      if (this._isPathBlocked(tank, maze)) {
        this._chooseTurn(tank, maze);
        this.moveState = 'blockedTurn';
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

    this.seekTimer = 0;

    if (this.moveState === 'cornerTurn') {
      this.keys = { forward: false, backward: false, left: false, right: false };
      this.keys[this.turnDirection] = true;

      const headingDiff = Math.abs(EasyAI._normalizeAngle(this.targetHeading - tank.angle));
      if (headingDiff <= this.alignThreshold || this.stateTimer >= this.cornerTurnTimeout) {
        this.moveState = 'seek';
        this.stateTimer = 0;
      }
      return;
    }

    if (this.moveState === 'blockedTurn') {
      this.keys = { forward: false, backward: false, left: false, right: false };
      this.keys[this.turnDirection] = true;

      const headingDiff = Math.abs(EasyAI._normalizeAngle(this.targetHeading - tank.angle));
      const aligned = headingDiff <= this.alignThreshold;
      const cleared = !this._isPathBlocked(tank, maze);

      if (aligned || cleared || this.stateTimer >= this.blockedTurnTimeout) {
        this.moveState = 'attempting';
        this.stateTimer = 0;
      }
      return;
    }

    if (this.moveState === 'attempting') {
      if (this._isPathBlocked(tank, maze)) {
        // Blocked again almost immediately after aligning -> this was a
        // corner/dead-end, not a through-corridor. Back off and retry.
        this.stuckCycles += 1;
        this.reverseDuration = this.stuckCycles >= this.stuckCycleLimit ? this.baseReverseDuration * 2 : this.baseReverseDuration;
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
      if (this.stuckCycles >= this.stuckCycleLimit) {
        // Several blocked/reverse cycles in a row without a real gap of
        // seek progress -> the current waypoint likely isn't reachable
        // this way. Force a fresh path plan instead of repeating the same
        // turn/reverse dance forever.
        this.stuckCycles = 0;
        this.waypointCell = null;
        this.forceAlternateTurn = true;
      }
      this._chooseTurn(tank, maze);
      this.moveState = 'blockedTurn';
      this.stateTimer = 0;
    }
  }

  // Picks which way to turn when blocked, and what heading to turn toward.
  // If a wall is currently sensed, turns to align *parallel* to it —
  // whichever of the wall's two parallel headings (walls here are always
  // axis-aligned, see maze.js) is closer to the direction of the current
  // waypoint, so the choice actually favors making progress rather than
  // just picking a side. Falls back to aiming straight at the waypoint
  // if no wall is currently sensed (e.g. right after reversing away from
  // one).
  _chooseTurn(tank, maze) {
    const wall = this._sensedWall(tank, maze);
    const steerAngle = Math.atan2(this.steerPoint.y - tank.y, this.steerPoint.x - tank.x);

    let targetHeading = steerAngle;
    if (wall) {
      const [headingA, headingB] = EasyAI._wallParallelHeadings(wall);
      const diffA = Math.abs(EasyAI._normalizeAngle(headingA - steerAngle));
      const diffB = Math.abs(EasyAI._normalizeAngle(headingB - steerAngle));
      const preferA = diffA <= diffB;
      targetHeading = preferA !== this.forceAlternateTurn ? headingA : headingB;
    }
    this.forceAlternateTurn = false;

    this.targetHeading = targetHeading;
    const rotDiff = EasyAI._normalizeAngle(targetHeading - tank.angle);
    this.turnDirection = rotDiff >= 0 ? 'right' : 'left';
  }

  // The two headings a tank could face to run parallel along a given
  // wall (walls are always axis-aligned rects, see maze.js _buildWallRects
  // / _wallShape). A wide-and-thin rect runs along the x-axis, so its
  // parallel headings are east/west; a tall-and-thin one runs along the
  // y-axis, so its parallel headings are south/north.
  static _wallParallelHeadings(wall) {
    const isHorizontal = wall.right - wall.left >= wall.bottom - wall.top;
    return isHorizontal ? [0, Math.PI] : [Math.PI / 2, -Math.PI / 2];
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

  // The world-space center of the far end of the current straight run
  // along a BFS-shortest path from the tank's current cell to the
  // target's — never a raw straight line to the target (a straight line
  // can look open, e.g. across a dead-end alcove, while no walkable path
  // actually follows it), and never just the immediate next cell either:
  // compressing a whole run of same-direction cells into one waypoint is
  // what makes the AI commit to a single heading down a corridor instead
  // of re-aiming at every 80px cell, which was reading as a zigzag. Line
  // of sight is still used for firing (see _updateFiring), never movement.
  //
  // Commits to the same waypoint across frames instead of re-planning
  // constantly: an open maze often has several equally-short routes, so
  // re-planning from scratch on every check could flip-flop between valid
  // routes and never actually get anywhere. Only re-plans once the tank
  // has actually reached its current waypoint cell, once the target has
  // moved to a new cell, or once the tank has drifted off the path the
  // current waypoint was planned from (see _pathIndexOf) — that last case
  // matters because getting shoved off-course (reversing away from an
  // obstacle, or a collision push) can land the tank somewhere with no
  // open route straight to the old waypoint at all; it was steering at a
  // wall it could never pass, not failing to navigate around one.
  //
  // Called every frame (see update()), so this needs to stay cheap: the
  // checks above are just cell/array comparisons, and findPath only runs
  // when one of them actually trips.
  //
  // When a fresh waypoint requires a real heading change (i.e. we just
  // reached a corner and the next run heads a different way), queues
  // pendingCornerHeading for _updateMovement to execute as a deliberate
  // stop-and-pivot (the 'cornerTurn' state) rather than swinging through
  // the turn while still driving forward.
  _nextWaypoint(tank, target, maze) {
    const fromCell = maze.worldToCell(tank.x, tank.y);
    const toCell = maze.worldToCell(target.x, target.y);

    const reachedWaypoint =
      !this.waypointCell || (fromCell.row === this.waypointCell.row && fromCell.col === this.waypointCell.col);
    const targetMoved =
      !this.pathTargetCell || this.pathTargetCell.row !== toCell.row || this.pathTargetCell.col !== toCell.col;
    const offPath = this.currentPath && EasyAI._pathIndexOf(fromCell, this.currentPath) === -1;

    if (reachedWaypoint || targetMoved || offPath) {
      const path = maze.findPath(fromCell, toCell);
      this.pathTargetCell = toCell;
      this.currentPath = path;
      const newWaypointCell = path ? EasyAI._runEndCell(path) : null;

      const waypointChanged =
        newWaypointCell && (!this.waypointCell || newWaypointCell.row !== this.waypointCell.row || newWaypointCell.col !== this.waypointCell.col);
      if (waypointChanged) {
        const center = maze._cellCenter(newWaypointCell.row, newWaypointCell.col);
        const steerAngle = Math.atan2(center.y - tank.y, center.x - tank.x);
        const headingDiff = Math.abs(EasyAI._normalizeAngle(steerAngle - tank.angle));
        if (headingDiff > this.cornerTurnThreshold) {
          this.pendingCornerHeading = EasyAI._snapToCardinal(steerAngle);
        }
      }

      this.waypointCell = newWaypointCell;
    }

    return this.waypointCell ? maze._cellCenter(this.waypointCell.row, this.waypointCell.col) : null;
  }

  // Index of `cell` within `path` (an array of {row,col}), or -1 if it's
  // not on that path at all.
  static _pathIndexOf(cell, path) {
    return path.findIndex((c) => c.row === cell.row && c.col === cell.col);
  }

  // Walks forward from the start of `path` while consecutive steps keep
  // moving in the same grid direction, and returns the last cell of that
  // straight run — i.e. how far the AI should commit to one heading
  // before it actually needs to turn. Falls back to the path's only cell
  // if it has no second step (already at/adjacent to the destination).
  static _runEndCell(path) {
    if (!path || path.length < 2) return path ? path[0] : null;
    const dRow = path[1].row - path[0].row;
    const dCol = path[1].col - path[0].col;
    let i = 1;
    while (i + 1 < path.length && path[i + 1].row - path[i].row === dRow && path[i + 1].col - path[i].col === dCol) {
      i++;
    }
    return path[i];
  }

  // Rounds an angle to the nearest cardinal direction (0/90/180/270deg).
  // Maze corridors are grid-aligned, so the heading toward a run's end
  // cell is already cardinal up to the tank's own offset from its lane's
  // centerline; snapping gives cornerTurn a clean, exact target instead
  // of chasing that offset.
  static _snapToCardinal(angle) {
    const step = Math.PI / 2;
    return EasyAI._normalizeAngle(Math.round(angle / step) * step);
  }

  // Whether something is blocking the tank's path forward.
  _isPathBlocked(tank, maze) {
    return this._sensedWall(tank, maze) !== null;
  }

  // The wall (if any) blocking the tank's path forward, so callers can
  // read its orientation (see _chooseTurn) rather than just a yes/no.
  // Uses a small rectangular sensor spanning a stretch of ground ahead
  // (rather than a single point at one fixed distance) so a thin wall
  // can't be missed just because it happens to fall between sample points.
  _sensedWall(tank, maze) {
    const sensorLength = 24; // px of ground ahead the sensor covers
    const sensorCenterDist = tank.radius + sensorLength / 2;
    const sensor = {
      cx: tank.x + Math.cos(tank.angle) * sensorCenterDist,
      cy: tank.y + Math.sin(tank.angle) * sensorCenterDist,
      halfW: sensorLength / 2,
      halfH: tank.radius * 0.6, // narrower than the full body, just checks roughly straight ahead
      angle: tank.angle
    };

    return maze.wallRects.find((wall) => Maze._satOverlap(sensor, Maze._wallShape(wall))) || null;
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
