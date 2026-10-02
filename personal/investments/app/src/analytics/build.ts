import { join } from "node:path";
import type { Datastore } from "../store/datastore";
import type { Statement } from "../types";
import { CORPORATE_KINDS, PERSONAL_NONREG_KINDS } from "./accountScopes";
import { type ActivityByPeriod, buildActivity } from "./activity";
import { buildFlows } from "./flows/build";
import { type ForeignPropertySummary, foreignPropertySummary } from "./foreignProperty";
import { type HoldingsOutput, buildHoldings } from "./holdings";
import { type IncomeScope, type IncomeSummary, buildIncome } from "./income";
import { type ReturnSeries, buildReturns } from "./returns";
import { type Lens, type Rollup, rollup } from "./rollup";
import { type RoomLine, buildRoomLines } from "./rooms";
import { buildSeries } from "./series";
import { type StatedFeesByPeriod, buildStatedFees } from "./statedFees";
import { type SuperficialLossCandidate, superficialLossWatch } from "./superficialLoss";
import type { AccountSeries } from "./types";

const LENSES: readonly Lens[] = ["registration", "account", "purpose"];

/**
 * Every calendar year that has at least one statement, oldest first. Rooms
 * and income are computed per year over exactly this range -- never a fixed
 * "current year", since the corpus spans several years and every one of
 * them needs a room/income line, not just the latest.
 */
function yearsCovered(statements: readonly Statement[]): number[] {
  const years = new Set<number>();
  for (const s of statements) years.add(Number(s.source.period.slice(0, 4)));
  return [...years].sort((a, b) => a - b);
}

export interface AnalyticsOutput {
  meta: {
    generated: string;
    /** Echoes the source datastore's own `meta.generated`, so a stale analytics.json is detectable against a fresher datastore. */
    datastoreGenerated: string;
    accountCount: number;
  };
  series: AccountSeries[];
  /** Keyed on the calendar year as a string (`"2026"`), one entry per year covered by the corpus. */
  rooms: Record<string, RoomLine[]>;
  /** Keyed the same way as `rooms`, over every account in the corpus -- `buildIncome`'s own `TAXABLE_KINDS` filter, not this scope, is what excludes Corporate and registered wrappers. */
  income: Record<string, IncomeSummary>;
  /**
   * The corporation's own passive investment income per fiscal year, the
   * SAME `buildIncome` function as `income` above but scoped to
   * `CORPORATE_KINDS` instead -- interest, foreign dividends, Canadian
   * eligible dividends and realized gains earned inside the corporation,
   * taxed in the corporation's hands, never the owner's personal estimate.
   */
  corporateIncome: Record<string, IncomeSummary>;
  returns: ReturnSeries[];
  rollups: Record<Lens, Rollup[]>;
  /** Dividends, interest, lending income, withholding tax and fees, per period per account. */
  activity: ActivityByPeriod;
  /** Fees as each statement's own cash summary states them, per period per account -- see `feeReconciliation.ts`. */
  statedFees: StatedFeesByPeriod;
  /** What is actually owned, combined across accounts, at the latest period -- see `holdings.ts`. */
  holdings: HoldingsOutput;
  /** `holdings`, restricted to the personal non-registered scope (`NonRegistered` and `Crypto`) -- the Non-registered tab's own holdings table. */
  personalHoldings: HoldingsOutput;
  /** `holdings`, restricted to the `Corporate` kind -- the Corporate tab's own holdings table. */
  corporateHoldings: HoldingsOutput;
  /**
   * The superficial-loss watch, per year -- every loss sale in a personal
   * non-registered or Crypto account that year, flagged against its 30-day
   * replacement-buy window. Computed at the build step over raw statements
   * (the browser never sees one), from `income[year].sales`.
   */
  superficialLoss: Record<string, SuperficialLossCandidate[]>;
  /** The owner's own T1135 cost-amount summary per year -- personal non-registered scope, registered wrappers excluded. */
  foreignPropertyPersonal: Record<string, ForeignPropertySummary>;
  /** The corporation's own T1135 cost-amount summary per year -- a separate taxpayer from the owner, so a separate summary. */
  foreignPropertyCorporate: Record<string, ForeignPropertySummary>;
}

/**
 * Assembles everything the five producer modules (series, rooms, income,
 * returns, rollup) compute over one datastore into the one payload the
 * dashboard reads. Pure -- no I/O -- so it is testable without touching disk.
 */
export function buildAnalytics(datastore: Datastore, generated: string): AnalyticsOutput {
  const series = buildSeries(datastore.statements, datastore.accounts);
  const years = yearsCovered(datastore.statements);
  const allAccountIds: IncomeScope = new Set(series.map((s) => s.maskedId));

  const rooms: Record<string, RoomLine[]> = {};
  const income: Record<string, IncomeSummary> = {};
  const corporateIncome: Record<string, IncomeSummary> = {};
  const superficialLoss: Record<string, SuperficialLossCandidate[]> = {};
  const foreignPropertyPersonal: Record<string, ForeignPropertySummary> = {};
  const foreignPropertyCorporate: Record<string, ForeignPropertySummary> = {};
  for (const year of years) {
    rooms[String(year)] = buildRoomLines(series, datastore.statements, year);
    const yearIncome = buildIncome(series, datastore.statements, year, allAccountIds);
    income[String(year)] = yearIncome;
    corporateIncome[String(year)] = buildIncome(
      series,
      datastore.statements,
      year,
      allAccountIds,
      CORPORATE_KINDS,
    );
    superficialLoss[String(year)] = superficialLossWatch(
      datastore.statements,
      series,
      yearIncome.sales,
    );
    foreignPropertyPersonal[String(year)] = foreignPropertySummary(
      datastore.statements,
      series,
      year,
      PERSONAL_NONREG_KINDS,
    );
    foreignPropertyCorporate[String(year)] = foreignPropertySummary(
      datastore.statements,
      series,
      year,
      CORPORATE_KINDS,
    );
  }

  const returns = buildReturns(series, datastore.statements);
  const rollups = Object.fromEntries(LENSES.map((lens) => [lens, rollup(series, lens)])) as Record<
    Lens,
    Rollup[]
  >;
  const activity = buildActivity(datastore.statements);
  const statedFees = buildStatedFees(datastore.statements);
  const holdings = buildHoldings(datastore.statements, datastore.accounts);
  const personalHoldings = buildHoldings(
    datastore.statements,
    datastore.accounts.filter((a) => PERSONAL_NONREG_KINDS.has(a.kind)),
  );
  const corporateHoldings = buildHoldings(
    datastore.statements,
    datastore.accounts.filter((a) => CORPORATE_KINDS.has(a.kind)),
  );

  return {
    meta: {
      generated,
      datastoreGenerated: datastore.meta.generated,
      accountCount: datastore.accounts.length,
    },
    series,
    rooms,
    income,
    corporateIncome,
    returns,
    rollups,
    activity,
    statedFees,
    holdings,
    personalHoldings,
    corporateHoldings,
    superficialLoss,
    foreignPropertyPersonal,
    foreignPropertyCorporate,
  };
}

const DATA_DIR = join(import.meta.dir, "..", "..", "..", "data");

if (import.meta.main) {
  const datastorePath = join(DATA_DIR, "datastore.json");
  const datastore = (await Bun.file(datastorePath).json()) as Datastore;
  const output = buildAnalytics(datastore, new Date().toISOString());

  await Bun.write(join(DATA_DIR, "analytics.json"), JSON.stringify(output, null, 2));

  console.log(
    `wrote analytics.json: ${output.series.length} accounts, ` +
      `${Object.keys(output.rooms).length} room years, ${Object.keys(output.income).length} income years, ` +
      `${output.returns.length} return series`,
  );

  const flows = buildFlows(datastore);
  await Bun.write(join(DATA_DIR, "flows.json"), JSON.stringify(flows));
  const pairCount = new Set(flows.rows.filter((r) => r.pairId !== null).map((r) => r.pairId)).size;
  const unpairedLegs = flows.rows.filter((r) => r.movement && r.pairId === null).length;
  const residualBlocks = flows.blocks.filter((b) => Math.abs(b.residual) > 0.005).length;
  console.log(
    `wrote flows.json: ${flows.rows.length} rows, ${pairCount} pairs, ` +
      `${unpairedLegs} unpaired legs, ${flows.blocks.length} blocks, ${residualBlocks} with a residual`,
  );
}
