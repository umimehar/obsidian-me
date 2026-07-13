---
title: Git hooks (masking guard)
tags: [config, git, security]
created: 2026-07-13
updated: 2026-07-13
status: active
type: reference
---

# Git hooks — masking guard

`pre-commit` blocks any commit whose staged changes contain unmasked sensitive data (SIN, passport, card, account, IBAN, routing/transit/institution numbers, national id, tax file number, driver's licence).

## Install (per device, once)

```bash
git -C ~/obsidian/obsidian-me config core.hooksPath config/git-hooks
```

Verify: `git -C ~/obsidian/obsidian-me config core.hooksPath` should print `config/git-hooks`.

## How to satisfy it

Record sensitive fields with the value masked, keeping the label:

```
SIN: ****
Passport: ****
Account: **** (ending 1234)
```

Last-4 digits alone (e.g. `ending 1234`) do not trip the guard.

## Notes

- The Obsidian Git plugin uses isomorphic-git and does NOT run native hooks, so vault auto-backup commits bypass this guard by design. It guards CLI / agent commits — which is where notes are authored.
- Escape hatch (only when a match is genuinely not a secret): `SKIP_MASK_HOOK=1 git commit ...` or `git commit --no-verify`.
- Scope: added lines of the staged diff only. A masked `****` value has no digit run, so it passes.
