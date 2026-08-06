import { describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { countedAccountNumbers, ingestAll } from "./build";
import { buildRegistry } from "./store/registry";
import {
  checkArithmetic,
  checkContinuity,
  checkGroundTruth,
  checkKindConsistency,
} from "./validate/checks";

const SOURCE = process.env.STATEMENTS_DIR ?? join(homedir(), "Downloads", "monthly_pdf_statements");
const CACHE = join(import.meta.dir, "..", ".cache");

// Skipped without the source PDFs. Never commit them to make this run in CI --
// they carry the owner's address and account numbers.
describe.if(existsSync(SOURCE))("full corpus", () => {
  test("parses every statement, deduplicating the fresh-download twin", async () => {
    // The source folder holds 221 files: 220 conventionally named, plus one
    // fresh Wealthsimple download that is byte-identical to one of the 220.
    expect((await ingestAll(SOURCE, CACHE)).length).toBe(220);
  });

  test("every statement passes its own arithmetic, with no unexplained mismatch", async () => {
    // checkArithmetic legitimately reports warning-severity findings for known
    // statement quirks (fx-rate rounding, a rebate netted against fees, a
    // same-day reversed entry) -- an empty findings list would contradict its
    // own design. The real invariant is zero errors: an unexplained mismatch.
    const findings = checkArithmetic(await ingestAll(SOURCE, CACHE));
    const errors = findings.filter((f) => f.severity === "error");
    if (errors.length > 0) console.log(errors.slice(0, 10));
    expect(errors).toEqual([]);
  });

  test("cash balances are continuous within each series", async () => {
    expect(checkContinuity(await ingestAll(SOURCE, CACHE))).toEqual([]);
  });

  test("no account changes kind across its history", async () => {
    // Wording drifts; kind must not.
    expect(checkKindConsistency(await ingestAll(SOURCE, CACHE))).toEqual([]);
  });

  test("finds the expected accounts, kinds and styles", async () => {
    const accounts = buildRegistry(await ingestAll(SOURCE, CACHE));
    expect(accounts).toHaveLength(14);
    expect(accounts.filter((a) => a.kind === "Chequing")).toHaveLength(3);
    for (const kind of ["TFSA", "FHSA", "RRSP", "SpousalRRSP", "RESP", "NonRegistered", "Crypto"]) {
      expect(accounts.some((a) => a.kind === kind)).toBe(true);
    }
    expect(accounts.some((a) => a.style === "managed")).toBe(true);
  });

  test("June 2026 account value lands within 0.5% of the observed app figure", async () => {
    const statements = await ingestAll(SOURCE, CACHE);
    const accounts = buildRegistry(statements);
    const [finding] = checkGroundTruth(
      statements,
      [{ observed: "2026-06-30", period: "2026-06", accountValue: 242019.61, netDeposits: null }],
      countedAccountNumbers(statements, accounts),
    );
    if (!finding?.actual) throw new Error("expected a ground-truth finding");
    expect(Math.abs(finding.actual - 242019.61) / 242019.61).toBeLessThan(0.005);
    expect(finding.message).toMatch(/pending valuation/i);
  });

  test("every ingested statement's template is document-derived, never filename-derived", async () => {
    // Guards the fix this task exists for: a fresh Wealthsimple download
    // carries no template segment in its filename at all, and every
    // statement -- not just that one -- must still classify correctly.
    const statements = await ingestAll(SOURCE, CACHE);
    for (const s of statements) {
      expect(["BROKERAGE", "CASH", "PERFORMANCE"]).toContain(s.source.template);
    }
  });
});
