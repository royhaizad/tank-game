# Changelog

One-line entries per game mechanic/feature change, newest first. See `CLAUDE.md`
"Keeping Docs in Sync" for when to add to this file.
- 2026-08-23 — Bullet tuning: slowed bullets from 320 px/s to 160 px/s (just faster than tank top speed, easier to react to); player base cannon now auto-fires every 0.5s while the fire key is held, still capped at 5 in flight (previously one shot per press only, no cooldown).
- 2026-08-23 — Merged all feature branches into main: main is now current and playable (movement, bullets, maze, Easy AI, menus, local multiplayer).

- 2026-08-19 — CLAUDE.md updated with "Keeping Docs in Sync" workflow rules (docs/GAME_SPEC.md, this changelog, and CLAUDE.md itself must be kept current with mechanic changes).
- 2026-08-19 — Base cannon now allows up to 5 bullets in flight per tank at once, with no cooldown between shots (previously: 1 bullet in flight + ~1s cooldown).
- 2026-08-19 — Added bullet firing and wall-bounce physics: bullets fire from the barrel tip, reflect at a mirrored angle off canvas edges, and expire after 6 seconds or 5 bounces; a bullet destroys any tank it touches, including its own shooter.
- 2026-08-19 — Increased tank brake power (friction) by 20% for a snappier stop when releasing W/S.
- 2026-08-19 — Added WASD tank-drive movement with acceleration/deceleration (forward/back along facing direction, A/D to rotate).
- 2026-08-19 — Initial project skeleton: folder structure, CLAUDE.md, docs/GAME_SPEC.md, placeholder index.html.
