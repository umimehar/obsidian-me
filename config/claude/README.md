---
title: Claude Code config (personal vault)
tags: [config, claude, tooling]
created: 2026-07-13
updated: 2026-07-13
status: active
type: reference
---

# Claude Code config — personal vault

This vault's **own** standalone Claude Code config. It is intentionally NOT symlinked from the `dev` vault — the two vaults keep independent, minimal configs so a device can use the union of both.

## What's here

- `mcp/mcp.json` — MCP servers for this vault: **obsidian**, **reddit**, **context7**, **sequential-thinking**. Kept minimal on purpose; add more as you need them.
- `.env.example` — per-device secrets template. Copy to `.env` (gitignored) and fill `OBSIDIAN_API_KEY` with **this** vault's Local REST API key.
- `skills/` — this vault's session skills: `obsidian-save`, `obsidian-resume`.

## New device — setup

```bash
cd ~/obsidian/obsidian-me/config/claude
cp .env.example .env && $EDITOR .env       # fill OBSIDIAN_API_KEY (this vault's key)

# masking guard (blocks committing unmasked secrets)
git -C ~/obsidian/obsidian-me config core.hooksPath config/git-hooks
```

Register the MCP servers with Claude Code by pointing it at `mcp/mcp.json`, or copy the entries into your `~/.mcp.json`. Install the session skills by copying `skills/<name>/SKILL.md` into `~/.claude/skills/<name>/` (or symlink this `skills/` dir). These are additive — they coexist with the `dev` vault's config.

> **Note on collisions.** If you also symlink the `dev` vault's config into `~/.claude`, keep only one copy of each same-named skill on `PATH`. The skills here detect the active vault by its folder name, so a single shared copy works for both vaults.
