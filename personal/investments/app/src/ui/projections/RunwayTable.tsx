import { Heading, Table, Text } from "@radix-ui/themes";
import { type RunwayRow, buildRunway } from "../../goals/runway";
import type { ProjectionInputs, ProjectionYear } from "../../projection/engine";
import { formatCurrency } from "../format";

export interface RunwayTableProps {
  rows: readonly ProjectionYear[];
  inputs: ProjectionInputs;
}

const NO_LIFETIME_CAP = "No lifetime cap to reach.";
const NOT_REACHED_IN_WINDOW = "Not reached within the window above.";
const NOTHING_UNCLAIMED = "Nothing left unclaimed.";

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

/** The unclaimed cell. Null never prints as a blank cell or as `$0.00` -- it is a real absence, stated in words. */
function unclaimedText(unclaimed: number | null): string {
  return unclaimed === null ? NOTHING_UNCLAIMED : formatCurrency(unclaimed);
}

function RunwayTableRow({ row, windowEnd }: { row: RunwayRow; windowEnd: string | null }) {
  return (
    <Table.Row data-testid={`runway-${row.id}`}>
      <Table.RowHeaderCell>{row.wrapper}</Table.RowHeaderCell>
      <Table.Cell>{row.bound}</Table.Cell>
      <Table.Cell>{yearText(row, windowEnd)}</Table.Cell>
      <Table.Cell>{unclaimedText(row.unclaimed)}</Table.Cell>
      <Table.Cell>{row.note}</Table.Cell>
    </Table.Row>
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

  if (runway.length === 0) return null;

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
          <Table.ColumnHeaderCell>Wrapper</Table.ColumnHeaderCell>
          <Table.ColumnHeaderCell>Bound</Table.ColumnHeaderCell>
          <Table.ColumnHeaderCell>Year</Table.ColumnHeaderCell>
          <Table.ColumnHeaderCell>Unclaimed</Table.ColumnHeaderCell>
          <Table.ColumnHeaderCell>Detail</Table.ColumnHeaderCell>
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
