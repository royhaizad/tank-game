// Title, Difficulty Select, and Result screens, per GAME_SPEC.md section 6.
// Draws whichever screen main.js asks for and turns canvas clicks into a
// button id main.js can act on (consumeClick()), the same "produce an
// intent, let main.js decide what to do with it" pattern EasyAI uses for
// keys/wantsToFire.
class Menu {
  constructor(canvas) {
    this.canvas = canvas;
    this.buttons = [];
    this.clickedId = null;

    canvas.addEventListener('click', (e) => this._onClick(e));
  }

  consumeClick() {
    const id = this.clickedId;
    this.clickedId = null;
    return id;
  }

  _onClick(e) {
    const rect = this.canvas.getBoundingClientRect();
    const scaleX = this.canvas.width / rect.width;
    const scaleY = this.canvas.height / rect.height;
    const x = (e.clientX - rect.left) * scaleX;
    const y = (e.clientY - rect.top) * scaleY;

    for (const btn of this.buttons) {
      if (btn.disabled) continue;
      if (x >= btn.x && x <= btn.x + btn.w && y >= btn.y && y <= btn.y + btn.h) {
        this.clickedId = btn.id;
        return;
      }
    }
  }

  drawTitleScreen(ctx, canvas) {
    this._drawBackground(ctx, canvas, '#2c4a1e');

    ctx.fillStyle = '#fff';
    ctx.font = 'bold 40px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Pixel Tank Duel', canvas.width / 2, canvas.height / 3);

    const playButton = { id: 'play', x: canvas.width / 2 - 90, y: canvas.height / 2, w: 180, h: 56, label: 'Play' };
    this.buttons = [playButton];
    this._drawButton(ctx, playButton);
  }

  drawDifficultySelect(ctx, canvas) {
    this._drawBackground(ctx, canvas, '#2c4a1e');

    ctx.fillStyle = '#fff';
    ctx.font = 'bold 28px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Select Difficulty', canvas.width / 2, 60);

    const tiers = [
      { id: 'easy', label: 'Easy', desc: 'Casual pursuit, basic ammo, no bank shots' },
      { id: 'medium', label: 'Medium', desc: 'Coming soon', disabled: true },
      { id: 'hard', label: 'Hard', desc: 'Coming soon', disabled: true }
    ];

    this.buttons = tiers.map((tier, i) => ({
      id: tier.id,
      x: canvas.width / 2 - 100,
      y: 110 + i * 100,
      w: 200,
      h: 56,
      label: tier.label,
      disabled: tier.disabled
    }));

    this.buttons.forEach((btn, i) => {
      this._drawButton(ctx, btn);
      ctx.fillStyle = '#cfcfcf';
      ctx.font = '13px sans-serif';
      ctx.fillText(tiers[i].desc, canvas.width / 2, btn.y + btn.h + 18);
    });
  }

  drawResultScreen(ctx, canvas, won) {
    this._drawBackground(ctx, canvas, won ? '#1e4a2c' : '#4a1e1e');

    ctx.fillStyle = '#fff';
    ctx.font = 'bold 36px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(won ? 'Victory!' : 'Defeat', canvas.width / 2, 90);

    const options = [
      { id: 'rematch', label: 'Rematch' },
      { id: 'changeDifficulty', label: 'Change Difficulty' },
      { id: 'title', label: 'Back to Title' }
    ];

    this.buttons = options.map((opt, i) => ({
      id: opt.id,
      x: canvas.width / 2 - 100,
      y: 150 + i * 74,
      w: 200,
      h: 56,
      label: opt.label
    }));

    this.buttons.forEach((btn) => this._drawButton(ctx, btn));
  }

  _drawBackground(ctx, canvas, color) {
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  _drawButton(ctx, btn) {
    ctx.fillStyle = btn.disabled ? '#4a4a4a' : '#3b6ea5';
    ctx.fillRect(btn.x, btn.y, btn.w, btn.h);
    ctx.strokeStyle = '#000';
    ctx.strokeRect(btn.x, btn.y, btn.w, btn.h);

    ctx.fillStyle = btn.disabled ? '#8a8a8a' : '#fff';
    ctx.font = '18px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(btn.label, btn.x + btn.w / 2, btn.y + btn.h / 2);
    ctx.textBaseline = 'alphabetic'; // restore default for other draw calls
  }
}
