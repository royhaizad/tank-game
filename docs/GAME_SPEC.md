# Game Design Spec — Pixel Tank Duel

Single source of truth for this game's design. Claude Code should check this
file before implementing any feature, rather than being re-told the rules.

---

## 1. Overview

**Genre:** Top-down 2D maze tank combat. 1–3 local players and/or 0–3 AI
opponents (up to 6 tanks) in the same maze at once (see section 5), fighting
either free-for-all (the default) or split into two teams (see section 9.2).
**Inspiration:** Tank Trouble (bouncing-bullet mechanic).
**Platform:** Browser, HTML5, fully client-side, no backend.
**Session length:** 1–5 minutes per match.
**Core loop:** Configure forces (how many players, how many AI, each AI's
difficulty) on the Mission Briefing screen → pick the match type there with
one of its two battle buttons, assigning teams on the Team Setup screen if
it's a team match → fight in a random maze → last tank (all-vs-all) or last
team standing wins → rematch or reconfigure.

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
  between repeat shots while held. That 0.5s is the *base cannon's*
  hold-to-repeat rate; an equipped power-up sets its own (0.09s for the
  gatling, and no auto-fire at all for the one-shot weapons, which need a
  fresh keypress each time) — see section 4. Firing is also capped by the 5-bullet
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

Crates spawn on random empty floor tiles every 3–7 seconds. The live-crate
cap is rolled once per match between 1 and 4, so some matches stay scarce
and weapon-hungry while others are a scramble. A crate never spawns on a
cell a tank is already standing on (that would read as a free pickup
rather than something to drive for). Driving over a crate swaps the
current weapon; it reverts to the base cannon once ammo runs out — the
base cannon has infinite ammo, so a tank is never left unable to shoot.
All power-up state resets every match (see section 10).

| Power-Up | Effect | Ammo |
|---|---|---|
| **Gatling Gun** | Fires continuously while held (~0.09s between rounds, so a held burst empties in ~1.4s), normal bounce physics per bullet, all 15 rounds can be in flight at once | 15 rounds |
| **Shotgun** | 5-pellet spread in a narrow cone (~0.42 rad), shorter range — pellets expire after ~0.96s (~2.4 cells) | 3 shots |
| **Homing Missile** | Travels straight and fast for 1 second, then slows down and curves toward the nearest OTHER tank at a capped turn rate — the missile's own shooter is never a valid target | 1 shot |
| **Shield** | Not a weapon: picking it up arms a charge as a buff layered on top of whatever weapon (and remaining ammo) is currently equipped, rather than replacing it — the bubble doesn't activate on pickup. The NEXT time fire is pressed, the charge pops into a visible bubble for 10 seconds, whether or not that press's actual shot goes through. While active, it deflects ANY bullet off its surface (mirror angle, counts as a bounce) — including the wearer's own returning ricochet — and absorbs mine shrapnel and an enemy's laser beam outright (the wearer's own laser still hits them; see the Laser row) | — |
| **Mine** | Dropped under the tank (usable even nosed against a wall), visible 1 second then invisible to everyone including its owner. Stepping on a hidden mine reveals it again (with a sound); stepping back OFF it lights a 0.5s fuse rather than detonating outright, then explodes into 8 shrapnel pieces sprayed outward (with a sound) — the mine itself never hurts anyone, only its shrapnel does, and shrapnel does not reflect off walls (it stops dead on contact, unlike a bullet). The trigger radius is a full 12px (matching the mine's drawn black body, not just its small red center marker). The mine's dropper gets one free departure (stepping off doesn't light the fuse the first time) — after that grace is used, stepping off again detonates it on them exactly like anyone else | 3 mines |
| **Laser** | A fast (not instant) beam that bounces off every wall (interior AND the outer boundary) with the same mirror-angle reflection as the cannon, up to 6 bounces. A dotted aim-preview line is drawn for **every** player to see the whole time a laser is equipped, tracing the beam's real bounce path — both an aiming aid and a telegraph. Firing locks that path immediately, but the beam then visibly travels it at high speed rather than resolving on the spot, giving whoever's in the way a brief window to break line of sight before it actually reaches them | 1 shot |

**Design rule:** every power-up trades extra power for a real risk
(self-damage potential, limited range, low ammo, or setup delay). Preserve
this balance in any future power-up added. Which drawback each one carries:
gatling — 15 bouncing rounds loose in a maze is the fastest way to shoot
yourself; shotgun — useless past ~2 cells; missile — slow once it's
actually homing, giving its target time to react; shield — purely
defensive (no offense of its own, and your own laser still gets through),
plus it does nothing until you next press fire — pick one up mid-danger
and you're still exposed until you actually shoot; mine — invisible to
you too, and its shrapnel doesn't care who dropped it once your one grace
departure is spent; laser — just 1 shot,
telegraphed by the aim line, and its brief travel time is a real (if
narrow) dodge window.

**Ammo/rate overrides:** a picked-up weapon may override the tank's own
firing limits (in-flight bullet cap, cooldown, and the hold-to-repeat
interval) for as long as it's equipped; on revert the tank returns to its
own base limits, which differ for players and AI (sections 3.2 and 5).

**AI and crates:** Easy AI does not seek crates out — it picks up whatever
it happens to drive over and then uses that weapon through the same firing
path players use. Actively contesting pickups is a Medium/Hard trait (see
section 5) and isn't built yet.

---

## 5. AI Opponents — 3 Difficulty Tiers, 0–3 Simultaneous

0–3 AI tanks per match, each independently set to Easy/Medium/Hard on the
Mission Briefing screen (see section 6). All three tiers are implemented.

Every tier is one class in `src/ai/`, and every tier shares the same
architecture — a `seek / cornerTurn / blockedTurn / attempting /
reversing` state machine driving `{ forward, backward, left, right }` +
`wantsToFire`, exactly the shape a human player's input produces (see
section 7), so an AI tank runs through the identical `Tank.update()` and
firing path a player's tank does. **Movement always steers toward a
pathfound waypoint, at every tier, without exception** — never a raw
line-of-sight straight line at the target, for the reason spelled out in
"Movement direction" below. A tier is defined by *how far it scales up*
the axes in the ladder table (section 5.1), not by inventing its own
navigation: `MediumAI` and `HardAI` both literally extend `EasyAI`
(`src/ai/medium.js`, `src/ai/hard.js`), inheriting its pathfinding,
hallway driving, corner pivots, and obstacle recovery untouched, so that
guarantee is structural rather than a convention a later edit could
quietly break. A navigation fix in Easy is therefore automatically a
navigation fix in every tier above it.

**Targeting (FFA):** in a free-for-all match (see section 1 and section 9)
there is no player-team/AI-team distinction, and a bullet hurts whatever
tank it touches regardless of who fired it or who's
driving the tank it hits. Each AI tank targets whichever other living tank
(player-controlled or AI-controlled) is nearest by walkable path distance,
re-evaluated every reaction tick alongside its normal re-pathing. If its
current target is destroyed, it re-targets immediately rather than waiting
for the next reaction tick.

**Targeting (team mode):** an AI considers only living tanks on the
*opposing* team, picking the nearest of those by the same rule as above —
a teammate is never chosen as a target. That is the whole of team-awareness
in the AI: it is not *protected* from a teammate's bullet, because friendly
fire is ON (section 9.2), so a stray bounce can still destroy a teammate.

| Tier | Movement | Accuracy | Bank shots | Reaction delay | Power-up behavior |
|---|---|---|---|---|---|
| **Easy** | "Hallway driving": commits to a straight heading down a whole corridor at a time, stops and pivots cleanly at corners, and only stops/turns/reverses when something the route didn't anticipate blocks it | Fires reliably once eligible (see note) | None (direct line of sight only) | ~0.8s (re-targeting which opponent only — pathing/waypoint updates, obstacle response, corner turns, and firing are all immediate, see notes) | Ignores ~half the time |
| **Medium** | Everything Easy does, plus dodging: sidesteps out of the path of an incoming bullet that's on a collision course nearby | Only takes clean shots — a ~9° fire window vs Easy's ~15° | None (direct line of sight only) | ~0.4s (re-targeting which opponent only, same as Easy) | Goes for it if closer to AI than player |
| **Hard** | Everything Medium does, plus flanking: pathfinds to an approach cell off the target's facing instead of straight at it, and its dodge is bounce-aware (see 5.1) | Leads the target by its velocity, and actively turns to line up a shot | Multi-wall, calculated — traces candidate ricochet paths and rejects any that would hit itself first | ~0.1s (re-targeting which opponent only, same cadence as the others) | Aggressively contests pickups, evasive strafing |

**Note:** Easy also pathfinds around walls (added to fix it getting stuck leaning on
a wall with no route to its target), so "pathfinding" doesn't distinguish any tier
from any other — every tier navigates by the same pathfound waypoints. The axes that
actually separate the tiers are in section 5.1.

**Note:** the Power-up behavior column is aspirational for *every* tier — crates
and weapons (section 4) aren't built yet, so no tier currently reacts to them at
all. Those cells describe the intent for when section 4 ships.

### 5.1 AI difficulty ladder

Every tier shares one brain and one navigation system: `MediumAI` and `HardAI` both
extend `EasyAI` (`src/ai/medium.js`, `src/ai/hard.js`), inheriting its pathfinding,
hallway driving, corner pivots and obstacle recovery untouched, and turning up a
small number of dials. A navigation fix in Easy is therefore automatically a
navigation fix in every tier above it. **Adding a tier means adding a row here and
a factory to `AI_TIERS` in `src/main.js`** — that table maps a tier to its brain
class, and any tier missing from it stays greyed out on the Mission Briefing screen.
Ammo limits are normally owned by the AI class's own constructor (`EasyAI`,
`HardAI`) so a tier's numbers live in one place; `MediumAI` deliberately doesn't
declare its own (see its file header) so its numbers are listed in
`AI_AMMO_OVERRIDES` in `src/main.js` instead — either approach is fine, a tier just
needs to end up in exactly one of the two tables.

| Axis | Easy | Medium | Hard |
|---|---|---|---|
| **Fire trigger** | Fires the instant it has a clean shot (0s) | Same — 0s | **0.15s holding a valid firing solution** (not just a clean shot — see below) |
| **Fire window** | ~15° (0.26 rad) — takes any shot roughly lined up | ~9° (0.16 rad) — holds out for a clean shot | ~5° (0.09 rad) — tightest, since Hard actively turns onto its solution first |
| **Ammo** | 1 bullet in flight + 1s cooldown | 2 bullets in flight + 0.6s cooldown | **3 bullets in flight + 0.3s cooldown** |
| **Re-target cadence** | ~0.8s | ~0.4s | **~0.1s** |
| **Dodging** | None | Sidesteps a bullet on a collision course within 180px | **Bounce-aware**: predicts the bullet's full ricochet path (not just its current straight line) before deciding it's safe |
| **Bank shots** | None | None | **Multi-wall, calculated**: traces candidate firing angles' ricochet paths and rejects any that would hit itself first |
| **Aim prediction** | None | None — see below | **Leads the target by its velocity, and turns its hull to line the barrel up** — the turret-less limitation below no longer applies once the AI is willing to stop and aim |
| **Flanking** | None | None | **Pathfinds to an approach cell off the target's current facing** instead of straight at it (see below) |

Measured over 500 headless Medium-vs-Easy matches, Medium wins ~60% (an even matchup
is ~50%) and converts 0.59 kills per shot against Easy's 0.43. Measured over 120
headless Hard-vs-Easy matches, Hard wins ~82% (98–20–2 draws); mirror matches (Hard
vs Hard) split roughly even, confirming no positional bias in the test harness.

**Why Medium has no predictive aim, and why Hard does.** Leading the target by its
current velocity was specced as Medium's aim upgrade, built, measured, and cut. It
gained nothing even against a target driving in a dead straight line (95.0% vs 95.5%
hit rate) and lost badly against one that stops and pivots the way these AI do (41.5%
vs 56.8%). The reason is structural: **these tanks have no turret**, so a shot always
leaves along the tank's current driving heading (section 3.1, 3.2) — for a tier that
never stops to aim, a predicted lead point can only change *when* it fires, never
where the bullet goes, and firing at moments when the barrel isn't on the target is
strictly worse. Compounding it, bullets travel only ~15% faster than tanks (160 vs
140 px/s, section 3.2), so the lead needed is enormous and any prediction error is
large. Hard is where prediction starts paying off, because Hard is willing to stop
moving and turn its hull onto a solution first (its aim-hold state, below) — once
that's true, leading the target is a straightforward win rather than a wash.

**Dodging (Medium):** watches every bullet in flight, and treats one as a threat when
it's within 180px, would arrive within 1s, would pass within roughly a tank's radius,
and has clear line of sight (a bullet with a wall in between will change direction
before it arrives — reacting to *bounce* paths is Hard's job, not Medium's). It then
sidesteps: since tanks can't strafe (section 3.1), it drives whichever of forward or
backward carries it sideways off the bullet's line, rotating toward straight-sideways
as it goes, and it checks there's room that way before committing rather than reversing
into a wall. Dodging pre-empts normal navigation for as long as the threat lasts (plus
a 0.25s minimum so a single frame of threat can't cause a twitch), then drops its
committed waypoint so the route is re-planned from wherever it ended up. A hard 1.5s
cap plus a 0.6s cooldown guarantees navigation always gets control back, so bullets
ricocheting nearby can never lock the AI into dodging forever.

**Firing trigger (Easy):** fires instantly (0s delay) the moment its current target is
aimed-at and directly visible (unobstructed line of sight) — not a random chance, and
no longer a 0.5s aim-hold (that felt too slow to get an opening shot off). Still
subject to the ammo limits below.

**"Accuracy" as an axis:** there is no random aim-miss mechanic in this game, so the
percentages in the tier table above are descriptive, not literal roll chances. What
actually varies per tier is how tight a shot has to be lined up before the AI takes it
(the fire window in section 5.1). Medium fires no less reliably than Easy — it just
declines the sloppy shots Easy takes. Note that a tier *cannot* be made harder by
adding an aim-hold delay: Easy already fires at 0s, so any hold makes a tier slower on
the trigger than the one below it. Medium originally specced a 0.3s hold and it
measured as a straight downgrade (41% win rate vs Easy, where an even matchup is 50%).

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
the maze with bullets at close range, and the exact limit is one of the difficulty
dials (see section 5.1). Easy fires 1 bullet at a time with a ~1s cooldown; Medium
fires 2 at a time with a 0.6s cooldown; Hard fires up to 3 at a time with a 0.3s
cooldown. Easy and Hard each own their numbers in their AI class's own constructor;
Medium's live in the `AI_AMMO_OVERRIDES` table in `src/main.js` instead (see the
note at the top of section 5.1) — applied to each Tank when the match starts either
way.

---

## 6. Screens / Flow

1. **Title Screen** — logo, Play button, idle background animation.
2. **Mission Briefing** — configure forces before battle. This screen picks
   *who* fights; the two battle buttons at the bottom pick *how*:
   - Allied Forces: 1P / 2P / 3P toggle picks how many local human players.
     Each active player slot shows its control scheme (Move Forward/Back,
     Turn Left/Right, Fire), rebindable directly from this screen (click a
     key box, press the new key — same swap-conflict rule as the pause
     menu's Change Controls, extended across every player's bindings so no
     two players can ever share a key).
   - Every active tank slot, player or AI, also shows an editable name field
     (see section 9.4) — click it and type to rename that tank.
   - Enemy Forces: 0P / 1 / 2 / 3 toggle picks how many AI tanks. Each
     active AI slot independently picks Easy/Medium/Hard (all three tiers
     built and selectable).
     0 AI is only selectable when there are 2+ players (a 1-player, 0-AI
     match would have nothing to fight).
   - Two battle buttons, in place of the single "Battle!" this screen used
     to have. Both need 2+ tanks total and are disabled below that:
     - **All vs All Battle** — starts a free-for-all immediately.
     - **Teams Battle** — goes to the Team Setup screen (below). It does
       *not* check the team split, since Team Setup is where a bad split
       gets fixed; gating entry would be a dead end.
   - Scoreboard button (top-right corner) — only shown once at least one
     match has been tallied this session; opens the Scoreboard modal
     (section 9.1).
3. **Team Setup** — reached from Mission Briefing's "Teams Battle" button;
   see section 9.2 for the rules it enforces. Contains:
   - A "← Back" button (top-left) returning to Mission Briefing with the
     forces and assignments intact.
   - A radio pair, **Play All vs All** / **Play Teams**, so the match type
     can still be changed from here without navigating back. Arriving via
     "Teams Battle" selects Play Teams. Selecting Play All vs All dims the
     team boxes and makes the whole assignment area inert.
   - Each team's heading is an editable name field — click it and type to
     rename that team (section 9.4). Only editable in Play Teams.
   - Two boxes, **Team 1** and **Team 2**, holding a labeled tank token
     (P1/P2/P3/AI1/AI2/AI3, in that tank's own color) for every configured
     tank. Drag a token into the other box to reassign it; clicking a token
     swaps it to the other team instead, for trackpads. Dropping outside a
     box, or back into its own, changes nothing.
   - "▶ Battle!" — needs 2+ tanks and, in Play Teams, both teams occupied;
     disabled with an inline reason otherwise.
4. **Match Screen** — maze + every configured tank (labeled P1/P2/P3 for
   players, AI1/AI2/AI3 for AI, in spawn order) + power-up crates, small
   HUD (current weapon icon + ammo count per player — see HUD notes below
   for the multi-player case). Per player the HUD shows a weapon icon, the
   weapon name, and either shots remaining (a picked-up weapon) or bullets
   in flight (the base cannon, which never runs out), plus 🛡️(ready) while
   a shield charge is held but not yet activated, or a 🛡️ countdown once
   it's actually up. Weapon icons are small procedurally-drawn shapes
   (one per weapon — three barrels for gatling, a pellet fan for shotgun,
   a finned dart for missile, a badge outline for shield, a spiked ball
   for mine, a lightning bolt for laser) standing in for the real `icon_*`
   sprites until those land; the same icon draws in the HUD and on a
   map crate, which also shows the weapon's name as a readable label. In a
   team match each tank also flies a small team-colored flag (section 9.2).
5. **Result Screen** — "`<label>` Wins!" banner (green if the winner is a
   player, red if the winner is an AI tank, the winning team's own color if
   a team won; "Draw" in the rare simultaneous-kill case — see section 9),
   buttons:
   Rematch (new random maze, same configuration), Change Difficulty (back
   to Mission Briefing — the button keeps its original name from the
   single-AI era even though it now reconfigures the whole match, not just
   difficulty), Back to Title, and Scoreboard (opens the modal in 9.1).
   Below the buttons it shows the top two or three session awards (section
   9.3) rather than the full tally table — the numbers are one click away
   in the Scoreboard, and the awards are what's worth reading the moment a
   match ends.

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
bounce ping, explosion, victory/defeat jingles — still unbuilt. Mute
toggle in pause menu — still unbuilt.

**Power-up SFX (built):** three distinct synthesized cues per
GAME_SPEC.md section 4's crate lifecycle — a soft ambient chime when a
crate **appears**, a brighter chime when a tank **equips** one (drives
over it), and a weapon-specific sound the instant a tank **uses** one
(fires it): a short tick for the gatling, a noise-burst blast for the
shotgun, a rising whoosh for the missile launch, a low thunk for the mine
drop, and a rising sweep timed to the laser's charge for the laser. The
base cannon has no "use" sound — it isn't a power-up. The shield has no
"use" sound either — equipping it is its only action, already covered by
the equip chime.

---

## 9. Win/Lose Condition

Free-for-all is the default and is described here; 2-Team is an opt-in
alternative picked on the Mission Briefing screen (section 9.2).

In a free-for-all there is no team distinction between players and AI
(see section 5's Targeting note); a bullet destroys whatever tank it
touches regardless of who fired it. A destroyed tank plays a brief
explosion animation where it died and is removed from play, but the match
continues; it ends when exactly one tank remains, and that tank's
controller (a specific player, or a specific AI) wins. (Edge case: if the
last two-or-more tanks are destroyed in the same instant — e.g. a mutual
point-blank kill — treat it as a draw; no player/AI is declared the
winner.) Once the match-ending kill happens, the battlefield freezes
exactly as it stood at that moment (only the explosion keeps animating)
for 2 seconds before the Result Screen appears, so the final death reads
clearly instead of cutting away instantly.

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
- In all-vs-all, a win is credited to the last tank standing. In a team
  match it's credited to every tank on the winning team, destroyed members
  included (section 9.2). A draw (simultaneous mutual kill, or both teams
  wiped in the same instant) credits no one.
- Stats survive Rematch, Change Difficulty, and Back to Title. Only an
  explicit Reset Stats button (on the Result Screen or the Briefing stats
  modal — see section 6) clears them. A page refresh also clears them,
  since nothing is persisted — no localStorage, per the no-backend/no-saves
  rule (section 10).
- Scoreboard tables color each stat by type rather than by tank: Win
  green, Kill red, Death white (white for contrast against this game's
  uniformly dark backgrounds — not computed dynamically, since nothing
  here uses a light background). A tank's name is plain white, not the
  tank's usual color; a team's name uses its team color.
- Shown in the in-match HUD (`src/ui/hud.js`, per-player, icon + number
  only) and in the **Scoreboard** modal (`src/ui/menu.js`).

**The Scoreboard modal** (renamed from "Session Stats"), opened from the
Mission Briefing button or the Result Screen, holds:

- **Tanks** — one row per slot used this session, **ranked by Wins**, with
  Kills breaking a tie, then fewest Deaths, then slot order, so two tanks
  with identical records never reshuffle arbitrarily between views.
- **Teams** — a separate table of the team tallies (section 9.2), shown
  only once a team match has been played.
- **Awards** — a button opening the awards modal (section 9.3).
- **Reset Stats** — asks for a Yes/No confirmation before wiping anything,
  since it can't be undone. It clears every tank and team tally; custom
  names are configuration, not stats, and are deliberately kept (9.4).

Two further counters are tracked per tank purely to feed the awards, and
are not shown as scoreboard columns: **self-kills** (destroyed by your own
ricochet) and **team-kills** (destroyed a teammate).

### 9.2 Team Mode (Team 1 vs Team 2)

An opt-in alternative to free-for-all, entered with Mission Briefing's
"Teams Battle" button (section 6). All-vs-all remains the default and is
completely unaffected by everything in this section.

**Assignment.** Every configured tank — human or AI, any mix, up to 6 total
— is assigned to Team 1 or Team 2 by hand on the Team Setup screen. There
is no auto-balance. Uneven teams are allowed and supported on purpose (e.g.
1 human vs 3 AI). The default split is every human on Team 1 vs every AI on
Team 2; any tank can be moved to either team.

- Assignments are stored per slot label (P1–P3, AI1–AI3), like the session
  stats in 9.1, so they survive changing the player/AI counts, switching
  match type back and forth, and coming back from a match. They are *not*
  auto-corrected when the counts change — if the current counts leave one
  team empty, Battle is disabled with an inline reason until the player
  fixes the split themselves.
- Both teams must have at least one tank for a match to start.
- Team colors (Team 1 blue, Team 2 orange) are a team identity of their
  own, distinct from each tank's individual color, since a team is a mix
  of human and AI tanks.

**In-match identification.** Each tank flies a small team-colored flag,
drawn as a separate pass layered over the tank rather than as part of the
tank itself: the tank keeps its own color and the flag stays upright while
the tank rotates beneath it. The P1/AI1 label above each tank stays white
in both match types — the flag is the only team cue on the map.

**Win condition.** The match ends when every tank on one team is destroyed,
and the surviving team wins (last team standing) — the team-level
equivalent of all-vs-all's last-tank-standing. If the last tanks on both
teams are destroyed in the same instant, it's a draw and neither team wins,
matching the simultaneous-kill rule in section 9. All-vs-all's own win
logic is untouched by this.

**Friendly fire: ON.** A bullet destroys whatever tank it touches, teammates
included — exactly as in free-for-all, with no team-based exemption in the
collision rule. Teams change who the AI *aims at* and how the match ends,
not what a bullet does when it lands. The bounce mechanic stays equally
dangerous for everyone in tight corridors, and self-kill via your own
ricochet (section 3.2) remains intentional.

- Killing a teammate credits the shooter a kill and the teammate a death,
  same as any other kill (section 9.1) — there is no separate "own goal"
  tally.
- AI still never *targets* a teammate (section 5) — it just isn't protected
  from a stray bounce.

**Win credit.** A team win credits a 🏆 Win to **every** tank on the winning
team, including ones destroyed earlier in the match — the win belongs to the
team, not to whoever happened to survive it (see section 9.1). A draw
credits no one, as in all-vs-all.

**Team tallies.** Team 1 and Team 2 each keep their own Win/Kill/Death
totals, shown as a separate table in the Scoreboard (section 9.1) rather
than mixed into the per-tank rows. Each event is credited to whichever team
that tank was on *at the time*, not to whoever is on the team now — teams
get reshuffled between matches, so summing the current roster's stats on
demand would credit a team with kills scored while that tank was on the
other side. A team win counts once for the team, not once per member.

### 9.3 Session Awards ("fun facts")

Light-hearted titles handed out from the session tallies — bragging rights
and material for taking the mickey out of whoever is having a bad night.
Computed in `src/ui/awards.js`, which is pure calculation and does no
drawing.

- Judged across the **whole session**, not a single match, so the titles
  accumulate meaning as the night goes on.
- Every award **explains itself on hover** — a tooltip describing what it
  actually measures, since half the titles are jokes rather than
  self-evident labels.
- **Exactly one name per award.** If two tanks are genuinely level on the
  value an award measures (e.g. both on 3 kills for Most Deadly), the
  award is **suppressed entirely** that session rather than crediting
  either one — no award ever reads as a list of names.
- An award only appears when it says something. Awards that every tank
  would qualify for (everyone on zero kills at session start) are
  suppressed, and nothing at all is shown until a match has produced some
  kills, deaths, or wins.

**Reveal.** Awards are shown one at a time, credits-style, rather than as a
static list — each one fades in, holds briefly, then the next takes its
place. This plays on both the Result Screen (top two or three) and the
Awards modal (the full set). A click, or any key press, immediately
advances to the next award for anyone who doesn't want to wait out the
pace; once every applicable award has been shown, the sequence just stops.

| Award | Held by |
|---|---|
| **Team Killer** | Destroyed the most teammates |
| **Own Goal Enthusiast** | Destroyed by their own ricochet most often |
| **Untouchable** | Never destroyed at all, having scored or won |
| **Champion** | Most wins |
| **Most Deadly** | Most kills |
| **Sharpshooter** | Best kill/death ratio |
| **Victim of the Situation** | Most deaths |
| **Cannon Fodder** | Worst kill/death ratio |
| **Glass Cannon** | Above-average kills *and* above-average deaths |
| **Pacifist** | No kills at all |
| **Participation Trophy** | Played, never won |
| **Wallflower** | Below-average kills *and* below-average deaths |

That order is also the **priority order**: the Result Screen shows only the
first two or three that currently apply, so the rare and funny ones outrank
the routine ones. The full list lives in the awards modal, opened from the
Scoreboard (section 9.1). "Held by" in the table above is aspirational —
in practice an award only shows when exactly one tank qualifies for it,
per the tie rule above.

### 9.4 Custom Names

Every tank slot (P1–P3, AI1–AI3) and both teams can be renamed.

- **Tanks** are renamed on the Mission Briefing screen — the name field
  sits directly after that tank's own label ("PLAYER 1  [Izzad]" /
  "AI 1  [Bolt]"), not floating above it. **Teams** are renamed on the Team
  Setup screen, by clicking the team's heading.
- Names are capped at **8 characters** — enough for a first name, short
  enough that labels above two nearby tanks don't collide on the maze.
- Text entry is drawn on the canvas, using the same "click it, then press
  keys" idiom as key rebinding, because this game has no DOM UI. Typing and
  Backspace only; three ways to finish an edit:
  - **Enter**, or clicking the small checkmark button inside the field's
    right edge — both commit immediately, no confirmation needed.
  - **Escape** — cancels immediately, no confirmation needed.
  - **Clicking anything else** (another field, any button) while the text
    actually changed — swallows that click and asks **Keep / Discard**
    first. The click that triggered the dialog is *not* carried out
    afterward; the user clicks it again once the name is resolved. If
    nothing was actually changed, clicking away just closes the edit
    silently and lets that click proceed normally.
- Clearing the field (Backspace to empty, then commit) restores the default
  name (P1, Team 1, etc).
- A custom name is **display only**. Stats stay keyed by slot label
  internally, so renaming P1 to "Izzad" keeps that slot's existing history
  rather than starting a new row, and Reset Stats never clears a name.
- The name replaces the label everywhere it appears: above the tank on the
  maze, in the HUD, on the Team Setup tokens, in the Scoreboard, in the
  awards, and in the Result Screen's "`<name>` Wins!" banner.

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
