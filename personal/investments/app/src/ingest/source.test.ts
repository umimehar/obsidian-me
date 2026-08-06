import { describe, expect, test } from "bun:test";
import { type Page, parseGeometry } from "./geometry";
import { detectTemplate, parseSourceFilename } from "./source";

describe("parseSourceFilename", () => {
  test("reads account, period and template", () => {
    expect(parseSourceFilename("ACCT0002CAD_2026-06_BROKERAGE.pdf")).toEqual({
      file: "ACCT0002CAD_2026-06_BROKERAGE.pdf",
      accountNo: "ACCT0002CAD",
      period: "2026-06",
      template: "BROKERAGE",
      version: 0,
      templateStated: true,
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

  test("reads a fresh Wealthsimple download, which carries no template segment", () => {
    // This is what a statement actually downloads as, one at a time, from the
    // app -- unlike the renamed bulk-export form every other test here uses.
    const p = parseSourceFilename("ACCT0001CAD_person-000000000000_2026-06_v_0.pdf");
    expect(p?.accountNo).toBe("ACCT0001CAD");
    expect(p?.period).toBe("2026-06");
    expect(p?.version).toBe(0);
    expect(p?.templateStated).toBe(false);
  });

  test("rejects a malformed fresh-download period or a missing version", () => {
    expect(parseSourceFilename("ACCT0001CAD_person-000000000000_2026-13_v_0.pdf")).toBeNull();
    expect(parseSourceFilename("ACCT0001CAD_person-000000000000_2026-06.pdf")).toBeNull();
    expect(parseSourceFilename("ACCT0001CAD_person-000000000000_2026-06_v_.pdf")).toBeNull();
  });

  test("marks a filename that does state a template", () => {
    expect(parseSourceFilename("ACCT0002CAD_2026-06_BROKERAGE.pdf")?.templateStated).toBe(true);
  });
});

/** Builds a synthetic single-word page, enough for a `findRow` regex match. */
function pageWithText(text: string): Page {
  const xml = `<page width="612" height="792">
    <word xMin="10" yMin="10" xMax="200" yMax="20">${text}</word>
  </page>`;
  const [page] = parseGeometry(xml);
  if (!page) throw new Error("test fixture failed to produce a page");
  return page;
}

describe("detectTemplate", () => {
  test("reads PERFORMANCE from the money-weighted return rates marker", () => {
    expect(detectTemplate([pageWithText("Money-weighted Return Rates")])).toBe("PERFORMANCE");
  });

  test("reads CASH from the monthly statement marker on the first page only", () => {
    expect(detectTemplate([pageWithText("Monthly Statement")])).toBe("CASH");
    // A later page calling itself a monthly statement does not count -- only
    // page one is trusted, matching how the real CASH template is worded.
    expect(
      detectTemplate([pageWithText("Account Summary"), pageWithText("Monthly Statement")]),
    ).toBeNull();
  });

  test("reads BROKERAGE from either the managed or order-execution-only marker", () => {
    expect(detectTemplate([pageWithText("Managed Account")])).toBe("BROKERAGE");
    expect(detectTemplate([pageWithText("Order Execution Only Account")])).toBe("BROKERAGE");
  });

  test("returns null when no marker is present, rather than guessing", () => {
    expect(detectTemplate([pageWithText("Some Unrelated Page")])).toBeNull();
  });
});
