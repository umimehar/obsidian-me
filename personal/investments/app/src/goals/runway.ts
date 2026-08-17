import type { ProjectionInputs, ProjectionYear } from "../projection/engine";

export interface RunwayRow {
  id: string;
  wrapper: string;
  bound: string;
  /** Null when the bound is never reached inside the projection, which is itself a finding. */
  year: string | null;
  /** What is left when the projection ends, for a bound never reached. Null otherwise. */
  unclaimed: number | null;
  note: string;
}

/**
 * The first row where a group's `roomRemaining` reaches zero, or null when
 * the projection ends before it does.
 *
 * `<=`, not `<`, on purpose: `roomRemaining` is clamped at zero once the cap
 * is used up (see `annualRoomRemaining` in `engine.ts`), so the row where it
 * first equals zero IS the row the cap was reached, not the row after. `>`
 * in place of `>=` here would skip that exact-zero row and report the cap
 * one year late, or never, in a corpus where the last dollar of room lands
 * exactly on a year boundary.
 */
function capReachedYear(rows: readonly ProjectionYear[], group: string): string | null {
  return rows.find((row) => (row.roomRemaining[group] ?? 0) <= 0)?.year ?? null;
}

/**
 * The CESG row is the one place a "cap reached" year and a statutory
 * deadline compete for the same slot. If `cumulativeGrant` ever reaches the
 * lifetime cap inside the projection, that row's year is the answer and
 * nothing is left unclaimed. Otherwise the beneficiary ages out
 * (`cesgLastYear`) before the cap is reached, and what is left is read off
 * the last row's `cumulativeGrant`, not off a note -- this is the row the
 * brief exists to surface, and it must survive a reworded `notes` array.
 */
function cesgRow(rows: readonly ProjectionYear[], inputs: ProjectionInputs): RunwayRow {
  const capRow = rows.find((row) => row.cumulativeGrant >= inputs.rules.cesgLifetime);
  if (capRow !== undefined) {
    return {
      id: "cesg",
      wrapper: "RESP (CESG)",
      bound: `${inputs.rules.cesgLifetime} lifetime CESG cap`,
      year: capRow.year,
      unclaimed: null,
      note: "The CESG lifetime cap is reached inside the projection.",
    };
  }
  const lastRow = rows.at(-1);
  const unclaimed =
    lastRow === undefined ? null : Math.max(0, inputs.rules.cesgLifetime - lastRow.cumulativeGrant);
  return {
    id: "cesg",
    wrapper: "RESP (CESG)",
    bound: `${inputs.rules.cesgLifetime} lifetime CESG cap`,
    year: inputs.cesgLastYear,
    unclaimed,
    note: "The beneficiary ages out before the CESG lifetime cap is reached, forfeiting the rest.",
  };
}

/**
 * The room runway: when each contribution cap is reached, when each
 * statutory deadline falls, and how much grant is left unclaimed.
 *
 * Every figure is read from `roomRemaining`, `cumulativeGrant` and the
 * deadline fields on `ProjectionInputs` -- never from `ProjectionYear.notes`.
 * Those strings are prose written for a reader; matching them would make a
 * rendered sentence load-bearing and would break silently the first time one
 * is reworded.
 *
 * Contribution-driven rows (`fhsa-cap`, `resp-cap`) move with the return
 * rate, because a higher return fills a lifetime cap sooner. Statutory rows
 * (`fhsa-close`, `rrsp-last`, and the CESG row's ages-out year) come
 * straight off `ProjectionInputs` and do not move with the rate at all.
 */
export function buildRunway(
  rows: readonly ProjectionYear[],
  inputs: ProjectionInputs,
): RunwayRow[] {
  return [
    {
      id: "fhsa-cap",
      wrapper: "FHSA",
      bound: `${inputs.rules.fhsaLifetime} lifetime contribution cap`,
      year: capReachedYear(rows, "FHSA"),
      unclaimed: null,
      note: "The FHSA lifetime contribution cap, reached by the money going in.",
    },
    {
      id: "fhsa-close",
      wrapper: "FHSA",
      bound: "must close 15 years after the first FHSA contribution",
      year: inputs.fhsaCloseYear === "" ? null : inputs.fhsaCloseYear,
      unclaimed: null,
      note: "A statutory deadline set by the account's first activity, not by the return rate.",
    },
    {
      id: "resp-cap",
      wrapper: "RESP",
      bound: `${inputs.rules.respLifetime} lifetime contribution cap`,
      year: capReachedYear(rows, "RESP"),
      unclaimed: null,
      note: "The RESP lifetime contribution cap, reached by the money going in.",
    },
    cesgRow(rows, inputs),
    {
      id: "rrsp-last",
      wrapper: "RRSP",
      bound: "last calendar year RRSP room accrues",
      year: inputs.rrspLastYear,
      unclaimed: null,
      note: "The owner turns 71 in this year, a statutory cutoff that outruns the projection itself.",
    },
    {
      id: "tfsa",
      wrapper: "TFSA",
      bound: "no lifetime cap",
      year: null,
      unclaimed: null,
      note: "The TFSA has no lifetime contribution cap, so there is no bound to reach.",
    },
  ];
}
