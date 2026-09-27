import { Flex, Heading, Table } from "@radix-ui/themes";
import type { RegisteredGroup, RoomLine } from "../../analytics/rooms";
import { formatCurrency } from "../format";

export interface ContributionHistoryProps {
  rooms: Readonly<Record<string, readonly RoomLine[]>>;
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
 * Every registered wrapper's contribution history, one row per wrapper and
 * one column per year the corpus covers. A cell reads "no statement" rather
 * than $0.00 when the wrapper had no room line that year at all -- a period
 * before the account existed, or one it filed nothing for -- since a stated
 * zero and an absent statement are different facts.
 */
export function ContributionHistory({ rooms }: ContributionHistoryProps) {
  const years = yearsOf(rooms);
  const groups = groupsPresent(rooms);

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
                const line = lineFor(rooms, group, year);
                return (
                  <Table.Cell key={year}>
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
