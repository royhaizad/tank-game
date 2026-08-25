// Weapon crates, per GAME_SPEC.md section 4. A crate sits on the center of
// a random empty floor cell; driving over it swaps the tank's weapon (see
// Tank.equipWeapon) and removes the crate.
//
// CrateField owns spawn timing and the live-crate cap for a whole match,
// so main.js only has to construct it and tick it once per frame.
//
// Sprite note: assets/sprites/weapon_crate.png and the icon_* set exist but
// are still raw oversized exports being resized on the feat/sprites branch,
// so the crate box itself is a placeholder rect; the icon on top of it is
// Weapons.drawIcon (weapon.js), a procedurally-drawn placeholder shared
// with the HUD. Swapping in real sprites later only needs to touch draw()
// here and Hud's icon call.
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

    Weapons.drawIcon(ctx, this.weaponType, 0, 0, this.radius * 1.4);

    ctx.restore();

    // Readable weapon-name label — fixed to this.y rather than the bob, and
    // outlined for legibility against the grass, same treatment as the
    // tank name labels drawn in main.js's drawMatchScene.
    ctx.save();
    ctx.font = 'bold 9px sans-serif';
    ctx.textAlign = 'center';
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.6)';
    ctx.strokeText(def.name, this.x, this.y - this.radius - 4);
    ctx.fillStyle = '#fff';
    ctx.fillText(def.name, this.x, this.y - this.radius - 4);
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

  // Ticks spawn timing and resolves pickups. Returns { pickups, spawned }
  // so the caller can play the right sound for each — a crate appearing
  // vs. a tank actually equipping one (GAME_SPEC.md section 4).
  update(dt, matchTanks) {
    this.crates.forEach((crate) => crate.update(dt));

    let spawned = false;
    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0) {
      if (this.crates.length < this.liveCap) spawned = this._spawn(matchTanks);
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

    return { pickups, spawned };
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
  // Returns whether a crate actually got placed (false if every cell was
  // taken), so the caller knows whether to play the spawn sound.
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
    if (candidates.length === 0) return false;

    const spot = candidates[Math.floor(Math.random() * candidates.length)];
    const type = Weapons.PICKUP_TYPES[Math.floor(Math.random() * Weapons.PICKUP_TYPES.length)];
    this.crates.push(new Crate(spot.x, spot.y, type));
    return true;
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
