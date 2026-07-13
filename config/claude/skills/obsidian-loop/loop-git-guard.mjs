#!/usr/bin/env node
// loop-git-guard.mjs — pause/resume the Obsidian git plugin's auto-commit for the duration of an
// obsidian-loop run, so the plugin cannot sweep a run's edits into a `vault backup:` commit mid run.
//
// How it works: the obsidian-git plugin (>=2.38) implements Obsidian's `onExternalSettingsChange`
// hook, which reloads its settings and RESTARTS the auto-backup timer whenever its `data.json`
// changes on disk. So writing `autoSaveInterval: 0` to that gitignored file pauses the live timer,
// and restoring the original value resumes it — no UI, no editing `control.md`, no vault commit.
//
// The original values live in a sentinel state file (default `~/.local/state/obsidian-loop/
// git-guard.json`). The sentinel — not the current data.json — is the source of truth for the
// owner's real setting, so a crashed run that left auto-commit disabled is self-healed on the next
// `resume`/preflight `status` rather than saving `0` as if it were the original.
//
// Node ESM, Bun-compatible: `node:` builtins only, zero npm deps, no build step. Matches the sibling
// `select-tickets.mjs` tooling. Commands: `pause`, `resume`, `status`.

import { readFileSync, writeFileSync, existsSync, mkdirSync, rmSync, renameSync } from "node:fs";
import { homedir } from "node:os";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const DATA_REL = join(".obsidian", "plugins", "obsidian-git", "data.json");
const SENTINEL_NAME = "git-guard.json";

// --- pure logic (unit-tested) ---------------------------------------------

/**
 * Compute the paused data.json and the original values to persist.
 * When a sentinel already exists (a prior pause), keep ITS original values so a
 * repeated pause never captures the already-zeroed interval as the "original".
 */
export function planPause(data, existingSentinel) {
  const original = existingSentinel
    ? {
        autoSaveInterval: existingSentinel.autoSaveInterval,
        autoBackupAfterFileChange: existingSentinel.autoBackupAfterFileChange,
      }
    : {
        autoSaveInterval: data.autoSaveInterval ?? 0,
        autoBackupAfterFileChange: data.autoBackupAfterFileChange ?? false,
      };
  return {
    data: { ...data, autoSaveInterval: 0, autoBackupAfterFileChange: false },
    original,
  };
}

/** Restore the saved values. With no sentinel this is a no-op. */
export function planResume(data, sentinel) {
  if (!sentinel) return { data, restored: false };
  return {
    data: {
      ...data,
      autoSaveInterval: sentinel.autoSaveInterval,
      autoBackupAfterFileChange: sentinel.autoBackupAfterFileChange,
    },
    restored: true,
  };
}

// --- IO helpers -----------------------------------------------------------

function stateDir() {
  return process.env.OBSIDIAN_LOOP_STATE_DIR || join(homedir(), ".local", "state", "obsidian-loop");
}

function sentinelPath() {
  return join(stateDir(), SENTINEL_NAME);
}

function defaultVault() {
  // Four levels up from this script (config/claude/skills/obsidian-loop/) is the vault root,
  // so a copy inside either vault defaults to its own vault. Callers override with --vault.
  return resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..");
}

function vaultPath(args) {
  const i = args.indexOf("--vault");
  if (i !== -1 && args[i + 1]) return args[i + 1];
  return defaultVault();
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

/** Write JSON atomically (tmp + rename) matching Obsidian's format: 2-space indent, no trailing newline. */
function writeJsonAtomic(path, obj) {
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.tmp-${process.pid}`;
  writeFileSync(tmp, JSON.stringify(obj, null, 2));
  renameSync(tmp, path);
}

/**
 * Read the sentinel resiliently. Returns `{ present, corrupt, value }` and never throws on bad JSON,
 * so a corrupt sentinel can never crash the preflight `status` self-heal check.
 */
function readSentinel() {
  const p = sentinelPath();
  if (!existsSync(p)) return { present: false, corrupt: false, value: null };
  try {
    return { present: true, corrupt: false, value: readJson(p) };
  } catch {
    return { present: true, corrupt: true, value: null };
  }
}

function obsidianRunning() {
  try {
    execFileSync("pgrep", ["-x", "Obsidian"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

// --- commands -------------------------------------------------------------

function dataPathFor(args) {
  const dp = join(vaultPath(args), DATA_REL);
  if (!existsSync(dp)) {
    console.error(`loop-git-guard: obsidian-git data.json not found at ${dp}`);
    console.error("  Is the vault path correct and the obsidian-git plugin installed?");
    process.exit(2);
  }
  return dp;
}

function cmdPause(args) {
  const dp = dataPathFor(args);
  const data = readJson(dp);
  const existing = readSentinel();
  if (existing.corrupt) {
    console.error(
      `loop-git-guard: sentinel at ${sentinelPath()} is unreadable. Set autoSaveInterval in Obsidian ` +
        `settings, delete that file, then pause again — refusing to overwrite an unknown paused state.`
    );
    process.exit(2);
  }
  const { data: next, original } = planPause(data, existing.value);

  const sentinel = {
    ...original,
    vault: vaultPath(args),
    pausedAt: new Date().toISOString(),
    pid: process.pid,
  };
  writeJsonAtomic(sentinelPath(), sentinel);
  writeJsonAtomic(dp, next);

  const live = obsidianRunning();
  console.log(
    `loop-git-guard: paused obsidian-git auto-commit (was autoSaveInterval=${original.autoSaveInterval}min).` +
      (live ? " Obsidian is running — the timer stops live." : " Obsidian not running — applies on next launch.")
  );
}

function cmdResume() {
  const s = readSentinel();
  if (!s.present) {
    console.log("loop-git-guard: nothing to resume (no sentinel).");
    return;
  }
  if (s.corrupt) {
    console.error(
      `loop-git-guard: sentinel at ${sentinelPath()} is unreadable; cannot recover the original ` +
        `autoSaveInterval. Set it in Obsidian settings, then delete that file to clear the paused state.`
    );
    process.exit(2);
  }
  // Restore into the exact vault the pause recorded, not whatever --vault resume was given.
  const dp = join(s.value.vault || defaultVault(), DATA_REL);
  if (!existsSync(dp)) {
    console.error(
      `loop-git-guard: data.json not found at ${dp}; clearing stale sentinel (nothing to restore).`
    );
    rmSync(sentinelPath(), { force: true });
    return;
  }
  const data = readJson(dp);
  const { data: next } = planResume(data, s.value);
  writeJsonAtomic(dp, next);
  rmSync(sentinelPath(), { force: true });
  console.log(
    `loop-git-guard: resumed obsidian-git auto-commit (autoSaveInterval=${s.value.autoSaveInterval}min).`
  );
}

function cmdStatus(args) {
  const dp = dataPathFor(args);
  const data = readJson(dp);
  const s = readSentinel();
  const out = {
    paused: s.present,
    autoSaveInterval: data.autoSaveInterval ?? 0,
    autoBackupAfterFileChange: data.autoBackupAfterFileChange ?? false,
    sentinelExists: s.present,
    sentinelCorrupt: s.corrupt,
    obsidianRunning: obsidianRunning(),
    originalAutoSaveInterval: s.value ? s.value.autoSaveInterval : null,
  };
  console.log(JSON.stringify(out, null, 2));
}

function main() {
  const [cmd, ...args] = process.argv.slice(2);
  switch (cmd) {
    case "pause":
      return cmdPause(args);
    case "resume":
      return cmdResume();
    case "status":
      return cmdStatus(args);
    default:
      console.error("usage: loop-git-guard.mjs <pause|resume|status> [--vault <path>]");
      process.exit(1);
  }
}

// Run only as a CLI, not when imported by the test file.
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
