import { Flex, Heading, Table } from "@radix-ui/themes";
import { REGISTERED_KINDS, type RegisteredGroup, type RoomLine } from "../../analytics/rooms";
import type { AccountSeries } from "../../analytics/types";
import { formatCurrency } from "../format";

export interface ContributionHistoryProps {
  rooms: Readonly<Record<string, readonly RoomLine[]>>;
  series: readonly AccountSeries[];
}

/** The canonical display order, filtered to the groups that appear in any year -- a group absent from every year is not a column-less row. */
const GROUP_ORDER: readonly RegisteredGroup[] = ["TFSA", "RRSP", "FHSA", "RESP"];

const NO_STATEMENT = "no statement";

function yearsOf(rooms: Readonly<Record<string, readonly RoomLine[]>>): number[] {
  return Object.keys(rooms)
    .map(Number)
    .sort((a, b) => a - b);
}

function groupsPresent(rooms: Readonly<Record<string, readonly RoomLine[]>>): RegisteredGroup[] {
  const seen = new Set<RegisteredGroup>();
  for (const lines of Object.values(rooms)) {
    for (const line of lines) seen.add(line.group);
  }
  return GROUP_ORDER.filter((group) => seen.has(group));
}

function lineFor(
  rooms: Readonly<Record<string, readonly RoomLine[]>>,
  group: RegisteredGroup,
  year: number,
): RoomLine | undefined {
  return rooms[String(year)]?.find((line) => line.group === group);
}

/**
 * The earliest year any account in `group` has a month at all, or null when
 * the group has no account with one. `buildRoomLines` sums a group's
 * accounts for every year the CORPUS covers, not just the years an
 * individual account existed, so a year before the group's first account
 * opened still carries a `RoomLine` at `used: 0` -- a stated zero rather
 * than the true "no statement" this predates.
 */
function firstYearFor(series: readonly AccountSeries[], group: RegisteredGroup): number | null {
  const kinds = REGISTERED_KINDS[group];
  let first: number | null = null;
  for (const account of series) {
    if (!kinds.includes(account.kind)) continue;
    const period = account.months[0]?.period;
    if (!period) continue;
    const year = Number(period.slice(0, 4));
    if (first === null || year < first) first = year;
  }
  return first;
}

/**
 * Every registered wrapper's contribution history, one row per wrapper and
 * one column per year the corpus covers. A cell reads "no statement" rather
 * than $0.00 both when the wrapper had no room line that year at all, and
 * when the year predates the group's first account (see `firstYearFor`) --
 * a stated zero and an absent statement are different facts.
 */
export function ContributionHistory({ rooms, series }: ContributionHistoryProps) {
  const years = yearsOf(rooms);
  const groups = groupsPresent(rooms);
  const firstYearByGroup = new Map(groups.map((group) => [group, firstYearFor(series, group)]));

  return (
    <Flex direction="column" gap="3">
      <Heading size="4" as="h3">
        Contribution history
      </Heading>
      <Table.Root data-contribution-history="">
        <Table.Header>
          <Table.Row>
            <Table.ColumnHeaderCell>Wrapper</Table.ColumnHeaderCell>
            {years.map((year) => (
              <Table.ColumnHeaderCell key={year}>{year}</Table.ColumnHeaderCell>
            ))}
          </Table.Row>
        </Table.Header>
        <Table.Body>
          {groups.map((group) => (
            <Table.Row key={group} data-history-row={group}>
              <Table.RowHeaderCell>{group}</Table.RowHeaderCell>
              {years.map((year) => {
                const firstYear = firstYearByGroup.get(group) ?? null;
                const beforeFirstAccount = firstYear !== null && year < firstYear;
                const line = beforeFirstAccount ? undefined : lineFor(rooms, group, year);
                return (
                  <Table.Cell key={year} data-history-cell={year}>
                    {line === undefined ? NO_STATEMENT : formatCurrency(line.used)}
                  </Table.Cell>
                );
              })}
            </Table.Row>
          ))}
        </Table.Body>
      </Table.Root>
    </Flex>
  );
}
