// Tank-drive movement: forward/back along facing direction, left/right
// rotates. Acceleration/deceleration per GAME_SPEC.md section 3.1.
// Wall/opponent collision is not implemented yet (no maze exists yet) —
// tank is clamped to the canvas bounds as a temporary stand-in.
class Tank {
  constructor(x, y, color) {
    this.x = x;
    this.y = y;
    this.angle = 0;
    this.speed = 0;
    this.color = color;
    this.radius = 14;

    this.acceleration = 220; // px/s^2
    this.friction = 260; // px/s^2, brings speed back to 0 when idle
    this.maxForwardSpeed = 140; // px/s
    this.maxReverseSpeed = 80; // px/s
    this.rotationSpeed = 2.6; // radians/s
  }

  update(dt, keys) {
    if (keys['w']) {
      this.speed += this.acceleration * dt;
    } else if (keys['s']) {
      this.speed -= this.acceleration * dt;
    } else if (this.speed > 0) {
      this.speed = Math.max(0, this.speed - this.friction * dt);
    } else if (this.speed < 0) {
      this.speed = Math.min(0, this.speed + this.friction * dt);
    }

    this.speed = Math.max(-this.maxReverseSpeed, Math.min(this.maxForwardSpeed, this.speed));

    if (keys['a']) this.angle -= this.rotationSpeed * dt;
    if (keys['d']) this.angle += this.rotationSpeed * dt;

    this.x += Math.cos(this.angle) * this.speed * dt;
    this.y += Math.sin(this.angle) * this.speed * dt;
  }

  clampToBounds(width, height) {
    this.x = Math.max(this.radius, Math.min(width - this.radius, this.x));
    this.y = Math.max(this.radius, Math.min(height - this.radius, this.y));
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
    ctx.fillRect(0, -3, this.radius + 12, 6);

    ctx.restore();
  }
}
