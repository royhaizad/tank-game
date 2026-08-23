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
- **Easy AI** (`src/ai/easy.js`): navigates by BFS pathfinding waypoints (never raw
  line-of-sight — that caused dead-end sticking); stop/turn/try/reverse obstacle state
  machine reacting every frame; fires after 0.5s continuous line-of-sight; limited to
  1 bullet + 1s cooldown.
- **Multiplayer**: Mission Briefing screen (1-3 players, 0-3 AI, per-AI difficulty,
  inline per-player key rebinding); free-for-all (any bullet hurts any tank);
  last-tank-standing win + draw case; P1/P2/P3 + AI1/AI2/AI3 on-map labels.
- **Menus**: Title, Mission Briefing, Result, pause menu (Esc) with Y/N confirmations
  and full key rebinding.

## Planned next — two independent sessions

Both branch off `main`. They touch different files, so they can't conflict.

### Session A — `chore/bullet-tuning` (done, pending merge to `main`)
Tuned bullet speed and added player auto-fire. New values in
`src/entities/bullet.js`: speed 160 px/s (was 320), radius 3px, maxLifetime 6s,
maxBounces 5 unchanged. Player fire (`src/main.js`): tap still fires instantly;
holding the fire key now auto-fires every 0.5s (`PLAYER_AUTO_FIRE_INTERVAL`),
still capped at 5 bullets in flight. AI unchanged (1 in flight + 1s cooldown,
overridden in `src/main.js`). GAME_SPEC.md section 3.2 updated to match.

### Session B — `feat/session-stats`
Kill / Death / Win counters per tank, accumulating across matches.
Decisions already made:
- **Scope**: these are *in-session tallies*, NOT a ranking system. GAME_SPEC.md line
  ~238 ("No scoring/rounds system in v1") must be reversed to allow this; the
  "Ranking/rank-points system" exclusion in section 11 **stays** out of scope.
- **Reset**: only an explicit Reset button clears the tally. Stats survive Rematch,
  Change Difficulty, *and* Back to Title. Page refresh clears them (no persistence —
  no localStorage, per the no-backend/no-saves rule).
- **Surfaces**: affects both multiplayer scoring and the GUI (HUD `src/ui/hud.js`
  and/or Result screen `src/ui/menu.js`).

## Known gaps

Per `GAME_SPEC.md` section 12: **Medium + Hard AI** (#4), **power-ups** (#5),
**pixel art pass** (#7), **audio pass** (#8) all remain.

- **Medium/Hard AI don't exist** — shown but disabled ("Coming soon") in the UI.
  GAME_SPEC.md section 5 flags they need a *new* defining trait (predictive aiming,
  bank shots, faster paths), since "pathfinding when out of sight" no longer separates
  them from Easy.
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
