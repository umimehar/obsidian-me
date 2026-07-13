# Board drift — plugin reflow and git auto-backup race

Extended guidance for the "Board hygiene" step. The SKILL.md hot path keeps a two-line summary and points here; the detail lives in this file and is loaded on demand.

## Kanban plugin board drift

The Obsidian Kanban plugin rewrites `*/board.md` out of band while the app is open: it reflows blank lines, drops the trailing newline, and can move a card to another column. That produces board vs frontmatter drift and a dirty tree that blocks the next `git pull --rebase`.
For a plugin auto-reflow, **frontmatter is the source of truth**: after any board edit, run `git status` and reconcile the board to match ticket frontmatter before committing (`--card-presence` catches presence drift). Exception — a deliberate HUMAN card drag is a triage signal, and when it is the newer change it wins: reconcile frontmatter to match the moved card (check `git log`/timestamps to tell which side changed last). Prefer closing boards in Obsidian during agent runs. See `knowledge/lessons.md` (`obsidian-kanban-plugin-rewrites-boards-out-of-band`) and TCK-0028.

## Git auto-backup commit race

The Obsidian git plugin auto commits and syncs the whole vault on an interval (owner set it to 20 min and enabled "auto commit-and-sync after stopping file edits", which suppresses a commit WHILE a file is being edited). It can still fire between your edits, mid run: it sweeps every unstaged change, including another session's in flight work and file deletions, into a generic `vault backup: <timestamp>` commit, and it leaves a dirty tree that blocks your next `git pull --rebase`. **No work is ever LOST to this race — every change is captured; only per commit provenance (which tidy `feat:`/`kanban:` message owns which change) is at risk.** So the guard targets provenance, not data recovery:

- **Keep your own commits atomic.** Before crafting a commit, run `git -C "$VAULT" status --short`. If foreign changes you did not make are present (another session's edits, deletions), commit THOSE first as their own `vault backup: <what>` commit, then make your `kanban:`/feature commit touching only its intended files. Never let the plugin fold your feature work into a backup commit.
- **A dirty tree at preflight is often this race, not corruption.** Reconcile by authorship: preserve foreign work in a backup commit (never `git stash`, never discard), restore anything still referenced that was deleted (`git checkout -- <path>`), then proceed.
- **Beware masked exit codes.** `git pull --rebase 2>&1 | tail -1 && <edits>` runs the edits even when the pull FAILED, because the pipeline's exit status is `tail`'s. Check the pull result on its own line before chaining edits.
- Prefer pausing the plugin's auto commit during long agent runs; the owner's 20 min + after-edit settings only narrow the window, they do not close it. The `loop-git-guard.mjs` guard automates the pause (TCK-0030 / TCK-0032).
