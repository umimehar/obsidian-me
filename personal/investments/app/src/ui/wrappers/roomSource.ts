import { REGISTERED_KINDS, type RegisteredGroup } from "../../analytics/rooms";
import type { AccountSeries } from "../../analytics/types";

export type ContributionsSource = "stated" | "derived" | null;

/**
 * Whether a group's contribution figure for one year was printed on the
 * statements or reconstructed from activity rows.
 *
 * `RoomLine` carries no source of its own -- it is a sum over accounts, and
 * the source lives per month on `MonthPoint.contributionsSource` -- so the
 * interface has to fold it back up here. `"derived"` wins over `"stated"`
 * whenever any component month is derived: a sum is only as printed as its
 * least printed part, and marking a part-derived total as stated would
 * present a reconstruction as though the statement said it.
 *
 * Null when nothing was contributed in that year, since there is no figure
 * to attribute a source to. Months with a null `contributions` are skipped
 * for the same reason.
 */
export function contributionsSourceFor(
  series: readonly AccountSeries[],
  group: RegisteredGroup,
  year: number,
): ContributionsSource {
  const kinds = REGISTERED_KINDS[group];
  const accounts = series.filter((account) => kinds.includes(account.kind));
  const sources = accounts.map((account) => sourceForAccountYear(account, year));

  if (sources.includes("derived")) return "derived";
  return sources.includes("stated") ? "stated" : null;
}

/** One account's source for one year, over the months that actually carry a contribution figure. */
function sourceForAccountYear(account: AccountSeries, year: number): ContributionsSource {
  let seenStated = false;

  for (const point of account.months) {
    if (Number(point.period.slice(0, 4)) !== year) continue;
    if (point.contributions === null || point.contributions === 0) continue;
    if (point.contributionsSource === "derived") return "derived";
    if (point.contributionsSource === "stated") seenStated = true;
  }

  return seenStated ? "stated" : null;
}
