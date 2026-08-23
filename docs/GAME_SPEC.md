# Game Design Spec — Pixel Tank Duel

Single source of truth for this game's design. Claude Code should check this
file before implementing any feature, rather than being re-told the rules.

---

## 1. Overview

**Genre:** Top-down 2D maze tank combat. 1–3 local players and/or 0–3 AI
opponents, free-for-all, in the same maze at once (see section 5).
**Inspiration:** Tank Trouble (bouncing-bullet mechanic).
**Platform:** Browser, HTML5, fully client-side, no backend.
**Session length:** 1–5 minutes per match.
**Core loop:** Configure forces (how many players, how many AI, each AI's
difficulty) on the Mission Briefing screen → free-for-all in a random maze
→ last tank standing wins → rematch or reconfigure.

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
instant start/stop. Tank collides with maze walls and every other tank on
the field — cannot pass through any of them.

### 3.2 Shooting & Bullet Physics (the signature mechanic)
- Tank fires in the direction its barrel currently faces.
- Bullets do NOT disappear on wall contact — they reflect at a mirrored
  angle (angle of incidence = angle of reflection), like a ball bouncing
  off a mirror.
- Bullets expire after 6 seconds OR 5 wall bounces, whichever comes first.
- A bullet destroys any tank it touches, including the tank that fired it.
  Self-kill via your own ricochet is intentional.
- Base cannon (player): up to 5 bullets in flight at once, fired one at a
  time (one bullet per Spacebar press, not full-auto). No cooldown between
  shots — firing rate is limited only by the 5-bullet cap. AI opponents
  use a stricter limit instead — see section 5.

### 3.3 Maze Generation
New random maze every match, using grid-based generation (recursive
backtracking or Prim's algorithm). Mix of tight 1-tile corridors and a few
2–3-tile open rooms. All tanks in the match (up to 6) spawn at mutually
distant points, chosen by iteratively picking whichever cell is farthest
(by walkable path distance) from every already-chosen spawn — never
adjacent at match start. Outer boundary wall contains all tanks and
bullets.

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

## 5. AI Opponents — 3 Difficulty Tiers, 0–3 Simultaneous

0–3 AI tanks per match, each independently set to Easy/Medium/Hard on the
Mission Briefing screen (see section 6). Currently only Easy is
implemented — Medium and Hard are selectable in the UI but disabled
("Coming soon") until built, same treatment as any other not-yet-built
feature in this doc.

**Targeting (FFA):** every match is free-for-all (see section 1 and
section 9) — there is no player-team/AI-team distinction, and a bullet
hurts whatever tank it touches regardless of who fired it or who's
driving the tank it hits. Each AI tank targets whichever other living tank
(player-controlled or AI-controlled) is nearest by walkable path distance,
re-evaluated every reaction tick alongside its normal re-pathing. If its
current target is destroyed, it re-targets immediately rather than waiting
for the next reaction tick.

| Tier | Movement | Accuracy | Bank shots | Reaction delay | Power-up behavior |
|---|---|---|---|---|---|
| **Easy** | Casually approaches its target (steers toward them, or a pathfound waypoint when out of sight); on hitting a wall it stops, turns, tries the new heading briefly, and reverses + retries a different direction if still stuck | Fires reliably once eligible (see note) | None (direct line of sight only) | ~0.8s (re-aiming/re-pathing/re-targeting only — obstacle response and firing are immediate, see notes) | Ignores ~half the time |
| **Medium** | Simple A* pathfinding when out of sight | ~75% | Occasional 1-wall | ~0.4s | Goes for it if closer to AI than player |
| **Hard** | Full A* pathfinding, actively hunts | ~90% | Multi-wall, calculated | ~0.1s | Aggressively contests pickups, evasive strafing |

**Note:** Easy now also pathfinds around walls (added to fix it getting stuck leaning
on a wall with no route to its target), so "pathfinding" no longer distinguishes
Medium/Hard from Easy. When Medium is built, it needs a different defining trait
than "pathfinding when out of sight" — e.g. faster/more direct paths, predictive
aiming, or actually using bank shots — to stay meaningfully harder than Easy.

**Firing trigger (Easy):** fires as soon as its current target has been continuously
aimed-at and directly visible (unobstructed line of sight) for 0.5s — not a random
chance anymore (the old ~50%-per-0.8s-tick roll felt too slow to get an opening shot
off). "Accuracy" for Easy is effectively retired until a real aim-miss mechanic
exists; Medium/Hard should define their own accuracy behavior when built. Still
subject to the 1-bullet/1s-cooldown ammo limit below.

**Movement responsiveness (Easy):** obstacle avoidance (stop/turn/reverse) reacts
every frame, not on the ~0.8s reaction-delay cadence — that delay only governs how
often the AI reconsiders its target (nearest living tank) and its next pathfound
waypoint, not how fast it notices a wall in front of it.

**Movement direction (Easy):** always steers toward the next waypoint on a
pathfound route through the maze grid — never a raw straight line to its target,
even when one looks clear. A straight line can look open (e.g. a sightline across
a dead-end alcove) while no walkable path actually follows it; steering at it
anyway is what drove the AI into dead ends. This mirrors how the actual Tank
Trouble AI ("Laika") navigates — A* pathfinding for movement, with line-of-sight
used separately, only to decide when to fire.

**Ammo (all tiers):** AI opponents fire only 1 bullet at a time, with a ~1 second
cooldown after it's gone before firing again — stricter than the player's 5-bullet,
no-cooldown base cannon from section 3.2. Keeps the AI from flooding the maze with
bullets at close range.

---

## 6. Screens / Flow

1. **Title Screen** — logo, Play button, idle background animation.
2. **Mission Briefing** — configure forces before battle:
   - Allied Forces: 1P / 2P / 3P toggle picks how many local human players.
     Each active player slot shows its control scheme (Move Forward/Back,
     Turn Left/Right, Fire), rebindable directly from this screen (click a
     key box, press the new key — same swap-conflict rule as the pause
     menu's Change Controls, extended across every player's bindings so no
     two players can ever share a key).
   - Enemy Forces: 0P / 1 / 2 / 3 toggle picks how many AI tanks. Each
     active AI slot independently picks Easy/Medium/Hard (Medium/Hard
     disabled — "Coming soon," same as everywhere else in this doc).
     0 AI is only selectable when there are 2+ players (a 1-player, 0-AI
     match would have nothing to fight).
   - "Battle!" button starts the match with the configured forces.
   - Session Stats button (top-right corner) — only shown once at least one
     match has been tallied this session (see section 9.1); opens a modal
     overlay with the same scoreboard and Reset Stats button as the Result
     Screen, plus a Close button to return to Briefing.
3. **Match Screen** — maze + every configured tank (labeled P1/P2/P3 for
   players, AI1/AI2/AI3 for AI, in spawn order) + power-up crates, small
   HUD (current weapon icon + ammo count per player — see HUD notes below
   for the multi-player case).
4. **Result Screen** — "`<label>` Wins!" banner (green if the winner is a
   player, red if the winner is an AI tank; "Draw" in the rare simultaneous-
   kill case — see section 9), buttons:
   Rematch (new random maze, same configuration), Change Difficulty (back
   to Mission Briefing — the button keeps its original name from the
   single-AI era even though it now reconfigures the whole match, not just
   difficulty), Back to Title.

---

## 7. Controls

Each local player has their own independent control scheme — move
forward/back, turn left/right, and fire — all rebindable, plus one Pause
key shared by the whole match (not per-player). Default schemes, assigned
by player slot:

| Player | Forward | Backward | Left | Right | Fire |
|---|---|---|---|---|---|
| P1 | W | S | A | D | Spacebar |
| P2 | ↑ | ↓ | ← | → | Enter |
| P3 | I | K | J | L | P |

- **Move:** tank-drive (not free 8-way strafing), per-player defaults above.
- **Fire:** per-player defaults above.
- **Pause:** Esc, shared by the whole match (not per-player) — opens the
  Pause Menu, and also acts as the universal cancel/back key within it.
  Esc itself can never be assigned to any action.
- Every action's key must be unique across the *entire* match — rebinding
  one player's key to something another player (or Pause) already uses
  swaps the two instead of letting one physical key double up.

### Pause Menu (opened by Esc during a match)

1. **Resume** — closes the menu, match continues exactly where it left off.
2. **Rematch*** — new random maze, same configuration (players/AI/difficulties).
3. **Change Difficulty*** — abandons the match, returns to Mission Briefing.
4. **Change Controls** — full key rebinding screen, covering every active
   player's scheme (see below). No confirmation needed; rebinding doesn't
   affect the current match.
5. **Quit to Title*** — abandons the match, returns to the Title Screen.

\* Requires a Yes/No confirmation (abandons the in-progress match) before
proceeding.

**Change Controls screen:** lists every bindable action for every active
player (Move Forward, Move Backward, Turn Left, Turn Right, Fire — times
however many players are in the match). Pause is not listed — it's fixed to
Esc and never rebindable (see above). Click an action, then press any key
to bind it. If that key was already bound to a different action — that
player's own, or a different player's — the two actions swap keys — no
action is ever left unbound, no key is ever shared by two actions. Esc cancels an
in-progress rebind instead of being assignable. The same rebinding UI is
also reachable directly from the Mission Briefing screen, before a match
starts.

---

## 8. Audio

Light chiptune background loop during matches. SFX: cannon fire, wall
bounce ping, explosion, power-up pickup chime, victory/defeat jingles.
Mute toggle in pause menu.

---

## 9. Win/Lose Condition

Free-for-all, always — there is no team distinction between players and AI
(see section 5's Targeting note); a bullet destroys whatever tank it
touches regardless of who fired it. A destroyed tank is removed from play
but the match continues; it ends when exactly one tank remains, and that
tank's controller (a specific player, or a specific AI) wins. (Edge case:
if the last two-or-more tanks are destroyed in the same instant — e.g. a
mutual point-blank kill — treat it as a draw; no player/AI is declared the
winner.) Result Screen shows within 1 second of the last death animation
finishing.

### 9.1 Session Stats (Win/Kill/Death tallies)

Each tank slot (P1/P2/P3, AI1/AI2/AI3) accumulates Wins, Kills, and Deaths
across matches in the current browser session — an in-session tally, NOT a
persistent ranking or rank-points system (that stays out of scope, see
section 11). Tracked per slot label, not per physical player, so
reconfiguring forces (e.g. dropping from 3 players to 2) keeps each
surviving slot's history. Displayed in Win/Kill/Death order everywhere,
each with a dedicated icon and a readable word: 🏆 Win, 🔫 Kill, 💀 Death
(the compact in-match HUD is the one exception — icon + number only, no
words, to fit the space).

- A kill is credited to whichever tank's bullet destroyed another tank.
  Self-kill via your own ricochet (section 3.2) counts as a death but never
  as a kill against yourself.
- A win is credited to the last tank standing; a draw (simultaneous mutual
  kill) credits no one.
- Stats survive Rematch, Change Difficulty, and Back to Title. Only an
  explicit Reset Stats button (on the Result Screen or the Briefing stats
  modal — see section 6) clears them. A page refresh also clears them,
  since nothing is persisted — no localStorage, per the no-backend/no-saves
  rule (section 10).
- Scoreboard tables (Result Screen and the Briefing stats modal) color
  each stat by type rather than by tank: Win green, Kill red, Death white
  (white for contrast against this game's uniformly dark backgrounds — not
  computed dynamically, since nothing here uses a light background). The
  tank name itself is plain white, not the tank's usual color.
- Shown in the in-match HUD (`src/ui/hud.js`, per-player, icon + number
  only) and as a full scoreboard on the Result Screen and the Briefing
  stats modal (`src/ui/menu.js`, all tanks used this session, both with
  the Reset Stats button).

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
- Ranking/rank-points system (distinct from the in-session Kill/Death/Win
  tallies in section 9.1, which reset on refresh and never persist)
- Player accounts, saves, or persistent stats
- Multiple maze themes/biomes
- Mobile touch controls

Local 2–3 player mode was previously listed here as out of scope for v1;
that decision was explicitly reversed — see section 1 and section 5.

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
