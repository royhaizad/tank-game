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

## Non-negotiables
- Bullets must bounce off walls (mirror-angle reflection), never disappear on wall contact.
- Do not add a backend, database, or login system. Ever.
