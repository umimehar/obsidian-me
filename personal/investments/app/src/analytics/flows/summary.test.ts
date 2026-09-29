import { describe, expect, test } from "bun:test";
import type { AccountKind } from "../../store/mask";
import { flowSummary } from "./summary";
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

function data(rows: FlowRow[], accounts: FlowAccount[], blocks: CashBlock[] = []): FlowsData {
  return { generated: "2026-09-29", accounts, rows, blocks };
}

const PERIOD = { from: "2026-01", to: "2026-12" };

describe("flowSummary", () => {
  test("paidIn sums unpaired movement credits by source category", () => {
    const cheq = account({ accountId: "acct_cheq", kind: "Chequing" });
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
        category: "outsideBank",
        movement: true,
        amountCad: 200,
        amount: 200,
      }),
    ];
    const s = flowSummary(data(rows, [cheq]), PERIOD, new Set(["acct_cheq"]));
    expect(s.paidIn).toBeCloseTo(1200, 6);
    expect(s.paidInBySource.payroll).toBeCloseTo(1000, 6);
    expect(s.paidInBySource.outsideBank).toBeCloseTo(200, 6);
  });

  test("a paired movement credit is never counted as paid in", () => {
    const cheq = account({ accountId: "acct_cheq", kind: "Chequing" });
    const rrsp = account({ accountId: "acct_rrsp", kind: "RRSP" });
    const rows = [
      row({
        accountId: "acct_rrsp",
        id: "i",
        category: "outsideBank",
        movement: true,
        amountCad: 500,
        amount: 500,
        pairId: "o>i",
      }),
    ];
    const s = flowSummary(data(rows, [cheq, rrsp]), PERIOD, new Set(["acct_cheq", "acct_rrsp"]));
    expect(s.paidIn).toBe(0);
  });

  test("contributionsByKind sums CONT credits on registered accounts, and DEP credits on RESP", () => {
    const tfsa = account({ accountId: "acct_tfsa", kind: "TFSA" });
    const resp = account({ accountId: "acct_resp", kind: "RESP" });
    const nonReg = account({ accountId: "acct_nr", kind: "NonRegistered" });
    const rows = [
      row({ accountId: "acct_tfsa", code: "CONT", movement: true, amountCad: 300, amount: 300 }),
      row({
        accountId: "acct_resp",
        code: "DEP",
        category: "outsideBank",
        movement: true,
        amountCad: 400,
        amount: 400,
      }),
      row({ accountId: "acct_nr", code: "CONT", movement: true, amountCad: 999, amount: 999 }),
    ];
    const accounts = new Set(["acct_tfsa", "acct_resp", "acct_nr"]);
    const s = flowSummary(data(rows, [tfsa, resp, nonReg]), PERIOD, accounts);
    expect(s.contributionsByKind.TFSA).toBeCloseTo(300, 6);
    expect(s.contributionsByKind.RESP).toBeCloseTo(400, 6);
    expect(s.contributionsByKind.NonRegistered).toBeUndefined();
  });

  test("grants and income sum their own categories", () => {
    const resp = account({ accountId: "acct_resp", kind: "RESP" });
    const rows = [
      row({
        accountId: "acct_resp",
        code: "GRANT",
        category: "grant",
        amountCad: 500,
        amount: 500,
      }),
      row({
        accountId: "acct_resp",
        id: "acct_resp:1",
        code: "DIV",
        category: "income",
        amountCad: 12.5,
        amount: 12.5,
      }),
    ];
    const s = flowSummary(data(rows, [resp]), PERIOD, new Set(["acct_resp"]));
    expect(s.grants).toBeCloseTo(500, 6);
    expect(s.income).toBeCloseTo(12.5, 6);
  });

  test("invested is buys less sale proceeds, excluding cash equivalents; cashEquivalentNet holds those separately", () => {
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
    const s = flowSummary(data(rows, [tfsa]), PERIOD, new Set(["acct_tfsa"]));
    expect(s.invested).toBeCloseTo(70, 6);
    expect(s.cashEquivalentNet).toBeCloseTo(50, 6);
  });

  test("costs is fees plus withholding, and left is unpaired movement debits plus SPEND", () => {
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
        code: "SPEND",
        category: "leftWealthsimple",
        amountCad: -20,
        amount: -20,
      }),
      row({
        accountId: "acct_cheq",
        id: "acct_cheq:3",
        code: "TRFOUT",
        category: "leftWealthsimple",
        movement: true,
        amountCad: -40,
        amount: -40,
      }),
    ];
    const s = flowSummary(data(rows, [cheq]), PERIOD, new Set(["acct_cheq"]));
    expect(s.costs).toBeCloseTo(8, 6);
    expect(s.left).toBeCloseTo(60, 6);
  });

  test("a paired leftWealthsimple debit never counts toward left", () => {
    const cheq = account({ accountId: "acct_cheq", kind: "Chequing" });
    const rrsp = account({ accountId: "acct_rrsp", kind: "RRSP" });
    const rows = [
      row({
        accountId: "acct_cheq",
        id: "o",
        code: "TRFOUT",
        category: "leftWealthsimple",
        movement: true,
        amountCad: -800,
        amount: -800,
        pairId: "o>i",
      }),
      row({
        accountId: "acct_rrsp",
        id: "i",
        code: "CONT",
        category: "outsideBank",
        movement: true,
        amountCad: 800,
        amount: 800,
        pairId: "o>i",
      }),
    ];
    const s = flowSummary(data(rows, [cheq, rrsp]), PERIOD, new Set(["acct_cheq", "acct_rrsp"]));
    expect(s.left).toBeCloseTo(0, 9);
  });

  test("investedRate is null when nothing came in", () => {
    const tfsa = account({ accountId: "acct_tfsa", kind: "TFSA" });
    const s = flowSummary(data([], [tfsa]), PERIOD, new Set(["acct_tfsa"]));
    expect(s.investedRate).toBeNull();
  });

  test("investedRate divides invested by paid in plus grants plus income", () => {
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
    const s = flowSummary(data(rows, [cheq, tfsa]), PERIOD, new Set(["acct_cheq", "acct_tfsa"]));
    expect(s.investedRate).toBeCloseTo(0.4, 6);
  });

  test("cashChange is the raw closing minus opening, and a positive residual is kept separate", () => {
    const tfsa = account({ accountId: "acct_tfsa", kind: "TFSA" });
    const block: CashBlock = {
      accountId: "acct_tfsa",
      period: "2026-05",
      currency: "CAD",
      opening: 0,
      closing: 105,
      fxRate: null,
      rowsNet: 100,
      residual: 5,
    };
    const s = flowSummary(data([], [tfsa], [block]), PERIOD, new Set(["acct_tfsa"]));
    expect(s.cashChange).toBeCloseTo(105, 6);
    expect(s.residual).toBeCloseTo(5, 6);
    expect(s.leftInCash).toBeCloseTo(105, 6);
  });

  test("cashChange still reads the raw closing minus opening with a negative residual", () => {
    const tfsa = account({ accountId: "acct_tfsa", kind: "TFSA" });
    const block: CashBlock = {
      accountId: "acct_tfsa",
      period: "2026-05",
      currency: "CAD",
      opening: 0,
      closing: 95,
      fxRate: null,
      rowsNet: 100,
      residual: -5,
    };
    const s = flowSummary(data([], [tfsa], [block]), PERIOD, new Set(["acct_tfsa"]));
    expect(s.cashChange).toBeCloseTo(95, 6);
    expect(s.residual).toBeCloseTo(-5, 6);
    expect(s.leftInCash).toBeCloseTo(95, 6);
  });

  test("a USD block with no fx rate and a nonzero change throws, naming account and period", () => {
    const tfsa = account({ accountId: "acct_tfsa", kind: "TFSA" });
    const block: CashBlock = {
      accountId: "acct_tfsa",
      period: "2026-05",
      currency: "USD",
      opening: 0,
      closing: 10,
      fxRate: null,
      rowsNet: 10,
      residual: 0,
    };
    const s = () => flowSummary(data([], [tfsa], [block]), PERIOD, new Set(["acct_tfsa"]));
    expect(s).toThrow(/acct_tfsa/);
    expect(s).toThrow(/2026-05/);
  });

  test("unpairedLegs counts movement rows with no pair, and laggedPairs counts distinct lagged pairs", () => {
    const cheq = account({ accountId: "acct_cheq", kind: "Chequing" });
    const rrsp = account({ accountId: "acct_rrsp", kind: "RRSP" });
    const rows = [
      row({
        accountId: "acct_cheq",
        category: "payroll",
        movement: true,
        amountCad: 100,
        amount: 100,
      }),
      row({
        accountId: "acct_cheq",
        id: "o",
        code: "TRFOUT",
        movement: true,
        amountCad: -50,
        amount: -50,
        pairId: "o>i",
        lagDays: 2,
      }),
      row({
        accountId: "acct_rrsp",
        id: "i",
        code: "CONT",
        movement: true,
        amountCad: 50,
        amount: 50,
        pairId: "o>i",
        lagDays: 2,
      }),
    ];
    const s = flowSummary(data(rows, [cheq, rrsp]), PERIOD, new Set(["acct_cheq", "acct_rrsp"]));
    expect(s.unpairedLegs).toBe(1);
    expect(s.laggedPairs).toBe(1);
  });

  test("laggedPairs counts only pairs with lagDays greater than 0, never a same-day pair", () => {
    const cheq = account({ accountId: "acct_cheq", kind: "Chequing" });
    const rrsp = account({ accountId: "acct_rrsp", kind: "RRSP" });
    const rows = [
      row({
        accountId: "acct_cheq",
        id: "same-o",
        code: "TRFOUT",
        movement: true,
        amountCad: -20,
        amount: -20,
        pairId: "same-o>same-i",
        lagDays: 0,
      }),
      row({
        accountId: "acct_rrsp",
        id: "same-i",
        code: "CONT",
        movement: true,
        amountCad: 20,
        amount: 20,
        pairId: "same-o>same-i",
        lagDays: 0,
      }),
      row({
        accountId: "acct_cheq",
        id: "lag-o",
        code: "TRFOUT",
        movement: true,
        amountCad: -30,
        amount: -30,
        pairId: "lag-o>lag-i",
        lagDays: 3,
      }),
      row({
        accountId: "acct_rrsp",
        id: "lag-i",
        code: "CONT",
        movement: true,
        amountCad: 30,
        amount: 30,
        pairId: "lag-o>lag-i",
        lagDays: 3,
      }),
    ];
    const s = flowSummary(data(rows, [cheq, rrsp]), PERIOD, new Set(["acct_cheq", "acct_rrsp"]));
    expect(s.laggedPairs).toBe(1);
  });

  test("unlistedSymbols names bought symbols the asset class table does not know, sorted and deduped", () => {
    const tfsa = account({ accountId: "acct_tfsa", kind: "TFSA" });
    const rows = [
      row({
        accountId: "acct_tfsa",
        code: "BUY",
        category: "buy",
        symbol: "ZZZ",
        amountCad: -10,
        amount: -10,
      }),
      row({
        accountId: "acct_tfsa",
        id: "acct_tfsa:1",
        code: "BUY",
        category: "buy",
        symbol: "AAA",
        amountCad: -10,
        amount: -10,
      }),
      row({
        accountId: "acct_tfsa",
        id: "acct_tfsa:2",
        code: "BUY",
        category: "buy",
        symbol: "ZZZ",
        amountCad: -10,
        amount: -10,
      }),
      row({
        accountId: "acct_tfsa",
        id: "acct_tfsa:3",
        code: "BUY",
        category: "buy",
        symbol: "PSA",
        amountCad: -10,
        amount: -10,
      }),
    ];
    const s = flowSummary(data(rows, [tfsa]), PERIOD, new Set(["acct_tfsa"]));
    expect(s.unlistedSymbols).toEqual(["AAA", "ZZZ"]);
  });
});
