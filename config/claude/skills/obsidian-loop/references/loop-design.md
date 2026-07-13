# Portability and loop-design sources

Background for the loop. Not needed on the hot path; loaded on demand.

## Portability

This skill is tool-agnostic: the protocol is prose plus a plain Node (`.mjs`, Bun-compatible) selector and `git`, so it runs under Claude Code, Cursor, Codex, Gemini CLI, or a local LLM. Anything tool-specific in the SKILL.md hot path (session-transcript paths, the `superpowers` skills, `/clear`) is given as an example with a generic fallback — substitute your tool's equivalent. Install differs per tool (see this skill's `README.md`).

## References (parallelism + loop design)

The sources below are provider-illustrative; the underlying principles are tool-agnostic.

- Anthropic, "How we built our multi-agent research system": orchestrator/worker architecture, lead agent spawns 3 to 5 parallel subagents, each with a complete delegation brief (objective, output format, tools, boundaries). https://www.anthropic.com/engineering/multi-agent-research-system
- Anthropic, "Multi-agent coordination patterns": subagents (bounded, report once) vs agent teams (persistent, accumulate context). https://claude.com/blog/multi-agent-coordination-patterns
- Claude Code agent teams. https://code.claude.com/docs/en/agent-teams
- Loop engineering (ReAct to loop engineering): verifiable goals, iteration limits, no blind retries. https://datasciencedojo.com/blog/agentic-loops-explained-from-react-to-loop-engineering-2026-guide/
- Claude Code cost management: prompt caching, auto-compaction, lean `CLAUDE.md`, `/clear`, scoped reads, model/effort routing. https://code.claude.com/docs/en/costs
- Anthropic prompt caching: cache the stable prefix, keep dynamic content at the end. https://www.anthropic.com/news/prompt-caching
- Effective context engineering (offload large tool output to files, curate for information density, git commits as post-compaction checkpoints). https://arize.com/blog/context-management-in-agent-harnesses/
