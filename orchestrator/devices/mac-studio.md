---
title: "Device — mac-studio"
tags:
  - meta/system
  - device
created: 2026-07-13
updated: 2026-08-19
status: active
type: device
slug: mac-studio
hostname: Mac
computer_name: Mac Studio
os: macos
capabilities:
  - claude-code
  - node
  - python
  - uv
  - git
repos: []
daemon: false
last_heartbeat: 2026-08-19T16:14:24
---

# Device — mac-studio

Personal Mac Studio (macOS 26.5, `ComputerName` **Mac Studio**). First device registered in this vault's fleet. Runs Claude Code interactively; the autonomous daemon lane is off here (`daemon: false`, and the slug is absent from `control.md` `devices_enabled`).

Claude Code config (MCP servers + session skills) lives only in the `dev` vault at `~/obsidian/obsidian-dev/config/claude/`, symlinked into `~/.claude/`. This vault carries no `config/` folder.

New devices join by cloning the vault and adding their own file in this folder (see [[orchestrator/design|design spec]], Device identity).
