import { Flex, Heading, Table, Text } from "@radix-ui/themes";
import type { AnalyticsOutput } from "../analytics/build";
import {
  type AccountWithholding,
  type WithholdingRecovery,
  type YearIncome,
  incomeByMonth,
  incomeByYear,
  withholdingByAccount,
} from "../analytics/incomeCosts";
import { DividendsChart } from "./charts/DividendsChart";
import { formatCurrency } from "./format";
import type { YearScope } from "./scope";
import { TaxView } from "./wrappers/TaxView";

export interface IncomeCostsProps {
  analytics: AnalyticsOutput;
  year: number;
  scope: YearScope;
}

/** Phrased for a person, not for the tax code -- see `withholdingRecovery` in `incomeCosts.ts`. */
const RECOVERY_TEXT: Record<WithholdingRecovery, string> = {
  credit: "Claimable as a foreign tax credit",
  "exempt for US listed funds": "Not withheld on US listed funds held directly",
  lost: "Lost, cannot be recovered",
};

function YearRow({ year, selected }: { year: YearIncome; selected: boolean }) {
  const { totals } = year;
  return (
    <Table.Row data-income-year-row={year.year} data-selected={selected ? "" : undefined}>
      <Table.RowHeaderCell>{year.year}</Table.RowHeaderCell>
      <Table.Cell>{formatCurrency(totals.dividends)}</Table.Cell>
      <Table.Cell>{formatCurrency(totals.interest)}</Table.Cell>
      <Table.Cell>{formatCurrency(totals.lendingIncome)}</Table.Cell>
      <Table.Cell>{formatCurrency(totals.withholdingTax)}</Table.Cell>
      <Table.Cell>{formatCurrency(totals.fees)}</Table.Cell>
      <Table.Cell>{totals.fxConversions}</Table.Cell>
    </Table.Row>
  );
}

/** Every year the corpus covers, oldest first, the selected year marked so a reader can find it at a glance. */
function YearTable({
  years,
  selectedYear,
}: {
  years: readonly YearIncome[];
  selectedYear: number;
}) {
  return (
    <Table.Root data-income-year-table="" variant="surface">
      <Table.Header>
        <Table.Row>
          <Table.ColumnHeaderCell>Year</Table.ColumnHeaderCell>
          <Table.ColumnHeaderCell>Dividends</Table.ColumnHeaderCell>
          <Table.ColumnHeaderCell>Interest</Table.ColumnHeaderCell>
          <Table.ColumnHeaderCell>Securities lending</Table.ColumnHeaderCell>
          <Table.ColumnHeaderCell>Foreign withholding tax</Table.ColumnHeaderCell>
          <Table.ColumnHeaderCell>Fees</Table.ColumnHeaderCell>
          <Table.ColumnHeaderCell>FX conversions</Table.ColumnHeaderCell>
        </Table.Row>
      </Table.Header>
      <Table.Body>
        {years.map((y) => (
          <YearRow key={y.year} year={y} selected={y.year === selectedYear} />
        ))}
      </Table.Body>
    </Table.Root>
  );
}

function WithholdingRow({ row }: { row: AccountWithholding }) {
  return (
    <Table.Row data-withholding-row={row.maskedId}>
      <Table.RowHeaderCell>{row.label}</Table.RowHeaderCell>
      <Table.Cell>{formatCurrency(row.withholdingTax)}</Table.Cell>
      <Table.Cell>{RECOVERY_TEXT[row.recovery]}</Table.Cell>
    </Table.Row>
  );
}

/** The spousal RRSP's own withholding, stated apart from the accounts that count toward the totals above. */
function SpousalRow({ row }: { row: AccountWithholding }) {
  return (
    <Text size="2" color="gray" data-withholding-spousal={row.maskedId}>
      {row.label} (spousal RRSP, your spouse's asset, not counted above):{" "}
      {formatCurrency(row.withholdingTax)}, {RECOVERY_TEXT[row.recovery].toLowerCase()}.
    </Text>
  );
}

function WithholdingTable({
  rows,
  year,
}: {
  rows: readonly AccountWithholding[];
  year: number;
}) {
  if (rows.length === 0) {
    return (
      <Text size="2" color="gray" data-withholding-empty="">
        No foreign withholding tax in {year}.
      </Text>
    );
  }
  return (
    <Table.Root data-withholding-table="" variant="surface">
      <Table.Header>
        <Table.Row>
          <Table.ColumnHeaderCell>Account</Table.ColumnHeaderCell>
          <Table.ColumnHeaderCell>Withheld</Table.ColumnHeaderCell>
          <Table.ColumnHeaderCell>Can it be recovered?</Table.ColumnHeaderCell>
        </Table.Row>
      </Table.Header>
      <Table.Body>
        {rows.map((row) => (
          <WithholdingRow key={row.maskedId} row={row} />
        ))}
      </Table.Body>
    </Table.Root>
  );
}

/** "All time" silently shows the latest year's figures, so the heading has to say so -- the same rule `TaxView` follows. */
function headingFor(year: number, scope: YearScope): string {
  return scope === "all" ? `Income and costs, latest year ${year}` : `Income and costs, ${year}`;
}

/**
 * What the portfolio pays and what it costs: a year table over the whole
 * corpus, a monthly dividend chart and a withholding table for the selected
 * year, and -- underneath, in its own section -- the personal taxable
 * income view `TaxView` already renders. The year table and the chart are
 * built on `incomeByYear`/`incomeByMonth`, which read the same reversal-
 * netted activity totals `activity.ts` already produces for the This month
 * page, rather than a second pass over the statements.
 */
export function IncomeCosts({ analytics, year, scope }: IncomeCostsProps) {
  const years = incomeByYear(analytics);
  const months = incomeByMonth(analytics, year);
  const withholding = withholdingByAccount(analytics, year);
  const spousal = withholding.find((row) => row.kind === "SpousalRRSP");
  const counted = withholding.filter((row) => row.kind !== "SpousalRRSP");

  return (
    <Flex direction="column" gap="6">
      <Flex direction="column" gap="3">
        <Heading size="5" as="h2">
          {headingFor(year, scope)}
        </Heading>
        <YearTable years={years} selectedYear={year} />
      </Flex>

      <DividendsChart year={year} months={months} />

      <Flex direction="column" gap="3">
        <Heading size="4" as="h3">
          Foreign withholding tax by account, {year}
        </Heading>
        <WithholdingTable rows={counted} year={year} />
        {spousal === undefined ? null : <SpousalRow row={spousal} />}
      </Flex>

      {/* No heading of its own here: TaxView already opens with "Investment
          income, {year}", its own h2, one level below this section's own. */}
      <TaxView analytics={analytics} year={year} scope={scope} />
    </Flex>
  );
}
