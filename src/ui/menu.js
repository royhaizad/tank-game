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

  // Custom names, per GAME_SPEC.md section 9.4. 8 characters is what keeps
  // a name legible above a tank without colliding with its neighbours on a
  // 640x480 maze holding up to six of them.
  static MAX_NAME_LENGTH = 8;
  static AWARD_TITLE_COLOR = '#f0c860';

  // Both resolve to the default when no custom name is set, so callers can
  // use them everywhere a label is displayed without checking first.
  static displayName(config, label) {
    const custom = config && config.tankNames && config.tankNames[label];
    return custom || label;
  }

  static teamName(config, teamId) {
    const custom = config && config.teamNames && config.teamNames[teamId];
    return custom || `Team ${teamId}`;
  }

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

    // Hover tooltips (award descriptions, per GAME_SPEC.md section 9.3).
    // Targets are rebuilt every frame by whichever screen draws them, and
    // drawTooltip() renders whichever one the pointer is currently over.
    this.pointer = { x: -1, y: -1 };
    this.hoverTargets = [];

    canvas.addEventListener('click', (e) => this._onClick(e));
    canvas.addEventListener('mousedown', (e) => this._onPointerDown(e));
    // move/up on window, not canvas, so a drag that wanders off the canvas
    // still tracks and still releases instead of getting stuck held down.
    window.addEventListener('mousemove', (e) => this._onPointerMove(e));
    window.addEventListener('mouseup', (e) => this._onPointerUp(e));
  }

  setScreen(screen) {
    this.screen = screen;
    // Cleared once per frame before anything draws, so a target can never
    // outlive the screen that registered it.
    this.hoverTargets = [];
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
      name: token.name,
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
    const { x, y } = this._eventPos(e);
    this.pointer = { x, y }; // tracked always — hover tooltips need it, not just drags

    if (!this.drag) return;

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
  // only used here to decide whether the Scoreboard button (top-right,
  // opens drawScoreboardModal) is worth showing; it's hidden until at least one
  // match has been tallied this session, per GAME_SPEC.md section 9.1.
  // Team assignment deliberately does NOT live here — this screen picks the
  // forces, and the two battle buttons at the bottom pick the match type:
  // "All vs All Battle" starts immediately, "Teams Battle" hands off to the
  // Team Setup screen (drawTeamAssignScreen), per GAME_SPEC.md section 9.2.
  drawBriefingScreen(ctx, canvas, config, awaitingRebind, stats, editingName) {
    this._drawBackground(ctx, canvas, '#2c4a1e');
    this.buttons = [];

    ctx.fillStyle = '#fff';
    ctx.font = 'bold 24px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Mission Briefing', canvas.width / 2, 22);
    ctx.font = '11px sans-serif';
    ctx.fillText('Click a name or a key to change it', canvas.width / 2, 38);

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

    // Rows start at 106 rather than 95 to clear the count selectors above —
    // each row now carries a name box sitting 16px above its own baseline.
    for (let i = 0; i < config.playerCount; i++) {
      this._drawPlayerBriefingRow(ctx, i, 106 + i * 85, awaitingRebind, config, editingName);
    }
    for (let i = 0; i < config.aiCount; i++) {
      this._drawAiBriefingRow(ctx, i, 106 + i * 85, config.aiDifficulties[i], config, editingName);
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
      const statsButton = { id: 'viewStats', x: canvas.width - 112, y: 8, w: 104, h: 22, label: 'Scoreboard' };
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

  // `config`/`editingName` are only passed from the Briefing screen, where
  // names are editable; the pause menu's Change Controls screen omits them
  // and gets the plain, unchanged header instead.
  _drawPlayerBriefingRow(ctx, playerIndex, y, awaitingRebind, config, editingName) {
    const colors = Menu.PLAYER_COLORS;
    const bindings = Input.playerBindings[playerIndex];
    const label = `P${playerIndex + 1}`;

    if (config) {
      this._drawNameField(
        ctx,
        { id: `rename:${label}`, x: 20, y: y - 16, w: 96, h: 16, nameKind: 'tank', nameKey: label },
        Menu.displayName(config, label),
        editingName
      );
    }

    ctx.fillStyle = colors[playerIndex];
    ctx.font = config ? 'bold 11px sans-serif' : 'bold 14px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(`PLAYER ${playerIndex + 1}`, config ? 124 : 20, config ? y - 4 : y);

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

  _drawAiBriefingRow(ctx, aiIndex, y, difficulty, config, editingName) {
    const colors = Menu.AI_COLORS;
    const label = `AI${aiIndex + 1}`;

    this._drawNameField(
      ctx,
      { id: `rename:${label}`, x: 340, y: y - 16, w: 96, h: 16, nameKind: 'tank', nameKey: label },
      Menu.displayName(config, label),
      editingName
    );

    ctx.fillStyle = colors[aiIndex];
    ctx.font = 'bold 11px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(`AI ${aiIndex + 1}`, 444, y - 4);

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
  drawTeamAssignScreen(ctx, canvas, config, editingName) {
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
    ctx.fillText('Drag tanks between teams, or click one to swap sides. Click a team name to rename it.', canvas.width / 2, 118);

    Menu.TEAM_IDS.forEach((teamId, i) =>
      this._drawTeamBox(ctx, canvas, config, teamId, 138 + i * 116, teamsOn, editingName)
    );

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
          name: this.drag.name,
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
  _drawTeamBox(ctx, canvas, config, teamId, top, enabled, editingName) {
    const box = { x: 40, y: top + 6, w: canvas.width - 80, h: 86 };

    // The heading doubles as the team's name field. It's only editable in
    // team mode — renaming a team you've just switched away from would be
    // an odd thing to offer.
    if (enabled) {
      this._drawNameField(
        ctx,
        { id: `renameTeam:${teamId}`, x: box.x, y: top - 13, w: 120, h: 17, nameKind: 'team', nameKey: teamId },
        Menu.teamName(config, teamId),
        editingName
      );
      ctx.fillStyle = Menu.TEAM_COLORS[teamId];
      ctx.fillRect(box.x, top + 2, 120, 2); // team-colored underline, so the box still reads as this team's
    } else {
      ctx.textAlign = 'left';
      ctx.font = 'bold 14px sans-serif';
      ctx.fillStyle = '#6f7f63';
      ctx.fillText(Menu.teamName(config, teamId), box.x + 2, top);
    }

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
      const token = {
        slotLabel: slot.label,
        name: Menu.displayName(config, slot.label),
        teamId,
        color: Menu.slotColor(slot),
        x,
        y: box.y + 12,
        w: 62,
        h: 62
      };
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
    // 12px rather than 13 so a full-length 8-character custom name still
    // fits inside the token's width (GAME_SPEC.md section 9.4).
    ctx.font = 'bold 12px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(token.name || token.slotLabel, token.x + token.w / 2, token.y + 58);
  }

  // Drawn last of all (main.js calls this after every screen and overlay),
  // so a tooltip can spill outside whatever drew its target and still sit
  // on top of everything.
  drawTooltip(ctx, canvas) {
    const target = this.hoverTargets.find((t) => Menu._hits(this.pointer.x, this.pointer.y, t));
    if (!target) return;

    ctx.font = '11px sans-serif';
    const padding = 8;
    const w = ctx.measureText(target.tooltip).width + padding * 2;
    const h = 26;

    // Prefer above-right of the cursor, but flip or clamp whenever that
    // would run off the canvas, so the text is never clipped.
    let x = this.pointer.x + 12;
    let y = this.pointer.y - h - 8;
    if (x + w > canvas.width - 6) x = this.pointer.x - w - 12;
    if (x < 6) x = 6;
    if (y < 6) y = this.pointer.y + 18;

    ctx.fillStyle = 'rgba(10, 10, 10, 0.96)';
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = Menu.AWARD_TITLE_COLOR;
    ctx.strokeRect(x, y, w, h);

    ctx.fillStyle = '#fff';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(target.tooltip, x + padding, y + h / 2);
    ctx.textBaseline = 'alphabetic';
  }

  // An editable name box (GAME_SPEC.md section 9.4): clicking it emits the
  // button id, main.js starts an edit and owns the keystrokes, and passes
  // its `editingName` back here so the field can show the live buffer and a
  // blinking caret. Shows the resolved display name the rest of the time.
  _drawNameField(ctx, btn, displayName, editing) {
    const active = editing && editing.kind === btn.nameKind && editing.key === btn.nameKey;
    this.buttons.push(btn);

    ctx.fillStyle = active ? '#c9903b' : '#3a3a3a';
    ctx.fillRect(btn.x, btn.y, btn.w, btn.h);
    ctx.strokeStyle = active ? '#fff' : '#000';
    ctx.strokeRect(btn.x, btn.y, btn.w, btn.h);

    const text = active ? editing.buffer : displayName;
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 11px sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, btn.x + 6, btn.y + btn.h / 2 + 1);

    if (active && Math.floor(Date.now() / 400) % 2 === 0) {
      ctx.fillRect(btn.x + 7 + ctx.measureText(text).width, btn.y + 3, 1, btn.h - 6);
    }
    ctx.textBaseline = 'alphabetic';
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
  // The tables live in the Scoreboard modal now (one click away via the
  // button here); this screen instead carries the two or three sharpest
  // session awards, which is what's worth reading the moment a match ends
  // (GAME_SPEC.md section 9.3).
  drawResultScreen(ctx, canvas, winner, stats, config) {
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
      { id: 'title', label: 'Back to Title' },
      { id: 'viewStats', label: 'Scoreboard' }
    ];

    this.buttons = options.map((opt, i) => ({
      id: opt.id,
      x: canvas.width / 2 - 90,
      y: 72 + i * 48,
      w: 180,
      h: 40,
      label: opt.label
    }));

    this.buttons.forEach((btn) => this._drawButton(ctx, btn));

    this._drawAwardList(ctx, canvas, Awards.compute(stats).slice(0, 3), config, 292, 'Session Awards');
  }

  // Shared by the Result screen (top three only) and the Awards modal (all
  // of them). Each line registers a hover target so drawTooltip() can
  // explain what the award actually means.
  _drawAwardList(ctx, canvas, awards, config, startY, heading) {
    const centerX = canvas.width / 2;
    let y = startY;

    ctx.textAlign = 'center';
    ctx.font = 'bold 13px sans-serif';
    ctx.fillStyle = '#fff';
    ctx.fillText(heading, centerX, y);

    if (awards.length === 0) {
      y += 22;
      ctx.font = '11px sans-serif';
      ctx.fillStyle = '#bbb';
      ctx.fillText('Play a match to start handing out awards.', centerX, y);
      return y;
    }

    awards.forEach((award) => {
      y += 26;
      const holders = award.holders.map((label) => Menu.displayName(config, label)).join(', ');

      ctx.font = 'bold 12px sans-serif';
      const titleText = `${award.title}: `;
      const titleWidth = ctx.measureText(titleText).width;
      ctx.font = '12px sans-serif';
      const holderWidth = ctx.measureText(holders).width;

      const left = centerX - (titleWidth + holderWidth) / 2;
      ctx.textAlign = 'left';
      ctx.font = 'bold 12px sans-serif';
      ctx.fillStyle = Menu.AWARD_TITLE_COLOR;
      ctx.fillText(titleText, left, y);
      ctx.font = '12px sans-serif';
      ctx.fillStyle = '#fff';
      ctx.fillText(holders, left + titleWidth, y);

      this.hoverTargets.push({
        x: left,
        y: y - 12,
        w: titleWidth + holderWidth,
        h: 17,
        tooltip: award.tooltip
      });
    });

    ctx.textAlign = 'center';
    return y;
  }

  // Full-screen overlay on top of whichever screen is already drawn (same
  // "don't clear the canvas first" pattern as drawPauseMenu), opened from
  // Mission Briefing or the Result screen. Holds the numbers — per-tank
  // ranked by wins, and the team tallies underneath as their own table
  // (GAME_SPEC.md sections 9.1 and 9.2). The awards live one level deeper,
  // in drawAwardsModal, so neither view has to be squeezed.
  drawScoreboardModal(ctx, canvas, stats, teamStats, config) {
    // Heavier than the pause menu's dimming on purpose: a table of small
    // numbers is unreadable with a screen's worth of buttons showing through.
    ctx.fillStyle = 'rgba(0, 0, 0, 0.9)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const centerX = canvas.width / 2;
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 22px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Scoreboard', centerX, 44);

    this.buttons = [];
    let bottom = this._drawScoreTable(ctx, canvas, Menu.rankedTankRows(stats, config), 76, 'Tanks', 'Tank');

    const teams = Menu.teamRows(teamStats, config);
    if (teams.length > 0) {
      bottom = this._drawScoreTable(ctx, canvas, teams, bottom + 28, 'Teams', 'Team');
    }

    const row = Math.max(bottom + 24, 300);
    const awardsButton = { id: 'viewAwards', x: centerX - 186, y: row, w: 180, h: 38, label: 'Awards' };
    const resetButton = { id: 'resetStats', x: centerX + 6, y: row, w: 180, h: 38, label: 'Reset Stats' };
    const closeButton = { id: 'closeStats', x: centerX - 90, y: row + 48, w: 180, h: 38, label: 'Close' };
    this.buttons.push(awardsButton, resetButton, closeButton);
    this.buttons.forEach((btn) => this._drawButton(ctx, btn));
  }

  // Drawn over the Scoreboard modal: every award that currently applies,
  // each explaining itself on hover (GAME_SPEC.md section 9.3).
  drawAwardsModal(ctx, canvas, stats, config) {
    // Nearly opaque: this sits on top of the Scoreboard modal, and two
    // translucent layers of table would show through each other.
    ctx.fillStyle = 'rgba(0, 0, 0, 0.96)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const centerX = canvas.width / 2;
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 22px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Awards', centerX, 40);
    ctx.font = '10px sans-serif';
    ctx.fillStyle = '#bbb';
    ctx.fillText('Hover an award to see what it means', centerX, 56);

    this.buttons = [];
    const bottom = this._drawAwardList(ctx, canvas, Awards.compute(stats), config, 80, 'This Session');

    const closeButton = { id: 'closeAwards', x: centerX - 90, y: Math.max(bottom + 24, 400), w: 180, h: 38, label: 'Close' };
    this.buttons.push(closeButton);
    this._drawButton(ctx, closeButton);
  }

  // Shared table renderer for the Result screen and the Briefing stats
  // modal: header row is icon + readable word per stat (Win/Kill/Death),
  // colored by stat type (green/red/white) rather than by tank, per
  // GAME_SPEC.md section 9.1. Order matches the on-map label scheme
  // (P1/P2/P3 players, AI1/AI2/AI3 AI), skipping slots never used this
  // session. Returns the y coordinate of the last content drawn, so
  // callers can position their own buttons below it.
  // Tank rows for the scoreboard, ranked by Wins (GAME_SPEC.md 9.1). Kills
  // break a tie, then fewest deaths, then slot order — so the table never
  // reshuffles arbitrarily between two tanks with identical records.
  static rankedTankRows(stats, config) {
    const order = ['P1', 'P2', 'P3', 'AI1', 'AI2', 'AI3'];
    return order
      .filter((label) => stats[label])
      .map((label) => ({ name: Menu.displayName(config, label), ...stats[label] }))
      .sort((a, b) => b.wins - a.wins || b.kills - a.kills || a.deaths - b.deaths);
  }

  static teamRows(teamStats, config) {
    return Menu.TEAM_IDS.filter((teamId) => teamStats[teamId]).map((teamId) => ({
      name: Menu.teamName(config, teamId),
      color: Menu.TEAM_COLORS[teamId],
      ...teamStats[teamId]
    }));
  }

  // rows: [{ name, wins, kills, deaths, color? }], already ordered by the
  // caller. Returns the y of the last line drawn so callers can stack below.
  _drawScoreTable(ctx, canvas, rows, startY, heading, nameColumnLabel) {
    const centerX = canvas.width / 2;
    const colX = { label: centerX - 150, wins: centerX - 30, kills: centerX + 30, deaths: centerX + 90 };
    let y = startY;

    if (heading) {
      ctx.textAlign = 'left';
      ctx.font = 'bold 12px sans-serif';
      ctx.fillStyle = '#cfcfcf';
      ctx.fillText(heading, colX.label, y);
      y += 16;
    }

    ctx.textAlign = 'left';
    ctx.font = 'bold 11px sans-serif';
    ctx.fillStyle = '#fff';
    ctx.fillText(nameColumnLabel || 'Tank', colX.label, y);
    ctx.fillStyle = Menu.STAT_COLORS.wins;
    ctx.fillText(`${Menu.STAT_ICONS.wins} ${Menu.STAT_LABELS.wins}`, colX.wins, y);
    ctx.fillStyle = Menu.STAT_COLORS.kills;
    ctx.fillText(`${Menu.STAT_ICONS.kills} ${Menu.STAT_LABELS.kills}`, colX.kills, y);
    ctx.fillStyle = Menu.STAT_COLORS.deaths;
    ctx.fillText(`${Menu.STAT_ICONS.deaths} ${Menu.STAT_LABELS.deaths}`, colX.deaths, y);

    if (rows.length === 0) {
      y += 20;
      ctx.fillStyle = '#bbb';
      ctx.font = '12px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('No stats yet', centerX, y);
      return y;
    }

    ctx.font = '12px sans-serif';
    rows.forEach((row) => {
      y += 18;
      ctx.textAlign = 'left';
      ctx.fillStyle = row.color || Menu.SCORE_LABEL_COLOR;
      ctx.fillText(row.name, colX.label, y);
      ctx.fillStyle = Menu.STAT_COLORS.wins;
      ctx.fillText(String(row.wins), colX.wins, y);
      ctx.fillStyle = Menu.STAT_COLORS.kills;
      ctx.fillText(String(row.kills), colX.kills, y);
      ctx.fillStyle = Menu.STAT_COLORS.deaths;
      ctx.fillText(String(row.deaths), colX.deaths, y);
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
  // controls like Briefing's Scoreboard button, where a full-size
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
