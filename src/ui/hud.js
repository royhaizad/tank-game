// In-match HUD, per GAME_SPEC.md section 6: current weapon + ammo count
// per player, tank labels, plus session Win/Kill/Death tallies (section
// 9.1, icons per HANDOFF.md decision: 🏆 win, 🔫 kill, 💀 death — same
// order and icons as the Result screen scoreboard in src/ui/menu.js).
// Only the base cannon exists so far (no power-ups yet), so "weapon" just
// reads "Cannon" for now.
class Hud {
  // playerEntries: match entries with kind === 'player', in player order.
  // stats: label -> { kills, deaths, wins } session tallies (src/main.js).
  // config: carries the custom names (GAME_SPEC.md 9.4) — stats stay keyed
  // by slot label, so only the displayed text changes when a tank renames.
  draw(ctx, canvas, playerEntries, activeBulletCount, stats, config) {
    ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
    ctx.fillRect(0, 0, canvas.width, 24);

    ctx.font = '12px sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    const midY = 12;

    let x = 8;
    playerEntries.forEach((entry) => {
      const status = entry.tank.destroyed ? 'OUT' : `${activeBulletCount(entry.tank)}/${entry.tank.maxActiveBullets}`;
      const s = stats[entry.label] || { wins: 0, kills: 0, deaths: 0 };
      const text = `${Menu.displayName(config, entry.label)}: ${status}  🏆${s.wins} 🔫${s.kills} 💀${s.deaths}`;
      ctx.fillStyle = entry.tank.color;
      ctx.fillText(text, x, midY);
      x += ctx.measureText(text).width + 18;
    });

    ctx.textBaseline = 'alphabetic'; // restore default for other draw calls
  }
}
