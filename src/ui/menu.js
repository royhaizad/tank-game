// Title, Mission Briefing, and Result screens, per GAME_SPEC.md section 6.
// Draws whichever screen main.js asks for and turns canvas clicks into a
// button id main.js can act on (consumeClick()), the same "produce an
// intent, let main.js decide what to do with it" pattern EasyAI uses for
// keys/wantsToFire.
class Menu {
  static PLAYER_COLORS = ['#3b6ea5', '#3f9142', '#8a3ba5']; // blue, green, purple
  static AI_COLORS = ['#a53b3b', '#c97a2e', '#7a1f6b']; // red, orange, magenta-red

  // Session stats display (GAME_SPEC.md section 9.1): icon + readable label
  // per stat, and a color per stat type (not per tank) — Win green, Kill
  // red, Death white. Every background this game draws is dark, so Death's
  // "invert for contrast" is just hardcoded white for now.
  static STAT_ICONS = { wins: '🏆', kills: '🔫', deaths: '💀' };
  static STAT_LABELS = { wins: 'Win', kills: 'Kill', deaths: 'Death' };
  static STAT_COLORS = { wins: '#4caf50', kills: '#e74c3c', deaths: '#ffffff' };
  static SCORE_LABEL_COLOR = '#ffffff';

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
  // difficulty (Easy/Medium/Hard all built and selectable), and each
  // player's control scheme (rebindable inline, same as the pause menu's Change
  // Controls). `config` is { playerCount, aiCount, aiDifficulties[3] }.
  // stats: label -> { kills, deaths, wins } session tallies (src/main.js) —
  // only used here to decide whether the Session Stats button (top-right,
  // opens drawStatsModal) is worth showing; it's hidden until at least one
  // match has been tallied this session, per GAME_SPEC.md section 9.1.
  drawBriefingScreen(ctx, canvas, config, awaitingRebind, stats) {
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

    if (stats && Object.keys(stats).length > 0) {
      const statsButton = { id: 'viewStats', x: canvas.width - 132, y: 8, w: 124, h: 22, label: 'Session Stats' };
      this.buttons.push(statsButton);
      this._drawSmallButton(ctx, statsButton);
    }
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
      { id: 'medium', label: 'Med' },
      { id: 'hard', label: 'Hard' }
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
  // stats: label -> { kills, deaths, wins } session tallies (src/main.js),
  // shown as a scoreboard with a Reset button per HANDOFF.md "Session B" —
  // in-session tallies only, cleared solely by that button (or a refresh).
  drawResultScreen(ctx, canvas, winner, stats) {
    const bg = !winner ? '#3a3a3a' : winner.kind === 'player' ? '#1e4a2c' : '#4a1e1e';
    this._drawBackground(ctx, canvas, bg);

    ctx.fillStyle = '#fff';
    ctx.font = 'bold 30px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(winner ? `${winner.label} Wins!` : 'Draw', canvas.width / 2, 45);

    const options = [
      { id: 'rematch', label: 'Rematch' },
      { id: 'changeDifficulty', label: 'Change Difficulty' },
      { id: 'title', label: 'Back to Title' }
    ];

    this.buttons = options.map((opt, i) => ({
      id: opt.id,
      x: canvas.width / 2 - 90,
      y: 75 + i * 50,
      w: 180,
      h: 42,
      label: opt.label
    }));

    this.buttons.forEach((btn) => this._drawButton(ctx, btn));

    const centerX = canvas.width / 2;
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 13px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Session Stats', centerX, 245);

    const tableBottom = this._drawScoreTable(ctx, canvas, stats, 265);
    const resetButton = { id: 'resetStats', x: centerX - 65, y: tableBottom + 20, w: 130, h: 28, label: 'Reset Stats' };
    this.buttons.push(resetButton);
    this._drawButton(ctx, resetButton);
  }

  // Full-screen overlay on top of whichever screen is already drawn (same
  // "don't clear the canvas first" pattern as drawPauseMenu), reachable
  // only from Mission Briefing via the Session Stats button, which is
  // itself only shown once stats exist (see drawBriefingScreen). Lets you
  // check/reset session tallies before a match without leaving Briefing.
  drawStatsModal(ctx, canvas, stats) {
    ctx.fillStyle = 'rgba(0, 0, 0, 0.75)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const centerX = canvas.width / 2;
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 22px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Session Stats', centerX, 60);

    this.buttons = [];
    const tableBottom = this._drawScoreTable(ctx, canvas, stats, 100);

    const resetButton = { id: 'resetStats', x: centerX - 90, y: tableBottom + 24, w: 180, h: 40, label: 'Reset Stats' };
    const closeButton = { id: 'closeStats', x: centerX - 90, y: tableBottom + 74, w: 180, h: 40, label: 'Close' };
    this.buttons.push(resetButton, closeButton);
    this._drawButton(ctx, resetButton);
    this._drawButton(ctx, closeButton);
  }

  // Shared table renderer for the Result screen and the Briefing stats
  // modal: header row is icon + readable word per stat (Win/Kill/Death),
  // colored by stat type (green/red/white) rather than by tank, per
  // GAME_SPEC.md section 9.1. Order matches the on-map label scheme
  // (P1/P2/P3 players, AI1/AI2/AI3 AI), skipping slots never used this
  // session. Returns the y coordinate of the last content drawn, so
  // callers can position their own buttons below it.
  _drawScoreTable(ctx, canvas, stats, startY) {
    const order = ['P1', 'P2', 'P3', 'AI1', 'AI2', 'AI3'];
    const labels = order.filter((label) => stats[label]);
    const centerX = canvas.width / 2;
    const colX = { label: centerX - 150, wins: centerX - 30, kills: centerX + 30, deaths: centerX + 90 };
    let y = startY;

    ctx.textAlign = 'left';
    ctx.font = 'bold 11px sans-serif';
    ctx.fillStyle = '#fff';
    ctx.fillText('Tank', colX.label, y);
    ctx.fillStyle = Menu.STAT_COLORS.wins;
    ctx.fillText(`${Menu.STAT_ICONS.wins} ${Menu.STAT_LABELS.wins}`, colX.wins, y);
    ctx.fillStyle = Menu.STAT_COLORS.kills;
    ctx.fillText(`${Menu.STAT_ICONS.kills} ${Menu.STAT_LABELS.kills}`, colX.kills, y);
    ctx.fillStyle = Menu.STAT_COLORS.deaths;
    ctx.fillText(`${Menu.STAT_ICONS.deaths} ${Menu.STAT_LABELS.deaths}`, colX.deaths, y);

    if (labels.length === 0) {
      y += 20;
      ctx.fillStyle = '#bbb';
      ctx.font = '12px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('No stats yet', centerX, y);
      return y;
    }

    ctx.font = '12px sans-serif';
    labels.forEach((label) => {
      y += 18;
      const s = stats[label];
      ctx.textAlign = 'left';
      ctx.fillStyle = Menu.SCORE_LABEL_COLOR;
      ctx.fillText(label, colX.label, y);
      ctx.fillStyle = Menu.STAT_COLORS.wins;
      ctx.fillText(String(s.wins), colX.wins, y);
      ctx.fillStyle = Menu.STAT_COLORS.kills;
      ctx.fillText(String(s.kills), colX.kills, y);
      ctx.fillStyle = Menu.STAT_COLORS.deaths;
      ctx.fillText(String(s.deaths), colX.deaths, y);
    });

    return y;
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

  // Compact utility button (smaller font than _drawButton) for corner
  // controls like Briefing's Session Stats button, where a full-size
  // button would overwhelm the layout.
  _drawSmallButton(ctx, btn) {
    ctx.fillStyle = '#3b6ea5';
    ctx.fillRect(btn.x, btn.y, btn.w, btn.h);
    ctx.strokeStyle = '#000';
    ctx.strokeRect(btn.x, btn.y, btn.w, btn.h);

    ctx.fillStyle = '#fff';
    ctx.font = 'bold 11px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(btn.label, btn.x + btn.w / 2, btn.y + btn.h / 2);
    ctx.textBaseline = 'alphabetic';
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
