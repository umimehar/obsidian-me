import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { parseStatement } from "./parse";
import { parseSourceFilename } from "./source";

const FIXTURES = join(import.meta.dir, "__fixtures__");

async function xml(name: string) {
  return Bun.file(join(FIXTURES, `${name}.xml`)).text();
}

describe("parseStatement", () => {
  test("dispatches a BROKERAGE statement to parseBrokerage", async () => {
    const source = parseSourceFilename("ACCT0001CAD_2026-06_BROKERAGE.pdf");
    if (!source) throw new Error("bad fixture filename");
    const s = parseStatement(await xml("brokerage-managed"), source);
    expect(s.accountType).toBe("Managed RRSP Account");
    expect(s.returns).toBeNull();
  });

  test("dispatches a PERFORMANCE statement to parsePerformance", async () => {
    const source = parseSourceFilename("ACCT0001CAD_2026-04_PERFORMANCE.pdf");
    if (!source) throw new Error("bad fixture filename");
    const s = parseStatement(await xml("performance"), source);
    expect(s.accountType).toBe("Managed RRSP Account");
    expect(s.returns?.sinceInception).toBe(10.31);
  });

  test("dispatches a CASH statement to parseCash", async () => {
    const source = parseSourceFilename("ACCT0005CAD_2026-06_CASH.pdf");
    if (!source) throw new Error("bad fixture filename");
    const s = parseStatement(await xml("cash"), source);
    expect(s.accountType).toBe("Chequing Account");
    expect(s.portfolio).toBeNull();
  });
});
