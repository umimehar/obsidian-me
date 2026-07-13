#!/bin/sh
# One command that runs every guardrail-script test suite under config/claude/skills/.
# Covers select-tickets, memory-lint, loop-git-guard, memory-rebuild, and memory-recall
# by discovering every *.test.mjs, so a new one is picked up automatically. Exits non-zero
# on any failure, so it drops straight into the pre-commit hook and any CI job.
#
# `find -exec ... +` passes an explicit file list to a single `node --test`, so it works on
# any Node version — unlike `node --test '**/*.test.mjs'`, whose glob support needs Node >= 21.
#
# Usage: sh config/claude/skills/run-tests.sh
ROOT=$(git rev-parse --show-toplevel 2>/dev/null) || ROOT=$(cd "$(dirname "$0")/../../.." && pwd)
exec find "$ROOT/config/claude/skills" -name '*.test.mjs' -exec node --test {} +
