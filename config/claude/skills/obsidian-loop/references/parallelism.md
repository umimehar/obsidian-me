# Parallelism and subagent routing

Extended guidance for the "Execute" step of the loop. The SKILL.md hot path keeps only the one-line rule; the detail lives here and is loaded on demand.

## Use subagents whenever work is genuinely independent

- **One claim, parallel work inside it.** This device holds at most one claimed ticket at a time; parallelism happens WITHIN that ticket, never by claiming several at once (that invites claim races and a dishonest board).
- **Map dependencies first, then fan out.** Split the ticket into subtasks. Anything that writes the same file, or needs another subtask's output, stays sequential. Dispatch only genuinely independent subtasks (auditing several repos, researching multiple sources, editing unrelated files) to 3 to 5 parallel subagents, then synthesize their results (fan-out then fan-in). Correctly parallelized independent work cuts wall-clock time substantially.
- **Offload exploration to keep this loop's context clean.** Searching a large repo, reading docs, or investigating an independent question goes to a subagent that returns only distilled findings, so the orchestrator context stays focused on the ticket.
- **Give each subagent a complete brief.** A subagent cannot ask follow-ups, so the first message carries everything: the objective, the exact files/paths and repo, the tools to use, the boundaries, and the output format. Ask for structured output (JSON or clearly delimited sections) so merging is trivial. Do not paste the whole conversation; send only what the subtask needs.
- **Subagents vs agent teams.** Use subagents for short, bounded subtasks that report back once (the common case). Use an agent team only for sustained, multi-step work where teammates must accumulate domain context and coordinate, for example a migration spanning several repos. Teams cost far more tokens; do not reach for them on interdependent or single-file work. If your tool ships these patterns as skills (for example `superpowers:dispatching-parallel-agents` and `superpowers:subagent-driven-development`), use them; otherwise apply the pattern directly.
- **No subagents? Degrade gracefully.** If your tool or model has no subagent/parallel support (many local LLM setups), do the subtasks sequentially in one session — the rest of the protocol is unchanged.
- **Coding caveat.** Most ticket work has few truly parallel parts. Default to a single focused session or lightweight subagents; reserve fan-out for genuinely independent, high-value work.

## Subagent model routing

When fanning out to subagents, route by role:

- **Execution subagents** (writing code, editing files, TDD, running the actual ticket work) run on a capable execution model (Sonnet or Opus). NEVER use the `fable` model for execution.
- **`fable` is for advice, selection, and decisions only** — when the orchestrator needs a judgment call or a choice made and would otherwise block, spawn a `fable` agent to decide, not to build.

Parallel execution across genuinely independent tracks (disjoint file sets) is encouraged; keep all git and kanban bookkeeping in the orchestrator so worker subagents only touch their own code files.
