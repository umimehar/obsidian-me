import { describe, expect, test } from "bun:test";
import type { AccountKind } from "../../store/mask";
import { tileBreakdowns } from "./breakdown";
import type { CashBlock, FlowAccount, FlowRow, FlowsData } from "./types";

function account(
  overrides: Partial<FlowAccount> & { accountId: string; kind: AccountKind },
): FlowAccount {
  return {
    shortId: overrides.accountId.slice(-4),
    label: overrides.accountId,
    purpose: "growth",
    inTotals: true,
    firstPeriod: "2026-01",
    lastPeriod: "2026-12",
    closed: false,
    ...overrides,
  };
}

function row(overrides: Partial<FlowRow> & { accountId: string }): FlowRow {
  return {
    id: `${overrides.accountId}:0`,
    period: "2026-05",
    date: "2026-05-15",
    code: "CONT",
    category: "outsideBank",
    movement: false,
    amountCad: 0,
    currency: "CAD",
    amount: 0,
    fxRate: null,
    symbol: "",
    pairId: null,
    lagDays: null,
    ...overrides,
  };
}

function data(
  rows: FlowRow[],
  accounts: FlowAccount[],
  blocks: CashBlock[] = [],
  suspectSymbols: string[] = [],
): FlowsData {
  return { generated: "2026-09-29", accounts, rows, blocks, suspectSymbols };
}

const PERIOD = { from: "2026-01", to: "2026-12" };

function sumParts(amounts: readonly { amount: number }[]): number {
  return amounts.reduce((s, p) => s + p.amount, 0);
}

describe("tileBreakdowns", () => {
  test("paidIn parts sum to the tile and split by source, with a contributions-by-kind section", () => {
    const cheq = account({ accountId: "acct_cheq", kind: "Chequing" });
    const tfsa = account({ accountId: "acct_tfsa", kind: "TFSA" });
    const rows = [
      row({
        accountId: "acct_cheq",
        category: "payroll",
        movement: true,
        amountCad: 1000,
        amount: 1000,
      }),
      row({
        accountId: "acct_cheq",
        id: "acct_cheq:1",
        category: "outsideBank",
        movement: true,
        amountCad: 200,
        amount: 200,
      }),
      row({
        accountId: "acct_tfsa",
        id: "acct_tfsa:1",
        code: "CONT",
        category: "outsideBank",
        movement: true,
        amountCad: 300,
        amount: 300,
      }),
    ];
    const b = tileBreakdowns(data(rows, [cheq, tfsa]), PERIOD, new Set(["acct_cheq", "acct_tfsa"]));
    expect(b.paidIn.total).toBeCloseTo(1500, 6);
    expect(sumParts(b.paidIn.parts)).toBeCloseTo(b.paidIn.total, 6);
    const payroll = b.paidIn.parts.find((p) => p.key === "payroll");
    expect(payroll?.amount).toBeCloseTo(1000, 6);
    expect(payroll?.rowIds).toEqual(["acct_cheq:0"]);
    const contribSection = b.paidIn.sections.find((s) => s.title.includes("contributions"));
    expect(contribSection?.parts[0]?.amount).toBeCloseTo(300, 6);
  });

  test("invested parts are purchases and less sales, summing to the tile", () => {
    const tfsa = account({ accountId: "acct_tfsa", kind: "TFSA" });
    const rows = [
      row({
        accountId: "acct_tfsa",
        code: "BUY",
        category: "buy",
        symbol: "VFV",
        amountCad: -100,
        amount: -100,
      }),
      row({
        accountId: "acct_tfsa",
        id: "acct_tfsa:1",
        code: "SELL",
        category: "saleProceeds",
        symbol: "VFV",
        amountCad: 30,
        amount: 30,
      }),
      row({
        accountId: "acct_tfsa",
        id: "acct_tfsa:2",
        code: "BUY",
        category: "buy",
        symbol: "PSA",
        amountCad: -50,
        amount: -50,
      }),
    ];
    const b = tileBreakdowns(data(rows, [tfsa]), PERIOD, new Set(["acct_tfsa"]));
    expect(b.invested.total).toBeCloseTo(70, 6);
    expect(sumParts(b.invested.parts)).toBeCloseTo(70, 6);
    expect(b.invested.parts.find((p) => p.key === "purchases")?.amount).toBeCloseTo(100, 6);
    expect(b.invested.parts.find((p) => p.key === "sales")?.amount).toBeCloseTo(-30, 6);
  });

  test("leftInCash parts are per-account cash change with no rowIds, plus cash-equivalent symbols with rowIds", () => {
    const tfsa = account({ accountId: "acct_tfsa", kind: "TFSA" });
    const block: CashBlock = {
      accountId: "acct_tfsa",
      period: "2026-05",
      currency: "CAD",
      opening: 0,
      closing: -50,
      fxRate: null,
      rowsNet: -50,
      residual: 0,
    };
    const rows = [
      row({
        accountId: "acct_tfsa",
        code: "BUY",
        category: "buy",
        symbol: "PSA",
        amountCad: -50,
        amount: -50,
      }),
    ];
    const b = tileBreakdowns(data(rows, [tfsa], [block]), PERIOD, new Set(["acct_tfsa"]));
    expect(b.leftInCash.total).toBeCloseTo(0, 6);
    expect(sumParts(b.leftInCash.parts)).toBeCloseTo(0, 6);
    const cashPart = b.leftInCash.parts.find((p) => p.key === "acct_tfsa");
    expect(cashPart?.amount).toBeCloseTo(-50, 6);
    expect(cashPart?.rowIds).toEqual([]);
    const symbolPart = b.leftInCash.parts.find((p) => p.key === "PSA");
    expect(symbolPart?.amount).toBeCloseTo(50, 6);
    expect(symbolPart?.rowIds).toEqual(["acct_tfsa:0"]);
  });

  test("income parts split dividends, interest, securities lending, cash back, rewards and other refunds", () => {
    const resp = account({ accountId: "acct_resp", kind: "RESP" });
    const rows = [
      row({ accountId: "acct_resp", code: "DIV", category: "income", amountCad: 10, amount: 10 }),
      row({
        accountId: "acct_resp",
        id: "acct_resp:1",
        code: "INT",
        category: "income",
        amountCad: 2,
        amount: 2,
      }),
      row({
        accountId: "acct_resp",
        id: "acct_resp:2",
        code: "FPLINT",
        category: "income",
        amountCad: 1,
        amount: 1,
      }),
    ];
    const b = tileBreakdowns(data(rows, [resp]), PERIOD, new Set(["acct_resp"]));
    expect(b.income.total).toBeCloseTo(13, 6);
    expect(sumParts(b.income.parts)).toBeCloseTo(13, 6);
    expect(b.income.parts.find((p) => p.key === "dividends")?.amount).toBeCloseTo(10, 6);
    expect(b.income.parts.find((p) => p.key === "interest")?.amount).toBeCloseTo(2, 6);
  });

  test("costs parts are management fees plus withholding, minus fee rebates", () => {
    const cheq = account({ accountId: "acct_cheq", kind: "Chequing" });
    const rows = [
      row({ accountId: "acct_cheq", code: "FEE", category: "fee", amountCad: -5, amount: -5 }),
      row({
        accountId: "acct_cheq",
        id: "acct_cheq:1",
        code: "NRT",
        category: "withholding",
        amountCad: -3,
        amount: -3,
      }),
      row({
        accountId: "acct_cheq",
        id: "acct_cheq:2",
        code: "REIMB",
        category: "fee",
        amountCad: 1,
        amount: 1,
      }),
    ];
    const b = tileBreakdowns(data(rows, [cheq]), PERIOD, new Set(["acct_cheq"]));
    expect(b.costs.total).toBeCloseTo(7, 6);
    expect(sumParts(b.costs.parts)).toBeCloseTo(7, 6);
    expect(b.costs.parts.find((p) => p.key === "feeRebates")?.amount).toBeCloseTo(-1, 6);
  });

  test("left parts split by kind and section by account", () => {
    const cheq = account({ accountId: "acct_cheq", kind: "Chequing" });
    const rows = [
      row({
        accountId: "acct_cheq",
        code: "TRFOUT",
        category: "leftWealthsimple",
        movement: true,
        amountCad: -40,
        amount: -40,
      }),
      row({
        accountId: "acct_cheq",
        id: "acct_cheq:1",
        code: "SPEND",
        category: "leftWealthsimple",
        amountCad: -20,
        amount: -20,
      }),
    ];
    const b = tileBreakdowns(data(rows, [cheq]), PERIOD, new Set(["acct_cheq"]));
    expect(b.left.total).toBeCloseTo(60, 6);
    expect(sumParts(b.left.parts)).toBeCloseTo(60, 6);
    expect(b.left.parts.find((p) => p.key === "transfersOut")?.amount).toBeCloseTo(40, 6);
    expect(b.left.parts.find((p) => p.key === "cardPurchases")?.amount).toBeCloseTo(20, 6);
    const byAccount = b.left.sections.find((s) => s.title === "By account");
    expect(byAccount?.parts[0]?.amount).toBeCloseTo(60, 6);
  });

  test("investedRate parts are the numerator and three denominator terms, not summed against the rate", () => {
    const cheq = account({ accountId: "acct_cheq", kind: "Chequing" });
    const tfsa = account({ accountId: "acct_tfsa", kind: "TFSA" });
    const rows = [
      row({
        accountId: "acct_cheq",
        category: "payroll",
        movement: true,
        amountCad: 1000,
        amount: 1000,
      }),
      row({
        accountId: "acct_tfsa",
        id: "acct_tfsa:1",
        code: "BUY",
        category: "buy",
        symbol: "VFV",
        amountCad: -400,
        amount: -400,
      }),
    ];
    const b = tileBreakdowns(data(rows, [cheq, tfsa]), PERIOD, new Set(["acct_cheq", "acct_tfsa"]));
    expect(b.investedRate.total).toBeCloseTo(0.4, 6);
    expect(b.investedRate.parts.find((p) => p.key === "invested")?.amount).toBeCloseTo(400, 6);
    expect(b.investedRate.parts.find((p) => p.key === "paidIn")?.amount).toBeCloseTo(1000, 6);
  });

  test("the identity ties paid in, CESG, income, costs, left and currency conversion to invested plus left in cash", () => {
    const cheq = account({ accountId: "acct_cheq", kind: "Chequing" });
    const resp = account({ accountId: "acct_resp", kind: "RESP" });
    const block: CashBlock = {
      accountId: "acct_cheq",
      period: "2026-05",
      currency: "CAD",
      opening: 0,
      closing: 900,
      fxRate: null,
      rowsNet: 900,
      residual: 0,
    };
    const rows = [
      row({
        accountId: "acct_cheq",
        category: "payroll",
        movement: true,
        amountCad: 1000,
        amount: 1000,
      }),
      row({
        accountId: "acct_cheq",
        id: "acct_cheq:1",
        code: "FEE",
        category: "fee",
        amountCad: -100,
        amount: -100,
      }),
      row({
        accountId: "acct_resp",
        id: "acct_resp:1",
        code: "GRANT",
        category: "grant",
        amountCad: 0,
        amount: 0,
      }),
    ];
    const b = tileBreakdowns(
      data(rows, [cheq, resp], [block]),
      PERIOD,
      new Set(["acct_cheq", "acct_resp"]),
    );
    const lhs =
      b.identity.paidIn +
      b.identity.cesg +
      b.identity.income +
      b.identity.movedIn -
      b.identity.costs -
      b.identity.left -
      b.identity.movedOut -
      b.identity.currencyConversion;
    const rhs = b.identity.invested + b.identity.leftInCash;
    expect(lhs).toBeCloseTo(rhs, 6);
  });

  test("a nonzero block residual sets the currency conversion term's own sign, and the identity still holds", () => {
    const cheq = account({ accountId: "acct_cheq", kind: "Chequing" });
    // The block's own closing has to reflect the SAME $1000 the payroll row
    // credits, plus the $5.25 residual -- an arbitrary closing here would
    // break the identity for a reason that has nothing to do with the sign
    // this test exists to catch.
    const block: CashBlock = {
      accountId: "acct_cheq",
      period: "2026-05",
      currency: "CAD",
      opening: 0,
      closing: 1005.25,
      fxRate: null,
      rowsNet: 1000,
      residual: 5.25,
    };
    const rows = [
      row({
        accountId: "acct_cheq",
        category: "payroll",
        movement: true,
        amountCad: 1000,
        amount: 1000,
      }),
    ];
    const b = tileBreakdowns(data(rows, [cheq], [block]), PERIOD, new Set(["acct_cheq"]));

    // `currencyConversion = fxConversionNegated - residual`: no fxConversion
    // rows here, so the term is exactly `-residual`. A flipped sign would
    // report +5.25 instead.
    expect(b.identity.currencyConversion).toBeCloseTo(-5.25, 6);

    const lhs =
      b.identity.paidIn +
      b.identity.cesg +
      b.identity.income +
      b.identity.movedIn -
      b.identity.costs -
      b.identity.left -
      b.identity.movedOut -
      b.identity.currencyConversion;
    const rhs = b.identity.invested + b.identity.leftInCash;
    expect(lhs).toBeCloseTo(rhs, 6);
  });

  test("a pair lagged across a month boundary counts as moved, in EITHER single month, even with both accounts selected", () => {
    const cheq = account({ accountId: "acct_cheq", kind: "Chequing" });
    const tfsa = account({ accountId: "acct_tfsa", kind: "TFSA" });
    const rows = [
      row({
        id: "o",
        accountId: "acct_cheq",
        period: "2026-01",
        date: "2026-01-31",
        code: "TRFOUT",
        category: "leftWealthsimple",
        movement: true,
        amountCad: -500,
        amount: -500,
        pairId: "o>i",
      }),
      row({
        id: "i",
        accountId: "acct_tfsa",
        period: "2026-02",
        date: "2026-02-02",
        code: "CONT",
        category: "outsideBank",
        movement: true,
        amountCad: 500,
        amount: 500,
        pairId: "o>i",
      }),
    ];
    const blocks: CashBlock[] = [
      {
        accountId: "acct_cheq",
        period: "2026-01",
        currency: "CAD",
        opening: 0,
        closing: -500,
        fxRate: null,
        rowsNet: -500,
        residual: 0,
      },
      {
        accountId: "acct_tfsa",
        period: "2026-02",
        currency: "CAD",
        opening: 0,
        closing: 500,
        fxRate: null,
        rowsNet: 500,
        residual: 0,
      },
    ];
    const accounts = new Set(["acct_cheq", "acct_tfsa"]);
    const flows = data(rows, [cheq, tfsa], blocks);

    // January alone sees only the debit leg; its partner's credit sits in
    // February, outside the period, so it is `movedOut` even though its
    // account IS selected -- the exact case the account-only check missed.
    const jan = tileBreakdowns(flows, { from: "2026-01", to: "2026-01" }, accounts);
    expect(jan.identity.movedOut).toBeCloseTo(500, 6);
    const janLhs =
      jan.identity.paidIn +
      jan.identity.cesg +
      jan.identity.income +
      jan.identity.movedIn -
      jan.identity.costs -
      jan.identity.left -
      jan.identity.movedOut -
      jan.identity.currencyConversion;
    expect(janLhs).toBeCloseTo(jan.identity.invested + jan.identity.leftInCash, 6);

    // February alone sees only the credit leg; its partner sits in
    // January, so it is `movedIn`.
    const feb = tileBreakdowns(flows, { from: "2026-02", to: "2026-02" }, accounts);
    expect(feb.identity.movedIn).toBeCloseTo(500, 6);
    const febLhs =
      feb.identity.paidIn +
      feb.identity.cesg +
      feb.identity.income +
      feb.identity.movedIn -
      feb.identity.costs -
      feb.identity.left -
      feb.identity.movedOut -
      feb.identity.currencyConversion;
    expect(febLhs).toBeCloseTo(feb.identity.invested + feb.identity.leftInCash, 6);
  });
});
