// Weapon definitions and firing dispatch, per GAME_SPEC.md section 4.
//
// A tank always has exactly one weapon equipped. Driving over a crate
// (see crate.js) swaps it; the weapon reverts to the base cannon the
// moment its ammo runs out. The base cannon has infinite ammo, so a tank
// is never left unable to shoot.
//
// Design rule from the spec: every weapon trades extra power for a real
// drawback, so none of them is strictly better than the base cannon.
// Each def below notes which drawback it carries.
//
// Fields a def may override (anything omitted falls back to the tank's own
// base values, which differ for players vs AI — see main.js startMatch):
//   ammo               shots before reverting to cannon (Infinity = never)
//   autoFireInterval   seconds between repeat shots while fire is HELD;
//                      Infinity = one shot per keypress, no auto-fire
//   fireCooldown       seconds of enforced downtime after a shot
//   maxActiveBullets   cap on this tank's bullets in flight
const Weapons = {
  CANNON: 'cannon',
  GATLING: 'gatling',
  SHOTGUN: 'shotgun',
  MISSILE: 'missile',
  SHIELD: 'shield',
  MINE: 'mine',
  LASER: 'laser'
};

// Everything a crate can contain — the base cannon is not a pickup.
Weapons.PICKUP_TYPES = [
  Weapons.GATLING,
  Weapons.SHOTGUN,
  Weapons.MISSILE,
  Weapons.SHIELD,
  Weapons.MINE,
  Weapons.LASER
];

Weapons.defs = {
  // Baseline. autoFireInterval 0.5 is the hold-to-auto-fire pacing from
  // GAME_SPEC.md section 3.2; ammo/cap/cooldown come from the tank.
  cannon: {
    name: 'Cannon',
    color: '#f2c14e',
    ammo: Infinity,
    autoFireInterval: 0.5,
    bulletKind: 'cannon'
  },

  // Drawback: all 15 rounds vanish in ~1.4s of held fire, and every one of
  // them keeps full bounce physics — spraying a corridor is the fastest
  // way to shoot yourself with your own ricochet. The in-flight cap is set
  // to the full magazine on purpose: capping it lower throttled the rate
  // back down to something that didn't read as a gatling at all, and
  // having all 15 rounds loose in the maze at once IS the drawback.
  gatling: {
    name: 'Gatling',
    color: '#c9d1d9',
    ammo: 15,
    autoFireInterval: 0.09,
    fireCooldown: 0.09,
    maxActiveBullets: 15,
    bulletKind: 'gatling'
  },

  // Drawback: pellets expire fast (see Bullet's 'pellet' kind), so it is
  // devastating point-blank and useless across a room.
  shotgun: {
    name: 'Shotgun',
    color: '#e08a3c',
    ammo: 3,
    autoFireInterval: Infinity,
    fireCooldown: 0.45,
    maxActiveBullets: Infinity, // 5 pellets per shot would otherwise trip the cap
    bulletKind: 'pellet',
    pellets: 5,
    spreadAngle: 0.42 // rad, total cone width (~24 degrees)
  },

  // Drawback: it homes on the NEAREST tank, which after 1s of straight
  // flight can easily be the tank that fired it. One shot only.
  missile: {
    name: 'Missile',
    color: '#d94f4f',
    ammo: 1,
    autoFireInterval: Infinity,
    fireCooldown: 0.5,
    maxActiveBullets: 4,
    bulletKind: 'missile'
  },

  // Not fired — picking it up grants a 6s bubble and leaves the tank on
  // the base cannon (see Tank.equipWeapon). Drawback: it only deflects
  // OTHER tanks' bullets; your own ricochet still kills you through it
  // (GAME_SPEC.md section 4), and 6s is short.
  shield: {
    name: 'Shield',
    color: '#5bc8f5',
    ammo: 0,
    duration: 6
  },

  // Drawback: invisible after 1s to EVERYONE including whoever dropped it,
  // and armed mines kill on contact regardless of owner.
  mine: {
    name: 'Mine',
    color: '#8a7f6d',
    ammo: 3,
    autoFireInterval: Infinity,
    fireCooldown: 0.5,
    maxActiveBullets: Infinity, // mines aren't bullets; never gated by the in-flight cap
    needsClearBarrel: false // dropped under the tank, not out of the barrel
  },

  // Drawback: a setup delay you cannot cancel — the aim line is drawn for
  // every player to see while the laser is equipped, and firing locks the
  // angle then charges for LaserBeam.CHARGE_TIME before the beam lands.
  laser: {
    name: 'Laser',
    color: '#7be0a4',
    ammo: 1,
    autoFireInterval: Infinity,
    fireCooldown: 0.5,
    maxActiveBullets: Infinity // beams aren't bullets; never gated by the in-flight cap
  }
};

Weapons.def = function (type) {
  return Weapons.defs[type] || Weapons.defs[Weapons.CANNON];
};

// Turns a fire input into whatever the currently equipped weapon actually
// produces, pushing into the match's live bullet/mine/beam collections.
// Ammo is consumed here, so main.js never has to know what a given weapon
// spawns — it just calls fire().
const WeaponFire = {
  // Mines are dropped underneath the tank, so unlike every barrel-fired
  // weapon they're still usable while nosed up against a wall.
  needsClearBarrel(tank) {
    return Weapons.def(tank.weapon).needsClearBarrel !== false;
  },

  fire(tank, maze, bullets, mines, beams) {
    const def = Weapons.def(tank.weapon);
    const tip = tank.getBarrelTip();

    switch (tank.weapon) {
      case Weapons.SHOTGUN: {
        // Evenly spaced across the cone, centered on the barrel heading.
        const step = def.spreadAngle / (def.pellets - 1);
        const start = tank.angle - def.spreadAngle / 2;
        for (let i = 0; i < def.pellets; i++) {
          bullets.push(new Bullet(tip.x, tip.y, start + step * i, tank, def.bulletKind));
        }
        break;
      }

      case Weapons.MINE:
        mines.add(new Mine(tank.x, tank.y, tank));
        break;

      case Weapons.LASER:
        beams.push(new LaserBeam(tank, maze));
        break;

      default:
        bullets.push(new Bullet(tip.x, tip.y, tank.angle, tank, def.bulletKind));
        break;
    }

    tank.consumeAmmo();
  }
};
