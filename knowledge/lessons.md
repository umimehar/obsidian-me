---
title: Lessons
tags: [knowledge, lessons]
created: 2026-07-13
updated: 2026-07-13
status: active
type: permanent
---

# Lessons

Corrections, tool quirks, and recurring debugging patterns captured across sessions. One rule per mistake; absolute directives; lead with why; concrete commands and paths.

**Scope: structural and cross-cutting only.** A lesson tied to one endeavor lives in that endeavor's folder (`personal/<name>/notes/<slug>.md`, or `projects/<name>/lessons.md` for a code project), NOT here.

## Format & supersession

Each entry is `### <short-rule-title> (YYYY-MM-DD)` — the slug is its `(subject, relation)` key for dedup — with a `Why:` (1 to 3 bullets) then an `ALWAYS`/`NEVER` rule carrying the concrete command/path. Never leave two live rules in conflict on the same subject: **update in place** for a refinement (bump the date), or **supersede** a now-wrong rule with a one-line tombstone `> ⊘ Superseded YYYY-MM-DD by [[#<new-slug>]]: <reason>`.

Prose format: one line per paragraph and per list item — never hard-wrap at a fixed column.

## Vault

### config lives only in the dev vault (2026-08-04)

Why:
- Two copies of Claude Code config drift apart, and the copy you are not looking at is the one that goes stale.
- The `config/claude/` and `config/git-hooks/` folders this vault's docs described never existed on disk, so `core.hooksPath` pointed at nothing and the "pre-commit masking guard" was a phantom safety net for three weeks.

NEVER create a `config/` folder in `obsidian-me`. Claude Code config — `CLAUDE.md`, skills, MCP definitions in `mcp/mcp.json`, hooks, statusline — is owned solely by `~/obsidian/obsidian-dev/config/claude/` and symlinked into `~/.claude/` by `bootstrap.sh`. Add a skill or an MCP server there and re-run `python3 mcp/register-mcp.py`; never drop one into `~/.claude/skills/` directly, or the next device will not have it.

### pin mcp<2 for stdio servers that import McpError (2026-08-04)

Why:
- `mcp` 2.0.0 removed `McpError` from `mcp.shared.exceptions`. `mcp-server-reddit` (0.2.1, unmaintained) and `mcp-server-fetch` import it at module load, so an unpinned `uvx` run dies with `ImportError` before the JSON-RPC handshake.
- Claude Code reports that as a bare `Connection closed`, which says nothing about the cause and sends you looking at the wrong layer.

ALWAYS diagnose an MCP `Connection closed` by running the server's command by hand and reading stderr, not by re-registering it. For these two the fix is `uvx --with "mcp<2" <server>`; drop the pin when either package ships a 2.x-compatible release.
