import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { parseBrokerage } from "./brokerage";
import { type Page, parseGeometry, rowText } from "./geometry";
import { parseSourceFilename } from "./source";

const FIXTURES = join(import.meta.dir, "__fixtures__");

async function loadPages(name: string): Promise<Page[]> {
  return parseGeometry(await Bun.file(join(FIXTURES, `${name}.xml`)).text());
}

async function load(name: string, file: string) {
  const source = parseSourceFilename(file);
  if (!source) throw new Error(`bad fixture filename ${file}`);
  const pages = await loadPages(name);
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

  test("reads an asset class with no wording in common with any known class", async () => {
    // Crypto accounts head their class row "Crypto Assets" — no "Equities",
    // no "Securities". Classes are derived from the table's shape (a row
    // between Cash and Total Portfolio carrying the same four money columns
    // those two rows do), not from a wording allow-list, so this needs no
    // dedicated regex.
    const word = (text: string, x0: number, y: number) => ({ x0, x1: x0 + 10, y, text });
    const pages: Page[] = [
      {
        rows: [
          { y: 1, words: [word("Managed RRSP Account", 50, 1)] },
          { y: 2, words: [word("2026-06-01 - 2026-06-30", 50, 2)] },
          { y: 3, words: [word("Account No.", 50, 3)] },
          {
            y: 4,
            words: [
              word("Cash", 50, 4),
              word("$50.00", 100, 4),
              word("2.47", 150, 4),
              word("$50.00", 200, 4),
              word("2.47", 250, 4),
            ],
          },
          {
            y: 5,
            words: [
              word("Crypto", 50, 5),
              word("Assets", 90, 5),
              word("$964.96", 150, 5),
              word("47.65", 220, 5),
              word("$964.96", 280, 5),
              word("47.65", 340, 5),
            ],
          },
          {
            y: 6,
            words: [
              word("Total", 50, 6),
              word("Portfolio", 100, 6),
              word("$1,014.96", 160, 6),
              word("100.00", 230, 6),
              word("$1,014.96", 300, 6),
              word("100.00", 370, 6),
            ],
          },
          { y: 7, words: [word("Portfolio Cash", 50, 7)] },
          {
            y: 8,
            words: [
              word("Last", 50, 8),
              word("Statement", 90, 8),
              word("Cash", 140, 8),
              word("Balance", 170, 8),
              word("$50.00", 220, 8),
            ],
          },
          {
            y: 9,
            words: [
              word("Closing", 50, 9),
              word("Cash", 100, 9),
              word("Balance", 140, 9),
              word("$50.00", 220, 9),
            ],
          },
        ],
      },
    ];
    const source = parseSourceFilename("ACCT0001CAD_2026-06_BROKERAGE.pdf");
    if (!source) throw new Error("bad filename");
    const s = parseBrokerage(pages, source);
    const p = s.portfolio;
    if (!p) throw new Error("expected a portfolio");
    expect(p.classes).toEqual([{ name: "Crypto Assets", marketValue: 964.96, bookCost: 964.96 }]);
    expect(p.cashMarketValue).toBe(50);
    expect(p.totalMarketValue).toBe(1014.96);
  });

  test("reads asset classes named with 'Securities', not just 'Equities'", async () => {
    // performance.xml names its classes "Canadian-Listed Securities and
    // Alternatives" / "US-Listed Securities and Alternatives" — an
    // /Equities/-only filter drops both entirely. The last class also
    // carries a trailing "(The conversion rate used to convert...)"
    // footnote that is not part of the name.
    const source = parseSourceFilename("ACCT0001CAD_2026-04_PERFORMANCE.pdf");
    if (!source) throw new Error("bad filename");
    const pages = await loadPages("performance");
    const s = parseBrokerage(pages, source);
    const p = s.portfolio;
    if (!p) throw new Error("expected a portfolio");
    expect(p.classes.length).toBeGreaterThan(0);
    for (const c of p.classes) {
      expect(c.name).not.toMatch(/conversion rate/i);
    }
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

  test("throws rather than fabricating a zero-filled summary when the section is absent", async () => {
    // A statement whose Portfolio Cash section genuinely could not be found
    // must not silently become a complete, reconciling all-zero CashSummary
    // — that is indistinguishable from a real zero-activity account.
    const source = parseSourceFilename("ACCT0001CAD_2026-06_BROKERAGE.pdf");
    if (!source) throw new Error("bad filename");
    const pages = await loadPages("brokerage-managed");
    const stripped = pages.map((p) => ({
      rows: p.rows.filter((r) => !/Portfolio Cash/.test(rowText(r))),
    }));
    expect(() => parseBrokerage(stripped, source)).toThrow(/portfolio cash/i);
  });

  test("throws when the detected currency count doesn't match the summary row", async () => {
    // Synthetic statement: no "USD Transactions" marker (so single-currency
    // is inferred) and no Cash Paid In / Contributions anchors to slice the
    // summary panel down (so nothing narrows it). If the closing/opening
    // balance rows genuinely carry 2 money tokens under those conditions,
    // that is a second, undetected currency — not a Combined column, since
    // the single-panel layout never has one. Silently taking the last 1
    // value would return the USD figure mislabeled as CAD; the parser must
    // throw instead.
    const word = (text: string, x0: number, y: number) => ({ x0, x1: x0 + 10, y, text });
    const pages: Page[] = [
      {
        rows: [
          { y: 1, words: [word("Managed RRSP Account", 50, 1)] },
          { y: 2, words: [word("2026-06-01 - 2026-06-30", 50, 2)] },
          { y: 3, words: [word("Portfolio Cash", 50, 3)] },
          {
            y: 4,
            words: [
              word("Last", 50, 4),
              word("Statement", 90, 4),
              word("Cash", 140, 4),
              word("Balance", 170, 4),
              word("$10.00", 220, 4),
              word("$20.00", 260, 4),
            ],
          },
          {
            y: 5,
            words: [
              word("Closing", 50, 5),
              word("Cash", 100, 5),
              word("Balance", 140, 5),
              word("$15.00", 220, 5),
              word("$25.00", 260, 5),
            ],
          },
        ],
      },
    ];
    const source = parseSourceFilename("ACCT0001CAD_2026-06_BROKERAGE.pdf");
    if (!source) throw new Error("bad filename");
    expect(() => parseBrokerage(pages, source)).toThrow(/currency count mismatch/i);
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

  test("reports no contributions or dividends on a Chequing account", async () => {
    // Chequing accounts print an "Interest:" panel instead of "Contributions:",
    // so there is no contributions column at all. dividendsYearToDate must
    // read null (no such section), not 0 (a stray value leaking in from an
    // unbounded column slice).
    const s = await load("brokerage-empty", "ACCT0006CAD_2026-06_BROKERAGE.pdf");
    expect(s.contributions).toBeNull();
    expect(s.dividendsYearToDate).toBeNull();
  });
});
