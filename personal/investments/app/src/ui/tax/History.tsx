import { Flex, Heading, Table, Text } from "@radix-ui/themes";
import type { AnalyticsOutput } from "../../analytics/build";
import type { RunningCapitalAccounts } from "../../analytics/corporatePassiveIncome";
import { formatCurrency } from "../format";
import {
  type CapitalLossCarryforwardRow,
  capitalLossCarryforward,
  hideZeroRows,
} from "./summaries";

interface PersonalHistoryRow {
  year: number;
  realizedGains: number;
  dividends: number;
  interest: number;
  foreignTaxWithheld: number;
  /** This year's own net allowable loss added to the carryforward -- see `capitalLossCarryforward`. */
  yearLoss: number;
  /** The running carryforward balance through this year -- an estimate, never a filing number. */
  carryforwardBalance: number;
}

function personalRows(
  income: AnalyticsOutput["income"],
  carryforward: readonly CapitalLossCarryforwardRow[],
): PersonalHistoryRow[] {
  const carryforwardByYear = new Map(carryforward.map((c) => [c.year, c]));
  return Object.keys(income)
    .map(Number)
    .sort((a, b) => a - b)
    .map((year) => {
      const row = income[String(year)];
      const loss = carryforwardByYear.get(year);
      return {
        year,
        realizedGains: row?.realizedGains ?? 0,
        dividends: (row?.canadianDistributions ?? 0) + (row?.foreignDividends ?? 0),
        interest: row?.interest ?? 0,
        foreignTaxWithheld: row?.foreignTaxWithheld ?? 0,
        yearLoss: loss?.yearLoss ?? 0,
        carryforwardBalance: loss?.running ?? 0,
      };
    });
}

function isPersonalRowZero(row: PersonalHistoryRow): boolean {
  return (
    row.realizedGains === 0 &&
    row.dividends === 0 &&
    row.interest === 0 &&
    row.foreignTaxWithheld === 0 &&
    row.carryforwardBalance === 0
  );
}

/**
 * Section 10 of the redesign spec, personal scope: realized
 * gains/dividends/interest/foreign tax by year, zero-activity years hidden,
 * plus the capital-loss carryforward running balance -- an estimate, never
 * a filing number, since CRA's own balance can differ (a loss already
 * claimed, or carried back three years instead of forward).
 */
export function PersonalHistory({
  income,
  inclusion,
}: {
  income: AnalyticsOutput["income"];
  /** The capital gains inclusion rate for the carryforward's own math -- the caller's current-year rate when the year has no entered rate of its own. */
  inclusion: number;
}) {
  const carryforward = capitalLossCarryforward(income, inclusion);
  const rows = hideZeroRows(personalRows(income, carryforward), isPersonalRowZero);
  if (rows.length === 0) return null;
  return (
    <Flex direction="column" gap="2" id="history">
      <Heading size="5" as="h2">
        History
      </Heading>
      <div className="ivt-table-scroll">
        <Table.Root data-history-table="" variant="surface" size="1">
          <Table.Header>
            <Table.Row>
              <Table.ColumnHeaderCell>Year</Table.ColumnHeaderCell>
              <Table.ColumnHeaderCell>Realized net gain</Table.ColumnHeaderCell>
              <Table.ColumnHeaderCell>Dividends</Table.ColumnHeaderCell>
              <Table.ColumnHeaderCell>Interest</Table.ColumnHeaderCell>
              <Table.ColumnHeaderCell>Foreign tax withheld</Table.ColumnHeaderCell>
              <Table.ColumnHeaderCell>Loss carryforward (estimate)</Table.ColumnHeaderCell>
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {rows.map((row) => (
              <Table.Row key={row.year} data-history-row={row.year}>
                <Table.RowHeaderCell>{row.year}</Table.RowHeaderCell>
                <Table.Cell className="ivt-num">
                  <Text color={row.realizedGains < 0 ? "red" : "jade"}>
                    {formatCurrency(row.realizedGains)}
                  </Text>
                </Table.Cell>
                <Table.Cell className="ivt-num">{formatCurrency(row.dividends)}</Table.Cell>
                <Table.Cell className="ivt-num">{formatCurrency(row.interest)}</Table.Cell>
                <Table.Cell className="ivt-num">
                  {formatCurrency(row.foreignTaxWithheld)}
                </Table.Cell>
                <Table.Cell className="ivt-num" data-carryforward-balance={row.year}>
                  {formatCurrency(row.carryforwardBalance)}
                </Table.Cell>
              </Table.Row>
            ))}
          </Table.Body>
        </Table.Root>
      </div>
    </Flex>
  );
}

function isCorporateRowZero(row: RunningCapitalAccounts): boolean {
  return row.cdaBalance === 0 && row.nerdtohBalance === 0 && row.eligibleRdtohBalance === 0;
}

/** Section 10 of the redesign spec, corporate scope: the running CDA/RDTOH table, zero-activity years hidden (e.g. 2023 and 2024 before the corporation held anything). */
export function CorporateHistory({ rows }: { rows: readonly RunningCapitalAccounts[] }) {
  const visible = hideZeroRows(rows, isCorporateRowZero);
  if (visible.length === 0) return null;
  return (
    <Flex direction="column" gap="2" id="history">
      <Heading size="5" as="h2">
        History
      </Heading>
      <div className="ivt-table-scroll">
        <Table.Root data-running-accounts-table="" variant="surface" size="1">
          <Table.Header>
            <Table.Row>
              <Table.ColumnHeaderCell>Fiscal year</Table.ColumnHeaderCell>
              <Table.ColumnHeaderCell>CDA balance</Table.ColumnHeaderCell>
              <Table.ColumnHeaderCell>Non-eligible RDTOH</Table.ColumnHeaderCell>
              <Table.ColumnHeaderCell>Eligible RDTOH</Table.ColumnHeaderCell>
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {visible.map((row) => (
              <Table.Row key={row.year} data-running-accounts-row={row.year}>
                <Table.RowHeaderCell>{row.year}</Table.RowHeaderCell>
                <Table.Cell className="ivt-num">{formatCurrency(row.cdaBalance)}</Table.Cell>
                <Table.Cell className="ivt-num">{formatCurrency(row.nerdtohBalance)}</Table.Cell>
                <Table.Cell className="ivt-num">
                  {formatCurrency(row.eligibleRdtohBalance)}
                </Table.Cell>
              </Table.Row>
            ))}
          </Table.Body>
        </Table.Root>
      </div>
    </Flex>
  );
}
