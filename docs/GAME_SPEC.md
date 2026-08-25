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
- Base cannon (player): up to 5 bullets in flight at once. A tap of the
  fire key (Spacebar by default) fires instantly, one bullet at a time.
  Holding the fire key down auto-fires a new bullet every 0.5s for as
  long as it's held (and the 5-bullet cap allows it) — releasing and
  re-tapping always fires instantly again, the 0.5s pacing only applies
  between repeat shots while held. Firing is also capped by the 5-bullet
  cap regardless of tap or hold. AI opponents use a stricter limit
  instead — see section 5.
- Bullet speed is 160 px/s — noticeably faster than a tank's own top
  forward speed (140 px/s) so it can't be outrun, but slow enough to be
  visually trackable and reactable to (previously 320 px/s, which felt
  too fast to react to).

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
Mission Briefing screen (see section 6). Easy and Hard are implemented;
Medium is still selectable in the UI but disabled ("Coming soon") until
built, same treatment as any other not-yet-built feature in this doc.

Every tier is one class in `src/ai/`, and every tier shares the same
architecture — a `seek / cornerTurn / blockedTurn / attempting /
reversing` state machine driving `{ forward, backward, left, right }` +
`wantsToFire`, exactly the shape a human player's input produces (see
section 7), so an AI tank runs through the identical `Tank.update()` and
firing path a player's tank does. **Movement always steers toward a
pathfound waypoint, at every tier, without exception** — never a raw
line-of-sight straight line at the target, for the reason spelled out in
"Movement direction" below. A tier is defined by *how far it scales up*
the axes in the ladder table, not by inventing its own navigation.
`HardAI` therefore literally extends `EasyAI` (`src/ai/hard.js`), so that
guarantee is structural rather than a convention a later edit could
quietly break.

**Targeting (FFA):** every match is free-for-all (see section 1 and
section 9) — there is no player-team/AI-team distinction, and a bullet
hurts whatever tank it touches regardless of who fired it or who's
driving the tank it hits. Each AI tank targets whichever other living tank
(player-controlled or AI-controlled) is nearest by walkable path distance,
re-evaluated every reaction tick alongside its normal re-pathing. If its
current target is destroyed, it re-targets immediately rather than waiting
for the next reaction tick.

**The difficulty ladder.** Each tier scales the same four axes up; a new
tier belongs in this table, not in a section of its own.

| Tier | Movement | Aim | Bank shots | Fire trigger | Ammo | Reaction delay | Power-up behavior |
|---|---|---|---|---|---|---|---|
| **Easy** | "Hallway driving": commits to a straight heading down a whole corridor at a time, stops and pivots cleanly at corners, and only stops/turns/reverses when something the route didn't anticipate blocks it | Aims at the target's current position only | None (direct line of sight only) | Instant (0s) once aimed-at and visible | 1 bullet in flight, 1s cooldown | ~0.8s (re-targeting which opponent only — pathing/waypoint updates, obstacle response, corner turns, and firing are all immediate, see notes) | Ignores ~half the time |
| **Medium** | *Coming soon* — hallway driving plus dodging | *Coming soon* | *Coming soon* — occasional 1-wall | *Coming soon* | *Coming soon* | ~0.4s | Goes for it if closer to the AI than the player |
| **Hard** | Hallway driving **+ dodging + flanking**: same pathfinder, but the goal cell is chosen to approach from off the target's current facing, and it bursts out of the predicted path of an incoming bullet | **Leads the target** using its velocity — aims where you'll be when the bullet arrives, not where you are | **Multi-wall, calculated**: searches firing angles whose traced ricochet path lands on the target within 3 bounces; rejects any that would ricochet back into itself first | 0.15s of continuous aim-on-solution | 3 bullets in flight, 0.3s cooldown | ~0.1s | Aggressively contests pickups, evasive strafing |

**Note:** Easy now also pathfinds around walls (added to fix it getting stuck leaning
on a wall with no route to its target), so "pathfinding" no longer distinguishes
Medium/Hard from Easy. When Medium is built, it needs a different defining trait
than "pathfinding when out of sight" — e.g. faster/more direct paths, predictive
aiming, or actually using bank shots — to stay meaningfully harder than Easy, and
has to land between Easy and Hard on every axis above.

**Note:** the Power-up behavior column is aspirational for *every* tier — crates
and weapons (section 4) aren't built yet, so no tier currently reacts to them at
all. Those cells describe the intent for when section 4 ships.

**Firing trigger (Easy):** fires instantly (0s delay) the moment its current target is
aimed-at and directly visible (unobstructed line of sight) — not a random chance, and
no longer a 0.5s aim-hold (that felt too slow to get an opening shot off). "Accuracy"
for Easy is effectively retired until a real aim-miss mechanic exists; Medium/Hard
should define their own accuracy behavior when built. Still subject to the
1-bullet/1s-cooldown ammo limit below.

**Movement responsiveness (Easy):** obstacle avoidance (stop/turn/reverse) and its
pathfound waypoint both react every frame, not on the ~0.8s reaction-delay cadence —
that delay only governs how often the AI reconsiders *which opponent* to target, not
how fast it notices a wall in front of it or reaches the end of its current corridor.

**Movement direction (Easy):** always steers toward a point on a pathfound route
through the maze grid — never a raw straight line to its target, even when one
looks clear. A straight line can look open (e.g. a sightline across a dead-end
alcove) while no walkable path actually follows it; steering at it anyway is what
drove the AI into dead ends. This mirrors how the actual Tank Trouble AI ("Laika")
navigates — A*-driven, discrete-behavior decision making (per public dev accounts,
since Laika's source isn't available), with line-of-sight used separately, only to
decide when to fire.

**"Hallway driving" (Easy):** the pathfound route is compressed into long straight
runs — consecutive cells heading the same direction collapse into a single waypoint
at the far end of that run — so the AI commits to one heading down a whole corridor
instead of re-aiming at every single maze cell, which previously read as a
zigzag. It only actually turns where the route genuinely bends, and does that turn
as a deliberate stop-and-pivot in place (snapping to the exact corridor heading)
rather than swinging through the corner while still driving forward, which was
clipping the inside wall of the turn. Reactive obstacle avoidance (stop/turn/
reverse, above) still applies on top of this for anything the planned route didn't
anticipate.

**Obstacle recovery (Easy):** when blocked, turns to align *parallel* with
whichever wall it hit rather than turning for a fixed guessed duration — of the
wall's two parallel headings, it picks whichever is closer to the direction of its
current waypoint, then drives forward hugging that wall. If several blocked/reverse
cycles happen in a row without a real stretch of unobstructed progress in between
(a genuine loop, e.g. a pocket the current waypoint can't actually reach this way),
it forces a fresh path replan and flips its wall-heading tie-break once, instead of
retrying the same losing turn forever.

Separately, the AI also re-plans its waypoint the instant the committed one stops
being directly reachable from wherever it actually is (no open grid passage between
its current cell and that waypoint cell) — not just when it reaches the waypoint or
the opponent moves cells. Getting shoved off-course (reversing away from an
obstacle, or a maze-wall collision push) could otherwise leave it committed to a
waypoint on the other side of a wall it could never cross no matter how it turned,
which read as the AI "getting stuck" pressed against a wall.

**Firing trigger (Hard):** needs 0.15s of continuously holding a valid *firing
solution* before the shot goes out — not merely 0.15s of the target being visible.
A firing solution is either a direct lead shot or a bank shot (below), and pointing
at a bare wall is a perfectly legitimate thing for Hard to be doing. The brief hold
is what buys the accuracy: Easy fires the instant it sees you and hits where you
were, Hard takes an extra beat and hits where you're going.

**Aim — leading (Hard):** aims at where the target will be when the bullet arrives,
derived from the target's own velocity. Flight time depends on the lead point and
the lead point depends on flight time, so it solves that fixed point iteratively. A
predicted point behind a wall is discarded (the target can't actually get there in a
straight line), falling back to its present position.

**Aim — bank shots (Hard):** with no direct line, Hard sweeps candidate firing
angles and traces each one's ricochet path through the maze, using the *same*
reflection rule the real bullet obeys (the wall's own orientation picks the mirror
axis — see section 3.2 and `Maze.moveWithBounce`), keeping the cheapest angle whose
path lands on the target within 3 bounces. Two constraints keep it honest:
- Traced shots are fired from where the muzzle *will* be once the tank has turned
  onto that angle, not from where the barrel points now — the barrel swings with the
  turret, and tracing from the current tip put the shot's origin a whole barrel
  length off.
- A candidate whose path would cross the AI's *own* hull before reaching the target
  is rejected outright. Self-kill by own ricochet is a real mechanic (section 3.2),
  so an AI that calculates bank shots has to calculate its way out of suiciding too.

**Dodging (Hard):** predicts each nearby bullet's flight forward — bounces included,
stepped through the maze's own bounce solver so the prediction can't disagree with
what the bullet actually does — and, if one would hit, commits a short burst
forward or backward out of its path. Because a tank only drives along its own facing
(section 3.1), a bullet coming straight down the corridor it's pointed along is
genuinely undodgeable by driving; in that case Hard holds its route and shoots back
rather than flailing. It ignores its own just-fired bullet until a bounce sends it
back.

**Flanking (Hard):** Hard does *not* pathfind to the target's cell. It pathfinds to
a cell 1–3 steps away from the target, scored on how far around the target's back it
sits (bearing from the target to that cell vs. the way the target is currently
facing) against what the detour costs in travel — so it comes at you from behind or
the side instead of driving straight down your barrel. Inside 2 cells it drops the
manoeuvring and just closes in. Crucially this changes only the *destination handed
to the pathfinder*: run compression into hallway waypoints, corner pivots, and
off-path replanning are all the same code Easy runs, so flanking can never degrade
into raw line-of-sight steering.

**Aim-hold (Hard):** when a firing solution exists but the tank isn't pointed at it,
Hard stops and pivots onto it, then holds still through the 0.15s fire trigger — its
own route-following steering would otherwise drag the barrel back off the solution
before the shot left. Both this and dodging are extra states in the same state
machine, and both can only be entered from `seek`, so neither can interrupt an
obstacle-recovery sequence part-way through and strand the tank. Both are capped by
a timeout and followed by a forced stretch of normal movement, so Hard can't freeze
in place or dodge-chatter. The hold is also gated on the shot being *takeable right
now* — not on cooldown, not at the 3-bullet cap, barrel not jammed against a wall —
because standing still to aim a shot that physically cannot leave the barrel is all
downside: the tank is a stationary target and nothing comes of it.

**Arriving on top of the target (Hard):** the pathfinder has nothing to route once
the tank is already standing in its destination cell — the path is one cell long, so
the waypoint is the tank's *own* cell centre, and steering at that produces a
meaningless heading that walks the tank into the nearest wall and leaves it churning
through obstacle recovery. On arrival Hard therefore steers at the real target
instead, and stops driving entirely once the steer point is underfoot, letting the
firing logic finish the job. This is the single case where Hard aims at a target
rather than a pathfound waypoint, and it is safe precisely because it is confined to
one cell — the pathfinder has already established there is no wall in between. Every
route longer than that still belongs to the pathfinder.

**Giving up on a flank (Hard):** if the shared stuck detector concludes the current
route isn't working and forces a fresh plan, Hard also discards the flanking cell it
was heading for and refuses to re-pick it until the target moves. The flanking cell
is what proved unreachable, so replanning toward it again just retries the same
losing approach against the same corner.

**Ammo (per tier):** every AI tier is stricter than the player's 5-bullet,
no-cooldown base cannon from section 3.2 — that's what keeps the AI from flooding
the maze with bullets at close range. Easy fires 1 bullet at a time with a ~1s
cooldown; Hard fires up to 3 at a time with a 0.3s cooldown. Each tier owns its own
numbers (see the ladder table), applied to its Tank when the match starts.

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
     active AI slot independently picks Easy/Medium/Hard (Easy and Hard
     both selectable; Medium disabled — "Coming soon," same as everywhere
     else in this doc).
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
