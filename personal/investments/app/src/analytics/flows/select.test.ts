import { describe, expect, test } from "bun:test";
import type { Statement } from "../../types";
import { selectFlowStatements } from "./select";

function statementFixture(overrides: {
  accountNo?: string;
  period?: string;
  template?: "BROKERAGE" | "CASH" | "PERFORMANCE";
  version?: number;
}): Statement {
  const {
    accountNo = "acct_cheq",
    period = "2026-05",
    template = "BROKERAGE",
    version = 0,
  } = overrides;
  return {
    source: {
      file: `${accountNo}_${period}_${template}.pdf`,
      accountNo,
      period,
      template,
      version,
    },
    accountType: "",
    periodStart: `${period}-01`,
    periodEnd: `${period}-28`,
    portfolio: null,
    cash: [],
    holdings: [],
    activity: [],
    contributions: null,
    dividendsYearToDate: null,
    fxRate: null,
    returns: null,
    balances: null,
  };
}

describe("selectFlowStatements", () => {
  test("a chequing month with BROKERAGE and CASH keeps only BROKERAGE", () => {
    const b = statementFixture({
      accountNo: "acct_cheq",
      period: "2026-05",
      template: "BROKERAGE",
    });
    const c = statementFixture({ accountNo: "acct_cheq", period: "2026-05", template: "CASH" });
    expect(selectFlowStatements([b, c])).toEqual([b]);
  });

  test("a CASH statement with no BROKERAGE twin is kept", () => {
    const c = statementFixture({ accountNo: "acct_cheq", period: "2026-07", template: "CASH" });
    expect(selectFlowStatements([c])).toEqual([c]);
  });

  test("PERFORMANCE is skipped and an amended version replaces its original", () => {
    const v0 = statementFixture({ period: "2026-04", template: "BROKERAGE", version: 0 });
    const v1 = statementFixture({ period: "2026-04", template: "BROKERAGE", version: 1 });
    const p = statementFixture({ period: "2026-04", template: "PERFORMANCE" });
    expect(selectFlowStatements([v0, v1, p])).toEqual([v1]);
  });
});
