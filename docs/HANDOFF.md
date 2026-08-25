# Handoff — current state of play

Read this + `CLAUDE.md` + `docs/GAME_SPEC.md` at the start of a session. GAME_SPEC.md
is the single source of truth for design; this file is just "where we are right now."

## Branch state

**`main` is current and playable** — all feature work through local multiplayer has been
merged in. Old feature branches (`feat/tank-movement`, `feat/bullet-physics`,
`feat/maze-generation`, `feat/ai-easy`, `feat/multiplayer`,
`chore/claude-md-docsync-rules`) are fully merged and can be ignored or deleted.

**Branch new work off `main`.** Do not stack branches on each other — that's what led to
a 6-deep unmerged stack before. Merge back to `main` after testing in the browser.

## What's built

- **Movement/bullets/maze**: tank-drive movement; bullets bounce off walls (mirror
  angle) and expire at 6s or 5 bounces; random 8x6 maze, 80px cells, 6px walls;
  SAT-based rotated-rect collision for tank body *and* barrel separately.
- **Easy AI** (`src/ai/easy.js`): "hallway driving" — compresses its BFS pathfound
  route into long straight corridor runs (one committed heading per corridor, not
  re-aimed at every 80px cell) and executes real turns as a deliberate stop-and-pivot
  at corners (snapped to the exact corridor heading) instead of swinging through them
  while still moving; this fixed both a zigzag feel and visible wall-clipping on
  turns. Waypoint/pathing updates every frame (only which-opponent-to-target stays on
  the ~0.8s reaction cadence). Reactive stop/turn/try/reverse obstacle handling still
  covers anything the planned route didn't anticipate — the turn aligns parallel with
  whichever wall it hit (picking whichever parallel heading is closer to the
  waypoint), and repeated blocked/reverse cycles force a fresh path replan so it can't
  loop forever against a pocket. Also re-plans immediately if the committed waypoint
  stops being reachable along the path it was planned from (e.g. shoved off-course by
  reversing) — the earlier root cause of it looking permanently stuck against a wall.
  Fires instantly (0s delay) on aim+line-of-sight; limited to 1 bullet + 1s cooldown.
- **Medium AI** (`src/ai/medium.js`): `class MediumAI extends EasyAI` — inherits all of
  the above navigation untouched (so Easy nav fixes are Medium nav fixes) and turns up
  four dials: ~9° fire window instead of ~15° (only takes clean shots), 2 bullets + 0.6s
  cooldown, 0.4s re-target cadence, and a dodge that sidesteps bullets on a collision
  course within 180px. Wins ~60% vs Easy over 500 headless matches (even = 50%).
  **Predictive/leading aim was built, measured, and cut** — with no turret the shot
  always leaves along the driving heading, so leading only shifts *when* it fires. See
  GAME_SPEC.md section 5.1; it belongs in Hard, together with aim-turning.
- **AI tier wiring**: `AI_TIERS` in `src/main.js` maps a tier name to its brain class
  and ammo limits. Adding Hard = one row there, one row in the GAME_SPEC 5.1 ladder,
  and dropping `disabled` from the Hard toggle in `src/ui/menu.js`. Tiers missing from
  `AI_TIERS` are greyed out on Mission Briefing and refuse selection.
- **Multiplayer**: Mission Briefing screen (1-3 players, 0-3 AI, per-AI difficulty,
  inline per-player key rebinding); free-for-all (any bullet hurts any tank);
  last-tank-standing win + draw case; P1/P2/P3 + AI1/AI2/AI3 on-map labels.
- **Menus**: Title, Mission Briefing, Result, pause menu (Esc) with Y/N confirmations
  and full key rebinding.
- **Bullet tuning**: bullet speed 160 px/s (was 320, now just faster than a tank's
  140 px/s top speed instead of much faster — easier to react to and dodge). Player
  base cannon: tap fires instantly, holding the fire key auto-fires every 0.5s
  (`PLAYER_AUTO_FIRE_INTERVAL` in `src/main.js`), still capped at 5 in flight. AI
  unchanged (1 in flight + 1s cooldown).
- **Session stats**: Win/Kill/Death tallies per tank slot (P1-3/AI1-3), in-session
  only (see GAME_SPEC.md section 9.1). HUD shows per-player icon+number only; Result
  screen and a new Mission Briefing "Session Stats" button (shown once stats exist,
  opens a modal) both show a full scoreboard — icon + word per column, colored by
  stat type (green/red/white) — plus a Reset Stats button. Self-kills count as a
  death but not a kill.

## Planned next

**Hard AI** — being built in a parallel session on its own branch, so expect
`src/ai/hard.js` plus a third row in `AI_TIERS` (`src/main.js`) and in the section 5.1
ladder table. Those two tables are the likely merge-conflict points between the Medium
and Hard branches; both are additive one-row changes.

## Known gaps

Per `GAME_SPEC.md` section 12: **Hard AI** (#4), **power-ups** (#5),
**pixel art pass** (#7), **audio pass** (#8) all remain. (Easy and Medium AI are
done.) Note for whoever builds Hard: the "aim prediction" idea is only worth
implementing together with hull aim-turning — see GAME_SPEC.md section 5.1 for the
measurements behind that.

- **Hard AI doesn't exist** — shown but disabled ("Coming soon") in the UI. Its
  defining traits per the section 5.1 ladder are aim-turning (hunting a shot rather
  than taking whatever lines up while driving) and bank shots; "pathfinding" doesn't
  separate any tier from Easy, and predictive aim is only worth it alongside
  aim-turning.
- `assets/sprites/` (22 files) is untracked on purpose — no code references sprites yet.
- Only synthesized audio exists (`src/engine/audio.js`, empty-fire click via Web Audio).

## Gotchas worth knowing

- **No build step, ever.** Plain `<script>` tags in `index.html`, load order matters.
  Game must run by double-clicking `index.html`.
- `.claude/serve.ps1` + `launch.json` are a local-only dev preview server (gitignored),
  on port 8130 — 8123 had a stale OS-level reservation. Not part of the game.
- Bullets move in 8 substeps/frame so fast shots can't tunnel through thin walls.
- AI wall-sensing uses a *rectangular area* sensor, not a single probe point — a point
  sample missed 6px walls depending on approach distance.
- If a dev-server preview tool reports port 8130 already in use "by another chat's
  dev server," don't assume it's serving *this* worktree's current files — a
  concurrent session's server can be pointed at a different checkout entirely and
  will silently serve stale JS with no error. Verify with a cache-busted `fetch()` of
  the file in question (or just check `Object.keys()` on a live instance for a
  property you just added) before trusting what a browser test shows. Safer to start
  your own server on a different port bound to the actual working directory.
