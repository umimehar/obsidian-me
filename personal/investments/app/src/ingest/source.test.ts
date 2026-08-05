import { describe, expect, test } from "bun:test";
import { parseSourceFilename } from "./source";

describe("parseSourceFilename", () => {
  test("reads account, period and template", () => {
    expect(parseSourceFilename("ACCT0002CAD_2026-06_BROKERAGE.pdf")).toEqual({
      file: "ACCT0002CAD_2026-06_BROKERAGE.pdf",
      accountNo: "ACCT0002CAD",
      period: "2026-06",
      template: "BROKERAGE",
      version: 0,
    });
  });

  test("recognises the cash and performance templates", () => {
    expect(parseSourceFilename("ACCT0005CAD_2026-06_CASH.pdf")?.template).toBe("CASH");
    expect(parseSourceFilename("ACCT0001CAD_2025-12_PERFORMANCE.pdf")?.template).toBe(
      "PERFORMANCE",
    );
  });

  test("rejects an unknown template rather than guessing", () => {
    expect(parseSourceFilename("ACCT0002CAD_2026-06_SUMMARY.pdf")).toBeNull();
  });

  test("rejects the legacy CSV-era name that puts the date last", () => {
    expect(parseSourceFilename("TFSA-transactions-ACCT0002-2026-06-01.pdf")).toBeNull();
  });

  test("rejects a malformed period", () => {
    expect(parseSourceFilename("ACCT0002CAD_2026-13_BROKERAGE.pdf")).toBeNull();
    expect(parseSourceFilename("ACCT0002CAD_202606_BROKERAGE.pdf")).toBeNull();
  });

  test("reads a re-issued statement's version suffix", () => {
    // Wealthsimple issues amended statements; the June 2026 managed RRSP says so
    // in terms. A later version supersedes the earlier one (Task 9).
    const v = parseSourceFilename("ACCT0001CAD_2026-06_BROKERAGE_v_2.pdf");
    expect(v?.period).toBe("2026-06");
    expect(v?.template).toBe("BROKERAGE");
    expect(v?.version).toBe(2);
  });
});
