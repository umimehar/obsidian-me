import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, readFileSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { planPause, planResume } from "./loop-git-guard.mjs";

const SCRIPT = fileURLToPath(new URL("./loop-git-guard.mjs", import.meta.url));

const sampleData = () => ({
  commitMessage: "vault backup: {{date}}",
  autoSaveInterval: 20,
  autoPullInterval: 5,
  autoBackupAfterFileChange: false,
  syncMethod: "merge",
});

// --- pure logic -----------------------------------------------------------

test("planPause zeroes the interval and records the original", () => {
  const { data, original } = planPause(sampleData(), null);
  assert.equal(data.autoSaveInterval, 0);
  assert.equal(original.autoSaveInterval, 20);
});

test("planPause preserves unrelated keys untouched", () => {
  const { data } = planPause(sampleData(), null);
  assert.equal(data.commitMessage, "vault backup: {{date}}");
  assert.equal(data.autoPullInterval, 5);
  assert.equal(data.syncMethod, "merge");
});

test("planPause also disables autoBackupAfterFileChange", () => {
  const on = { ...sampleData(), autoBackupAfterFileChange: true };
  const { data, original } = planPause(on, null);
  assert.equal(data.autoBackupAfterFileChange, false);
  assert.equal(original.autoBackupAfterFileChange, true);
});

test("planPause with an existing sentinel keeps the TRUE original, not the already-zeroed value", () => {
  // A prior pause already set data to 0 and saved original=20 in the sentinel.
  const paused = { ...sampleData(), autoSaveInterval: 0 };
  const sentinel = { autoSaveInterval: 20, autoBackupAfterFileChange: false };
  const { original } = planPause(paused, sentinel);
  assert.equal(original.autoSaveInterval, 20, "must not capture 0 as the original");
});

test("planResume restores the saved interval", () => {
  const paused = { ...sampleData(), autoSaveInterval: 0 };
  const sentinel = { autoSaveInterval: 20, autoBackupAfterFileChange: true };
  const { data, restored } = planResume(paused, sentinel);
  assert.equal(restored, true);
  assert.equal(data.autoSaveInterval, 20);
  assert.equal(data.autoBackupAfterFileChange, true);
});

test("planResume with no sentinel is a no-op", () => {
  const d = sampleData();
  const { data, restored } = planResume(d, null);
  assert.equal(restored, false);
  assert.equal(data.autoSaveInterval, 20);
});

test("pause -> resume round trip returns the original data", () => {
  const before = sampleData();
  const { data: pausedData, original } = planPause(before, null);
  const { data: resumedData } = planResume(pausedData, original);
  assert.deepEqual(resumedData, before);
});

test("double pause then single resume still restores the original (idempotent pause)", () => {
  const before = sampleData();
  const p1 = planPause(before, null);
  const p2 = planPause(p1.data, p1.original); // second pause sees the sentinel
  const { data } = planResume(p2.data, p2.original);
  assert.equal(data.autoSaveInterval, 20);
});

// --- CLI integration ------------------------------------------------------

function makeVault() {
  const root = mkdtempSync(join(tmpdir(), "loop-git-guard-"));
  const pluginDir = join(root, ".obsidian", "plugins", "obsidian-git");
  execFileSync("mkdir", ["-p", pluginDir]);
  writeFileSync(join(pluginDir, "data.json"), JSON.stringify(sampleData(), null, 2));
  return root;
}

function run(args, env) {
  return execFileSync("node", [SCRIPT, ...args], {
    encoding: "utf8",
    env: { ...process.env, ...env },
  });
}

function runExpectFail(args, env) {
  try {
    execFileSync("node", [SCRIPT, ...args], { encoding: "utf8", env: { ...process.env, ...env }, stdio: "pipe" });
    throw new Error("expected a nonzero exit");
  } catch (e) {
    if (e.status == null) throw e;
    return e;
  }
}

test("CLI pause then resume leaves data.json byte-identical, sentinel cleaned up", () => {
  const vault = makeVault();
  const stateDir = mkdtempSync(join(tmpdir(), "loop-git-state-"));
  const env = { OBSIDIAN_LOOP_STATE_DIR: stateDir };
  const dataPath = join(vault, ".obsidian", "plugins", "obsidian-git", "data.json");
  const before = readFileSync(dataPath, "utf8");

  run(["pause", "--vault", vault], env);
  const paused = JSON.parse(readFileSync(dataPath, "utf8"));
  assert.equal(paused.autoSaveInterval, 0);
  assert.ok(existsSync(join(stateDir, "git-guard.json")), "sentinel written");

  run(["resume", "--vault", vault], env);
  assert.equal(readFileSync(dataPath, "utf8"), before, "data.json restored exactly");
  assert.ok(!existsSync(join(stateDir, "git-guard.json")), "sentinel removed");

  rmSync(vault, { recursive: true, force: true });
  rmSync(stateDir, { recursive: true, force: true });
});

test("CLI status reports paused state and exits 0", () => {
  const vault = makeVault();
  const stateDir = mkdtempSync(join(tmpdir(), "loop-git-state-"));
  const env = { OBSIDIAN_LOOP_STATE_DIR: stateDir };

  const out1 = JSON.parse(run(["status", "--vault", vault], env));
  assert.equal(out1.paused, false);
  assert.equal(out1.autoSaveInterval, 20);

  run(["pause", "--vault", vault], env);
  const out2 = JSON.parse(run(["status", "--vault", vault], env));
  assert.equal(out2.paused, true);
  assert.equal(out2.autoSaveInterval, 0);

  rmSync(vault, { recursive: true, force: true });
  rmSync(stateDir, { recursive: true, force: true });
});

test("CLI resume with no sentinel is a safe no-op (self-heal friendly)", () => {
  const vault = makeVault();
  const stateDir = mkdtempSync(join(tmpdir(), "loop-git-state-"));
  const env = { OBSIDIAN_LOOP_STATE_DIR: stateDir };
  const dataPath = join(vault, ".obsidian", "plugins", "obsidian-git", "data.json");
  const before = readFileSync(dataPath, "utf8");

  run(["resume", "--vault", vault], env); // nothing paused
  assert.equal(readFileSync(dataPath, "utf8"), before);

  rmSync(vault, { recursive: true, force: true });
  rmSync(stateDir, { recursive: true, force: true });
});

test("CLI status does not crash on a corrupt sentinel; reports sentinelCorrupt", () => {
  const vault = makeVault();
  const stateDir = mkdtempSync(join(tmpdir(), "loop-git-state-"));
  const env = { OBSIDIAN_LOOP_STATE_DIR: stateDir };
  writeFileSync(join(stateDir, "git-guard.json"), "{ this is not json");

  const out = JSON.parse(run(["status", "--vault", vault], env));
  assert.equal(out.sentinelCorrupt, true);
  assert.equal(out.paused, true);

  rmSync(vault, { recursive: true, force: true });
  rmSync(stateDir, { recursive: true, force: true });
});

test("CLI resume on a corrupt sentinel fails loudly and preserves the sentinel", () => {
  const vault = makeVault();
  const stateDir = mkdtempSync(join(tmpdir(), "loop-git-state-"));
  const env = { OBSIDIAN_LOOP_STATE_DIR: stateDir };
  const sentPath = join(stateDir, "git-guard.json");
  writeFileSync(sentPath, "{ broken");

  const e = runExpectFail(["resume", "--vault", vault], env);
  assert.ok(e.status !== 0);
  assert.ok(existsSync(sentPath), "corrupt sentinel kept for manual inspection");

  rmSync(vault, { recursive: true, force: true });
  rmSync(stateDir, { recursive: true, force: true });
});

test("CLI resume clears a stale sentinel when the recorded data.json is gone", () => {
  const vault = makeVault();
  const stateDir = mkdtempSync(join(tmpdir(), "loop-git-state-"));
  const env = { OBSIDIAN_LOOP_STATE_DIR: stateDir };
  const sentPath = join(stateDir, "git-guard.json");

  run(["pause", "--vault", vault], env);
  assert.ok(existsSync(sentPath));
  rmSync(vault, { recursive: true, force: true }); // plugin/vault removed under it

  run(["resume", "--vault", vault], env); // uses sentinel.vault, finds no data.json
  assert.ok(!existsSync(sentPath), "stale sentinel cleared so the paused state cannot get stuck");

  rmSync(stateDir, { recursive: true, force: true });
});
