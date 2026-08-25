// Medium-tier AI, per GAME_SPEC.md section 5.
//
// Deliberately built as a subclass of EasyAI rather than a parallel
// re-implementation: the difficulty ladder is meant to be one AI with the
// dials turned up, not three unrelated brains. Everything about *how it
// drives* — BFS pathfinding, hallway driving, stop-and-pivot corners, the
// blocked/attempt/reverse recovery machine — is inherited unchanged, so a
// navigation fix in easy.js is automatically a navigation fix here too.
// In particular, movement still ALWAYS steers toward a pathfound waypoint
// and never toward a raw line of sight (that was a real bug once — see
// easy.js and GAME_SPEC.md section 5's "Movement direction" note); the
// dodge added below is a short, bounded interruption of that steering,
// not a second way of choosing where to go.
//
// Medium scales up from Easy on four axes (see the ladder table in
// GAME_SPEC.md section 5):
//   1. Reaction — re-picks its target every 0.4s instead of every 0.8s.
//   2. Ammo — 2 bullets in flight + 0.6s cooldown (wired in main.js's
//      AI_TIERS table, since it's a property of the Tank, not the brain).
//   3. Aim — shot discipline: only fires inside a ~9-degree window on the
//      target, where Easy will take any shot within ~15 degrees.
//   4. Movement — basic dodge: sidesteps out of the path of an incoming
//      bullet that's on a collision course within detection range.
//
// Axis 3 was originally specced as simple linear prediction (lead the
// target by its current velocity). It was built, measured over ~3500
// headless matches, and cut: leading gained nothing even against a target
// driving in a dead straight line (95.0% vs 95.5% hit rate) and lost badly
// against one that stops and pivots like Easy does (41.5% vs 56.8%). The
// reason is structural — these tanks have no turret, so a shot always
// leaves along the tank's *driving* heading (see Tank.getBarrelTip). A lead
// point can therefore only change *when* the AI fires, never where the
// bullet goes, and firing at moments when the barrel isn't on the target is
// simply worse. It also doesn't help that bullets travel only ~15% faster
// than tanks (160 vs 140 px/s), so the required lead is enormous. Prediction
// only becomes worth having once an AI turns to line its barrel up — which
// is Hard's "actively hunts" behavior, and where it should live.
//
// So what Medium deliberately does NOT do, keeping it distinct from Hard:
// it never turns to line up a shot (firing stays opportunistic — it shoots
// when its driving heading happens to line up, it just holds out for a
// cleaner alignment than Easy), and it never plans bank shots off walls.
class MediumAI extends EasyAI {
  constructor() {
    super();

    // Axis 1: re-targeting cadence.
    this.reactionInterval = 0.4; // s, per GAME_SPEC.md section 5 (Easy: 0.8)

    // Fire trigger. Fires the instant it has a clean shot, same as Easy. A 0.3s aim-hold
    // was tried here first (it's what the tier ladder originally proposed,
    // back when Easy still held its aim for 0.5s) and measured as a straight
    // nerf: Easy fires at 0s now, so any hold at all makes Medium slower on
    // the trigger than the tier below it. Medium's shooting edge comes from
    // shot *quality* and ammo instead — see facingThreshold below.
    this.requiredSightedTime = 0;

    // Axis 3: aim. Only takes clean shots — a ~9-degree fire window instead of Easy's
    // ~15-degree one. This is Medium's real aim upgrade — measured over 500
    // headless Medium-vs-Easy matches it lifts kills-per-shot from 0.48 to
    // 0.56 and the win rate from ~55% to ~59%. Tightening further (0.1 rad)
    // costs more shot opportunities than it gains in precision.
    this.facingThreshold = 0.16; // rad (Easy: 0.26)

    // Axis 4: dodging.
    this.dodgeRange = 180; // px, only bullets this close are considered
    this.dodgeLookahead = 1; // s, only bullets arriving within this window are considered
    this.dodgeMargin = 6; // px of slack added to the hit radius, so near-misses still count as worth dodging
    this.dodgeProbeDistance = 40; // px, how far to the side it checks for room before committing to that side
    this.dodgeTurnDeadzone = 0.15; // rad, generous so it doesn't jitter mid-sidestep
    this.dodgeCommit = 0.25; // s, minimum dodge duration once started, so one frame of threat doesn't cause a twitch
    this.dodgeMaxDuration = 1.5; // s, hard cap — navigation always gets control back
    this.dodgeRefractory = 0.6; // s after a capped-out dodge before it may dodge again

    this.threat = null; // { bullet, timeToImpact } this frame, or null
    this.dodgePlan = null; // { bullet, drive, heading } the current sidestep is executing
    this.dodgeLockout = 0; // s remaining of refractory
  }

  // Same contract as EasyAI.update(), plus `bullets`: every live bullet in
  // the match, needed for dodging. EasyAI ignores the extra argument, so
  // main.js can pass it to every tier uniformly.
  update(dt, tank, opponents, maze, bullets) {
    this.dodgeLockout = Math.max(0, this.dodgeLockout - dt);
    this.threat = this.dodgeLockout > 0 ? null : this._incomingThreat(tank, bullets || [], maze);
    return super.update(dt, tank, opponents, maze);
  }

  // Axis 4. Dodging is layered on top of the inherited state machine as one
  // extra 'dodging' state that pre-empts the others, rather than woven into
  // them: while it's active the normal seek/turn/reverse logic is paused
  // entirely, and when it ends the committed waypoint is dropped so the
  // route is re-planned from wherever the sidestep actually left the tank.
  _updateMovement(dt, tank, maze) {
    const threatChanged = this.threat && this.dodgePlan && this.threat.bullet !== this.dodgePlan.bullet;
    if (this.threat && (this.moveState !== 'dodging' || threatChanged)) {
      if (this.moveState !== 'dodging') this.stateTimer = 0;
      this.moveState = 'dodging';
      this.dodgePlan = this._planDodge(tank, maze, this.threat);
    }

    if (this.moveState === 'dodging') {
      this.stateTimer += dt;

      const cappedOut = this.stateTimer >= this.dodgeMaxDuration;
      const threatCleared = !this.threat && this.stateTimer >= this.dodgeCommit;

      if (!cappedOut && !threatCleared) {
        this._applyDodge(tank);
        return;
      }

      // Bullets bouncing around nearby could otherwise keep re-triggering a
      // dodge indefinitely and stop the AI ever fighting back, so a capped
      // dodge buys a stretch of guaranteed navigation time before the next.
      if (cappedOut) this.dodgeLockout = this.dodgeRefractory;

      this.moveState = 'seek';
      this.stateTimer = 0;
      this.seekTimer = 0;
      this.dodgePlan = null;
      this.waypointCell = null; // sidestepping almost certainly left the committed corridor run
      this.pendingCornerHeading = null;
      // falls through to normal movement on this same frame
    }

    super._updateMovement(dt, tank, maze);
  }

  // The most urgent bullet currently on a collision course, or null.
  // "Basic" on purpose (per the ladder): it projects each bullet's current
  // straight-line travel only and ignores where it will go after bouncing,
  // so a bullet with a wall between it and the tank is skipped outright —
  // it's going to change direction before it ever gets here, and reacting
  // to bounce paths is Hard's job.
  _incomingThreat(tank, bullets, maze) {
    let best = null;

    for (const bullet of bullets) {
      if (!bullet.alive) continue;

      const dx = tank.x - bullet.x;
      const dy = tank.y - bullet.y;
      if (dx * dx + dy * dy > this.dodgeRange * this.dodgeRange) continue;

      const vx = Math.cos(bullet.angle) * bullet.speed;
      const vy = Math.sin(bullet.angle) * bullet.speed;
      const speedSq = vx * vx + vy * vy;
      if (speedSq === 0) continue;

      // Time of the bullet's closest approach to the tank, treating the
      // tank as stationary. Negative means it's already going away — which
      // is also what harmlessly skips the AI's own just-fired shot.
      const t = (dx * vx + dy * vy) / speedSq;
      if (t <= 0 || t > this.dodgeLookahead) continue;

      const missX = bullet.x + vx * t - tank.x;
      const missY = bullet.y + vy * t - tank.y;
      const hitRadius = tank.radius + bullet.radius + this.dodgeMargin;
      if (missX * missX + missY * missY > hitRadius * hitRadius) continue;

      if (!this._hasLineOfSight(tank, bullet, maze)) continue;

      if (!best || t < best.timeToImpact) best = { bullet, timeToImpact: t };
    }

    return best;
  }

  // Works out which way to sidestep out of a bullet's line. Tanks here are
  // tank-drive (no strafing, see GAME_SPEC.md section 3.1), so a "sidestep"
  // is really "drive whichever of forward/backward carries me sideways off
  // this line, while rotating toward straight-sideways" — a short curving
  // escape rather than a true lateral step.
  _planDodge(tank, maze, threat) {
    const bullet = threat.bullet;
    const perpX = -Math.sin(bullet.angle);
    const perpY = Math.cos(bullet.angle);

    // Which side of the bullet's line the tank already sits on: continuing
    // off that side is a shorter escape than crossing in front of it.
    const side = (tank.x - bullet.x) * perpX + (tank.y - bullet.y) * perpY;
    const sign = side < 0 ? -1 : 1; // dead-on (side ~ 0): either way is equally good
    let escapeX = perpX * sign;
    let escapeY = perpY * sign;

    if (!this._sideIsClear(tank, escapeX, escapeY, maze)) {
      escapeX = -escapeX;
      escapeY = -escapeY;
    }

    const forwardDot = Math.cos(tank.angle) * escapeX + Math.sin(tank.angle) * escapeY;
    const drive = forwardDot >= 0 ? 'forward' : 'backward';
    // The heading the *body* should hold: reversing means facing away from
    // the escape direction so that backing up travels along it.
    const heading = drive === 'forward' ? Math.atan2(escapeY, escapeX) : Math.atan2(-escapeY, -escapeX);

    return { bullet, drive, heading };
  }

  // Whether there's room to sidestep a short way in (dirX, dirY) without a
  // wall in between — cheap enough to run at the start of a dodge, and it
  // stops the AI from confidently "dodging" straight into a corridor wall.
  _sideIsClear(tank, dirX, dirY, maze) {
    const probe = {
      x: tank.x + dirX * (tank.radius + this.dodgeProbeDistance),
      y: tank.y + dirY * (tank.radius + this.dodgeProbeDistance)
    };
    return this._hasLineOfSight(tank, probe, maze);
  }

  _applyDodge(tank) {
    if (!this.dodgePlan) return;

    this.keys = {
      forward: this.dodgePlan.drive === 'forward',
      backward: this.dodgePlan.drive === 'backward',
      left: false,
      right: false
    };

    const diff = EasyAI._normalizeAngle(this.dodgePlan.heading - tank.angle);
    if (diff > this.dodgeTurnDeadzone) this.keys.right = true;
    else if (diff < -this.dodgeTurnDeadzone) this.keys.left = true;
  }

  // Firing itself needs no override: EasyAI._updateFiring already reads
  // facingThreshold and requiredSightedTime off `this`, so the tighter fire
  // window set in the constructor is the whole of Medium's aim upgrade.
}
