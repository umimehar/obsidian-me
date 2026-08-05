import { classifyAccountType, maskAccountNo } from "../store/mask";
import type { CashSummary, Statement } from "../types";
import { type Finding, within } from "./report";

function finding(
  check: Finding["check"],
  s: Statement,
  message: string,
  expected: number | null,
  actual: number | null,
  severity: Finding["severity"] = "error",
): Finding {
  return {
    check,
    severity,
    // Masked: the report is committed.
    accountShortId: maskAccountNo(s.source.accountNo).shortId,
    period: s.source.period,
    message,
    expected,
    actual,
    delta: expected !== null && actual !== null ? actual - expected : null,
    sourceFile: s.source.file,
  };
}

function checkCashBlock(s: Statement, cash: CashSummary, out: Finding[]): void {
  if (cash.totalIn === null || cash.totalOut === null) return;

  const derived = cash.opening + cash.totalIn - cash.totalOut;
  if (!within(derived, cash.closing)) {
    out.push(
      finding(
        "statement-arithmetic",
        s,
        `${cash.currency} cash does not reconcile: opening + paid in - paid out != closing`,
        derived,
        cash.closing,
      ),
    );
  }
  if (cash.paidIn) {
    const sum = Object.values(cash.paidIn).reduce((a, v) => a + v, 0);
    if (!within(sum, cash.totalIn)) {
      out.push(
        finding(
          "statement-arithmetic",
          s,
          `${cash.currency} paid in breakdown does not sum to the printed total`,
          cash.totalIn,
          sum,
        ),
      );
    }
  }
  if (cash.paidOut) {
    const sum = Object.values(cash.paidOut).reduce((a, v) => a + v, 0);
    if (!within(sum, cash.totalOut)) {
      out.push(
        finding(
          "statement-arithmetic",
          s,
          `${cash.currency} paid out breakdown does not sum to the printed total`,
          cash.totalOut,
          sum,
        ),
      );
    }
  }
}

export function checkArithmetic(statements: readonly Statement[]): Finding[] {
  const out: Finding[] = [];

  for (const s of statements) {
    for (const cash of s.cash) checkCashBlock(s, cash, out);

    const p = s.portfolio;
    if (!p) {
      if (s.source.template !== "CASH") {
        out.push(
          finding(
            "missing-portfolio",
            s,
            "no portfolio summary on a statement that must print one",
            null,
            null,
          ),
        );
      }
      continue;
    }

    // Checked against the portfolio total rather than per asset class: the
    // summary's class label wraps around mailing-address rows and does not
    // match the assets section's heading. This check is stronger anyway.
    const sum = s.holdings.reduce((a, h) => a + h.marketValue, 0) + p.cashMarketValue;
    if (!within(sum, p.totalMarketValue)) {
      out.push(
        finding(
          "statement-arithmetic",
          s,
          "holdings plus cash do not equal the portfolio total",
          p.totalMarketValue,
          sum,
        ),
      );
    }
  }
  return out;
}

/** Groups by account AND template. The chequing accounts have two per month. */
function bySeries(statements: readonly Statement[]): Map<string, Statement[]> {
  const map = new Map<string, Statement[]>();
  for (const s of statements) {
    if (s.source.template === "PERFORMANCE") continue;
    const key = `${s.source.accountNo}|${s.source.template}`;
    const list = map.get(key) ?? [];
    list.push(s);
    map.set(key, list);
  }
  for (const list of map.values()) {
    list.sort(
      (a, b) =>
        a.source.period.localeCompare(b.source.period) || a.source.version - b.source.version,
    );
  }
  return map;
}

export function checkContinuity(statements: readonly Statement[]): Finding[] {
  const out: Finding[] = [];

  for (const list of bySeries(statements).values()) {
    for (let i = 1; i < list.length; i += 1) {
      const prev = list[i - 1];
      const curr = list[i];
      if (!prev || !curr || prev.source.period === curr.source.period) continue;

      for (const cash of curr.cash) {
        const prior = prev.cash.find((c) => c.currency === cash.currency);
        if (!prior) continue;
        if (!within(prior.closing, cash.opening)) {
          out.push(
            finding(
              "cash-continuity",
              curr,
              `${cash.currency} opening does not match ${prev.source.period} closing`,
              prior.closing,
              cash.opening,
            ),
          );
        }
      }
    }
  }
  return out;
}

function nextPeriod(period: string): string {
  const [y, m] = period.split("-").map(Number);
  if (y === undefined || m === undefined) return period;
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
}

/** Comfortably beyond any real corpus; guards against a malformed period stalling nextPeriod. */
const MAX_COVERAGE_SPAN = 3000;

export function checkCoverage(statements: readonly Statement[]): Finding[] {
  const out: Finding[] = [];

  for (const list of bySeries(statements).values()) {
    const present = new Set(list.map((s) => s.source.period));
    const first = list[0];
    const last = list[list.length - 1];
    if (!first || !last) continue;

    let p = first.source.period;
    let steps = 0;
    while (p < last.source.period) {
      if (steps >= MAX_COVERAGE_SPAN) {
        out.push({
          check: "coverage-gap",
          severity: "error",
          accountShortId: maskAccountNo(first.source.accountNo).shortId,
          period: p,
          message: `coverage scan stuck at this period after ${MAX_COVERAGE_SPAN} steps without reaching ${last.source.period}; the period format is likely malformed`,
          expected: null,
          actual: null,
          delta: null,
          sourceFile: "",
        });
        break;
      }
      if (!present.has(p)) {
        out.push({
          check: "coverage-gap",
          severity: "warning",
          accountShortId: maskAccountNo(first.source.accountNo).shortId,
          period: p,
          message: `no ${first.source.template} statement for this month`,
          expected: null,
          actual: null,
          delta: null,
          sourceFile: "",
        });
      }
      p = nextPeriod(p);
      steps += 1;
    }
  }
  return out;
}

export function checkSupersession(statements: readonly Statement[]): Finding[] {
  const seen = new Map<string, Statement[]>();
  for (const s of statements) {
    const key = `${s.source.accountNo}|${s.source.period}|${s.source.template}`;
    const list = seen.get(key) ?? [];
    list.push(s);
    seen.set(key, list);
  }

  const out: Finding[] = [];
  for (const list of seen.values()) {
    if (list.length < 2) continue;
    const sorted = [...list].sort((a, b) => a.source.version - b.source.version);
    const latest = sorted[sorted.length - 1];
    if (!latest) continue;
    out.push(
      finding(
        "superseded",
        latest,
        `${sorted.length} versions of this statement; version ${latest.source.version} is used`,
        null,
        null,
        "warning",
      ),
    );
  }
  return out;
}

export function checkKindConsistency(statements: readonly Statement[]): Finding[] {
  const byAccount = new Map<string, Statement[]>();
  for (const s of statements) {
    const list = byAccount.get(s.source.accountNo) ?? [];
    list.push(s);
    byAccount.set(s.source.accountNo, list);
  }

  const out: Finding[] = [];
  for (const list of byAccount.values()) {
    const kinds = new Set(list.map((s) => classifyAccountType(s.accountType).kind));
    if (kinds.size <= 1) continue;
    const latest = [...list].sort((a, b) => a.source.period.localeCompare(b.source.period)).pop();
    if (!latest) continue;
    out.push(
      finding(
        "kind-drift",
        latest,
        `account maps to more than one kind across its history: ${[...kinds].join(", ")}`,
        null,
        null,
      ),
    );
  }
  return out;
}

export function checkCrossDocument(statements: readonly Statement[]): Finding[] {
  const out: Finding[] = [];

  for (const p of statements.filter((s) => s.source.template === "PERFORMANCE")) {
    const twin = statements.find(
      (s) =>
        s.source.template === "BROKERAGE" &&
        s.source.accountNo === p.source.accountNo &&
        s.source.period === p.source.period,
    );
    if (
      twin?.portfolio &&
      p.portfolio &&
      !within(twin.portfolio.totalMarketValue, p.portfolio.totalMarketValue)
    ) {
      out.push(
        finding(
          "cross-document",
          p,
          "performance and brokerage statements disagree on the portfolio total",
          twin.portfolio.totalMarketValue,
          p.portfolio.totalMarketValue,
        ),
      );
    }
    const b = p.balances;
    if (!b) {
      // A PERFORMANCE statement is defined by carrying a balance summary, so
      // a null one is a parser bug -- with one documented exception: an
      // account funded mid-period prints a dash instead of a figure, which
      // legitimately parses to null. Warning, not error, to reflect that.
      out.push(
        finding(
          "cross-document",
          p,
          "no balance summary on this PERFORMANCE statement (expected only when the account was funded mid-period)",
          null,
          null,
          "warning",
        ),
      );
      continue;
    }

    const derived = b.start + b.deposits - b.withdrawals + b.changeInMarketValue;
    if (!within(derived, b.end)) {
      out.push(finding("cross-document", p, "balance summary does not reconcile", derived, b.end));
    }
    if (p.portfolio && !within(b.end, p.portfolio.totalMarketValue)) {
      out.push(
        finding(
          "cross-document",
          p,
          "balance summary end does not match the portfolio total",
          p.portfolio.totalMarketValue,
          b.end,
        ),
      );
    }
  }
  return out;
}

export interface Observation {
  observed: string;
  period: string;
  accountValue: number | null;
  netDeposits: number | null;
}

export function checkGroundTruth(
  statements: readonly Statement[],
  observations: readonly Observation[],
  countedAccounts: ReadonlySet<string>,
): Finding[] {
  const out: Finding[] = [];

  for (const obs of observations) {
    if (obs.accountValue === null) continue;

    // PERFORMANCE excluded: it duplicates its BROKERAGE twin's portfolio.
    const scoped = statements
      .filter((s) => s.source.period === obs.period && s.source.template === "BROKERAGE")
      .filter((s) => countedAccounts.size === 0 || countedAccounts.has(s.source.accountNo));

    const total = scoped.reduce((a, s) => a + (s.portfolio?.totalMarketValue ?? 0), 0);
    const pending = scoped.flatMap((s) => s.holdings.filter((h) => h.pendingValuation));

    const note =
      pending.length > 0
        ? ` (${pending.length} holding(s) carry a pending valuation: ${pending.map((h) => h.symbol).join(", ")})`
        : "";

    out.push({
      check: "ground-truth",
      severity: "warning",
      accountShortId: "*",
      period: obs.period,
      message: `account value on ${obs.observed} versus the app${note}`,
      expected: obs.accountValue,
      actual: total,
      delta: total - obs.accountValue,
      sourceFile: "",
    });
  }
  return out;
}

export function runChecks(
  statements: readonly Statement[],
  observations: readonly Observation[],
  countedAccounts: ReadonlySet<string>,
): Finding[] {
  return [
    ...checkArithmetic(statements),
    ...checkContinuity(statements),
    ...checkCoverage(statements),
    ...checkCrossDocument(statements),
    ...checkSupersession(statements),
    ...checkKindConsistency(statements),
    ...checkGroundTruth(statements, observations, countedAccounts),
  ];
}
