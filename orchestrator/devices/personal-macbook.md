---
title: "Device — personal-macbook"
tags:
  - meta/system
  - device
created: 2026-10-07
updated: 2026-10-07
status: active
type: device
slug: personal-macbook
hostname: Mac
computer_name: MBP
os: macos
capabilities:
  - claude-code
  - node
  - python
  - uv
  - git
repos: []
daemon: false
last_heartbeat: 2026-10-07T18:15:12
---

# Device — personal-macbook

Personal MacBook Pro (`ComputerName` **MBP**). Its bare `hostname` reports `Mac`, which collides with [[mac-studio]]; `computer_name: MBP` disambiguates the two machines. Same slug as in the dev vault fleet.

Claude Code config lives only in the `dev` vault at `~/obsidian/obsidian-dev/config/claude/`, symlinked into `~/.claude/`.
