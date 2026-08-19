// Tank-drive movement: forward/back along facing direction, left/right
// rotates. Acceleration/deceleration per GAME_SPEC.md section 3.1. Wall
// collision is resolved externally by Maze.resolveTankCollision() after
// update() moves the tank, using getBodyShape()/getBarrelShape() below so
// neither the body nor the protruding barrel can end up inside a wall.
// Opponent-tank collision isn't implemented yet (no second tank exists).
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
    this.maxActiveBullets = 5; // per GAME_SPEC.md section 3.2
    this.destroyed = false;
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
  }
}
