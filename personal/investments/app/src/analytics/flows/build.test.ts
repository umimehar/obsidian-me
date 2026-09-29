import { describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { join } from "node:path";
import type { Datastore } from "../../store/datastore";
import { loadFlows } from "../../ui/data";
import { buildFlows, isClosedAsOf } from "./build";

const DATASTORE_PATH = join(import.meta.dir, "..", "..", "..", "..", "data", "datastore.json");
const FLOWS_PATH = join(import.meta.dir, "..", "..", "..", "..", "data", "flows.json");

describe("isClosedAsOf", () => {
  test("an account with no declared closing period is never closed, however $0 its balance is", () => {
    // The regression this guards: closure must never be inferred from a
    // zero balance. A live pass-through chequing account sits at $0
    // between movements, and this comparison never sees a balance at all.
    expect(isClosedAsOf(null, "2026-06")).toBe(false);
  });

  test("a declared closing period at or before the account's lastPeriod is closed", () => {
    expect(isClosedAsOf("2024-06", "2024-06")).toBe(true);
    expect(isClosedAsOf("2024-06", "2026-08")).toBe(true);
  });

  test("a declared closing period after the account's lastPeriod is not yet closed", () => {
    expect(isClosedAsOf("2027-01", "2026-08")).toBe(false);
  });
});

describe.if(existsSync(DATASTORE_PATH))("buildFlows over the real datastore", () => {
  async function datastore() {
    return (await Bun.file(DATASTORE_PATH).json()) as Datastore;
  }

  test("every cash block reconciles on the corpus", async () => {
    const flows = buildFlows(await datastore());
    expect(flows.blocks.filter((b) => Math.abs(b.residual) > 0.005)).toEqual([]);
  });

  test("no committed flow row carries a description", () => {
    const raw = JSON.stringify(loadFlows());
    expect(raw).not.toContain("description");
    expect(raw).not.toMatch(/e-Transfer|Direct deposit/);
  });

  test("flows.json is current against the datastore", async () => {
    expect(loadFlows()).toEqual(JSON.parse(JSON.stringify(await buildFlows(await datastore()))));
  });

  test("flows.json stays under 2.5 MB", async () => {
    expect((await Bun.file(FLOWS_PATH).arrayBuffer()).byteLength).toBeLessThan(2_500_000);
  });

  test("8cd3, a live pass-through chequing account, is never marked closed", async () => {
    // The account the review finding named: it sits at $0 between
    // movements ($63,666 of outside money has gone through it), and a
    // balance-based inference would have marked it closed.
    const flows = await buildFlows(await datastore());
    const account = flows.accounts.find((a) => a.shortId === "8cd3");
    if (account === undefined) throw new Error("8cd3 not found in flows.json");
    expect(account.closed).toBe(false);
  });
});
