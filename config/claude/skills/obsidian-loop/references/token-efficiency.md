# Token efficiency — spend context on signal, not noise

Extended guidance for the "Execute" step. The SKILL.md hot path keeps only the one-line rule; the detail lives here and is loaded on demand.

Re-sent context, not the current prompt, is the bulk of the bill: every file read and tool dump is re-billed on every later turn. Keep the loop lean:

- **Start each ticket with a clean context.** One ticket at a time means nothing to carry over; clear the context or start a fresh session before a new claim (for example `/clear` in Claude Code, a new chat in Cursor, or restarting your CLI) so a prior ticket's file reads and tool output stop riding along on every turn.
- **Read narrowly.** Load the ticket note plus only the exact files the task needs, never the whole vault or repo. Inspect the queue with the read-only selector instead of loading every ticket into chat; use `rg`/`fd` and targeted reads over broad dumps; name the file and line to skip expensive exploration.
- **Filter tool output before it enters context.** Pipe noisy commands through `grep`/`head`/`tail`; never paste raw logs or full test output, extract the failing lines. For a large artifact, write it to a scratch file and reference the path, reading on demand — retrieval is paid once, context is re-billed every turn.
- **Distill subagent results.** Subagents return a short structured brief, not their raw tool trace. Skip subagents for trivial shell/git steps: the prompt and tool-definition overhead costs more than it saves.
- **Commit often as checkpoints.** The atomic `kanban:` commits plus the ticket Worklog ARE the durable state. After a compaction or reset, `git log`, `git diff`, and the Worklog reconstruct where you were, so context can be compacted safely without losing the thread.
- **Treat the ticket note as external memory.** Write decisions and progress to the Worklog, not an ever-growing chat scratch; do not re-read files you have already read.
- **Keep the stable prefix stable for prompt caching.** Do not churn the skill text, instruction files, or tool set mid-session; if your provider caches prompts (most hosted ones do), a steady static prefix keeps cache hits landing at a fraction of full input cost turn after turn, while rewrites invalidate the cache.
- **Route effort to the ticket.** Match reasoning effort and model to `effort` and `ticket_type`: low for chores/docs/mechanical edits, higher only for design-heavy features. Respect `control.md` `max_effort`; smaller or cheaper models are fine for well-scoped subagent grunt work.
