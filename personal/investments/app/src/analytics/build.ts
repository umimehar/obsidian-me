import { join } from "node:path";
import type { Datastore } from "../store/datastore";
import type { Statement } from "../types";
import { type IncomeScope, type IncomeSummary, buildIncome } from "./income";
import { type ReturnSeries, buildReturns } from "./returns";
import { type Lens, type Rollup, rollup } from "./rollup";
import { type RoomLine, buildRoomLines } from "./rooms";
import { buildSeries } from "./series";
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
  returns: ReturnSeries[];
  rollups: Record<Lens, Rollup[]>;
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
  for (const year of years) {
    rooms[String(year)] = buildRoomLines(series, datastore.statements, year);
    income[String(year)] = buildIncome(series, datastore.statements, year, allAccountIds);
  }

  const returns = buildReturns(series, datastore.statements);
  const rollups = Object.fromEntries(LENSES.map((lens) => [lens, rollup(series, lens)])) as Record<
    Lens,
    Rollup[]
  >;

  return {
    meta: {
      generated,
      datastoreGenerated: datastore.meta.generated,
      accountCount: datastore.accounts.length,
    },
    series,
    rooms,
    income,
    returns,
    rollups,
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
}
