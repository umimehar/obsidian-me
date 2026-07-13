---
title: Orchestrator Control
tags:
  - meta/system
created: 2026-07-02
updated: 2026-07-02
status: active
type: control
loop: paused
max_tickets_per_day: 5
max_effort: medium
allowed_types:
  - research
  - docs
  - chore
  - test
require_review: false
devices_enabled: []
---

# Orchestrator Control

The cockpit for the autonomous lane. Every daemon reads this file before every action.

- `loop: paused` → every daemon stands down on its next wake. This is the kill switch.
- `devices_enabled` → only these device slugs may run the daemon.
- `allowed_types` + `max_effort` + `max_tickets_per_day` bound what the daemon may claim.
- `require_review` → who reviews finished work. `true` → a human must review every ticket: the loop stops in `Review` and waits. `false` (default) → the loop runs a mandatory agent review at high effort and closes automatically to `Done` on pass. Either way, a single ticket can force human review with its own `human_review_required: true`.

Edit from any synced device (including phone). See [[orchestrator/design|design spec]].
