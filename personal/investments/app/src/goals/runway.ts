import type { ProjectionInputs, ProjectionYear } from "../projection/engine";
import type { ProjectionGroup } from "../projection/inputs";

export interface RunwayRow {
  id: string;
  wrapper: string;
  bound: string;
  /** Null when the bound is never reached inside the projection, which is itself a finding. */
  year: string | null;
  /**
   * What is left in a lifetime-cap bound (`fhsa-cap`, `resp-cap`, `cesg`)
   * when the projection ends before reaching it. Null for a reached cap and
   * for every statutory-deadline row (`fhsa-close`, `rrsp-last`), neither of
   * which has a leftover amount to report.
   */
  unclaimed: number | null;
  note: string;
}

/** Whether `group` is one the current selection actually covers, mirroring `engine.ts`'s own `inScope`. */
function inScope(inputs: ProjectionInputs, group: ProjectionGroup): boolean {
  return inputs.groups === undefined || inputs.groups.includes(group);
}

/** A whole-dollar figure with thousands separators, matching how the brief itself writes these caps. */
function money(amount: number): string {
  return `$${amount.toLocaleString("en-CA")}`;
}

/**
 * The first row where a group's `roomRemaining` reaches zero, and what is
 * left in that room at the end of the projection when it never does.
 *
 * `roomRemaining` reaching zero is overloaded in `engine.ts`: a filled cap is
 * the intended reading, but the same zero also appears for a group the
 * caller has excluded (`inScope` in `engine.ts` substitutes a flat zero) and,
 * for FHSA, for any row past the close year regardless of how much room was
 * actually used. The caller of this function only invokes it once `inScope`
 * above has confirmed the group is selected, which removes the first
 * overlap. FHSA closing before its cap fills is a real remaining overlap,
 * but it is unreachable in the corpus -- the cap fills in 2028, eleven years
 * before the 2039 close -- and is left as a known limitation rather than
 * guessed at here.
 *
 * Defaults the lookup to `Number.POSITIVE_INFINITY`, not zero:
 * `noUncheckedIndexedAccess` forces a default for a key that in practice is
 * always present, and zero would read as "cap reached" under this function's
 * own predicate, fabricating a finding a missing key never actually
 * reported.
 */
function capBound(
  rows: readonly ProjectionYear[],
  group: ProjectionGroup,
): { year: string | null; unclaimed: number | null } {
  const capRow = rows.find((row) => (row.roomRemaining[group] ?? Number.POSITIVE_INFINITY) <= 0);
  if (capRow !== undefined) return { year: capRow.year, unclaimed: null };
  const lastRow = rows.at(-1);
  return {
    year: null,
    unclaimed: lastRow === undefined ? null : (lastRow.roomRemaining[group] ?? null),
  };
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
  const bound = `${money(inputs.rules.cesgLifetime)} lifetime CESG cap`;
  const capRow = rows.find((row) => row.cumulativeGrant >= inputs.rules.cesgLifetime);
  if (capRow !== undefined) {
    return {
      id: "cesg",
      wrapper: "RESP (CESG)",
      bound,
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
    bound,
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
 *
 * A wrapper's rows are omitted entirely, not reported with a fabricated
 * year, when `inputs.groups` excludes its group -- the same "no selected
 * account" case `engine.ts` reports as a flat zero for every figure that
 * group would otherwise carry.
 */
export function buildRunway(
  rows: readonly ProjectionYear[],
  inputs: ProjectionInputs,
): RunwayRow[] {
  const result: RunwayRow[] = [];

  if (inScope(inputs, "FHSA")) {
    const cap = capBound(rows, "FHSA");
    result.push({
      id: "fhsa-cap",
      wrapper: "FHSA",
      bound: `${money(inputs.rules.fhsaLifetime)} lifetime contribution cap`,
      year: cap.year,
      unclaimed: cap.unclaimed,
      note: "The FHSA lifetime contribution cap, reached by the money going in.",
    });
    result.push({
      id: "fhsa-close",
      wrapper: "FHSA",
      bound: "must close 15 years after the first FHSA contribution",
      // fhsaCloseYear is "" only when the corpus has no FHSA account at all
      // (see projection/inputs.ts's own fhsaCloseYear), which cannot happen
      // here since this branch only runs once inScope has confirmed FHSA is
      // selected and an FHSA account is what puts it in scope. The guard
      // stays because the field's type carries that empty case regardless.
      year: inputs.fhsaCloseYear === "" ? null : inputs.fhsaCloseYear,
      unclaimed: null,
      note: "A statutory deadline set by the account's first activity, not by the return rate.",
    });
  }

  if (inScope(inputs, "RESP")) {
    const cap = capBound(rows, "RESP");
    result.push({
      id: "resp-cap",
      wrapper: "RESP",
      bound: `${money(inputs.rules.respLifetime)} lifetime contribution cap`,
      year: cap.year,
      unclaimed: cap.unclaimed,
      note: "The RESP lifetime contribution cap, reached by the money going in.",
    });
    result.push(cesgRow(rows, inputs));
  }

  if (inScope(inputs, "RRSP")) {
    result.push({
      id: "rrsp-last",
      wrapper: "RRSP",
      bound: "last calendar year RRSP room accrues",
      year: inputs.rrspLastYear,
      unclaimed: null,
      note: "The owner turns 71 in this year, a statutory cutoff that outruns the projection itself.",
    });
  }

  if (inScope(inputs, "TFSA")) {
    result.push({
      id: "tfsa",
      wrapper: "TFSA",
      bound: "no lifetime cap",
      year: null,
      unclaimed: null,
      note: "The TFSA has no lifetime contribution cap, so there is no bound to reach.",
    });
  }

  return result;
}
