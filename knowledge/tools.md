---
title: Dev Tools & CLIs
tags: [knowledge, tools]
created: 2026-04-15
updated: 2026-10-20
status: active
type: permanent
---

# Dev Tools & CLIs

Tools, configurations, and CLI commands used across projects.

## Editor & IDE

<!-- VS Code extensions, settings, keybindings -->

## Terminal & Shell

<!-- zsh config, aliases, useful commands -->

## Git

<!-- Aliases, workflows, useful commands -->

## Docker

<!-- Common compose patterns, useful commands -->

## Database

<!-- psql commands, migration tools, backup scripts -->

## Cloud / Hosting

<!-- Vercel, Railway, AWS CLI commands -->

## Monitoring

<!-- Logging, error tracking, performance monitoring -->

## Local LLMs

First stop whenever a task calls for running a model locally on the Mac: [MTPLX](https://mtplx.com/). Free, open source (Apache 2.0), native Mac app for Apple Silicon (macOS 14+, ~60 MB DMG). Version v2.12.2 as of 2026-10-20, not installed yet.

- Why it is fast: native MTP speculative decoding, the model's own multi token prediction head drafts ahead and the main model verifies, so output is identical to plain decoding. Vendor claims about 2x, up to 2.69x on Qwen 3.6 27B (M5 Max numbers, unverified on our M4 Max 128 GB).
- What it gives you: chat app, an OpenAI and Anthropic compatible local server, one click launch for OpenCode, Pi and Hermes, and Forge, which converts a Hugging Face model to MLX and measures the speedup.
- Models: Qwen 3.8 Flash Next (125B MoE), Qwen 3.8 27B, Qwen 3.6 27B, plus small packs for 16 GB Macs (Ternary Bonsai 2 27B, MiMo V2.6 9B coder).
- Good uses: bulk work that needs no judgment (log summarizing, commit message drafts, labeling), a first pass that shrinks long output before Claude reads it, and an offline or rate limited fallback. Not a replacement for Claude driving crew or loop sessions.
- Alternatives if MTPLX does not fit: `mlx-lm` for scripting, `llama-server` (llama.cpp) for long context and GGUF, and ollaya (port 11435) for Jev style typed decision models such as `laya`, `decider` and `winnow`. ollaya's installer pipes a script to the shell, so read it first.
