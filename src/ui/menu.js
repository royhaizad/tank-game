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

  // Team mode (GAME_SPEC.md section 9.2). A team is a mix of human and AI
  // tanks, so a team's color is its own identity — not derived from
  // PLAYER_COLORS/AI_COLORS, which stay per-tank.
  static TEAM_IDS = ['1', '2'];
  static TEAM_COLORS = { 1: '#2f8fbf', 2: '#d07b2a' };
  // Darkened team colors, for the Result screen banner background — the
  // full-strength colors are far too bright behind 30px text.
  static TEAM_BG_COLORS = { 1: '#1b3a4a', 2: '#4a3117' };

  constructor(canvas) {
    this.canvas = canvas;
    this.buttons = [];
    this.clickedId = null;
    this.screen = null; // set each frame by main.js, so the drag handlers below stay inert elsewhere

    // Team Setup drag state (GAME_SPEC.md section 9.2). Tokens and drop
    // zones are rebuilt every frame by drawTeamAssignScreen; a finished
    // drag reports itself as a `team:<slot>:<teamId>` click, so main.js
    // handles a drop and a plain click through the exact same path.
    this.tokens = [];
    this.dropZones = [];
    this.drag = null;
    this.suppressClick = false;

    canvas.addEventListener('click', (e) => this._onClick(e));
    canvas.addEventListener('mousedown', (e) => this._onPointerDown(e));
    // move/up on window, not canvas, so a drag that wanders off the canvas
    // still tracks and still releases instead of getting stuck held down.
    window.addEventListener('mousemove', (e) => this._onPointerMove(e));
    window.addEventListener('mouseup', (e) => this._onPointerUp(e));
  }

  setScreen(screen) {
    this.screen = screen;
  }

  consumeClick() {
    const id = this.clickedId;
    this.clickedId = null;
    return id;
  }

  _eventPos(e) {
    const rect = this.canvas.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left) * (this.canvas.width / rect.width),
      y: (e.clientY - rect.top) * (this.canvas.height / rect.height)
    };
  }

  static _hits(x, y, rect) {
    return x >= rect.x && x <= rect.x + rect.w && y >= rect.y && y <= rect.y + rect.h;
  }

  _onClick(e) {
    // A drag or a token tap already decided what this gesture meant; without
    // this, releasing a token on top of a button would also press it.
    if (this.suppressClick) {
      this.suppressClick = false;
      return;
    }

    const { x, y } = this._eventPos(e);

    for (const btn of this.buttons) {
      if (btn.disabled) continue;
      if (Menu._hits(x, y, btn)) {
        this.clickedId = btn.id;
        return;
      }
    }
  }

  _onPointerDown(e) {
    if (this.screen !== 'teamAssign') return;

    const { x, y } = this._eventPos(e);
    const token = this.tokens.find((t) => Menu._hits(x, y, t));
    if (!token) return;

    this.drag = {
      slotLabel: token.slotLabel,
      teamId: token.teamId,
      color: token.color,
      w: token.w,
      h: token.h,
      offsetX: x - token.x,
      offsetY: y - token.y,
      startX: x,
      startY: y,
      x,
      y,
      moved: false
    };
  }

  _onPointerMove(e) {
    if (!this.drag) return;

    const { x, y } = this._eventPos(e);
    this.drag.x = x;
    this.drag.y = y;
    // Compared against where the press started, not the last frame, so a
    // slow drag still counts as a drag rather than a string of taps.
    if (Math.hypot(x - this.drag.startX, y - this.drag.startY) > 4) this.drag.moved = true;
  }

  _onPointerUp(e) {
    if (!this.drag) return;

    const drag = this.drag;
    this.drag = null;
    const { x, y } = this._eventPos(e);

    let assignedTo = null;
    if (drag.moved) {
      // Dropped outside any box, or back into its own, means "no change" —
      // the token simply reappears where it started.
      const zone = this.dropZones.find((z) => Menu._hits(x, y, z));
      if (zone && zone.teamId !== drag.teamId) assignedTo = zone.teamId;
    } else {
      // Click fallback: a tap on a token swaps it to the other team, for
      // trackpads and for anyone who'd rather not drag.
      assignedTo = Menu.TEAM_IDS.find((id) => id !== drag.teamId);
    }

    this.suppressClick = true;
    if (assignedTo) this.clickedId = `team:${drag.slotLabel}:${assignedTo}`;
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

  // --- Team helpers, per GAME_SPEC.md section 9.2 -----------------------
  // `config.teams` maps slot label ('P1'..'P3', 'AI1'..'AI3') to '1' or '2'
  // for all six possible slots; only the ones the current player/AI counts
  // actually use count for anything. These live here rather than in
  // main.js so the Team Setup screen's disabled state and the Battle
  // button's click handler can never disagree about what's startable.

  static teamOf(config, label) {
    return config.teams && config.teams[label] === '2' ? '2' : '1';
  }

  static slotColor(slot) {
    return slot.kind === 'player' ? Menu.PLAYER_COLORS[slot.index] : Menu.AI_COLORS[slot.index];
  }

  // Every tank the current configuration will actually put on the field, in
  // the same P1/P2/P3 then AI1/AI2/AI3 spawn order main.js uses.
  static configuredSlots(config) {
    const slots = [];
    for (let i = 0; i < config.playerCount; i++) slots.push({ kind: 'player', index: i, label: `P${i + 1}` });
    for (let i = 0; i < config.aiCount; i++) slots.push({ kind: 'ai', index: i, label: `AI${i + 1}` });
    return slots;
  }

  static teamCounts(config) {
    const counts = { 1: 0, 2: 0 };
    Menu.configuredSlots(config).forEach((slot) => counts[Menu.teamOf(config, slot.label)]++);
    return counts;
  }

  // Every mode needs 2+ tanks; team mode additionally needs both teams
  // occupied. Uneven teams (e.g. 1 vs 3) are fine on purpose.
  static canStartMatch(config) {
    if (config.playerCount + config.aiCount < 2) return false;
    if (!config.teamMode) return true;
    const counts = Menu.teamCounts(config);
    return counts['1'] > 0 && counts['2'] > 0;
  }

  // Mission Briefing screen, per GAME_SPEC.md section 6: pick player count
  // (1-3), AI count (0-3, only 0-selectable when players > 1), each AI's
  // difficulty (Medium/Hard disabled — not built yet), and each player's
  // control scheme (rebindable inline, same as the pause menu's Change
  // Controls). `config` is { playerCount, aiCount, aiDifficulties[3] }.
  // stats: label -> { kills, deaths, wins } session tallies (src/main.js) —
  // only used here to decide whether the Session Stats button (top-right,
  // opens drawStatsModal) is worth showing; it's hidden until at least one
  // match has been tallied this session, per GAME_SPEC.md section 9.1.
  // Team assignment deliberately does NOT live here — this screen picks the
  // forces, and the two battle buttons at the bottom pick the match type:
  // "All vs All Battle" starts immediately, "Teams Battle" hands off to the
  // Team Setup screen (drawTeamAssignScreen), per GAME_SPEC.md section 9.2.
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

    // Both battle buttons need 2+ tanks; "Teams Battle" doesn't check the
    // team split here, because the Team Setup screen it opens is where you
    // fix a split anyway — gating entry to it would be a dead end.
    const canBattle = config.playerCount + config.aiCount >= 2;
    const backButton = { id: 'briefingBack', x: 75, y: 440, w: 90, h: 34, label: '← Back' };
    const ffaButton = {
      id: 'battleFfa',
      x: 185,
      y: 440,
      w: 190,
      h: 34,
      label: 'All vs All Battle',
      disabled: !canBattle
    };
    const teamsButton = {
      id: 'battleTeams',
      x: 395,
      y: 440,
      w: 170,
      h: 34,
      label: 'Teams Battle',
      disabled: !canBattle
    };
    this.buttons.push(backButton, ffaButton, teamsButton);
    this._drawButton(ctx, backButton);
    this._drawButton(ctx, ffaButton);
    this._drawButton(ctx, teamsButton);

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

  // Team Setup — the screen "Teams Battle" opens from Mission Briefing, per
  // GAME_SPEC.md section 9.2. It owns the match-type radio as well as the
  // assignment, so you can drop back to all-vs-all without navigating back
  // a screen. Tanks are dragged between the two boxes; clicking one swaps
  // it to the other team instead.
  drawTeamAssignScreen(ctx, canvas, config) {
    this._drawBackground(ctx, canvas, '#2c4a1e');
    this.buttons = [];
    this.tokens = [];
    this.dropZones = [];

    ctx.fillStyle = '#fff';
    ctx.font = 'bold 22px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Team Setup', canvas.width / 2, 26);

    const backButton = { id: 'teamBack', x: 8, y: 8, w: 84, h: 24, label: '← Back' };
    this.buttons.push(backButton);
    this._drawSmallButton(ctx, backButton);

    const teamsOn = !!config.teamMode;
    this._drawRadio(ctx, canvas, 'mode:ffa', 'Play All vs All', 42, !teamsOn);
    this._drawRadio(ctx, canvas, 'mode:team', 'Play Teams', 74, teamsOn);

    ctx.textAlign = 'center';
    ctx.font = '10px sans-serif';
    ctx.fillStyle = teamsOn ? '#cfcfcf' : '#7d8f71';
    ctx.fillText('Click and drag tanks between teams — or click one to swap sides', canvas.width / 2, 118);

    Menu.TEAM_IDS.forEach((teamId, i) => this._drawTeamBox(ctx, canvas, config, teamId, 138 + i * 116, teamsOn));

    const counts = Menu.teamCounts(config);
    if (teamsOn && (counts['1'] === 0 || counts['2'] === 0)) {
      ctx.textAlign = 'center';
      ctx.font = '10px sans-serif';
      ctx.fillStyle = '#c9903b';
      ctx.fillText('Both teams need at least one tank before you can start.', canvas.width / 2, 380);
    }

    const battleButton = {
      id: 'battle',
      x: canvas.width / 2 - 90,
      y: 390,
      w: 180,
      h: 44,
      label: '▶ Battle!',
      disabled: !Menu.canStartMatch(config)
    };
    this.buttons.push(battleButton);
    this._drawButton(ctx, battleButton);

    // The held tank rides above everything, including the box it's about to
    // land in, so it never slips behind a border mid-drag.
    if (this.drag) {
      this._drawTankToken(
        ctx,
        {
          slotLabel: this.drag.slotLabel,
          color: this.drag.color,
          x: this.drag.x - this.drag.offsetX,
          y: this.drag.y - this.drag.offsetY,
          w: this.drag.w,
          h: this.drag.h
        },
        true,
        true
      );
    }
  }

  _drawRadio(ctx, canvas, id, label, y, selected) {
    const btn = { id, x: canvas.width / 2 - 150, y, w: 300, h: 26, label, selected };
    this.buttons.push(btn);

    ctx.fillStyle = selected ? '#4a4a4a' : '#3a3a3a';
    ctx.fillRect(btn.x, btn.y, btn.w, btn.h);
    ctx.strokeStyle = selected ? '#fff' : '#000';
    ctx.strokeRect(btn.x, btn.y, btn.w, btn.h);

    const cx = btn.x + 18;
    const cy = btn.y + btn.h / 2;
    ctx.beginPath();
    ctx.arc(cx, cy, 7, 0, Math.PI * 2);
    ctx.strokeStyle = '#fff';
    ctx.stroke();
    if (selected) {
      ctx.beginPath();
      ctx.arc(cx, cy, 3.5, 0, Math.PI * 2);
      ctx.fillStyle = '#fff';
      ctx.fill();
    }

    ctx.fillStyle = '#fff';
    ctx.font = selected ? 'bold 13px sans-serif' : '13px sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, btn.x + 36, cy + 1);
    ctx.textBaseline = 'alphabetic';
  }

  // One team's drop zone plus the tanks currently assigned to it. When
  // all-vs-all is selected the box is drawn dimmed and registers neither a
  // drop zone nor draggable tokens, so the whole screen goes inert.
  _drawTeamBox(ctx, canvas, config, teamId, top, enabled) {
    const box = { x: 40, y: top + 6, w: canvas.width - 80, h: 86 };

    ctx.textAlign = 'left';
    ctx.font = 'bold 14px sans-serif';
    ctx.fillStyle = enabled ? Menu.TEAM_COLORS[teamId] : '#6f7f63';
    ctx.fillText(`Team ${teamId}`, box.x + 2, top);

    const dragOver = enabled && this.drag && this.drag.teamId !== teamId && Menu._hits(this.drag.x, this.drag.y, box);

    ctx.fillStyle = 'rgba(0, 0, 0, 0.25)';
    ctx.fillRect(box.x, box.y, box.w, box.h);
    ctx.strokeStyle = !enabled ? '#4a5a3e' : dragOver ? '#ffffff' : Menu.TEAM_COLORS[teamId];
    ctx.lineWidth = dragOver ? 3 : 2;
    ctx.strokeRect(box.x, box.y, box.w, box.h);
    ctx.lineWidth = 1;

    if (enabled) this.dropZones.push({ teamId, x: box.x, y: box.y, w: box.w, h: box.h });

    const members = Menu.configuredSlots(config).filter((slot) => Menu.teamOf(config, slot.label) === teamId);
    let x = box.x + 12;

    members.forEach((slot) => {
      const token = { slotLabel: slot.label, teamId, color: Menu.slotColor(slot), x, y: box.y + 12, w: 62, h: 62 };
      // The tank under the cursor is drawn there instead, but its gap stays
      // open so it stays obvious where it was picked up from.
      const held = this.drag && this.drag.slotLabel === slot.label;
      if (!held) {
        if (enabled) this.tokens.push(token);
        this._drawTankToken(ctx, token, enabled, false);
      }
      x += 70;
    });

    if (members.length === 0) {
      ctx.textAlign = 'center';
      ctx.font = '11px sans-serif';
      ctx.fillStyle = enabled ? '#8fa383' : '#6f7f63';
      ctx.fillText('empty — drag a tank here', box.x + box.w / 2, box.y + box.h / 2 + 4);
    }
  }

  // A tank as a draggable chip: the same body-plus-barrel shape Tank.draw()
  // paints on the maze, pointing up, with its P1/AI1 label underneath.
  _drawTankToken(ctx, token, enabled, lifted) {
    if (lifted) {
      ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
      ctx.fillRect(token.x + 5, token.y + 7, token.w - 10, token.h - 14);
    }

    ctx.fillStyle = enabled ? '#333' : '#3a3a3a';
    ctx.fillRect(token.x + 28, token.y + 2, 6, 14);

    ctx.fillStyle = enabled ? token.color : '#4a4a4a';
    ctx.fillRect(token.x + 12, token.y + 12, 38, 30);
    ctx.strokeStyle = lifted ? '#fff' : '#000';
    ctx.strokeRect(token.x + 12, token.y + 12, 38, 30);

    ctx.fillStyle = enabled ? '#fff' : '#8a8a8a';
    ctx.font = 'bold 13px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(token.slotLabel, token.x + token.w / 2, token.y + 58);
  }

  _drawToggleButton(ctx, btn) {
    ctx.fillStyle = btn.disabled ? '#3a3a3a' : btn.selected ? btn.selectedColor || '#3b6ea5' : '#4a4a4a';
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
  // { label, kind: 'team', team } for the last team standing in team mode,
  // or null for a draw (simultaneous mutual kill), per GAME_SPEC.md 9/9.2.
  // stats: label -> { kills, deaths, wins } session tallies (src/main.js),
  // shown as a scoreboard with a Reset button per HANDOFF.md "Session B" —
  // in-session tallies only, cleared solely by that button (or a refresh).
  drawResultScreen(ctx, canvas, winner, stats) {
    // A team is a mix of humans and AI, so the player-green/AI-red split
    // doesn't apply to it — a team win gets its own team color instead.
    const bg = !winner
      ? '#3a3a3a'
      : winner.kind === 'team'
        ? Menu.TEAM_BG_COLORS[winner.team]
        : winner.kind === 'player'
          ? '#1e4a2c'
          : '#4a1e1e';
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
