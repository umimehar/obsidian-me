import { classifyAccountType, maskAccountNo } from "../store/mask";
import type {
  ActivityRow,
  AssetClassTotal,
  CashSummary,
  Holding,
  PortfolioSummary,
  Statement,
} from "../types";
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

/**
 * Two known statement-side quirks make the activity ledger's own
 * credit/debit sums differ from the printed totalIn/totalOut, and both leave
 * the identical residual on both sides -- whatever gets excluded from cash
 * paid in is excluded from cash paid out by the same amount, because in
 * both cases it is really one entry the statement nets between the two
 * categories rather than two independent errors. So a shared residual
 * (`within(diffIn, diffOut)`) is the precondition for either explanation;
 * without it there is no single netted entry that could account for both
 * sides at once, and the mismatch is unexplained.
 *
 * - A small ETF-rebate credit is coded FEE or REIMB -- the same codes the
 *   real management fee and reimbursement debits use -- and the statement
 *   nets it against Fees paid out instead of counting it as cash in. The
 *   description wording for it changes across the corpus ("ETF Rebate",
 *   "ACCOUNTING_REIMBURSEMENT"), so detection keys on the code plus a credit
 *   sign (the real fee/reimbursement is always a debit) rather than on
 *   wording, account, or period, so it generalizes to any statement with the
 *   same shape.
 * - An amended/corrected statement can reverse an earlier entry: a credit
 *   for amount X, and elsewhere a same-coded debit for the same X, with
 *   neither counted in the printed totals. Detected by finding that matching
 *   credit/debit pair rather than assuming a single row.
 *
 * Returns null when the residual has no such counterpart in the rows
 * themselves, which is the honest answer for the cases this cannot explain.
 */
function explainActivityMismatch(
  rows: readonly ActivityRow[],
  diffIn: number,
  diffOut: number,
): string | null {
  if (!within(diffIn, diffOut)) return null;
  const netAmount = diffIn;
  if (within(netAmount, 0)) return null;

  const rebateSum = rows
    .filter((r) => (r.code === "FEE" || r.code === "REIMB") && r.credit > 0)
    .reduce((a, r) => a + r.credit, 0);
  if (rebateSum > 0 && within(rebateSum, netAmount)) {
    return `${rebateSum.toFixed(2)} of FEE/REIMB-coded rebate credits appear netted against fees paid out rather than counted as cash in`;
  }

  const reversedCredit = rows.find(
    (credit) =>
      credit.credit > 0 &&
      within(credit.credit, netAmount) &&
      rows.some(
        (debit) => debit !== credit && debit.code === credit.code && within(debit.debit, netAmount),
      ),
  );
  if (reversedCredit) {
    return `a ${reversedCredit.code} entry for ${netAmount.toFixed(2)} appears reversed elsewhere on the statement, consistent with an amended/corrected statement whose printed totals exclude the correction`;
  }

  return null;
}

function checkActivityRows(s: Statement, cash: CashSummary, out: Finding[]): void {
  if (cash.totalIn === null || cash.totalOut === null) return;

  const rows = s.activity.filter((r) => r.currency === cash.currency);
  const creditSum = rows.reduce((a, r) => a + r.credit, 0);
  const debitSum = rows.reduce((a, r) => a + r.debit, 0);
  const inOk = within(creditSum, cash.totalIn);
  const outOk = within(debitSum, cash.totalOut);
  if (inOk && outOk) return;

  const explanation = explainActivityMismatch(
    rows,
    creditSum - cash.totalIn,
    debitSum - cash.totalOut,
  );
  const severity = explanation ? "warning" : "error";

  if (!inOk) {
    out.push(
      finding(
        "statement-arithmetic",
        s,
        explanation
          ? `${cash.currency} activity credits do not sum to cash paid in: ${explanation}`
          : `${cash.currency} activity credits do not sum to the printed cash paid in`,
        cash.totalIn,
        creditSum,
        severity,
      ),
    );
  }
  if (!outOk) {
    out.push(
      finding(
        "statement-arithmetic",
        s,
        explanation
          ? `${cash.currency} activity debits do not sum to cash paid out: ${explanation}`
          : `${cash.currency} activity debits do not sum to the printed cash paid out`,
        cash.totalOut,
        debitSum,
        severity,
      ),
    );
  }
}

function checkMissingPortfolio(s: Statement, out: Finding[]): void {
  if (s.source.template === "CASH") return;
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

/**
 * Checked against the portfolio total rather than per asset class: the
 * summary's class label wraps around mailing-address rows and does not
 * match the assets section's heading. This check is stronger anyway.
 *
 * A converted USD holding is exactly what the disclosed fx rate covers
 * (unlike book cost below), so a mismatch here is not automatically a
 * parser defect: the statement prints that rate to six decimals, and
 * summing several holdings converted at a rounded rate drifts a cent or two
 * from whatever precision the statement's own total used. A cent per
 * converted holding is the budget for that drift; a residual within it is
 * fx rounding, one bigger than that -- or one on a CAD-only statement, where
 * no conversion touched the numbers at all -- has no such excuse and stays
 * an error.
 */
function checkMarketValue(s: Statement, p: PortfolioSummary, out: Finding[]): void {
  const sum = s.holdings.reduce((a, h) => a + h.marketValue, 0) + p.cashMarketValue;
  if (within(sum, p.totalMarketValue)) return;

  const convertedCount = s.holdings.filter((h) => h.marketValueConverted).length;
  const delta = sum - p.totalMarketValue;
  const isRounding = convertedCount > 0 && Math.abs(delta) <= convertedCount * 0.01;
  out.push(
    finding(
      "statement-arithmetic",
      s,
      isRounding
        ? `market value differs by ${delta.toFixed(2)}; the statement's fx rate is disclosed to six decimals, so summing ${convertedCount} converted USD holding(s) drifts by rounding`
        : "holdings plus cash do not equal the portfolio total",
      p.totalMarketValue,
      sum,
      isRounding ? "warning" : "error",
    ),
  );
}

interface ClassBookCostResult {
  name: string;
  sum: number;
  expected: number;
  hasConverted: boolean;
  reconciles: boolean;
}

/**
 * A magnitude budget cannot separate an fx residual from a real column-read
 * bug: measuring what a wrong-column read (book cost misread as market
 * value) would look like gives 0.16%-26.05% across the same 19 statements
 * that carry real fx residuals of 0.02%-4.55% -- the two overlap in size, so
 * no threshold can tell them apart. The statement's own structure can,
 * though: it states book cost per asset class, and every holding carries
 * its class. A class made entirely of unconverted (CAD) holdings has no fx
 * rate touching it at all, so its book cost must reconcile exactly; a class
 * with a converted holding is where the approximation actually lives.
 */
function reconcileClassBookCost(
  holdings: readonly Holding[],
  cls: AssetClassTotal,
): ClassBookCostResult {
  const classHoldings = holdings.filter((h) => h.assetClass === cls.name);
  const sum = classHoldings.reduce((a, h) => a + h.bookCost, 0);
  return {
    name: cls.name,
    sum,
    expected: cls.bookCost,
    hasConverted: classHoldings.some((h) => h.bookCostConverted),
    reconciles: within(sum, cls.bookCost),
  };
}

function pushClassBookCostFindings(
  s: Statement,
  results: readonly ClassBookCostResult[],
  out: Finding[],
): void {
  for (const r of results) {
    if (r.reconciles) continue;
    const delta = r.sum - r.expected;
    out.push(
      finding(
        "statement-arithmetic",
        s,
        r.hasConverted
          ? `${r.name} book cost differs by ${delta.toFixed(2)}; the statement's disclosed rate applies to market value only, so converted USD book cost is approximate`
          : `${r.name} book cost does not reconcile: holdings sum to a different figure than the class total`,
        r.expected,
        r.sum,
        r.hasConverted ? "warning" : "error",
      ),
    );
  }
}

/**
 * The whole-statement figure is kept too, but its severity is derived from
 * the per-class results rather than from "some holding somewhere is USD":
 * a real defect in one class must not be excused by an unrelated converted
 * class reconciling fine elsewhere on the same statement. Only when every
 * class-level mismatch is a converted one (or there is no class-level
 * mismatch to explain a cash-only residual) does the whole-statement figure
 * read as the fx warning; any class-level error demotes it back to error.
 */
function checkBookCost(s: Statement, p: PortfolioSummary, out: Finding[]): void {
  const results = p.classes.map((cls) => reconcileClassBookCost(s.holdings, cls));
  pushClassBookCostFindings(s, results, out);

  const bookSum = s.holdings.reduce((a, h) => a + h.bookCost, 0) + p.cashBookCost;
  if (within(bookSum, p.totalBookCost)) return;

  const anyClassError = results.some((r) => !r.reconciles && !r.hasConverted);
  const anyClassWarning = results.some((r) => !r.reconciles && r.hasConverted);
  const isApproximate = !anyClassError && anyClassWarning;
  const delta = bookSum - p.totalBookCost;
  out.push(
    finding(
      "statement-arithmetic",
      s,
      isApproximate
        ? `book cost differs by ${delta.toFixed(2)}; the statement's disclosed rate applies to market value only, so converted USD book cost is approximate`
        : "holdings plus cash do not equal the portfolio book cost total",
      p.totalBookCost,
      bookSum,
      isApproximate ? "warning" : "error",
    ),
  );
}

export function checkArithmetic(statements: readonly Statement[]): Finding[] {
  const out: Finding[] = [];

  for (const s of statements) {
    for (const cash of s.cash) {
      checkCashBlock(s, cash, out);
      checkActivityRows(s, cash, out);
    }

    const p = s.portfolio;
    if (!p) {
      checkMissingPortfolio(s, out);
      continue;
    }

    checkMarketValue(s, p, out);
    checkBookCost(s, p, out);
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
