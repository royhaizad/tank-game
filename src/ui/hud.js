// In-match HUD, per GAME_SPEC.md section 6: current weapon + ammo count,
// difficulty label. Only the base cannon exists so far (no power-ups
// yet), so "weapon" just reads "Cannon" for now.
class Hud {
  draw(ctx, canvas, playerTank, activeCount, difficultyLabel) {
    ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
    ctx.fillRect(0, 0, canvas.width, 26);

    ctx.font = '13px sans-serif';
    ctx.textBaseline = 'middle';
    const midY = 13;

    ctx.fillStyle = '#fff';
    ctx.textAlign = 'left';
    ctx.fillText(`Cannon: ${activeCount}/${playerTank.maxActiveBullets}`, 8, midY);

    ctx.textAlign = 'right';
    ctx.fillText(`Difficulty: ${difficultyLabel}`, canvas.width - 8, midY);

    ctx.textBaseline = 'alphabetic'; // restore default for other draw calls
  }
}
