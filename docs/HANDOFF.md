# Handoff — current state of play

Read this + `CLAUDE.md` + `docs/GAME_SPEC.md` at the start of a session. GAME_SPEC.md
is the single source of truth for design; this file is just "where we are right now."

## Branch state

All branches are pushed to GitHub. **Nothing is merged into `main` yet** — `main` is
still only the initial skeleton commit. Branches stack in this order, each off the last:

```
main
└── feat/tank-movement      WASD tank-drive, accel/decel, +20% brake
    └── feat/bullet-physics bouncing bullets, 5-in-flight, no cooldown
        └── feat/maze-generation  random maze, rect wall collision (SAT), barrel-blocked fire
            └── feat/ai-easy      Easy AI: BFS pathfinding, 1 bullet/1s cooldown
                └── feat/menus    Title/Difficulty/Result screens, pause menu, key rebinding
                    └── feat/multiplayer  ← current branch (dc9e910)
```

Also pushed, unmerged, and independent: `chore/claude-md-docsync-rules` (the doc-sync
rules now in CLAUDE.md + backfilled `docs/CHANGELOG.md`).

## What's built (all in `feat/multiplayer`)

- **Movement/bullets/maze**: tank-drive movement; bullets bounce off walls (mirror
  angle) and expire at 6s or 5 bounces; random 8x6 maze, 80px cells, 6px walls;
  SAT-based rotated-rect collision for tank body *and* barrel separately.
- **Easy AI** (`src/ai/easy.js`): always navigates by BFS pathfinding waypoints (never
  raw line-of-sight — that caused dead-end sticking); stop/turn/try/reverse obstacle
  state machine reacting every frame; fires after 0.5s continuous line-of-sight;
  limited to 1 bullet + 1s cooldown.
- **Multiplayer** (newest): Mission Briefing screen (1-3 players, 0-3 AI, per-AI
  difficulty, inline per-player key rebinding); free-for-all (any bullet hurts any
  tank); last-tank-standing win + draw case; P1/P2/P3 + AI1/AI2/AI3 on-map labels.

## Known gaps / next steps

Per `GAME_SPEC.md` section 12 (build priority), remaining: **Medium + Hard AI** (#4),
**power-ups** (#5), **pixel art pass** (#7), **audio pass** (#8).

- **Medium/Hard AI don't exist.** They're shown but disabled ("Coming soon") in the
  UI. GAME_SPEC.md section 5 flags that "pathfinding when out of sight" no longer
  distinguishes them from Easy — they need a *new* defining trait (predictive aiming,
  bank shots, faster paths) before being built.
- `assets/sprites/` (22 files) is untracked on purpose — no code references sprites
  yet; that's the pixel-art pass, still ahead.
- Only synthesized audio exists (`src/engine/audio.js`, empty-fire click via Web Audio).

## Gotchas worth knowing

- **No build step, ever.** Plain `<script>` tags in `index.html`, load order matters.
  Game must run by double-clicking `index.html`.
- `.claude/serve.ps1` + `launch.json` are a local-only dev preview server (gitignored),
  on port 8130 — 8123 had a stale OS-level reservation. Not part of the game.
- Bullets move in 8 substeps/frame so fast shots can't tunnel through thin walls.
- AI wall-sensing uses a *rectangular area* sensor, not a single probe point — a point
  sample missed 6px walls depending on approach distance.
