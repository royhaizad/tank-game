// In-match HUD, per GAME_SPEC.md section 6: current weapon + ammo count
// per player, tank labels. Only the base cannon exists so far (no
// power-ups yet), so "weapon" just reads "Cannon" for now.
class Hud {
  // playerEntries: match entries with kind === 'player', in player order.
  draw(ctx, canvas, playerEntries, activeBulletCount) {
    ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
    ctx.fillRect(0, 0, canvas.width, 24);

    ctx.font = '12px sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    const midY = 12;

    let x = 8;
    playerEntries.forEach((entry) => {
      const status = entry.tank.destroyed ? 'OUT' : `${activeBulletCount(entry.tank)}/${entry.tank.maxActiveBullets}`;
      const text = `${entry.label}: ${status}`;
      ctx.fillStyle = entry.tank.color;
      ctx.fillText(text, x, midY);
      x += ctx.measureText(text).width + 18;
    });

    ctx.textBaseline = 'alphabetic'; // restore default for other draw calls
  }
}
