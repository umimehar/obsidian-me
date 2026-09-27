import { Badge, Box, Card, Flex, Heading, Table, Text } from "@radix-ui/themes";
import type { Coverage } from "../analytics/coverage";

export interface DataStatusProps {
  coverage: Coverage;
}

function Headline({ coverage }: DataStatusProps) {
  if (coverage.latestComplete === null) {
    return <Text size="3">No month yet has a statement for every open account.</Text>;
  }
  const month = coverage.months.find((m) => m.period === coverage.latestComplete);
  const behind = coverage.accounts.filter((a) => a.lastPeriod < coverage.latestPeriod);
  return (
    <Flex direction="column" gap="1">
      <Text size="2" color="gray">
        Latest complete month
      </Text>
      <Text size="6" weight="bold" data-latest-complete="">
        {coverage.latestComplete}
      </Text>
      <Text size="2" color="gray">
        All {month?.expected ?? 0} open accounts have a statement for this month.
      </Text>
      {behind.length === 0 ? null : (
        <Text size="2" data-coverage-behind="">
          {coverage.latestPeriod} is partial. Still to import:{" "}
          {behind.map((a) => a.label).join(", ")}.
        </Text>
      )}
    </Flex>
  );
}

function MissingCell({ missing, none }: { missing: readonly string[]; none: string }) {
  if (missing.length === 0) {
    return (
      <Text size="2" color="gray">
        {none}
      </Text>
    );
  }
  return (
    <Badge color="amber" variant="soft" highContrast>
      {missing.join(", ")}
    </Badge>
  );
}

function AccountTable({ coverage }: DataStatusProps) {
  return (
    <Table.Root size="1" variant="surface" data-coverage-accounts="">
      <Table.Header>
        <Table.Row>
          <Table.ColumnHeaderCell>Account</Table.ColumnHeaderCell>
          <Table.ColumnHeaderCell>First</Table.ColumnHeaderCell>
          <Table.ColumnHeaderCell>Latest</Table.ColumnHeaderCell>
          <Table.ColumnHeaderCell align="right">Months</Table.ColumnHeaderCell>
          <Table.ColumnHeaderCell>Missing</Table.ColumnHeaderCell>
        </Table.Row>
      </Table.Header>
      <Table.Body>
        {coverage.accounts.map((a) => (
          <Table.Row key={a.label}>
            <Table.RowHeaderCell>
              {a.label}
              {a.inTotals ? null : (
                <Text size="1" color="gray">
                  {" "}
                  (not in totals)
                </Text>
              )}
            </Table.RowHeaderCell>
            <Table.Cell>{a.firstPeriod}</Table.Cell>
            <Table.Cell>{a.lastPeriod}</Table.Cell>
            <Table.Cell align="right">{a.monthCount}</Table.Cell>
            <Table.Cell>
              <MissingCell missing={a.missing} none="none" />
            </Table.Cell>
          </Table.Row>
        ))}
      </Table.Body>
    </Table.Root>
  );
}

function MonthTable({ coverage }: DataStatusProps) {
  return (
    <Table.Root size="1" variant="surface" data-coverage-months="">
      <Table.Header>
        <Table.Row>
          <Table.ColumnHeaderCell>Month</Table.ColumnHeaderCell>
          <Table.ColumnHeaderCell align="right">Accounts</Table.ColumnHeaderCell>
          <Table.ColumnHeaderCell>Missing</Table.ColumnHeaderCell>
        </Table.Row>
      </Table.Header>
      <Table.Body>
        {coverage.months.map((m) => (
          <Table.Row key={m.period}>
            <Table.RowHeaderCell>{m.period}</Table.RowHeaderCell>
            <Table.Cell align="right">
              {m.present} of {m.expected}
            </Table.Cell>
            <Table.Cell>
              <MissingCell missing={m.missing} none="complete" />
            </Table.Cell>
          </Table.Row>
        ))}
      </Table.Body>
    </Table.Root>
  );
}

/**
 * Housekeeping about the statement archive: which months are in and which
 * accounts still owe one. It reads `coverage.json`, the same figures
 * `tracking.md` prints, so the page and the note cannot disagree.
 */
export function DataStatus({ coverage }: DataStatusProps) {
  return (
    <Flex direction="column" gap="5" pt="4">
      <Card>
        <Headline coverage={coverage} />
      </Card>
      <Box>
        <Heading size="3" as="h3" mb="2">
          By account
        </Heading>
        <AccountTable coverage={coverage} />
      </Box>
      <Box>
        <Heading size="3" as="h3" mb="2">
          By month
        </Heading>
        <MonthTable coverage={coverage} />
      </Box>
      <Text size="1" color="gray">
        Built from the statement archive on {coverage.generated.slice(0, 10)}. An account is
        expected every month from its first statement onward.
      </Text>
    </Flex>
  );
}
