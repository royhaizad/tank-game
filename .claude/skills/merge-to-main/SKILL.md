---
name: merge-to-main
description: Ship a finished feature/fix/chore branch to main in this repo — commit, push, open a PR, squash-merge it, and clean up branches. Use when the user says things like "merge this to main", "ship this branch", "open a PR for this", or work on a feature branch is done and tested.
---

# Merge to main

This repo (Pixel Tank Duel) uses **one git worktree per branch** — separate
folders like `Tank Game`, `Tank Game - bullet-tuning`, `Tank Game -
session-stats` all sharing the same `.git`. That layout breaks a couple of
`gh`'s default assumptions, handled below. Per `CLAUDE.md`: never commit
directly to `main`, always a feature branch + PR, even solo.

## Preconditions

- You're on a `feat/<name>` / `fix/<name>` / `chore/<name>` branch with
  committed-worthy changes, already tested per CLAUDE.md's "tell me how to
  manually test it" rule.
- If the change touches a game mechanic, the CLAUDE.md "Keeping Docs in
  Sync" steps (GAME_SPEC.md, CHANGELOG.md, HANDOFF.md, CLAUDE.md itself)
  should already be done *before* this skill runs — this skill only ships
  what's already there, it doesn't audit docs.

## Steps

1. **Review and stage explicitly** — never `git add -A`. Check `git
   status` / `git diff` first, then stage only the files that belong to
   this change:
   ```bash
   git add <file1> <file2> ...
   ```

2. **Commit** with a message explaining *why*, not just *what*:
   ```bash
   git commit -m "short summary of the change"
   ```

3. **Push the branch**:
   ```bash
   git push -u origin <branch-name>
   ```

4. **Open the PR**:
   ```bash
   gh pr create --title "..." --body "$(cat <<'EOF'
   ## Summary
   - ...

   ## Test plan
   - [x] ...
   EOF
   )"
   ```

5. **Confirm merge strategy with the user** if not already stated this
   session (default recommendation: squash-merge, keeps `main` history to
   one commit per feature for solo work). Also confirm whether *you*
   should merge it or whether the user wants to click merge on GitHub
   themselves — merging into `main` is a shared-state action, treat it
   like the other "ask first" actions.

6. **Merge — do NOT pass `--delete-branch`.** In a worktree layout, `gh pr
   merge --delete-branch` tries to switch this worktree to `main` to
   delete the local branch, and fails with `fatal: 'main' is already used
   by worktree at ...` because `main` is checked out in a different
   worktree folder. Delete branches as separate steps instead:
   ```bash
   gh pr merge <PR#> --squash
   ```

7. **Delete the remote branch**:
   ```bash
   git push origin --delete <branch-name>
   ```

8. **From the `main` worktree** (not this one — `cd` to the `Tank Game`
   folder, the one with `[main]` in `git worktree list`), sync and delete
   the local branch reference:
   ```bash
   git pull origin main
   git branch -D <branch-name>
   ```
   Use `-D` (force), not `-d`. After a squash-merge the commit hashes on
   the feature branch don't match anything on `main`, so git can't
   recognize it as "fully merged" the normal way and `-d` will refuse —
   that's expected and safe once GitHub confirms the PR merged.

9. **Leave the now-empty feature worktree folder for the user to delete**
   (e.g. `Tank Game - <branch-name>`). `git worktree remove` (or a plain
   `rmdir`) on it must be run from a session/terminal that is *not*
   itself sitting inside that folder as its working directory — Windows
   locks a directory that's a process's CWD and refuses to delete it, even
   with `--force`. Don't attempt this from the same session that has that
   folder as its primary working directory; tell the user to run it
   themselves, or run it from a different already-open session/terminal.

## Gotchas specific to this repo

- `.claude/` is entirely gitignored except this skills folder is meant to
  be tracked — if `.gitignore` still blanket-ignores `.claude/`, this file
  itself won't sync to other worktrees via git. Check `.gitignore` if the
  skill seems to "disappear" in a fresh worktree.
- Bash tool cwd does not persist a plain `cd` across separate tool calls —
  each command needs its own `cd "<worktree path>" &&` prefix when
  operating on a worktree other than the default one.
