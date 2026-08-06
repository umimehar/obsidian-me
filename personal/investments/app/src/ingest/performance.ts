import type { PeriodBalances, Returns, Statement } from "../types";
import { parseBrokerage } from "./brokerage";
import { type Page, findRow, rowText, scanPairs } from "./geometry";
import type { SourceRef } from "./source";

const RETURNS_HEADING = /Money-weighted Return Rates/;
const PERCENT = /-?[\d.]+(?=%)/g;
const BALANCE_HEADING = /Start date balance/;

/**
 * A horizon shorter than the account's life prints 0.00%. That is "not
 * applicable", not a measured zero, so it becomes null. Only `sinceInception`
 * is always real.
 */
function orNull(value: number | undefined): number | null {
  if (value === undefined) return null;
  return value === 0 ? null : value;
}

function readReturns(pages: readonly Page[]): Returns | null {
  const heading = findRow(pages, RETURNS_HEADING);
  if (!heading) return null;

  const all = pages.flatMap((p) => p.rows);
  const at = all.indexOf(heading);
  const row = all.slice(at + 1, at + 6).find((r) => (rowText(r).match(PERCENT) ?? []).length >= 6);
  if (!row) return null;

  const values = (rowText(row).match(PERCENT) ?? []).map(Number);
  return {
    currentPeriod: orNull(values[0]),
    oneYear: orNull(values[1]),
    threeYears: orNull(values[2]),
    fiveYears: orNull(values[3]),
    tenYears: orNull(values[4]),
    sinceInception: values[5] ?? null,
  };
}

function readBalances(pages: readonly Page[]): PeriodBalances | null {
  const heading = findRow(pages, BALANCE_HEADING);
  if (!heading) return null;

  const all = pages.flatMap((p) => p.rows);
  const at = all.indexOf(heading);
  const pairs = scanPairs(all.slice(at + 1, at + 5));
  const values = pairs.flatMap((p) => p.values);
  if (values.length < 5) return null;

  return {
    start: values[0] ?? 0,
    deposits: values[1] ?? 0,
    withdrawals: values[2] ?? 0,
    changeInMarketValue: values[3] ?? 0,
    end: values[4] ?? 0,
  };
}

export function parsePerformance(pages: readonly Page[], source: SourceRef): Statement {
  const base = parseBrokerage(pages, source);
  return { ...base, returns: readReturns(pages), balances: readBalances(pages) };
}
