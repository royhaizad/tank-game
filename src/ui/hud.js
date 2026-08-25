// In-match HUD, per GAME_SPEC.md section 6: current weapon + ammo count
// per player, tank labels, plus session Win/Kill/Death tallies (section
// 9.1, icons per HANDOFF.md decision: 🏆 win, 🔫 kill, 💀 death — same
// order and icons as the Result screen scoreboard in src/ui/menu.js).
//
// The weapon icon is Weapons.drawIcon (weapon.js) — a small procedurally-
// drawn placeholder shared with the map crate, standing in for the real
// icon_* sprites (assets/sprites/) until they're resized on feat/sprites.
class Hud {
  static ICON_SIZE = 10; // px

  // playerEntries: match entries with kind === 'player', in player order.
  // stats: label -> { kills, deaths, wins } session tallies (src/main.js).
  draw(ctx, canvas, playerEntries, activeBulletCount, stats) {
    ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
    ctx.fillRect(0, 0, canvas.width, 24);

    ctx.font = '12px sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    const midY = 12;

    let x = 8;
    playerEntries.forEach((entry) => {
      const tank = entry.tank;

      Weapons.drawIcon(ctx, tank.weapon, x + Hud.ICON_SIZE / 2, midY, Hud.ICON_SIZE);
      x += Hud.ICON_SIZE + 4;

      // The shield icon needs its U+FE0F variation selector — without it,
      // U+1F6E1 falls back to a faint monochrome outline instead of the
      // colored glyph the other HUD icons get. A charged-but-not-yet-fired
      // shield shows "(ready)" instead of a countdown — see
      // Tank.tryActivateShieldCharge, popped by the next fire press.
      const s = stats[entry.label] || { wins: 0, kills: 0, deaths: 0 };
      let shieldStatus = '';
      if (tank.hasShield()) shieldStatus = ` 🛡️${Math.ceil(tank.shieldRemaining)}s`;
      else if (tank.shieldCharged) shieldStatus = ' 🛡️(ready)';
      const text = `${entry.label}: ${this._weaponStatus(tank, activeBulletCount)}` +
        shieldStatus +
        `  🏆${s.wins} 🔫${s.kills} 💀${s.deaths}`;

      ctx.fillStyle = tank.color;
      ctx.fillText(text, x, midY);
      x += ctx.measureText(text).width + 14;
    });

    ctx.textBaseline = 'alphabetic'; // restore default for other draw calls
  }

  // The base cannon never runs out, so what actually limits it is how many
  // of its bullets are still in flight — that's the useful number to show.
  // A picked-up weapon shows shots remaining instead, since that's what
  // decides when it reverts to the cannon.
  _weaponStatus(tank, activeBulletCount) {
    if (tank.destroyed) return 'OUT';
    const def = Weapons.def(tank.weapon);
    if (tank.weapon === Weapons.CANNON) {
      return `${def.name} ${activeBulletCount(tank)}/${tank.effectiveMaxActiveBullets()}`;
    }
    return `${def.name} x${tank.weaponAmmo}`;
  }
}
