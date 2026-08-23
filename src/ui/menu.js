// Title, Mission Briefing, and Result screens, per GAME_SPEC.md section 6.
// Draws whichever screen main.js asks for and turns canvas clicks into a
// button id main.js can act on (consumeClick()), the same "produce an
// intent, let main.js decide what to do with it" pattern EasyAI uses for
// keys/wantsToFire.
class Menu {
  static PLAYER_COLORS = ['#3b6ea5', '#3f9142', '#8a3ba5']; // blue, green, purple
  static AI_COLORS = ['#a53b3b', '#c97a2e', '#7a1f6b']; // red, orange, magenta-red

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

  // Mission Briefing screen, per GAME_SPEC.md section 6: pick player count
  // (1-3), AI count (0-3, only 0-selectable when players > 1), each AI's
  // difficulty (Medium/Hard disabled — not built yet), and each player's
  // control scheme (rebindable inline, same as the pause menu's Change
  // Controls). `config` is { playerCount, aiCount, aiDifficulties[3] }.
  drawBriefingScreen(ctx, canvas, config, awaitingRebind) {
    this._drawBackground(ctx, canvas, '#2c4a1e');
    this.buttons = [];

    ctx.fillStyle = '#fff';
    ctx.font = 'bold 24px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Mission Briefing', canvas.width / 2, 22);
    ctx.font = '11px sans-serif';
    ctx.fillText('Configure your forces before battle', canvas.width / 2, 38);

    this._drawCountSelector(
      ctx,
      160,
      'Allied Forces',
      ['1P', '2P', '3P'],
      config.playerCount - 1, // labels are 1-indexed counts but option index is 0-indexed
      'players',
      () => false
    );
    this._drawCountSelector(ctx, 480, 'Enemy Forces', ['0', '1', '2', '3'], config.aiCount, 'ai', (n) =>
      n === 0 ? config.playerCount < 2 : false
    );

    for (let i = 0; i < config.playerCount; i++) {
      this._drawPlayerBriefingRow(ctx, i, 95 + i * 85, awaitingRebind);
    }
    for (let i = 0; i < config.aiCount; i++) {
      this._drawAiBriefingRow(ctx, i, 95 + i * 85, config.aiDifficulties[i]);
    }

    const canBattle = config.playerCount + config.aiCount >= 2;
    const backButton = { id: 'briefingBack', x: 200, y: 440, w: 90, h: 34, label: '← Back' };
    const battleButton = {
      id: 'battle',
      x: 340,
      y: 440,
      w: 120,
      h: 34,
      label: '▶ Battle!',
      disabled: !canBattle
    };
    this.buttons.push(backButton, battleButton);
    this._drawButton(ctx, backButton);
    this._drawButton(ctx, battleButton);
  }

  _drawCountSelector(ctx, centerX, title, optionLabels, current, idPrefix, isDisabled) {
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 13px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(title, centerX, 55);

    const w = 42;
    const gap = 6;
    const totalW = optionLabels.length * w + (optionLabels.length - 1) * gap;
    let x = centerX - totalW / 2;

    optionLabels.forEach((label, i) => {
      const btn = {
        id: `${idPrefix}:${i}`,
        x,
        y: 64,
        w,
        h: 24,
        label,
        disabled: isDisabled(i),
        selected: i === current
      };
      this.buttons.push(btn);
      this._drawToggleButton(ctx, btn);
      x += w + gap;
    });
  }

  _drawPlayerBriefingRow(ctx, playerIndex, y, awaitingRebind) {
    const colors = Menu.PLAYER_COLORS;
    const bindings = Input.playerBindings[playerIndex];

    ctx.fillStyle = colors[playerIndex];
    ctx.font = 'bold 14px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(`PLAYER ${playerIndex + 1}`, 20, y);

    const actions = ['forward', 'backward', 'left', 'right', 'fire'];
    const shortLabels = ['Fwd', 'Back', 'Left', 'Right', 'Fire'];
    const boxW = 46;
    const gap = 5;
    let x = 20;

    actions.forEach((action, i) => {
      const awaiting = awaitingRebind && awaitingRebind.playerIndex === playerIndex && awaitingRebind.action === action;
      const btn = {
        id: `rebind:${playerIndex}:${action}`,
        x,
        y: y + 10,
        w: boxW,
        h: 28,
        label: awaiting ? '…' : Menu._displayKey(bindings[action]),
        caption: shortLabels[i],
        awaiting
      };
      this.buttons.push(btn);
      this._drawKeyBox(ctx, btn);
      x += boxW + gap;
    });
  }

  _drawAiBriefingRow(ctx, aiIndex, y, difficulty) {
    const colors = Menu.AI_COLORS;

    ctx.fillStyle = colors[aiIndex];
    ctx.font = 'bold 14px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(`AI ${aiIndex + 1}`, 340, y);

    const tiers = [
      { id: 'easy', label: 'Easy' },
      { id: 'medium', label: 'Med', disabled: true },
      { id: 'hard', label: 'Hard', disabled: true }
    ];
    const boxW = 55;
    const gap = 6;
    let x = 340;

    tiers.forEach((tier) => {
      const btn = {
        id: `diff:${aiIndex}:${tier.id}`,
        x,
        y: y + 10,
        w: boxW,
        h: 28,
        label: tier.label,
        disabled: tier.disabled,
        selected: difficulty === tier.id
      };
      this.buttons.push(btn);
      this._drawToggleButton(ctx, btn);
      x += boxW + gap;
    });
  }

  _drawToggleButton(ctx, btn) {
    ctx.fillStyle = btn.disabled ? '#3a3a3a' : btn.selected ? '#3b6ea5' : '#4a4a4a';
    ctx.fillRect(btn.x, btn.y, btn.w, btn.h);
    ctx.strokeStyle = btn.selected ? '#fff' : '#000';
    ctx.strokeRect(btn.x, btn.y, btn.w, btn.h);

    ctx.fillStyle = btn.disabled ? '#777' : '#fff';
    ctx.font = '13px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(btn.label, btn.x + btn.w / 2, btn.y + btn.h / 2);
    ctx.textBaseline = 'alphabetic';
  }

  _drawKeyBox(ctx, btn) {
    ctx.fillStyle = btn.awaiting ? '#c9903b' : '#3b6ea5';
    ctx.fillRect(btn.x, btn.y, btn.w, btn.h);
    ctx.strokeStyle = '#000';
    ctx.strokeRect(btn.x, btn.y, btn.w, btn.h);

    ctx.fillStyle = '#cfcfcf';
    ctx.font = '9px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(btn.caption, btn.x + btn.w / 2, btn.y - 2);

    ctx.fillStyle = '#fff';
    ctx.font = 'bold 12px sans-serif';
    ctx.textBaseline = 'middle';
    ctx.fillText(btn.label, btn.x + btn.w / 2, btn.y + btn.h / 2 + 1);
    ctx.textBaseline = 'alphabetic';
  }

  // winner: { label, kind: 'player'|'ai' } for whoever's left standing, or
  // null for a draw (simultaneous mutual kill), per GAME_SPEC.md section 9.
  drawResultScreen(ctx, canvas, winner) {
    const bg = !winner ? '#3a3a3a' : winner.kind === 'player' ? '#1e4a2c' : '#4a1e1e';
    this._drawBackground(ctx, canvas, bg);

    ctx.fillStyle = '#fff';
    ctx.font = 'bold 36px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(winner ? `${winner.label} Wins!` : 'Draw', canvas.width / 2, 90);

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

  // Overlaid on top of a frozen match scene main.js already drew this
  // frame — doesn't clear the canvas first.
  drawPauseMenu(ctx, canvas) {
    ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.fillStyle = '#fff';
    ctx.font = 'bold 28px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Paused', canvas.width / 2, 50);

    const options = [
      { id: 'resume', label: 'Resume' },
      { id: 'rematch', label: 'Rematch' },
      { id: 'changeDifficulty', label: 'Change Difficulty' },
      { id: 'changeControls', label: 'Change Controls' },
      { id: 'quitToTitle', label: 'Quit to Title' }
    ];

    this.buttons = options.map((opt, i) => ({
      id: opt.id,
      x: canvas.width / 2 - 110,
      y: 80 + i * 64,
      w: 220,
      h: 52,
      label: opt.label
    }));

    this.buttons.forEach((btn) => this._drawButton(ctx, btn));
  }

  // Also overlaid on top of the frozen match scene, on top of the pause
  // menu itself.
  drawConfirmDialog(ctx, canvas, message) {
    ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.fillStyle = '#fff';
    ctx.font = 'bold 18px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(message, canvas.width / 2, canvas.height / 2 - 40);

    const yesButton = { id: 'yes', x: canvas.width / 2 - 130, y: canvas.height / 2, w: 120, h: 50, label: 'Yes' };
    const noButton = { id: 'no', x: canvas.width / 2 + 10, y: canvas.height / 2, w: 120, h: 50, label: 'No' };
    this.buttons = [yesButton, noButton];
    this.buttons.forEach((btn) => this._drawButton(ctx, btn));
  }

  // Full-screen (not an overlay) — a dedicated screen for rebinding keys,
  // covering every active player's scheme (Pause is never listed here —
  // it's fixed to Esc, not rebindable, per GAME_SPEC.md section 7). Reuses
  // the same compact per-player key-box row the Mission Briefing screen
  // uses, so the two rebinding UIs look and behave identically.
  // `awaitingRebind` is { playerIndex, action } or null.
  drawControlsScreen(ctx, canvas, playerCount, awaitingRebind) {
    this._drawBackground(ctx, canvas, '#2c4a1e');
    this.buttons = [];

    ctx.fillStyle = '#fff';
    ctx.font = 'bold 24px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Change Controls', canvas.width / 2, 36);
    ctx.font = '12px sans-serif';
    ctx.fillText('Click an action, then press the key to bind (Esc cancels)', canvas.width / 2, 56);

    for (let i = 0; i < playerCount; i++) {
      this._drawPlayerBriefingRow(ctx, i, 90 + i * 85, awaitingRebind);
    }

    const backButton = {
      id: 'back',
      x: canvas.width / 2 - 80,
      y: 90 + playerCount * 85 + 10,
      w: 160,
      h: 40,
      label: 'Back'
    };
    this.buttons.push(backButton);
    this._drawButton(ctx, backButton);
  }

  _drawRebindRow(ctx, btn) {
    ctx.fillStyle = btn.awaiting ? '#c9903b' : '#3b6ea5';
    ctx.fillRect(btn.x, btn.y, btn.w, btn.h);
    ctx.strokeStyle = '#000';
    ctx.strokeRect(btn.x, btn.y, btn.w, btn.h);

    ctx.fillStyle = '#fff';
    ctx.font = '14px sans-serif';
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    ctx.fillText(btn.label, btn.x + 12, btn.y + btn.h / 2);
    ctx.textAlign = 'right';
    ctx.fillText(btn.keyDisplay, btn.x + btn.w - 12, btn.y + btn.h / 2);
    ctx.textBaseline = 'alphabetic'; // restore default for other draw calls
  }

  static _displayKey(key) {
    if (key === ' ') return 'Space';
    if (key === 'escape') return 'Esc';
    if (key === 'arrowup') return '↑';
    if (key === 'arrowdown') return '↓';
    if (key === 'arrowleft') return '←';
    if (key === 'arrowright') return '→';
    return key.length === 1 ? key.toUpperCase() : key.charAt(0).toUpperCase() + key.slice(1);
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
