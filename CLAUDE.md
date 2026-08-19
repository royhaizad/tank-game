# Pixel Tank Duel — Project Rules

## Stack
- Vanilla HTML/CSS/JavaScript only. NO frameworks, NO npm packages, NO build step.
- Game must run by opening index.html directly in a browser (offline-first, no server).

## Structure
- Game logic lives in src/, organized by entities/ai/engine/ui (see folder tree in README.md)
- Full game design spec is in docs/GAME_SPEC.md — always check it before implementing a feature.

## Workflow
- Branch naming: feat/<name>, fix/<name>, chore/<name>
- Never commit directly to main — always a feature branch + PR, even solo.
- Keep commits small and scoped to one change.
- After implementing a feature, tell me how to manually test it in the browser.

## Keeping Docs in Sync (do this every time, not just when reminded)
- Whenever you change or add a game mechanic/feature, before committing:
  1. Check whether docs/GAME_SPEC.md needs updating (new mechanic added,
     existing mechanic changed, or something moved out of the "Out of
     Scope" section) — update it if so.
  2. Add a one-line entry to docs/CHANGELOG.md describing what changed.
  3. If the change affects project rules themselves (e.g. adds a new
     folder, changes the tech stack, changes a Non-negotiable below),
     update this CLAUDE.md file too.
  4. Tell me explicitly which files you updated, as part of your summary,
     so I always know what changed without having to ask.
- If you're not sure whether a file needs updating, err on the side of
  checking it and telling me your reasoning, rather than skipping it.

## Non-negotiables
- Bullets must bounce off walls (mirror-angle reflection), never disappear on wall contact.
- Do not add a backend, database, or login system. Ever.
