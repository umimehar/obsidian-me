import { Flex, Heading, Table, Text } from "@radix-ui/themes";
import { type RunwayRow, buildRunway } from "../../goals/runway";
import type { ProjectionInputs, ProjectionYear } from "../../projection/engine";
import { formatCurrency } from "../format";

export interface RunwayTableProps {
  rows: readonly ProjectionYear[];
  inputs: ProjectionInputs;
}

const NO_LIFETIME_CAP = "No lifetime cap to reach.";
const NOT_REACHED_IN_WINDOW = "Not reached within the window above.";
const CAP_REACHED = "The lifetime cap is reached inside this window, so nothing is left unclaimed.";
const STATUTORY_NO_LEFTOVER =
  "This is a statutory deadline, not a lifetime cap, so it carries no leftover amount to report.";
const NO_CAP_CONCEPT = "This wrapper has no lifetime cap, so there is nothing to leave unclaimed.";
const HEADERS = ["Wrapper", "Bound", "Year", "Unclaimed", "Detail"] as const;

/**
 * The year cell, read against the window `rows` actually covers rather than
 * against a hardcoded constant. Two different reasons produce a null year,
 * and they must not read the same: `unclaimed` non-null means a lifetime cap
 * exists but the window ends before it fills (`fhsa-cap`, `resp-cap`, a
 * still-open `cesg`); `unclaimed` null alongside a null year means the row
 * has no lifetime cap at all (`tfsa`), which is a different finding and gets
 * different words.
 *
 * A year past `windowEnd` -- the RRSP's 2068 against the projection's own
 * 2056 in the normal case -- is stated, never hidden, but is marked as
 * beyond the window so it cannot read as a value the projection itself
 * produced.
 */
function yearText(row: RunwayRow, windowEnd: string | null): string {
  if (row.year === null) return row.unclaimed === null ? NO_LIFETIME_CAP : NOT_REACHED_IN_WINDOW;
  if (windowEnd !== null && Number(row.year) > Number(windowEnd)) {
    return `${row.year} (beyond the projected window above)`;
  }
  return row.year;
}

/**
 * Whether `bound` states an actual quantified lifetime cap (`"$40,000
 * lifetime contribution cap"`) rather than a statutory deadline (`"must
 * close 15 years..."`, `"last calendar year RRSP room accrues"`) or the
 * absence of a cap altogether (`"no lifetime cap"`). Every quantified-cap
 * bound this module ever renders starts with a currency figure; no
 * statutory or no-cap bound does, including the no-cap one, which contains
 * the word "cap" as text but never a `$` figure -- so this is not the same
 * check `includes("cap")` would make, and deliberately isn't written that
 * way.
 */
function hasQuantifiedCap(bound: string): boolean {
  return bound.startsWith("$");
}

/**
 * The unclaimed cell. `runway.ts`'s own doc on `RunwayRow.unclaimed` names
 * three different reasons the field comes back null: a lifetime cap that
 * was reached, a statutory row that has no leftover concept by
 * construction, and a wrapper with no lifetime cap at all. `yearText`
 * below keeps those apart already; this cell used to collapse all three
 * into one sentence, which let "you filled this cap" and "this concept
 * does not apply here" read identically to someone scanning the column.
 * Null never prints as a blank cell or as `$0.00` either way -- it is
 * always a real absence, stated in words, just not the same words for
 * every reason behind it.
 */
function unclaimedText(row: RunwayRow): string {
  if (row.unclaimed !== null) return formatCurrency(row.unclaimed);
  if (hasQuantifiedCap(row.bound)) return CAP_REACHED;
  return row.year === null ? NO_CAP_CONCEPT : STATUTORY_NO_LEFTOVER;
}

function RunwayTableRow({ row, windowEnd }: { row: RunwayRow; windowEnd: string | null }) {
  return (
    <Table.Row data-testid={`runway-${row.id}`}>
      <Table.RowHeaderCell>{row.wrapper}</Table.RowHeaderCell>
      <Table.Cell>{row.bound}</Table.Cell>
      <Table.Cell>{yearText(row, windowEnd)}</Table.Cell>
      <Table.Cell>{unclaimedText(row)}</Table.Cell>
      <Table.Cell>{row.note}</Table.Cell>
    </Table.Row>
  );
}

/**
 * The absence state: every wrapper's group excluded from `inputs.groups`,
 * so `buildRunway` returns zero rows. Not reachable through today's UI
 * (`ProjectionsView` passes no group selector), but reachable by corpus --
 * `PROJECTION_GROUP_ORDER` includes `Corporate`, which `buildRunway`
 * handles in none of its four branches, so a scope whose only projected
 * group is `Corporate` yields an empty runway. States the absence rather
 * than rendering nothing, per this project's disabled-not-hidden
 * principle for a scope that legitimately has nothing to report.
 */
function EmptyRunway() {
  return (
    <Flex direction="column" gap="2" data-runway-empty="">
      <Heading size="4" as="h3">
        Room runway
      </Heading>
      <Text size="2" color="gray" data-runway-empty-message="">
        No account in this projection carries a lifetime cap or a statutory deadline to report here.
      </Text>
    </Flex>
  );
}

/**
 * The room runway: a real `<table>`, not a grid of divs, so a screen reader
 * announces each wrapper's bound, year and unclaimed figure as a row rather
 * than as unrelated fragments of text.
 *
 * `buildRunway` runs here, from the same `rows`/`inputs` the projection chart
 * already derived, rather than being handed a `RunwayRow[]` directly -- the
 * same shape `ProjectionsView` already holds for the chart, so mounting this
 * table costs the caller nothing beyond passing those two through.
 *
 * The window statement above the table states the projected range in words
 * next to the years it explains, per the finding carried over from task 5's
 * review: a row's year is only a plain fact when the window it was computed
 * inside is stated beside it. `windowEnd` comes off `rows` itself -- the
 * projection's own last row -- never a hardcoded constant, so a longer or
 * shorter projection moves this statement and the beyond-window marking on
 * `yearText` together.
 */
export function RunwayTable({ rows, inputs }: RunwayTableProps) {
  const runway = buildRunway(rows, inputs);
  const windowStart = rows[0]?.year ?? null;
  const windowEnd = rows.at(-1)?.year ?? null;

  if (runway.length === 0) return <EmptyRunway />;

  const windowLine =
    windowStart !== null && windowEnd !== null
      ? `The projection behind this table runs from ${windowStart} to ${windowEnd}. A year outside that range is stated as a fact about the account's rules, not as something this projection produced.`
      : "The projection behind this table has no rows, so no year below was produced by it.";

  return (
    <Table.Root data-runway-table="" variant="surface">
      <caption style={{ captionSide: "top", textAlign: "left" }}>
        <Heading size="4" as="h3">
          Room runway
        </Heading>
        <Text size="2" color="gray" data-runway-window="">
          {windowLine}
        </Text>
      </caption>
      <Table.Header>
        <Table.Row>
          {HEADERS.map((header) => (
            <Table.ColumnHeaderCell key={header}>{header}</Table.ColumnHeaderCell>
          ))}
        </Table.Row>
      </Table.Header>
      <Table.Body>
        {runway.map((row) => (
          <RunwayTableRow key={row.id} row={row} windowEnd={windowEnd} />
        ))}
      </Table.Body>
    </Table.Root>
  );
}
