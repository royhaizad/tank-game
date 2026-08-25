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
  // the base cannon (see Tank.equipWeapon). Deflects ANY bullet, including
  // its own wearer's returning ricochet (GAME_SPEC.md section 4); an
  // enemy's laser is absorbed the same way, but a mine still kills on
  // contact regardless (see mine.js), and the wearer's OWN laser still
  // hits them (see laser.js) — the shield only ever protects against
  // someone/something else's shot when it comes to lasers. Drawback: 6s
  // is short, and it offers no offense of its own.
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

// A small procedurally-drawn icon per weapon type, in def.color, used by
// both the map crate (crate.js) and the in-match HUD (ui/hud.js) so the
// two stay visually consistent. Placeholder for the real icon_* sprites
// (still being resized on feat/sprites) — deliberately bold, simple
// shapes so they stay readable at the tiny HUD size (~10px) as well as
// crate size (~20px). `size` is roughly the icon's bounding diameter.
Weapons.drawIcon = function (ctx, type, cx, cy, size) {
  const def = Weapons.def(type);
  const r = size / 2;

  ctx.save();
  ctx.translate(cx, cy);
  ctx.fillStyle = def.color;
  ctx.strokeStyle = def.color;
  ctx.lineWidth = Math.max(1, size * 0.12);

  switch (type) {
    case Weapons.GATLING: {
      // Three barrels.
      const barW = size * 0.16;
      const barH = size * 0.75;
      for (let i = -1; i <= 1; i++) {
        ctx.fillRect(i * size * 0.24 - barW / 2, -barH / 2, barW, barH);
      }
      break;
    }

    case Weapons.SHOTGUN: {
      // A fanned spread of pellets.
      const dots = 5;
      for (let i = 0; i < dots; i++) {
        const t = i / (dots - 1) - 0.5; // -0.5..0.5
        const dx = t * size * 0.75;
        const dy = -r * 0.5 - Math.abs(t) * size * 0.25;
        ctx.beginPath();
        ctx.arc(dx, dy, size * 0.09, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    }

    case Weapons.MISSILE: {
      // Dart-shaped nose plus two tailfins.
      ctx.beginPath();
      ctx.moveTo(0, -r);
      ctx.lineTo(r * 0.5, r * 0.6);
      ctx.lineTo(-r * 0.5, r * 0.6);
      ctx.closePath();
      ctx.fill();
      ctx.fillRect(-r * 0.75, r * 0.25, r * 0.35, r * 0.4);
      ctx.fillRect(r * 0.4, r * 0.25, r * 0.35, r * 0.4);
      break;
    }

    case Weapons.SHIELD: {
      // A rounded badge/shield outline.
      ctx.beginPath();
      ctx.moveTo(0, -r);
      ctx.quadraticCurveTo(r, -r * 0.6, r * 0.8, 0);
      ctx.quadraticCurveTo(r * 0.6, r * 0.8, 0, r);
      ctx.quadraticCurveTo(-r * 0.6, r * 0.8, -r * 0.8, 0);
      ctx.quadraticCurveTo(-r, -r * 0.6, 0, -r);
      ctx.closePath();
      ctx.globalAlpha = 0.35;
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.stroke();
      break;
    }

    case Weapons.MINE: {
      // A spiked ball, echoing Mine.draw's own look.
      ctx.beginPath();
      ctx.arc(0, 0, r * 0.55, 0, Math.PI * 2);
      ctx.fill();
      [0, 45, 90, 135, 180, 225, 270, 315].forEach((deg) => {
        const a = (deg * Math.PI) / 180;
        ctx.beginPath();
        ctx.moveTo(Math.cos(a) * r * 0.55, Math.sin(a) * r * 0.55);
        ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
        ctx.stroke();
      });
      break;
    }

    case Weapons.LASER: {
      // A lightning-bolt reads as "energy weapon" at a glance, even tiny.
      ctx.beginPath();
      ctx.moveTo(r * 0.15, -r);
      ctx.lineTo(-r * 0.55, r * 0.1);
      ctx.lineTo(0, r * 0.1);
      ctx.lineTo(-r * 0.15, r);
      ctx.lineTo(r * 0.55, -r * 0.1);
      ctx.lineTo(0, -r * 0.1);
      ctx.closePath();
      ctx.fill();
      break;
    }

    default: // cannon, or any unrecognized type — a plain dot
      ctx.beginPath();
      ctx.arc(0, 0, r * 0.45, 0, Math.PI * 2);
      ctx.fill();
      break;
  }

  ctx.restore();
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

    // Read BEFORE consumeAmmo(), which can revert tank.weapon to cannon
    // right here if this was the weapon's last shot — dispatching after
    // that would silently skip the sound on every weapon's final use.
    WeaponFire._playFireSound(tank.weapon);
    tank.consumeAmmo();
  },

  // "A tank uses a powerup" SFX, per weapon. Shield never reaches this —
  // equipping it is its only action (see Tank.equipWeapon), covered by
  // AudioEngine.playPowerupEquip instead. Cannon has no sound here on
  // purpose: it isn't a powerup.
  _playFireSound(type) {
    switch (type) {
      case Weapons.GATLING: AudioEngine.playGatlingShot(); break;
      case Weapons.SHOTGUN: AudioEngine.playShotgunBlast(); break;
      case Weapons.MISSILE: AudioEngine.playMissileLaunch(); break;
      case Weapons.MINE: AudioEngine.playMineDrop(); break;
      case Weapons.LASER: AudioEngine.playLaserFire(); break;
    }
  }
};
