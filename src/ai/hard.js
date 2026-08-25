// Hard-tier AI, per GAME_SPEC.md section 5.
//
// Deliberately built as `extends EasyAI` rather than a fresh class: the
// navigation architecture is a hard requirement to share (movement ALWAYS
// goes through pathfinding waypoints — hallway-driving runs, stop-and-
// pivot corners, parallel-to-wall obstacle recovery, forced replans on a
// stuck loop — never raw line-of-sight steering, which was a deliberately
// fixed bug in Easy). Subclassing makes that structural rather than a
// promise a future edit could quietly break. What Hard changes is the
// four difficulty axes, and nothing else:
//
//   1. Fire trigger — 0.15s of continuous aim-on-solution before firing
//      (Easy: instant on plain line of sight; Hard trades a sliver of
//      delay for a shot that's actually aimed at where you'll be).
//   2. Ammo — 3 bullets in flight + 0.3s cooldown (Easy: 1 + 1s). Still
//      stricter than the player's 5-bullet/no-cooldown base cannon.
//   3. Aim — leads the target using its velocity (solving for where the
//      bullet and the tank arrive at the same time), and when there is no
//      direct line it searches for a *bank shot*: a firing angle whose
//      ricochet path, traced through the same reflection rule the real
//      bullet uses (see Maze.moveWithBounce), lands on the target within
//      a few bounces. Candidate shots that would ricochet back into the
//      AI itself first are rejected — self-kill is a real mechanic here
//      (GAME_SPEC.md section 3.2), so a "smart" AI has to avoid it.
//   4. Movement — two additions on top of Easy's pathfinding, never
//      replacing it: `dodging` (a short burst out of the line of a bullet
//      whose predicted flight path, bounces included, would hit it) and
//      *flanking* (the pathfinding goal is not the target's cell but a
//      nearby cell chosen to sit away from the direction the target is
//      currently facing — so it comes at you from behind or the side
//      instead of driving down your barrel).
//
// Both movement additions are extra states in the same state machine
// (seek / cornerTurn / blockedTurn / attempting / reversing, now plus
// dodging / aiming), entered only from 'seek' so they can never interrupt
// Easy's obstacle-recovery sequence half-way through and strand the tank.
//
// Flanking is expressed purely as a *different goal cell handed to the
// same pathfinder* — Hard never steers at a point the pathfinder didn't
// give it.
class HardAI extends EasyAI {
  constructor() {
    super();

    // --- Axis 1: fire trigger (GAME_SPEC.md section 5) ---
    this.requiredSightedTime = 0.15; // s of continuous solution + alignment before firing
    this.facingThreshold = 0.09; // rad (~5deg) — tighter than Easy's ~15deg, since Hard actively aims
    this.reactionInterval = 0.1; // s, re-targeting cadence (Easy: 0.8s)

    // --- Axis 2: ammo (read by main.js startMatch and applied to the Tank) ---
    this.maxActiveBullets = 3;
    this.fireCooldownDuration = 0.3; // s

    // --- Axis 3: aim ---
    this.bulletSpeed = 160; // px/s, must match Bullet.speed in bullet.js
    this.bulletRadius = 3; // px, must match Bullet.radius in bullet.js
    this.shotHitRadius = 14; // px, just under tank.radius + bullet.radius (17) so grazes aren't claimed as hits
    this.aimSolution = null; // { angle, kind: 'direct' | 'bank' } or null
    this.bankSolution = null; // last bank-shot search result, reused between searches
    this.bankTimer = 0; // s until the next bank-shot search
    this.bankInterval = 0.25; // s between bank searches (the search is the expensive part)
    this.bankSamples = 120; // candidate firing angles per search (3deg resolution)
    this.maxBankBounces = 3; // bullets die at 5 bounces (bullet.js), so leave headroom
    this.maxShotRange = 620; // px of total traced flight (~3.9s of a bullet's 6s life)
    this.bankMaxCells = 6; // only bother banking when the target is within this path distance

    // --- Axis 4a: aim-hold ("stop and snap onto the firing solution") ---
    // Entered from 'seek' when a firing solution exists but the tank isn't
    // pointed at it yet. Pivots in place, then holds still through the
    // 0.15s fire trigger so seek's steering can't drag the barrel off the
    // solution before the shot goes out.
    this.aimAlignThreshold = 0.05; // rad, "on the solution"
    this.aimHoldTimeout = 0.7; // s, safety cap so it can't freeze aiming forever
    this.aimCooldown = 0; // s until it may enter 'aiming' again
    this.aimRecovery = 0.4; // s of normal movement enforced after each aim

    // --- Axis 4b: dodging ---
    this.dodgeHorizon = 0.8; // s of bullet flight to predict ahead
    this.dodgeSteps = 16; // prediction substeps over that horizon
    this.dodgeDangerRadius = 23; // px, tank.radius + bullet.radius + a small margin
    this.dodgeDuration = 0.3; // s of committed evasive burst
    this.dodgeCooldown = 0; // s until it may dodge again
    this.dodgeRecovery = 0.2; // s of normal movement enforced after each dodge
    this.dodgeParallelLimit = 0.8; // |cos| between drive axis and bullet path above which driving can't dodge at all
    this.dodgeDirection = 'forward'; // forward | backward, chosen at dodge entry
    this.threatBullets = []; // bullets handed in by main.js this frame

    // --- Axis 4c: flanking ---
    this.flankGoal = null; // {row, col} cell pathfound to instead of the target's own cell
    this.flankTargetCell = null; // the target cell flankGoal was chosen for
    this.failedFlankGoal = null; // an approach the stuck detector gave up on; skipped until the target moves
    this.flankReplanNeeded = false; // set when that happens, so a new approach is picked next frame
    this.flankMinRing = 1; // goal must sit at least this many cells from the target
    this.flankMaxRing = 3; // ...and at most this many, so it stays a real approach
    this.flankRearWeight = 6; // how much "away from where the target is facing" is worth
    this.flankTravelWeight = 1.5; // ...per extra cell of travel it costs to get there
    this.flankCloseRange = 2; // cells: inside this, stop manoeuvring and just close in
    this.arrivalRadius = 20; // px: steer point this close counts as "arrived" (see _updateMovement)
  }

  // Same contract as EasyAI.update(), plus `bullets` — every live bullet
  // in the match, needed for dodge prediction. EasyAI ignores the extra
  // argument, so main.js can pass it to both tiers unconditionally.
  update(dt, tank, opponents, maze, bullets) {
    this.threatBullets = bullets || [];
    return super.update(dt, tank, opponents, maze);
  }

  // Movement = Easy's state machine with two states bolted on in front of
  // it. Both are entered only from 'seek', so an in-progress
  // blockedTurn/attempting/reversing recovery always runs to completion —
  // interrupting that sequence is exactly how an AI ends up wedged
  // against a wall.
  _updateMovement(dt, tank, maze) {
    this._updateAimSolution(dt, tank, this.target, maze);
    this.dodgeCooldown = Math.max(0, this.dodgeCooldown - dt);
    this.aimCooldown = Math.max(0, this.aimCooldown - dt);

    if (this.moveState === 'dodging') {
      this.stateTimer += dt;
      this.seekTimer = 0;
      const blocked = this._sensedWallToward(tank, maze, this.dodgeDirection === 'forward' ? 0 : Math.PI) !== null;
      if (blocked || this.stateTimer >= this.dodgeDuration) {
        this.moveState = 'seek';
        this.stateTimer = 0;
        this.dodgeCooldown = this.dodgeRecovery;
      }
      this.keys = {
        forward: this.dodgeDirection === 'forward',
        backward: this.dodgeDirection === 'backward',
        left: false,
        right: false
      };
      return;
    }

    if (this.moveState === 'aiming') {
      this.stateTimer += dt;
      this.seekTimer = 0;

      // wantsToFire is last frame's decision (_updateFiring runs after
      // this) — once it's true the shot has been requested, so release the
      // hold and get moving again rather than standing still as a target.
      const shotTaken = this.wantsToFire;
      if (!this.aimSolution || shotTaken || !this._canTakeShot(tank, maze) || this.stateTimer >= this.aimHoldTimeout) {
        this.moveState = 'seek';
        this.stateTimer = 0;
        this.aimCooldown = this.aimRecovery;
        this.keys = { forward: false, backward: false, left: false, right: false };
        return;
      }

      const aimDiff = EasyAI._normalizeAngle(this.aimSolution.angle - tank.angle);
      this.keys = { forward: false, backward: false, left: false, right: false };
      if (Math.abs(aimDiff) > this.aimAlignThreshold) this.keys[aimDiff >= 0 ? 'right' : 'left'] = true;
      return;
    }

    if (this.moveState === 'seek') {
      if (this.dodgeCooldown <= 0) {
        const direction = this._planDodge(tank, maze);
        if (direction) {
          this.dodgeDirection = direction;
          this.moveState = 'dodging';
          this.stateTimer = 0;
          this.keys = {
            forward: direction === 'forward',
            backward: direction === 'backward',
            left: false,
            right: false
          };
          return;
        }
      }

      if (this.aimCooldown <= 0 && this.aimSolution && this._canTakeShot(tank, maze)) {
        const aimDiff = Math.abs(EasyAI._normalizeAngle(this.aimSolution.angle - tank.angle));
        if (aimDiff > this.aimAlignThreshold) {
          this.moveState = 'aiming';
          this.stateTimer = 0;
          this.keys = { forward: false, backward: false, left: false, right: false };
          return;
        }
      }

      // Arrived: the steer point is underfoot, so there is no meaningful
      // heading left to drive along. Hold position and let the firing logic
      // work rather than crawling forward into the nearest wall.
      if (this.steerPoint && Math.hypot(this.steerPoint.x - tank.x, this.steerPoint.y - tank.y) < this.arrivalRadius) {
        this.keys = { forward: false, backward: false, left: false, right: false };
        return;
      }
    }

    super._updateMovement(dt, tank, maze);

    // Easy clears waypointCell in exactly one place: when its stuck
    // detector concludes the current route isn't working and forces a
    // fresh plan. A Hard route is aimed at a *flanking* cell, so that cell
    // is the thing that just proved unreachable — drop it as well, and
    // refuse to re-pick it until the target moves, or the replan simply
    // retries the same losing approach and the tank grinds against the
    // same corner forever.
    if (this.waypointCell === null && !this.flankReplanNeeded) {
      this.failedFlankGoal = this.flankGoal;
      this.flankReplanNeeded = true;
    }
  }

  // Whether standing still to aim could actually produce a shot right now.
  // Holding the aim pose while the cannon is on cooldown, already at the
  // 3-bullet cap, or with the barrel jammed against a wall is pure
  // downside — the tank is a stationary target and the shot can't leave
  // anyway — so the aim-hold is gated on this both to enter and to stay.
  // Mirrors Tank.canFire(), counting this tank's own live bullets out of
  // the list main.js hands in.
  _canTakeShot(tank, maze) {
    if (tank.cooldownRemaining > 0) return false;
    if (maze.isBarrelBlocked(tank)) return false;

    let active = 0;
    for (const bullet of this.threatBullets) {
      if (bullet.alive && bullet.owner === tank) active++;
    }
    return active < tank.maxActiveBullets;
  }

  // Fires off the current firing solution (lead shot or bank shot) rather
  // than off a raw "is the target in front of me" test — so a bank shot,
  // which points at a *wall*, is a perfectly valid reason to shoot.
  _updateFiring(dt, tank, target, maze) {
    if (!this.aimSolution || target.destroyed) {
      this.sightedTime = 0;
      this.wantsToFire = false;
      return;
    }

    const aimDiff = Math.abs(EasyAI._normalizeAngle(this.aimSolution.angle - tank.angle));
    const ready = aimDiff <= this.facingThreshold && !maze.isBarrelBlocked(tank);

    this.sightedTime = ready ? this.sightedTime + dt : 0;
    this.wantsToFire = ready && this.sightedTime >= this.requiredSightedTime;
  }

  // --- Axis 3: aim -------------------------------------------------------

  // Picks the best firing solution available this frame: a direct lead
  // shot if there's a clear line, otherwise the most recent bank-shot
  // search result. Bank searches are the expensive part, so they run on
  // their own cadence and only when there's no direct shot to be had.
  _updateAimSolution(dt, tank, target, maze) {
    this.bankTimer -= dt;

    if (!target || target.destroyed) {
      this.aimSolution = null;
      this.bankSolution = null;
      return;
    }

    const direct = this._directSolution(tank, target, maze);
    if (direct) {
      this.aimSolution = direct;
      this.bankSolution = null;
      return;
    }

    if (this.bankTimer <= 0) {
      this.bankTimer = this.bankInterval;
      this.bankSolution = this._withinBankRange(tank, target, maze)
        ? this._searchBankShot(tank, target, maze)
        : null;
    }

    this.aimSolution = this.bankSolution;
  }

  // A straight shot at where the target *will be* when the bullet gets
  // there, not where it is now. Requires a clear line to both the target
  // and the predicted point — a lead point on the far side of a wall is a
  // wasted shot, so it falls back to the target's actual position.
  _directSolution(tank, target, maze) {
    if (!this._hasLineOfSight(tank, target, maze)) return null;

    const lead = this._leadPoint(tank, target);
    const aimPoint = this._hasLineOfSight(tank, lead, maze) ? lead : target;
    return { angle: Math.atan2(aimPoint.y - tank.y, aimPoint.x - tank.x), kind: 'direct' };
  }

  // Where the target will be when a bullet fired now reaches it. The
  // flight distance depends on the lead point and the lead point depends
  // on the flight distance, so this iterates the fixed point a few times —
  // three passes is plenty at these speeds.
  _leadPoint(tank, target) {
    const vx = Math.cos(target.angle) * target.speed;
    const vy = Math.sin(target.angle) * target.speed;

    let x = target.x;
    let y = target.y;
    for (let i = 0; i < 3; i++) {
      const flightTime = Math.hypot(x - tank.x, y - tank.y) / this.bulletSpeed;
      x = target.x + vx * flightTime;
      y = target.y + vy * flightTime;
    }
    return { x, y };
  }

  _withinBankRange(tank, target, maze) {
    const path = maze.findPath(maze.worldToCell(tank.x, tank.y), maze.worldToCell(target.x, target.y));
    return !!path && path.length - 1 <= this.bankMaxCells;
  }

  // Sweeps candidate firing angles and traces each one's ricochet path,
  // keeping the cheapest solution that actually lands on the target
  // (fewest bounces first, then least turning to line up). Aims at the
  // target's current position rather than a lead point: a bank shot's
  // flight time isn't known until after its path is traced, and a
  // multi-bounce shot is opportunistic by nature.
  _searchBankShot(tank, target, maze) {
    const aimPoint = { x: target.x, y: target.y };

    let best = null;
    for (let i = 0; i < this.bankSamples; i++) {
      const angle = -Math.PI + (i * 2 * Math.PI) / this.bankSamples;
      // The muzzle swings with the turret, so each candidate has to be
      // traced from where the barrel tip will be once the tank has turned
      // onto that angle — not from where it points right now. Tracing from
      // the current tip put the shot's origin up to a barrel-length off.
      const origin = {
        x: tank.x + Math.cos(angle) * tank.barrelLength,
        y: tank.y + Math.sin(angle) * tank.barrelLength
      };
      const traced = this._traceShot(origin, angle, tank, aimPoint, maze);
      if (!traced || traced.bounces === 0) continue; // a 0-bounce hit would already be a direct shot

      const turn = Math.abs(EasyAI._normalizeAngle(angle - tank.angle));
      const score = traced.bounces * 2 + turn;
      if (!best || score < best.score) best = { angle, kind: 'bank', bounces: traced.bounces, score };
    }
    return best;
  }

  // Traces a shot fired from `origin` at `angle` through the maze,
  // reflecting with the exact rule the real bullet uses (see
  // Maze.moveWithBounce: the wall's own orientation decides the mirror
  // axis, not the face that was struck), and reports whether it reaches
  // `aimPoint`. Returns null if it runs out of range/bounces, or if it
  // would pass through the firing tank itself first — an own ricochet is
  // a real kill in this game, so a shot that suicides is not a solution.
  _traceShot(origin, angle, selfTank, aimPoint, maze) {
    let x = origin.x;
    let y = origin.y;
    let heading = angle;
    let travelled = 0;
    let bounces = 0;

    while (bounces <= this.maxBankBounces && travelled < this.maxShotRange) {
      const dx = Math.cos(heading);
      const dy = Math.sin(heading);
      const remaining = this.maxShotRange - travelled;
      const hit = HardAI._rayHitWall(x, y, dx, dy, maze, remaining, this.bulletRadius);
      const legLength = hit ? hit.t : remaining;
      const endX = x + dx * legLength;
      const endY = y + dy * legLength;

      const tTarget = HardAI._segmentCircleHit(x, y, endX, endY, aimPoint.x, aimPoint.y, this.shotHitRadius, 0);
      // On the first leg the muzzle sits right next to the firing tank, so
      // ignore self-hits until the bullet has cleared its own hull.
      const selfIgnore = bounces === 0 ? selfTank.radius * 2 : 0;
      const tSelf = HardAI._segmentCircleHit(x, y, endX, endY, selfTank.x, selfTank.y, this.shotHitRadius, selfIgnore);

      if (tTarget !== null && (tSelf === null || tTarget <= tSelf)) return { bounces };
      if (tSelf !== null) return null;
      if (!hit) return null;

      const wall = hit.wall;
      const isVertical = wall.right - wall.left < wall.bottom - wall.top;
      heading = isVertical ? Math.PI - heading : -heading;

      // Nudge off the wall so the reflected ray can't immediately re-hit it.
      x = endX + Math.cos(heading) * 0.5;
      y = endY + Math.sin(heading) * 0.5;
      travelled += legLength;
      bounces++;
    }

    return null;
  }

  // Nearest wall a ray hits, as a distance along the ray plus the wall
  // itself. Slab test per wall, with every wall inflated by the bullet's
  // radius so the hit lands where the bullet's *center* would stop —
  // matching Maze._findWallHit, which tests center-to-rect distance
  // against that same radius.
  static _rayHitWall(x, y, dx, dy, maze, maxT, radius) {
    let bestT = maxT;
    let bestWall = null;

    for (const wall of maze.wallRects) {
      const left = wall.left - radius;
      const right = wall.right + radius;
      const top = wall.top - radius;
      const bottom = wall.bottom + radius;

      let tNear = -Infinity;
      let tFar = Infinity;

      if (dx === 0) {
        if (x < left || x > right) continue;
      } else {
        let t1 = (left - x) / dx;
        let t2 = (right - x) / dx;
        if (t1 > t2) [t1, t2] = [t2, t1];
        tNear = Math.max(tNear, t1);
        tFar = Math.min(tFar, t2);
      }

      if (dy === 0) {
        if (y < top || y > bottom) continue;
      } else {
        let t1 = (top - y) / dy;
        let t2 = (bottom - y) / dy;
        if (t1 > t2) [t1, t2] = [t2, t1];
        tNear = Math.max(tNear, t1);
        tFar = Math.min(tFar, t2);
      }

      if (tNear > tFar || tNear < 0.25 || tNear >= bestT) continue;
      bestT = tNear;
      bestWall = wall;
    }

    return bestWall ? { t: bestT, wall: bestWall } : null;
  }

  // Distance along the segment at which it first comes within `radius` of
  // (cx, cy), or null if it never does. `minDistance` ignores contact that
  // happens too close to the segment's start (used to skip the firing
  // tank's own hull at the muzzle).
  static _segmentCircleHit(x1, y1, x2, y2, cx, cy, radius, minDistance) {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const length = Math.hypot(dx, dy);
    if (length === 0) return null;

    const ux = dx / length;
    const uy = dy / length;
    const projection = Math.max(0, Math.min(length, (cx - x1) * ux + (cy - y1) * uy));
    const closestX = x1 + ux * projection;
    const closestY = y1 + uy * projection;

    if (Math.hypot(cx - closestX, cy - closestY) > radius) return null;
    if (projection < minDistance) return null;
    return projection;
  }

  // --- Axis 4b: dodging --------------------------------------------------

  // 'forward' / 'backward' if a burst that way would take the tank out of
  // an incoming bullet's predicted path, or null if there's nothing to
  // dodge (or nothing driving can do about it). A tank only drives along
  // its own facing, so a bullet coming straight down the corridor it's
  // pointed along genuinely can't be dodged by moving — in that case it
  // holds its route (and shoots back) instead of flailing.
  _planDodge(tank, maze) {
    const threat = this._incomingThreat(tank, maze);
    if (!threat) return null;

    const drive = { x: Math.cos(tank.angle), y: Math.sin(tank.angle) };
    const travel = { x: Math.cos(threat.heading), y: Math.sin(threat.heading) };
    if (Math.abs(drive.x * travel.x + drive.y * travel.y) > this.dodgeParallelLimit) return null;

    // Normal to the bullet's path: moving along it is what actually gets
    // the tank out of the line. Pick the sign that increases the offset
    // the tank already has from that path.
    const normal = { x: -travel.y, y: travel.x };
    const offset = (tank.x - threat.x) * normal.x + (tank.y - threat.y) * normal.y;
    const forwardGain = (drive.x * normal.x + drive.y * normal.y) * (offset >= 0 ? 1 : -1);

    const preferred = forwardGain >= 0 ? 'forward' : 'backward';
    const fallback = preferred === 'forward' ? 'backward' : 'forward';

    for (const direction of [preferred, fallback]) {
      if (this._sensedWallToward(tank, maze, direction === 'forward' ? 0 : Math.PI) === null) return direction;
    }
    return null;
  }

  // The first bullet whose predicted flight path — bounces included,
  // stepped through the maze's own bounce solver so the prediction can't
  // disagree with what the bullet actually does — passes close enough to
  // hit this tank within the dodge horizon.
  _incomingThreat(tank, maze) {
    const stepDt = this.dodgeHorizon / this.dodgeSteps;
    const reach = this.bulletSpeed * this.dodgeHorizon + this.dodgeDangerRadius;

    for (const bullet of this.threatBullets) {
      if (!bullet.alive) continue;
      // Its own freshly fired bullet is travelling away from the muzzle;
      // it only becomes a threat once a bounce sends it back.
      if (bullet.owner === tank && bullet.bounceCount === 0) continue;
      if (Math.hypot(bullet.x - tank.x, bullet.y - tank.y) > reach) continue;

      const sim = { x: bullet.x, y: bullet.y, angle: bullet.angle, radius: bullet.radius };
      for (let step = 0; step < this.dodgeSteps; step++) {
        const dx = Math.cos(sim.angle) * bullet.speed * stepDt;
        const dy = Math.sin(sim.angle) * bullet.speed * stepDt;
        const heading = sim.angle;
        const moved = maze.moveWithBounce(sim, dx, dy);

        const contact = HardAI._segmentCircleHit(
          sim.x, sim.y, moved.x, moved.y, tank.x, tank.y, this.dodgeDangerRadius, 0
        );
        if (contact !== null) return { x: sim.x, y: sim.y, heading };

        sim.x = moved.x;
        sim.y = moved.y;
      }
    }
    return null;
  }

  // EasyAI._sensedWall, but for an arbitrary direction relative to the
  // tank's facing — dodging needs to know whether the way *behind* it is
  // clear too, not just ahead.
  _sensedWallToward(tank, maze, relativeAngle) {
    const angle = tank.angle + relativeAngle;
    const sensorLength = 24; // px of ground the sensor covers, same as EasyAI._sensedWall
    const sensorCenterDist = tank.radius + sensorLength / 2;
    const sensor = {
      cx: tank.x + Math.cos(angle) * sensorCenterDist,
      cy: tank.y + Math.sin(angle) * sensorCenterDist,
      halfW: sensorLength / 2,
      halfH: tank.radius * 0.6,
      angle
    };

    return maze.wallRects.find((wall) => Maze._satOverlap(sensor, Maze._wallShape(wall))) || null;
  }

  // --- Axis 4c: flanking -------------------------------------------------

  // Same pathfinding as Easy — only the destination changes. Hard paths to
  // a flanking cell near the target rather than to the target's own cell,
  // so the route it drives approaches from off the target's nose.
  // Everything downstream (run compression into hallway waypoints, corner
  // pivots, off-path replanning) is inherited untouched.
  _nextWaypoint(tank, target, maze) {
    const goal = this._updateFlankGoal(tank, target, maze);
    const destination = goal ? maze._cellCenter(goal.row, goal.col) : target;
    const waypoint = super._nextWaypoint(tank, destination, maze);
    if (!waypoint) return waypoint;

    // Once the tank is standing in the destination cell, the pathfinder has
    // nothing left to route: the path is a single cell, so the waypoint is
    // the tank's *own* cell centre. Steering at that is steering at almost
    // exactly itself — the heading it produces is numerical noise, which
    // sends the tank into whatever wall is nearest and leaves it churning
    // through the blocked/reverse recovery cycle. Inside one cell there is
    // by definition no wall between the two, so aim at the real target
    // instead; the pathfinder still owns every route longer than this.
    const tankCell = maze.worldToCell(tank.x, tank.y);
    if (this.waypointCell && this.waypointCell.row === tankCell.row && this.waypointCell.col === tankCell.col) {
      return { x: target.x, y: target.y };
    }
    return waypoint;
  }

  // Commits to a flanking cell the same way Easy commits to a waypoint —
  // re-choosing constantly would flip-flop between equally good approach
  // angles and never complete one. Re-chosen only when the target changes
  // cell or the goal is reached.
  _updateFlankGoal(tank, target, maze) {
    const tankCell = maze.worldToCell(tank.x, tank.y);
    const targetCell = maze.worldToCell(target.x, target.y);

    const targetMoved =
      !this.flankTargetCell ||
      this.flankTargetCell.row !== targetCell.row ||
      this.flankTargetCell.col !== targetCell.col;
    const reached = this.flankGoal && this.flankGoal.row === tankCell.row && this.flankGoal.col === tankCell.col;

    // A new target cell moves the whole ring of candidate approaches, so
    // whatever failed against the old one is no longer meaningful.
    if (targetMoved) this.failedFlankGoal = null;

    if (targetMoved || reached || this.flankReplanNeeded) {
      this.flankReplanNeeded = false;
      this.flankTargetCell = targetCell;
      this.flankGoal = this._chooseFlankCell(target, maze, tankCell, targetCell);
    }
    return this.flankGoal;
  }

  // Scores every cell in a ring around the target by how far around its
  // back the cell sits (bearing from the target to that cell vs the way
  // the target is currently facing) against what the detour costs in
  // travel. Returns null — meaning "just path straight at them" — once
  // it's close enough that manoeuvring is pointless, or if the best cell
  // is the one it's already standing in.
  _chooseFlankCell(target, maze, tankCell, targetCell) {
    const fromTarget = maze._bfsDistances([targetCell]);
    const fromTank = maze._bfsDistances([tankCell]);

    const rangeToTarget = fromTarget[tankCell.row][tankCell.col];
    if (rangeToTarget >= 0 && rangeToTarget <= this.flankCloseRange) return null;

    let best = null;
    let bestScore = -Infinity;
    for (let row = 0; row < maze.rows; row++) {
      for (let col = 0; col < maze.cols; col++) {
        const ring = fromTarget[row][col];
        if (ring < this.flankMinRing || ring > this.flankMaxRing) continue;
        const travel = fromTank[row][col];
        if (travel < 0) continue;
        if (this.failedFlankGoal && this.failedFlankGoal.row === row && this.failedFlankGoal.col === col) continue;

        const center = maze._cellCenter(row, col);
        const bearing = Math.atan2(center.y - target.y, center.x - target.x);
        // 0 = dead ahead of the target's barrel, 1 = directly behind it.
        const rearness = Math.abs(EasyAI._normalizeAngle(bearing - target.angle)) / Math.PI;

        const score = rearness * this.flankRearWeight - travel * this.flankTravelWeight;
        if (score > bestScore) {
          bestScore = score;
          best = { row, col };
        }
      }
    }

    if (best && best.row === tankCell.row && best.col === tankCell.col) return null;
    return best;
  }
}
