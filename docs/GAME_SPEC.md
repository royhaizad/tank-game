# Game Design Spec — Pixel Tank Duel

Single source of truth for this game's design. Claude Code should check this
file before implementing any feature, rather than being re-told the rules.

---

## 1. Overview

**Genre:** Top-down 2D maze tank combat, single-player vs AI.
**Inspiration:** Tank Trouble (bouncing-bullet mechanic).
**Platform:** Browser, HTML5, fully client-side, no backend.
**Session length:** 1–5 minutes per match.
**Core loop:** Pick difficulty → fight AI in a random maze → last tank
standing wins → rematch or change difficulty.

---

## 2. Visual Style

Pixel art, Stardew Valley aesthetic: 16-bit hand-painted look, NOT flat
8-bit blocks. Warm, muted color palette (soft greens, browns, dusty blues).
Maze walls textured like stone/wood-plank tiles, not plain rectangles.
Tanks are small top-down pixel sprites (~24–32px), rotate smoothly, body
and barrel visually distinct. Player tank = blue tint, AI tank = red tint.
Background = grass/dirt tile texture. Use nearest-neighbor scaling so
sprites stay crisp at any canvas size, never blurry.

---

## 3. Core Mechanics

### 3.1 Movement
Classic tank-drive controls: forward/back moves along current facing
direction, left/right rotates the tank. Acceleration and deceleration, not
instant start/stop. Tank collides with maze walls and the opponent tank —
cannot pass through either.

### 3.2 Shooting & Bullet Physics (the signature mechanic)
- Tank fires in the direction its barrel currently faces.
- Bullets do NOT disappear on wall contact — they reflect at a mirrored
  angle (angle of incidence = angle of reflection), like a ball bouncing
  off a mirror.
- Bullets expire after 6 seconds OR 5 wall bounces, whichever comes first.
- A bullet destroys any tank it touches, including the tank that fired it.
  Self-kill via your own ricochet is intentional.
- Base cannon: up to 5 bullets in flight per tank at once, fired one at a
  time (one bullet per Spacebar press, not full-auto). No cooldown between
  shots — firing rate is limited only by the 5-bullet cap.

### 3.3 Maze Generation
New random maze every match, using grid-based generation (recursive
backtracking or Prim's algorithm). Mix of tight 1-tile corridors and a few
2–3-tile open rooms. Both tanks spawn at randomized, maximally distant
points — never adjacent at match start. Outer boundary wall contains all
tanks and bullets.

---

## 4. Power-Ups

Crates spawn on random empty floor tiles every 8–15 seconds (max 1–2
active on the map at once). Driving over a crate swaps the current weapon;
it reverts to the base cannon once ammo runs out.

| Power-Up | Effect |
|---|---|
| **Gatling Gun** | Fires continuously while held, high rate, ~15 rounds total, normal bounce physics per bullet |
| **Shotgun** | 5-shot spread in a narrow cone, shorter range, 3 total shots |
| **Homing Missile** | Travels straight 2 seconds, then curves toward nearest tank (can target its own shooter), 1 shot |
| **Shield** | Deflects/absorbs incoming bullets for 6 seconds, visible bubble sprite; own reflected shot can still kill the shielded tank |
| **Mine** | Drops a trap, invisible after 1 second, explodes when the OTHER tank drives over it, 3 mines total |
| **Laser** | Instant-hit straight beam, dotted aim-preview line before firing, passes through 1 thin wall, stops at thick outer walls, 1 shot |

**Design rule:** every power-up trades extra power for a real risk
(self-damage potential, limited range, low ammo, or setup delay). Preserve
this balance in any future power-up added.

---

## 5. AI Opponent — 3 Difficulty Tiers

Selected on a pre-match screen (Easy / Medium / Hard).

| Tier | Movement | Accuracy | Bank shots | Reaction delay | Power-up behavior |
|---|---|---|---|---|---|
| **Easy** | Casually approaches the player; simple BFS pathfinding around walls when there's no direct line to the player, basic reactive wall-avoidance otherwise | ~50% | None (direct line of sight only) | ~0.8s | Ignores ~half the time |
| **Medium** | Simple A* pathfinding when out of sight | ~75% | Occasional 1-wall | ~0.4s | Goes for it if closer to AI than player |
| **Hard** | Full A* pathfinding, actively hunts | ~90% | Multi-wall, calculated | ~0.1s | Aggressively contests pickups, evasive strafing |

**Note:** Easy now also pathfinds around walls (added to fix it getting stuck leaning
on a wall with no route to the player), so "pathfinding" no longer distinguishes
Medium/Hard from Easy. When Medium is built, it needs a different defining trait
than "pathfinding when out of sight" — e.g. faster/more direct paths, predictive
aiming, or actually using bank shots — to stay meaningfully harder than Easy.

---

## 6. Screens / Flow

1. **Title Screen** — logo, Play button, idle background animation.
2. **Difficulty Select** — Easy / Medium / Hard buttons with short
   description under each.
3. **Match Screen** — maze + both tanks + power-up crates, small HUD
   (current weapon icon + ammo count, difficulty label).
4. **Result Screen** — Victory/Defeat banner, buttons: Rematch (new random
   maze, same difficulty), Change Difficulty, Back to Title.

---

## 7. Controls

- **Move:** WASD or Arrow Keys (tank-drive, not free 8-way strafing)
- **Fire:** Spacebar
- **Pause:** Esc → Resume / Quit to Title

---

## 8. Audio

Light chiptune background loop during matches. SFX: cannon fire, wall
bounce ping, explosion, power-up pickup chime, victory/defeat jingles.
Mute toggle in pause menu.

---

## 9. Win/Lose Condition

Match ends immediately when either tank is hit by any projectile or mine.
Result Screen shows within 1 second of the death animation finishing. No
scoring/rounds system in v1 — single match, then rematch/reset.

---

## 10. Technical Requirements

- Fully client-side: no login, no backend, no database.
- Vanilla HTML/CSS/JavaScript only — no frameworks, no build step, no npm.
- Canvas ~960x640, centered, pixel-perfect scaling.
- Target 60fps for smooth bullet physics.
- Maze and power-up state fully reset every new match.

---

## 11. Explicitly Out of Scope for v1

Do not add without an explicit decision to expand scope:
- Online multiplayer / matchmaking
- Local 2–3 player mode (planned for a later phase, not v1)
- Ranking/rank-points system
- Player accounts, saves, or persistent stats
- Multiple maze themes/biomes
- Mobile touch controls

---

## 12. Build Priority Order

1. Tank movement + collision in a static test maze
2. Bullet firing + wall-bounce physics — get this exactly right first,
   it's the signature mechanic
3. Random maze generation
4. AI opponent — Easy tier first, then Medium, then Hard
5. Power-up spawning + all 6 weapon behaviors
6. Menus: Title, Difficulty Select, Result screens
7. Pixel art pass
8. Audio pass
