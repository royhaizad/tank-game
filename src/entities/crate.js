// Weapon crates, per GAME_SPEC.md section 4. A crate sits on the center of
// a random empty floor cell; driving over it swaps the tank's weapon (see
// Tank.equipWeapon) and removes the crate.
//
// CrateField owns spawn timing and the live-crate cap for a whole match,
// so main.js only has to construct it and tick it once per frame.
//
// Sprite note: assets/sprites/weapon_crate.png and the icon_* set exist but
// are still raw oversized exports being resized on the feat/sprites branch,
// so everything here draws placeholder rects for now. Swapping in sprites
// later only needs to touch draw() here and Hud's weapon swatch.
class Crate {
  constructor(x, y, weaponType) {
    this.x = x;
    this.y = y;
    this.weaponType = weaponType;
    this.radius = 11; // px, half the drawn box
    this.age = 0;
  }

  update(dt) {
    this.age += dt;
  }

  draw(ctx) {
    const def = Weapons.def(this.weaponType);
    // Slight bob so crates read as pickups rather than scenery.
    const bob = Math.sin(this.age * 3) * 1.5;

    ctx.save();
    ctx.translate(this.x, this.y + bob);

    ctx.fillStyle = '#8a5a2b';
    ctx.fillRect(-this.radius, -this.radius, this.radius * 2, this.radius * 2);
    ctx.strokeStyle = '#3b2410';
    ctx.lineWidth = 2;
    ctx.strokeRect(-this.radius, -this.radius, this.radius * 2, this.radius * 2);

    // Placeholder for the weapon icon sprite: a swatch in the weapon's color.
    ctx.fillStyle = def.color;
    ctx.fillRect(-5, -5, 10, 10);

    ctx.restore();
  }
}

class CrateField {
  // Spawn cadence and live cap, per GAME_SPEC.md section 4.
  static SPAWN_MIN = 3; // s
  static SPAWN_MAX = 7; // s
  static LIVE_CAP_MIN = 1;
  static LIVE_CAP_MAX = 4;

  constructor(maze) {
    this.maze = maze;
    this.crates = [];
    // "max 1-4 live" is read as a cap rolled once per match, so some
    // matches stay scarce and weapon-hungry while others are a scramble.
    this.liveCap = CrateField.LIVE_CAP_MIN +
      Math.floor(Math.random() * (CrateField.LIVE_CAP_MAX - CrateField.LIVE_CAP_MIN + 1));
    this.spawnTimer = this._rollSpawnDelay();
  }

  _rollSpawnDelay() {
    return CrateField.SPAWN_MIN + Math.random() * (CrateField.SPAWN_MAX - CrateField.SPAWN_MIN);
  }

  // Ticks spawn timing and resolves pickups. Returns the entries that
  // picked something up this frame, so the caller can play a chime.
  update(dt, matchTanks) {
    this.crates.forEach((crate) => crate.update(dt));

    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0) {
      if (this.crates.length < this.liveCap) this._spawn(matchTanks);
      this.spawnTimer = this._rollSpawnDelay();
    }

    const pickups = [];
    this.crates = this.crates.filter((crate) => {
      const taker = matchTanks.find((entry) => !entry.tank.destroyed && this._touches(crate, entry.tank));
      if (!taker) return true;
      taker.tank.equipWeapon(crate.weaponType);
      pickups.push({ entry: taker, weaponType: crate.weaponType });
      return false;
    });

    return pickups;
  }

  _touches(crate, tank) {
    const dx = crate.x - tank.x;
    const dy = crate.y - tank.y;
    const reach = crate.radius + tank.radius;
    return dx * dx + dy * dy <= reach * reach;
  }

  // Picks a random cell that has no crate already and no tank sitting on
  // it, so a crate can never spawn directly under someone (which would
  // read as a free instant pickup rather than something to drive for).
  _spawn(matchTanks) {
    const candidates = [];
    for (let row = 0; row < this.maze.rows; row++) {
      for (let col = 0; col < this.maze.cols; col++) {
        const center = this._cellCenter(row, col);
        if (this.crates.some((crate) => crate.x === center.x && crate.y === center.y)) continue;
        const occupied = matchTanks.some((entry) => {
          if (entry.tank.destroyed) return false;
          const cell = this.maze.worldToCell(entry.tank.x, entry.tank.y);
          return cell.row === row && cell.col === col;
        });
        if (occupied) continue;
        candidates.push(center);
      }
    }
    if (candidates.length === 0) return;

    const spot = candidates[Math.floor(Math.random() * candidates.length)];
    const type = Weapons.PICKUP_TYPES[Math.floor(Math.random() * Weapons.PICKUP_TYPES.length)];
    this.crates.push(new Crate(spot.x, spot.y, type));
  }

  _cellCenter(row, col) {
    return {
      x: col * this.maze.cellSize + this.maze.cellSize / 2,
      y: row * this.maze.cellSize + this.maze.cellSize / 2
    };
  }

  draw(ctx) {
    this.crates.forEach((crate) => crate.draw(ctx));
  }
}
