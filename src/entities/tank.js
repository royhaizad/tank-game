// Tank-drive movement: forward/back along facing direction, left/right
// rotates. Acceleration/deceleration per GAME_SPEC.md section 3.1. Wall
// collision is resolved externally by Maze.resolveTankCollision() after
// update() moves the tank, using getBodyShape()/getBarrelShape() below so
// neither the body nor the protruding barrel can end up inside a wall.
// Opponent-tank collision isn't implemented yet (no second tank exists).
//
// A tank also carries its currently equipped weapon and shield state (see
// weapon.js and GAME_SPEC.md section 4). maxActiveBullets/
// fireCooldownDuration below stay the tank's OWN base limits (players and
// AI differ — see main.js startMatch); an equipped power-up weapon can
// override them for as long as it's held, via the effective*() methods.
class Tank {
  constructor(x, y, color) {
    this.x = x;
    this.y = y;
    this.angle = 0;
    this.speed = 0;
    this.color = color;
    this.radius = 14;

    this.acceleration = 220; // px/s^2
    this.friction = 312; // px/s^2, brings speed back to 0 when idle (+20% brake power)
    this.maxForwardSpeed = 140; // px/s
    this.maxReverseSpeed = 80; // px/s
    this.rotationSpeed = 2.6; // radians/s

    this.barrelLength = this.radius + 12; // px, from tank center to barrel tip
    this.barrelHalfHeight = 3; // px, half the barrel's drawn width
    this.maxActiveBullets = 5; // per GAME_SPEC.md section 3.2 (player default; AI tanks override this)
    this.fireCooldownDuration = 0; // s, 0 = no cooldown (player default; AI tanks override this)
    this.cooldownRemaining = 0; // s, must reach 0 before firing again
    this.destroyed = false;

    // Power-up state, per GAME_SPEC.md section 4. Everyone starts on the
    // base cannon, which has infinite ammo — so a tank is never left
    // unable to shoot when a picked-up weapon runs dry.
    this.weapon = Weapons.CANNON;
    this.weaponAmmo = Infinity;
    this.shieldRemaining = 0; // s left on the ACTIVE shield bubble
    this.shieldCharged = false; // true once picked up, until the next fire press activates it
    this.shieldRadius = this.radius + 8; // px
  }

  // Swaps to a crate's weapon. Shield is the odd one out: it's not fired
  // and isn't really a "weapon" the tank holds — picking it up just arms
  // a charge (as a buff layered on top of whatever's currently equipped,
  // leaving that weapon and its remaining ammo untouched) rather than
  // activating the bubble outright. The charge sits ready until the next
  // fire press pops it, via tryActivateShieldCharge().
  equipWeapon(type) {
    const def = Weapons.def(type);
    if (type === Weapons.SHIELD) {
      this.shieldCharged = true;
      return;
    }
    this.weapon = type;
    this.weaponAmmo = def.ammo;
    this.cooldownRemaining = 0; // a fresh weapon is ready immediately
  }

  // Pops a pending shield charge into an active bubble — called the
  // instant a fire press is attempted (see tryFire in main.js), whether
  // or not the tank's actual weapon manages to fire, so pressing shoot
  // always reliably activates a held charge. Returns whether it did
  // anything, so the caller knows whether to play the activation sound.
  tryActivateShieldCharge() {
    if (!this.shieldCharged) return false;
    this.shieldCharged = false;
    this.shieldRemaining = Weapons.def(Weapons.SHIELD).duration;
    return true;
  }

  revertToCannon() {
    this.weapon = Weapons.CANNON;
    this.weaponAmmo = Infinity;
  }

  consumeAmmo() {
    if (this.weaponAmmo === Infinity) return;
    this.weaponAmmo--;
    if (this.weaponAmmo <= 0) this.revertToCannon();
  }

  hasShield() {
    return this.shieldRemaining > 0;
  }

  // The equipped weapon's override if it has one, else this tank's own
  // base limit (5/no-cooldown for players, 1/1s for AI — see main.js).
  effectiveMaxActiveBullets() {
    const def = Weapons.def(this.weapon);
    return def.maxActiveBullets !== undefined ? def.maxActiveBullets : this.maxActiveBullets;
  }

  effectiveFireCooldown() {
    const def = Weapons.def(this.weapon);
    return def.fireCooldown !== undefined ? def.fireCooldown : this.fireCooldownDuration;
  }

  // Seconds between repeat shots while the fire key is HELD. Infinity for
  // the one-shot weapons, so they need a fresh keypress each time.
  autoFireInterval() {
    return Weapons.def(this.weapon).autoFireInterval;
  }

  canFire(activeBulletCount) {
    return activeBulletCount < this.effectiveMaxActiveBullets() && this.cooldownRemaining <= 0;
  }

  getBarrelTip() {
    return {
      x: this.x + Math.cos(this.angle) * this.barrelLength,
      y: this.y + Math.sin(this.angle) * this.barrelLength
    };
  }

  // Collision shapes for Maze's SAT-based wall collision: the square body
  // and the barrel, as separate rotated rectangles (rather than one shape
  // covering both), so the open space beside the barrel isn't wrongly
  // treated as solid tank.
  getBodyShape() {
    return { cx: this.x, cy: this.y, halfW: this.radius, halfH: this.radius, angle: this.angle };
  }

  getBarrelShape() {
    const localCenter = this.barrelLength / 2;
    return {
      cx: this.x + Math.cos(this.angle) * localCenter,
      cy: this.y + Math.sin(this.angle) * localCenter,
      halfW: localCenter,
      halfH: this.barrelHalfHeight,
      angle: this.angle
    };
  }

  // actions: { forward, backward, left, right } — semantic movement
  // intent, not literal key names, so this has no idea which physical
  // keys the player bound to them (see Input.bindings) and AI tanks can
  // drive themselves the exact same way (see EasyAI).
  update(dt, actions) {
    if (this.cooldownRemaining > 0) {
      this.cooldownRemaining = Math.max(0, this.cooldownRemaining - dt);
    }

    if (this.shieldRemaining > 0) {
      this.shieldRemaining = Math.max(0, this.shieldRemaining - dt);
    }

    if (actions.forward) {
      this.speed += this.acceleration * dt;
    } else if (actions.backward) {
      this.speed -= this.acceleration * dt;
    } else if (this.speed > 0) {
      this.speed = Math.max(0, this.speed - this.friction * dt);
    } else if (this.speed < 0) {
      this.speed = Math.min(0, this.speed + this.friction * dt);
    }

    this.speed = Math.max(-this.maxReverseSpeed, Math.min(this.maxForwardSpeed, this.speed));

    if (actions.left) this.angle -= this.rotationSpeed * dt;
    if (actions.right) this.angle += this.rotationSpeed * dt;

    this.x += Math.cos(this.angle) * this.speed * dt;
    this.y += Math.sin(this.angle) * this.speed * dt;
  }

  draw(ctx) {
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(this.angle);

    // Body
    ctx.fillStyle = this.color;
    ctx.fillRect(-this.radius, -this.radius, this.radius * 2, this.radius * 2);

    // Barrel
    ctx.fillStyle = '#333';
    ctx.fillRect(0, -this.barrelHalfHeight, this.barrelLength, this.barrelHalfHeight * 2);

    ctx.restore();

    if (this.hasShield()) this._drawShield(ctx);
  }

  // Placeholder for assets/sprites/shield_bubble.png (still being resized
  // on the feat/sprites branch). Drawn unrotated and after the body so it
  // reads as a bubble around the tank, not part of it; it flickers over
  // the last second as a warning that it's about to lapse.
  _drawShield(ctx) {
    const expiring = this.shieldRemaining < 1;
    const flicker = expiring ? 0.35 + 0.35 * Math.sin(this.shieldRemaining * 30) : 0.7;

    ctx.save();
    ctx.globalAlpha = flicker;
    ctx.strokeStyle = Weapons.defs.shield.color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.shieldRadius, 0, Math.PI * 2);
    ctx.stroke();

    ctx.globalAlpha = flicker * 0.18;
    ctx.fillStyle = Weapons.defs.shield.color;
    ctx.fill();
    ctx.restore();
  }
}
