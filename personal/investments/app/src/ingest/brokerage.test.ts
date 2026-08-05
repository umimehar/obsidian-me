import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { parseBrokerage } from "./brokerage";
import { parseGeometry } from "./geometry";
import { parseSourceFilename } from "./source";

const FIXTURES = join(import.meta.dir, "__fixtures__");

async function load(name: string, file: string) {
  const source = parseSourceFilename(file);
  if (!source) throw new Error(`bad fixture filename ${file}`);
  const pages = parseGeometry(await Bun.file(join(FIXTURES, `${name}.xml`)).text());
  return parseBrokerage(pages, source);
}

const managed = () => load("brokerage-managed", "ACCT0001CAD_2026-06_BROKERAGE.pdf");
const dual = () => load("brokerage-dual-currency", "ACCT0002CAD_2026-06_BROKERAGE.pdf");

describe("header", () => {
  test("reads the account type verbatim", async () => {
    expect((await managed()).accountType).toBe("Managed RRSP Account");
    expect((await dual()).accountType).toBe("Order Execution Only TFSA Account");
  });

  test("reads the 2023 wording, which names no account code", async () => {
    // Wealthsimple renamed this descriptor twice. The 2023 form contains no
    // "TFSA" token at all; a parser written against 2026 statements throws here.
    const s = await load("brokerage-legacy-wording", "ACCT0007CAD_2023-06_BROKERAGE.pdf");
    expect(s.accountType).toBe("Tax-Free Savings Account");
  });

  test("reads the self-directed spousal wording", async () => {
    const s = await load("brokerage-spousal", "ACCT0003CAD_2026-03_BROKERAGE.pdf");
    expect(s.accountType).toBe("Self-directed Spousal RRSP Account");
  });

  test("reads the statement period", async () => {
    const s = await managed();
    expect(s.periodStart).toBe("2026-06-01");
    expect(s.periodEnd).toBe("2026-06-30");
  });

  test("throws rather than guessing when the type row is absent", () => {
    const source = parseSourceFilename("ACCT0001CAD_2026-06_BROKERAGE.pdf");
    if (!source) throw new Error("bad filename");
    expect(() => parseBrokerage([], source)).toThrow(/account type/i);
  });
});

describe("portfolio summary", () => {
  test("reads it despite the mailing address sharing its rows", async () => {
    // The owner's name sits on the Cash row and the address interleaves between
    // the asset-class rows. Column slicing removes both.
    const p = (await managed()).portfolio;
    if (!p) throw new Error("expected a portfolio");
    expect(p.cashMarketValue).toBe(122.95);
    expect(p.totalMarketValue).toBe(20498.54);
    expect(p.totalBookCost).toBe(20501.7);
  });

  test("reads a non-null portfolio on the 2023 wrapped-header layout", async () => {
    // The 2023 statements wrap "Market Value" across two rows, so the header
    // never appears contiguous in any row. The guard must not depend on it.
    // This account really was empty in 2023-06 — zeros are the correct
    // answer, null is not.
    const s = await load("brokerage-legacy-wording", "ACCT0007CAD_2023-06_BROKERAGE.pdf");
    const p = s.portfolio;
    if (!p) throw new Error("expected a portfolio");
    expect(p.totalMarketValue).toBe(0);
    expect(p.totalBookCost).toBe(0);
  });
});

describe("cash summary", () => {
  test("reads the managed three-panel layout without cross-panel bleed", async () => {
    // Last Statement Cash Balance $116.67 | Cash Paid In Deposits $0.00 |
    // Contributions: — all one row. Taking the last money token reads $0.00.
    const cad = (await managed()).cash[0];
    if (!cad) throw new Error("expected a CAD cash summary");
    expect(cad.opening).toBe(116.67);
    expect(cad.totalIn).toBe(12430.95);
    expect(cad.totalOut).toBe(12424.67);
    expect(cad.closing).toBe(122.95);
    expect(cad.paidIn?.proceedsFromSales).toBe(12417.15);
    expect(cad.paidIn?.dividends).toBe(13.8);
    expect(cad.paidOut?.fees).toBe(7.52);
    expect(cad.paidOut?.costOfInvestments).toBe(12417.15);
  });

  test("distinguishes the two Other rows", async () => {
    // "Other" appears once under Cash Paid In and once under Cash Paid Out.
    const cad = (await managed()).cash[0];
    expect(cad?.paidIn?.other).toBe(0);
    expect(cad?.paidOut?.other).toBe(0);
  });

  test("reads both currency columns on a dual-currency account", async () => {
    const s = await dual();
    expect(s.cash.map((c) => c.currency).sort()).toEqual(["CAD", "USD"]);
    const cad = s.cash.find((c) => c.currency === "CAD");
    const usd = s.cash.find((c) => c.currency === "USD");
    expect(cad?.opening).toBe(2618.4);
    expect(cad?.totalIn).toBe(3005.67);
    expect(cad?.closing).toBe(1037.09);
    expect(cad?.paidIn?.stockLendingIncome).toBe(0.06);
    expect(usd?.opening).toBe(0.06);
    expect(usd?.closing).toBe(0.06);
  });

  test("the cash block reconciles on both layouts", async () => {
    for (const s of [await managed(), await dual()]) {
      for (const c of s.cash) {
        if (c.totalIn === null || c.totalOut === null) continue;
        expect(c.opening + c.totalIn - c.totalOut).toBeCloseTo(c.closing, 2);
      }
    }
  });
});

describe("contributions and fx", () => {
  test("reads the 60-day split", async () => {
    const s = await managed();
    expect(s.contributions?.first60Days).toBe(0);
    expect(s.contributions?.restOfYear).toBe(8000);
    expect(s.contributions?.yearToDate).toBeNull();
  });

  test("reads the year-to-date figure on the other layout", async () => {
    const s = await dual();
    expect(s.contributions?.yearToDate).toBe(6143.25);
    expect(s.contributions?.first60Days).toBeNull();
    expect(s.dividendsYearToDate).toBe(301.94);
  });

  test("reads the month-end conversion rate", async () => {
    expect((await dual()).fxRate).toBe(1.421);
  });
});
