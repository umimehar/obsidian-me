import { describe, expect, test } from "bun:test";
import type { AccountRecord } from "../../store/registry";
import type { ActivityRow, Currency, Statement } from "../../types";
import { classifyStatement, resolveCashCode } from "./classify";

function row(code: string, overrides: Partial<ActivityRow> = {}): ActivityRow {
  return {
    date: "2026-05-15",
    postedDate: null,
    code,
    description: "",
    debit: 0,
    credit: 0,
    balance: 0,
    currency: "CAD",
    ...overrides,
  };
}

function statementFixture(overrides: {
  accountNo?: string;
  period?: string;
  template?: "BROKERAGE" | "CASH" | "PERFORMANCE";
  fxRate?: number | null;
  activity?: ActivityRow[];
}): Statement {
  const {
    accountNo = "acct_d77c",
    period = "2026-05",
    template = "BROKERAGE",
    fxRate = null,
    activity = [],
  } = overrides;
  return {
    source: {
      file: `${accountNo}_${period}_${template}.pdf`,
      accountNo,
      period,
      template,
      version: 0,
    },
    accountType: "",
    periodStart: `${period}-01`,
    periodEnd: `${period}-28`,
    portfolio: null,
    cash: [],
    holdings: [],
    activity,
    contributions: null,
    dividendsYearToDate: null,
    fxRate,
    returns: null,
    balances: null,
  };
}

function account(overrides: Partial<AccountRecord> = {}): AccountRecord {
  return {
    maskedId: "acct_d77c",
    shortId: "d77c",
    label: "TFSA (self-directed)",
    kind: "TFSA",
    style: "self-directed",
    purpose: "growth",
    inTotals: true,
    firstPeriod: "2023-01",
    lastPeriod: "2026-08",
    statementCount: 1,
    typeHistory: [],
    ...overrides,
  };
}

describe("resolveCashCode", () => {
  test("Direct deposit from is payroll", () => {
    expect(resolveCashCode("Direct deposit from Employer Inc")).toBe("CASH_PAYROLL");
  });
  test("Interac e-Transfer received", () => {
    expect(resolveCashCode("Interac e-Transfer® Received from [redacted]")).toBe("CASH_INTERAC_IN");
  });
  test("Interac e-Transfer out", () => {
    expect(resolveCashCode("Interac e-Transfer® Out")).toBe("CASH_INTERAC_OUT");
  });
  test("Interest earned", () => {
    expect(resolveCashCode("Interest earned")).toBe("CASH_INTEREST");
  });
  test("Cash back is a reward", () => {
    expect(resolveCashCode("Cash back - Prepaid card")).toBe("CASH_REWARD");
  });
  test("anything else is a transfer", () => {
    expect(resolveCashCode("Transfer out to Non-registered")).toBe("CASH_TRANSFER");
  });
});

describe("classifyStatement", () => {
  test("CONT credit into a TFSA is outside bank movement", () => {
    const s = statementFixture({ activity: [row("CONT", { credit: 500 })] });
    const [r] = classifyStatement(s, account());
    expect(r?.movement).toBe(true);
    expect(r?.category).toBe("outsideBank");
  });

  test("CONT credit into a corporate account is business", () => {
    const s = statementFixture({
      accountNo: "acct_91b8",
      activity: [row("CONT", { credit: 5000 })],
    });
    const [r] = classifyStatement(
      s,
      account({ kind: "Corporate", shortId: "91b8", maskedId: "acct_91b8" }),
    );
    expect(r?.category).toBe("business");
  });

  test("EFT credit into a corporate account is business", () => {
    const s = statementFixture({
      accountNo: "acct_91b8",
      activity: [row("EFT", { credit: 1000 })],
    });
    const [r] = classifyStatement(
      s,
      account({ kind: "Corporate", shortId: "91b8", maskedId: "acct_91b8" }),
    );
    expect(r?.category).toBe("business");
  });

  test("AFT_IN into chequing is payroll", () => {
    const s = statementFixture({
      accountNo: "acct_2b74",
      activity: [row("AFT_IN", { credit: 3000 })],
    });
    const [r] = classifyStatement(
      s,
      account({ kind: "Chequing", shortId: "2b74", maskedId: "acct_2b74" }),
    );
    expect(r?.category).toBe("payroll");
  });

  test("DEP credit on 2b74 is the reviewed payroll override", () => {
    const s = statementFixture({
      accountNo: "acct_2b74",
      activity: [row("DEP", { credit: 2342 })],
    });
    const [r] = classifyStatement(
      s,
      account({ kind: "Chequing", shortId: "2b74", maskedId: "acct_2b74" }),
    );
    expect(r?.category).toBe("payroll");
  });

  test("DEP credit on another chequing account is outside bank", () => {
    const s = statementFixture({
      accountNo: "acct_8cd3",
      activity: [row("DEP", { credit: 44000 })],
    });
    const [r] = classifyStatement(
      s,
      account({ kind: "Chequing", shortId: "8cd3", maskedId: "acct_8cd3" }),
    );
    expect(r?.category).toBe("outsideBank");
  });

  test("E_TRFIN credit is an Interac receipt", () => {
    const s = statementFixture({
      accountNo: "acct_2b74",
      activity: [row("E_TRFIN", { credit: 100 })],
    });
    const [r] = classifyStatement(
      s,
      account({ kind: "Chequing", shortId: "2b74", maskedId: "acct_2b74" }),
    );
    expect(r?.category).toBe("interacIn");
  });

  test("TRFOUT debit is a movement that left Wealthsimple", () => {
    const s = statementFixture({
      accountNo: "acct_2b74",
      activity: [row("TRFOUT", { debit: 700 })],
    });
    const [r] = classifyStatement(
      s,
      account({ kind: "Chequing", shortId: "2b74", maskedId: "acct_2b74" }),
    );
    expect(r?.movement).toBe(true);
    expect(r?.category).toBe("leftWealthsimple");
    expect(r?.amountCad).toBe(-700);
  });

  test("SPEND debit is not a movement but still left Wealthsimple", () => {
    const s = statementFixture({ accountNo: "acct_2b74", activity: [row("SPEND", { debit: 50 })] });
    const [r] = classifyStatement(
      s,
      account({ kind: "Chequing", shortId: "2b74", maskedId: "acct_2b74" }),
    );
    expect(r?.movement).toBe(false);
    expect(r?.category).toBe("leftWealthsimple");
  });

  test("CASH payroll description resolves and classifies as payroll", () => {
    const s = statementFixture({
      accountNo: "acct_2b74",
      template: "CASH",
      activity: [row("", { credit: 2000, description: "Direct deposit from Employer Inc" })],
    });
    const [r] = classifyStatement(
      s,
      account({ kind: "Chequing", shortId: "2b74", maskedId: "acct_2b74" }),
    );
    expect(r?.code).toBe("CASH_PAYROLL");
    expect(r?.category).toBe("payroll");
  });

  test("CASH Interac received description resolves and classifies", () => {
    const s = statementFixture({
      accountNo: "acct_2b74",
      template: "CASH",
      activity: [
        row("", { credit: 100, description: "Interac e-Transfer® Received from [redacted]" }),
      ],
    });
    const [r] = classifyStatement(
      s,
      account({ kind: "Chequing", shortId: "2b74", maskedId: "acct_2b74" }),
    );
    expect(r?.code).toBe("CASH_INTERAC_IN");
    expect(r?.category).toBe("interacIn");
  });

  test("CASH Interac out description resolves and is a movement", () => {
    const s = statementFixture({
      accountNo: "acct_2b74",
      template: "CASH",
      activity: [row("", { debit: 100, description: "Interac e-Transfer® Out" })],
    });
    const [r] = classifyStatement(
      s,
      account({ kind: "Chequing", shortId: "2b74", maskedId: "acct_2b74" }),
    );
    expect(r?.code).toBe("CASH_INTERAC_OUT");
    expect(r?.movement).toBe(true);
  });

  test("CASH transfer out description resolves and is a movement", () => {
    const s = statementFixture({
      accountNo: "acct_2b74",
      template: "CASH",
      activity: [row("", { debit: 300, description: "Transfer out to Non-registered" })],
    });
    const [r] = classifyStatement(
      s,
      account({ kind: "Chequing", shortId: "2b74", maskedId: "acct_2b74" }),
    );
    expect(r?.code).toBe("CASH_TRANSFER");
    expect(r?.movement).toBe(true);
  });

  test("CASH interest description resolves to income", () => {
    const s = statementFixture({
      accountNo: "acct_2b74",
      template: "CASH",
      activity: [row("", { credit: 1.23, description: "Interest earned" })],
    });
    const [r] = classifyStatement(
      s,
      account({ kind: "Chequing", shortId: "2b74", maskedId: "acct_2b74" }),
    );
    expect(r?.code).toBe("CASH_INTEREST");
    expect(r?.category).toBe("income");
  });

  test("CASH cash back description resolves to income", () => {
    const s = statementFixture({
      accountNo: "acct_2b74",
      template: "CASH",
      activity: [row("", { credit: 5, description: "Cash back - Prepaid card" })],
    });
    const [r] = classifyStatement(
      s,
      account({ kind: "Chequing", shortId: "2b74", maskedId: "acct_2b74" }),
    );
    expect(r?.code).toBe("CASH_REWARD");
    expect(r?.category).toBe("income");
  });

  test("a dividend reversal produces two income rows with signed amounts", () => {
    const s = statementFixture({
      accountNo: "acct_97ab",
      activity: [row("DIV", { credit: 81.8 }), row("DIV", { debit: 40.9 })],
    });
    const rows = classifyStatement(
      s,
      account({ kind: "SpousalRRSP", shortId: "97ab", maskedId: "acct_97ab" }),
    );
    expect(rows).toHaveLength(2);
    expect(rows[0]?.amountCad).toBeCloseTo(81.8, 6);
    expect(rows[0]?.category).toBe("income");
    expect(rows[1]?.amountCad).toBeCloseTo(-40.9, 6);
    expect(rows[1]?.category).toBe("income");
  });

  test("a USD dividend converts at the statement's own rate", () => {
    const s = statementFixture({
      accountNo: "acct_2c62",
      fxRate: 1.4,
      activity: [row("DIV", { credit: 10, currency: "USD" as Currency })],
    });
    const [r] = classifyStatement(
      s,
      account({ kind: "NonRegistered", shortId: "2c62", maskedId: "acct_2c62" }),
    );
    expect(r?.amountCad).toBeCloseTo(14, 6);
    expect(r?.amount).toBe(10);
    expect(r?.fxRate).toBe(1.4);
  });

  test("a REIMB row worded as an ETF rebate is a fee, positive", () => {
    const s = statementFixture({
      activity: [row("REIMB", { credit: 1.5, description: "ETF Rebate" })],
    });
    const [r] = classifyStatement(s, account());
    expect(r?.category).toBe("fee");
    expect(r?.amountCad).toBeGreaterThan(0);
  });

  test("a REIMB row worded otherwise is income", () => {
    const s = statementFixture({
      activity: [row("REIMB", { credit: 1.5, description: "Miscellaneous credit" })],
    });
    const [r] = classifyStatement(s, account());
    expect(r?.category).toBe("income");
  });

  test("a BUY row extracts its symbol", () => {
    const s = statementFixture({
      period: "2026-05",
      activity: [
        row("BUY", {
          debit: 100,
          description: "VFV - Vanguard S&P 500 Index ETF: Bought 2 shares",
        }),
      ],
    });
    const [r] = classifyStatement(s, account());
    expect(r?.category).toBe("buy");
    expect(r?.symbol).toBe("VFV");
    expect(r?.id).toBe("d77c:2026-05:B:0");
  });

  test("a BUY row with an empty description has an empty symbol", () => {
    const s = statementFixture({ activity: [row("BUY", { debit: 100, description: "" })] });
    const [r] = classifyStatement(s, account());
    expect(r?.category).toBe("buy");
    expect(r?.symbol).toBe("");
  });

  test("an in-kind transfer in carries no cash and is excluded from movement", () => {
    const s = statementFixture({
      activity: [
        row("TRFIN", {
          description:
            "BABA - Alibaba Group Holding Ltd: Transfer of 2.0000 shares into the account",
        }),
      ],
    });
    const [r] = classifyStatement(s, account());
    expect(r?.category).toBe("inKind");
    expect(r?.movement).toBe(false);
    expect(r?.amountCad).toBe(0);
  });

  test("a zero LOAN row produces no row", () => {
    const s = statementFixture({ activity: [row("LOAN")] });
    expect(classifyStatement(s, account())).toEqual([]);
  });

  test("a nonzero LOAN row throws, naming the file and code", () => {
    const s = statementFixture({ activity: [row("LOAN", { credit: 5 })] });
    expect(() => classifyStatement(s, account())).toThrow(/LOAN/);
  });

  test("an unknown activity code throws, naming the file and code", () => {
    const s = statementFixture({ activity: [row("NEWCODE", { credit: 5 })] });
    expect(() => classifyStatement(s, account())).toThrow(/NEWCODE/);
  });

  test("a USD DEP debit on a rateless statement throws", () => {
    const s = statementFixture({
      accountNo: "acct_2c62",
      fxRate: null,
      activity: [row("DEP", { debit: 10, currency: "USD" as Currency })],
    });
    expect(() =>
      classifyStatement(
        s,
        account({ kind: "NonRegistered", shortId: "2c62", maskedId: "acct_2c62" }),
      ),
    ).toThrow();
  });
});
