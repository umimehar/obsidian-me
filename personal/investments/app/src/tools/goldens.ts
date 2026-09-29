import { join } from "node:path";
import rawDatastore from "@data/datastore.json";
import { simulateBenchmark, skippedPeriods } from "../analytics/benchmark";
import type { AnalyticsOutput } from "../analytics/build";
import { buildCashflowSeries } from "../analytics/cashflowSeries";
import { feeReconciliationGaps } from "../analytics/feeReconciliation";
import { buildFlows } from "../analytics/flows/build";
import { buildFlowGraph, depositsByDestination } from "../analytics/flows/graph";
import { type FlowPeriod, allTime, yearPeriod } from "../analytics/flows/period";
import { flowSummary } from "../analytics/flows/summary";
import type { FlowsData } from "../analytics/flows/types";
import { latestGroupGain } from "../analytics/groupGain";
import type { HoldingsOutput } from "../analytics/holdings";
import { buildIncome } from "../analytics/income";
import { chequingInterestByAccount, incomeByYear } from "../analytics/incomeCosts";
import { monthReview, reviewPeriods } from "../analytics/monthReview";
import { buildPortfolioSeries } from "../analytics/portfolioSeries";
import { latestMarketValue, rollup } from "../analytics/rollup";
import type { Lens } from "../analytics/rollup";
import { buildSeries } from "../analytics/series";
import type { AccountSeries } from "../analytics/types";
import { GOLDEN_GOALS, STRETCH_GOAL } from "../goals/__fixtures__/goals";
import { accountValues, buildAllocations } from "../goals/allocation";
import { contributionToClose, evaluateGoal } from "../goals/evaluate";
import { buildRunway } from "../goals/runway";
import type { Goldens } from "../goldens";
import { loadPlan, retirementYear as planRetirementYear } from "../plan";
import { type ProjectionYear, projectYears } from "../projection/engine";
import { fittedReturnRate } from "../projection/fittedRate";
import { projectedAccounts, projectionInputs } from "../projection/inputs";
import { milestoneYear, retirementIncome, runScenarios } from "../projection/scenario";
import type { Datastore } from "../store/datastore";
import { defaultSelection } from "../ui/chartAccounts";
import type { ReturnValuePoint } from "../ui/charts/returnsSeries";
import {
  accountRateExtent,
  buildReturnsSeries,
  chartedReturnAccounts,
  plottedCount,
} from "../ui/charts/returnsSeries";
import {
  latestPeriod,
  lensTotal,
  loadAnalytics,
  loadBenchmark,
  loadReconciliation,
} from "../ui/data";

const DATA = join(import.meta.dir, "..", "..", "..", "data");
const LENSES: readonly Lens[] = ["registration", "account", "purpose"];

/**
 * Every figure in this file is computed by calling the SAME production
 * function the test that reads it calls. Nothing here restates a number by
 * hand, so a golden cannot encode a figure the pipeline does not actually
 * produce -- the failure mode of a hand-maintained golden file, and the
 * reason the 145 inline literals this replaces were worth removing rather
 * than re-typing.
 */

/**
 * Sums the RESP accounts' tagged `CONT` credits straight off the datastore.
 * Deliberately NOT read from `contributionsByYear`, which already folds `DEP`
 * rows in -- the whole point of the figure is to be the undercount that
 * folding avoids.
 */
function respContRowTotal(datastore: Datastore, series: readonly AccountSeries[]): number {
  const respIds = new Set(series.filter((a) => a.kind === "RESP").map((a) => a.maskedId));
  let total = 0;
  for (const statement of datastore.statements) {
    if (!respIds.has(statement.source.accountNo)) continue;
    for (const row of statement.activity) {
      if (row.code === "CONT") total += row.credit;
    }
  }
  return total;
}

/**
 * Unwraps a value the corpus must have produced, or throws naming what was
 * missing. Every one of these is a corrupt-artifact case rather than an
 * expected absence: a corpus with no portfolio points, no counted period or
 * no CESG row means `bun run build` did not finish, and writing a goldens
 * file full of zeroes from it would hand every test a plausible wrong number.
 */
function required<T>(value: T | null | undefined, what: string): T {
  if (value === null || value === undefined) throw new Error(`the corpus produced no ${what}`);
  return value;
}

/** Latest market, book and gain per lens-and-label, with the group's own period range. */
function buildGroups(series: readonly AccountSeries[]): Goldens["groups"] {
  const groups: Goldens["groups"] = {};
  for (const lens of LENSES) {
    for (const group of rollup(series, lens)) {
      const ids = new Set(group.accounts.map((a) => a.maskedId));
      const groupSeries = series.filter((s) => ids.has(s.maskedId) && s.inTotals);
      const gain = latestGroupGain(groupSeries);
      if (!gain) continue;
      const points = buildPortfolioSeries(groupSeries);
      groups[`${lens}:${group.label}`] = {
        market: gain.marketValue,
        book: gain.bookCost,
        gain: gain.gain,
        firstPeriod: points[0]?.period ?? "",
        lastPeriod: points[points.length - 1]?.period ?? "",
      };
    }
  }
  return groups;
}

/**
 * Account-lens groups whose latest gain is negative. Recorded rather than
 * asserted as a constant, because whether the corpus contains a loss at all is
 * a property of this month's market: Private Market Fund and Crypto were the
 * corpus's only two losses at 2026-06 and both turned positive at 2026-07,
 * which silently made a test that pinned -$3.16 unsatisfiable.
 */
function accountLossGroups(groups: Goldens["groups"]): string[] {
  return Object.entries(groups)
    .filter(([key, g]) => key.startsWith("account:") && g.gain < 0)
    .map(([key]) => key.slice("account:".length))
    .sort();
}

/** Latest stated market value per account. An account stating none is omitted, never zeroed. */
function buildAccounts(series: readonly AccountSeries[]): Goldens["accounts"] {
  const accounts: Goldens["accounts"] = {};
  for (const account of series) {
    const value = latestMarketValue(account);
    if (value !== null) accounts[account.shortId] = value;
  }
  return accounts;
}

function buildAllocationGoldens(series: readonly AccountSeries[]): Goldens["allocations"] {
  const allocations: Goldens["allocations"] = {};
  for (const a of buildAllocations(series)) {
    allocations[a.accountId] = { group: a.group, share: a.share, opening: a.opening };
  }
  return allocations;
}

function toPair(extent: readonly [number, number] | null): [number, number] | null {
  return extent === null ? null : [extent[0], extent[1]];
}

function buildReturnGoldens(
  returnsSeries: readonly { shortId: string; points: readonly ReturnValuePoint[] }[],
): Goldens["returns"] {
  const returns: Goldens["returns"] = {};
  for (const account of returnsSeries) {
    returns[account.shortId] = {
      points: account.points.length,
      plotted: plottedCount(account.points),
      // Copied into a mutable pair: `accountRateExtent` returns a readonly
      // tuple, and the goldens are a plain JSON document.
      extent: toPair(accountRateExtent(account.points)),
    };
  }
  return returns;
}

function buildGoalGoldens(
  analytics: AnalyticsOutput,
  rows: readonly ProjectionYear[],
  fhsaCloseYear: string,
): Goldens["goals"] {
  const goals: Goldens["goals"] = {};
  for (const goal of GOLDEN_GOALS) {
    const v = evaluateGoal(goal, analytics, rows, 0.06, fhsaCloseYear);
    goals[goal.id] = {
      projected: v.projected,
      gap: v.gap,
      monthlyToClose: v.monthlyToClose,
      blocked: v.blocked,
      coveredCount: v.coverage.covered.length,
      uncoveredCount: v.coverage.uncovered.length,
    };
  }
  return goals;
}

type FutureGoldens = Pick<
  Goldens["projection"],
  | "retirementYear"
  | "retirementReal"
  | "retirementNominal"
  | "retirementMonthlyIncome"
  | "milestone500kYear"
  | "milestone1mYear"
>;

/** The Future tab's own headline figures, run through the same production functions the page calls. */
function buildFutureGoldens(analytics: AnalyticsOutput, startYear: string): FutureGoldens {
  const plan = loadPlan();
  const retireYear = planRetirementYear(plan);
  const years = Math.max(30, retireYear - Number(startYear));
  const scenarios = runScenarios(analytics, defaultSelection(analytics.series), {
    rate: 0.06,
    spread: 0.02,
    inflation: plan.inflation,
    years,
  });
  const point = scenarios.base.points.find((p) => Number(p.year) === retireYear);
  const income = retirementIncome(scenarios.base.points, retireYear, plan.withdrawalRate);
  return {
    retirementYear: retireYear,
    retirementReal: point?.real ?? 0,
    retirementNominal: point?.nominal ?? 0,
    retirementMonthlyIncome: income?.monthly ?? 0,
    milestone500kYear: milestoneYear(scenarios.base.points, 500_000),
    milestone1mYear: milestoneYear(scenarios.base.points, 1_000_000),
  };
}

/** The two Cash rows only, by currency -- `holdings.currency` covers every row, this is the subset the page calls out on its own. */
function cashByCurrency(holdings: HoldingsOutput): Goldens["holdings"]["cash"] {
  const cad = holdings.holdings.find((h) => h.symbol === "" && h.priceCurrency === "CAD");
  const usd = holdings.holdings.find((h) => h.symbol === "" && h.priceCurrency === "USD");
  return { CAD: cad?.value ?? 0, USD: usd?.value ?? 0 };
}

/** `buildHoldings`'s own output, reshaped into the goldens' pinned shape -- every figure read off that same model, never recomputed. */
function buildHoldingsGoldens(holdings: HoldingsOutput): Goldens["holdings"] {
  const sp500 = holdings.groups.find((g) => g.label === "S&P 500");
  const topSymbols = holdings.holdings.slice(0, 10).map((h) => ({
    symbol: h.symbol,
    currency: h.priceCurrency,
    value: h.value,
    accounts: h.accounts,
  }));
  const lRows = holdings.holdings
    .filter((h) => h.symbol === "L")
    .map((h) => ({
      currency: h.priceCurrency,
      name: h.name,
      value: h.value,
      accounts: h.accounts,
    }));

  return {
    period: holdings.period,
    total: holdings.total,
    behind: holdings.behind,
    cash: cashByCurrency(holdings),
    currency: holdings.currency,
    sp500: {
      value: sp500?.value ?? 0,
      share: sp500?.share ?? 0,
      accountCount: sp500?.accounts.length ?? 0,
    },
    topSymbols,
    assetClasses: holdings.assetClasses,
    lRows,
  };
}

/** `simulateBenchmark` over the committed portfolio series and benchmark closes, reshaped into the goldens' pinned shape. */
/** The summary tiles plus the graph's own `totalIn`, for one period over every account. */
function flowHeadline(
  flows: FlowsData,
  p: FlowPeriod,
  allAccounts: ReadonlySet<string>,
): Goldens["flows"]["headline"]["2025"] {
  const s = flowSummary(flows, p, allAccounts);
  const graph = buildFlowGraph(flows, p, "accountType", allAccounts);
  return {
    paidIn: s.paidIn,
    paidInBySource: s.paidInBySource,
    invested: s.invested,
    leftInCash: s.leftInCash,
    income: s.income,
    costs: s.costs,
    left: s.left,
    investedRate: s.investedRate,
    totalIn: graph.totalIn,
  };
}

/** `depositsByDestination` for 2026-07 alone, group by account type, keyed by destination label. */
function destinationSample202607(
  flows: FlowsData,
  allAccounts: ReadonlySet<string>,
): Record<string, number> {
  const p = { from: "2026-07", to: "2026-07" };
  const [bucket] = depositsByDestination(flows, p, "accountType", allAccounts);
  return bucket?.values ?? {};
}

/** `buildFlows(datastore)`'s own row/pair counts and the 2025, 2026 and all-time headline. */
function buildFlowGoldens(datastore: Datastore): Goldens["flows"] {
  const flows = buildFlows(datastore);
  const allAccounts = new Set(flows.accounts.map((a) => a.accountId));
  const pairIds = new Set(flows.rows.filter((r) => r.pairId !== null).map((r) => r.pairId));
  const laggedPairIds = new Set(
    flows.rows.filter((r) => r.lagDays !== null && r.lagDays > 0).map((r) => r.pairId),
  );
  return {
    rowCount: flows.rows.length,
    pairCount: pairIds.size,
    laggedPairs: laggedPairIds.size,
    unpairedLegs: flows.rows.filter((r) => r.movement && r.pairId === null).length,
    headline: {
      "2025": flowHeadline(flows, yearPeriod(2025), allAccounts),
      "2026": flowHeadline(flows, yearPeriod(2026), allAccounts),
      all: flowHeadline(flows, allTime(flows), allAccounts),
    },
    destinationSample202607: destinationSample202607(flows, allAccounts),
  };
}

function buildBenchmarkGoldens(analytics: AnalyticsOutput): Goldens["benchmark"] {
  const benchmark = loadBenchmark();
  const points = simulateBenchmark(analytics.series, benchmark.closes);
  const last = required(points[points.length - 1], "a benchmark point");
  return {
    portfolioEnd: last.portfolio,
    benchmarkEnd: last.benchmark,
    difference: last.portfolio - last.benchmark,
    monthsSkipped: skippedPeriods(analytics.series, benchmark.closes).length,
  };
}

function buildGoldens(): Goldens {
  const analytics = loadAnalytics();
  const reconciliation = loadReconciliation();
  const series = analytics.series;
  const counted = series.filter((s) => s.inTotals);

  const portfolio = buildPortfolioSeries(series);
  const lastPortfolio = required(portfolio[portfolio.length - 1], "portfolio points");
  const cashflow = buildCashflowSeries(series);
  const lastCashflow = required(cashflow[cashflow.length - 1], "cashflow points");
  const period = required(latestPeriod(analytics), "counted period");
  const firstCounted = required(
    counted
      .flatMap((a) => a.months.map((m) => m.period))
      .sort()
      .at(0),
    "counted months",
  );

  const fitted = fittedReturnRate(series);
  const projected = new Set(projectedAccounts(series).map((a) => a.maskedId));
  const uncovered = counted.filter((a) => !projected.has(a.maskedId));

  // Both projections read the SAME inputs but for the rate, so the two
  // terminal values differ only by the rate -- which is the whole point of
  // the pair, and would stop being true if either were built from its own
  // freshly derived inputs.
  const baseInputs = projectionInputs(analytics);
  const atDefault = projectYears({ ...baseInputs, returnRate: 0.06 });
  const atFitted = projectYears({ ...baseInputs, returnRate: fitted.rate });

  const future = buildFutureGoldens(analytics, baseInputs.startYear);
  const runwayRows = buildRunway(atDefault, { ...baseInputs, returnRate: 0.06 });
  const lastDefault = required(atDefault[atDefault.length - 1], "projected years at 6%");
  const lastFitted = required(atFitted[atFitted.length - 1], "projected years at the fitted rate");

  const groups = buildGroups(series);
  const lossGroups = accountLossGroups(groups);
  const accounts = buildAccounts(series);
  const allocations = buildAllocationGoldens(series);

  // The FHSA's own projected balance in the year its lifetime cap fills, and
  // the year it must close. Both read from the engine at the default rate,
  // the same pair `allocation.test.ts` asserts against.
  const fhsaValues = accountValues(atDefault, series, 0.06, baseInputs.fhsaCloseYear);
  const fhsaSeries = fhsaValues.find((s) => allocations[s.accountId]?.group === "FHSA");
  const fhsaCapRow = runwayRows.find((r) => r.id === "fhsa-cap");
  const fhsaCapYear = fhsaCapRow?.year ?? "";
  const fhsaCapIndex = atDefault.findIndex((r) => r.year === fhsaCapYear);

  // A one-year window, so neither lifetime cap fills -- the state
  // `runway.test.ts` needs to exercise `capBound`'s never-reached branch.
  const shortInputs = projectionInputs(analytics, { returnRate: 0.06, years: 1 });
  const shortRunway = buildRunway(projectYears(shortInputs), shortInputs);

  const goals = buildGoalGoldens(analytics, atDefault, baseInputs.fhsaCloseYear);

  // The 0% projection, the one case `contributionToClose` cannot solve with
  // the growth-factor formula. The window is the goal's own, start year
  // through target year inclusive, the same span the card states.
  const atZero = projectYears({ ...baseInputs, returnRate: 0 });
  const zeroStretch = evaluateGoal(STRETCH_GOAL, analytics, atZero, 0, baseInputs.fhsaCloseYear);
  const stretchYears = Number(STRETCH_GOAL.by) - Number(baseInputs.startYear) + 1;

  const returnsSeries = buildReturnsSeries(analytics.returns, series);
  const returns = buildReturnGoldens(returnsSeries);
  // The accounts the Growth tab's grid actually draws: Chequing and any
  // zero-plotted account dropped, via the same production filter the chart
  // calls.
  const chartedReturns = chartedReturnAccounts(returnsSeries, series);

  const acknowledged = reconciliation.findings.filter((f) => f.acknowledged);

  const startYear = baseInputs.startYear;
  const lines = analytics.rooms[startYear] ?? [];
  const respLine = lines.find((l) => l.group === "RESP");
  const rrspLine = lines.find((l) => l.group === "RRSP");
  const income = required(analytics.income[startYear], `income summary for ${startYear}`);
  // Independent of `analytics.income`: built by calling `buildIncome` itself
  // over `datastore.json`, the same inputs `analytics/build.ts` uses, rather
  // than reading the committed `analytics.json`'s own copy of the answer.
  // Comparing the pipeline's output to a golden copied from that SAME
  // output would stay green even if a real costing rule were deleted --
  // both `bun run analytics` and this command would re-bless the same wrong
  // figure in one breath.
  const rawStatements = (rawDatastore as Datastore).statements;
  const incomeSeries = buildSeries(rawStatements, (rawDatastore as Datastore).accounts);
  const incomeAccountIds = new Set(incomeSeries.map((s) => s.maskedId));
  const income2025 = buildIncome(incomeSeries, rawStatements, 2025, incomeAccountIds);
  const income2026 = buildIncome(incomeSeries, rawStatements, 2026, incomeAccountIds);
  const cesgRow = required(
    runwayRows.find((r) => r.id === "cesg"),
    "CESG runway row",
  );

  const [latestReviewPeriod] = reviewPeriods(analytics);
  const review = monthReview(analytics, required(latestReviewPeriod, "a reviewable period"));

  return {
    corpus: {
      statementCount: reconciliation.statementCount,
      // The source folder holds one file per statement plus any
      // fresh-download twin that deduplicates away, so this is the statement
      // count plus the `ingest` skip findings -- derived, never counted by
      // hand, and it stays correct as twins come and go.
      sourceFileCount:
        reconciliation.statementCount +
        reconciliation.findings.filter((f) => f.check === "ingest").length,
      accountCount: analytics.meta.accountCount,
      countedAccountCount: counted.length,
      latestPeriod: period,
      firstPeriod: firstCounted,
    },
    portfolio: {
      total: lensTotal(analytics, "registration"),
      bookCost: lastPortfolio.bookCost,
      gain: lastPortfolio.marketValue - lastPortfolio.bookCost,
      gainShare: (lastPortfolio.marketValue - lastPortfolio.bookCost) / lastPortfolio.bookCost,
      seriesPointCount: portfolio.length,
    },
    reconciliation: {
      findingCount: reconciliation.findings.length,
      acknowledgedCount: acknowledged.length,
      unacknowledgedCount: reconciliation.findings.length - acknowledged.length,
      acknowledgedChecks: acknowledged.map((f) => f.check).sort(),
      statementArithmeticCount: reconciliation.findings.filter(
        (f) => f.check === "statement-arithmetic",
      ).length,
    },
    groups,
    lossGroups,
    accounts,
    allocations,
    returns,
    returnsChartedCount: chartedReturns.length,
    returnsChartedPlottedTotal: chartedReturns.reduce((sum, a) => sum + plottedCount(a.points), 0),
    cashflow: {
      period: lastCashflow.period,
      deposits: lastCashflow.deposits,
      withdrawals: lastCashflow.withdrawals,
      accountCount: lastCashflow.accountCount,
    },
    fittedRate: {
      rate: fitted.rate,
      months: fitted.months,
      countedAccounts: fitted.accounts,
      steps: fitted.monthsFitted,
    },
    projection: {
      defaultRateEndValue: lastDefault.value,
      fittedRateEndValue: lastFitted.value,
      seamPeriod: period,
      // "Uncovered" is `projectedAccounts`'s own complement, read from that
      // function rather than recomputed from kinds here: it is the single
      // place projection membership is decided, and a second copy of the
      // rule is exactly what `groupOf`'s comment records going wrong before.
      uncoveredAccountCount: uncovered.length,
      uncoveredValue: uncovered.reduce((sum, a) => sum + (latestMarketValue(a) ?? 0), 0),
      fhsaCloseYear: baseInputs.fhsaCloseYear,
      fhsaCapYear,
      fhsaValueAtCapYear: fhsaCapIndex < 0 ? 0 : (fhsaSeries?.values[fhsaCapIndex] ?? 0),
      ...future,
    },
    rooms: {
      opening: baseInputs.opening,
      lifetimeContributed: baseInputs.lifetimeContributed,
      cesgRoomAccrued: baseInputs.cesgRoomAccrued,
      respFromContRowsOnly: respContRowTotal(rawDatastore as Datastore, series),
      rrspAssessedRemaining: baseInputs.rrspAssessedRemaining,
      contributed: baseInputs.contributedThisYear,
      rrspAssessedLimit: rrspLine?.limit ?? 0,
      respLifetimeContributed: respLine?.lifetimeContributions?.contributed ?? 0,
      cesgReceived: baseInputs.cesgReceived,
      rrspSpousalUsed: rrspLine?.spousalUsed ?? 0,
    },
    runway: {
      leftoverAfterOneYear: Object.fromEntries(
        shortRunway
          .filter((r) => r.id === "fhsa-cap" || r.id === "resp-cap")
          .map((r) => [r.wrapper, r.unclaimed ?? 0]),
      ),
      cesgClaimed: baseInputs.rules.cesgLifetime - (cesgRow.unclaimed ?? 0),
      cesgForfeited: cesgRow.unclaimed ?? 0,
    },
    goals,
    zeroRateStretchAnnualToClose: contributionToClose(zeroStretch.gap ?? 0, stretchYears, 0),
    income: {
      year: Number(startYear),
      canadianDistributions: income.canadianDistributions,
      foreignDividends: income.foreignDividends,
      foreignTaxWithheld: income.foreignTaxWithheld,
      interest: income.interest,
      realizedGain: income.realizedGains,
      costUnknownSales: income.costUnknownSales,
      rrspDeduction: baseInputs.contributedThisYear.RRSP ?? 0,
    },
    incomeByYear: {
      "2025": {
        interest: income2025.interest,
        canadianDistributions: income2025.canadianDistributions,
        foreignDividends: income2025.foreignDividends,
        foreignTaxWithheld: income2025.foreignTaxWithheld,
        realizedGains: income2025.realizedGains,
        costUnknownSales: income2025.costUnknownSales,
      },
      "2026": {
        interest: income2026.interest,
        canadianDistributions: income2026.canadianDistributions,
        foreignDividends: income2026.foreignDividends,
        foreignTaxWithheld: income2026.foreignTaxWithheld,
        realizedGains: income2026.realizedGains,
        costUnknownSales: income2026.costUnknownSales,
      },
    },
    incomeCosts: {
      byYear: {
        "2025": required(
          incomeByYear(analytics).find((y) => y.year === 2025),
          "2025 activity totals",
        ).totals,
        "2026": required(
          incomeByYear(analytics).find((y) => y.year === 2026),
          "2026 activity totals",
        ).totals,
      },
      chequingInterestByYear: {
        "2025": chequingInterestByAccount(analytics, 2025).reduce((sum, a) => sum + a.interest, 0),
        "2026": chequingInterestByAccount(analytics, 2026).reduce((sum, a) => sum + a.interest, 0),
      },
      feeReconciliationGapsByYear: {
        "2025": feeReconciliationGaps(analytics, 2025).map(({ label, gap }) => ({ label, gap })),
        "2026": feeReconciliationGaps(analytics, 2026).map(({ label, gap }) => ({ label, gap })),
      },
    },
    month: {
      period: review.period,
      change: review.end - (review.start ?? 0),
      netDeposits: review.netDeposits,
      growth: review.growth ?? 0,
      missingValue: review.missingValue,
    },
    holdings: buildHoldingsGoldens(analytics.holdings),
    benchmark: buildBenchmarkGoldens(analytics),
    flows: buildFlowGoldens(rawDatastore as Datastore),
  };
}

if (import.meta.main) {
  const goldens = buildGoldens();
  await Bun.write(join(DATA, "goldens.json"), `${JSON.stringify(goldens, null, 2)}\n`);
  console.log(
    `wrote goldens.json: ${goldens.corpus.statementCount} statements at ${goldens.corpus.latestPeriod}, ` +
      `total ${goldens.portfolio.total.toFixed(2)}, ` +
      `${Object.keys(goldens.groups).length} groups, ${Object.keys(goldens.accounts).length} accounts`,
  );
}
