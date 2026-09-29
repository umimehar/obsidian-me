import { describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { join } from "node:path";
import type { Datastore } from "../../store/datastore";
import { loadFlows } from "../../ui/data";
import { buildFlows } from "./build";

const DATASTORE_PATH = join(import.meta.dir, "..", "..", "..", "..", "data", "datastore.json");
const FLOWS_PATH = join(import.meta.dir, "..", "..", "..", "..", "data", "flows.json");

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
});
