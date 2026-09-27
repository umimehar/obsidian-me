import { Flex, Heading, Table, Text } from "@radix-ui/themes";
import type { AnalyticsOutput } from "../analytics/build";
import {
  type AccountIncome,
  type AccountWithholding,
  type ChequingInterest,
  type WithholdingRecovery,
  type YearIncome,
  chequingInterestByAccount,
  incomeByAccountForYear,
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

/**
 * Phrased for a person, not for the tax code -- see `withholdingRecovery` in
 * `incomeCosts.ts`. The exempt case only ever renders for a row that DID
 * have tax withheld, which for an RRSP or a spousal RRSP holding a US
 * listed security directly should not happen at all under the Canada-US
 * treaty, so the wording says to check why rather than simply "not
 * withheld".
 */
const RECOVERY_TEXT: Record<WithholdingRecovery, string> = {
  credit: "Claimable as a foreign tax credit",
  "exempt for US listed funds":
    "Not recoverable; US listed securities held directly in an RRSP are exempt, so check why this was withheld",
  lost: "Lost, cannot be recovered",
};

function YearRow({ year, selected }: { year: YearIncome; selected: boolean }) {
  const { totals } = year;
  return (
    <Table.Row
      data-income-year-row={year.year}
      data-selected={selected ? "" : undefined}
      aria-current={selected ? "true" : undefined}
      className={selected ? "ivt-selected-row" : undefined}
    >
      <Table.RowHeaderCell>{year.year}</Table.RowHeaderCell>
      <Table.Cell>{formatCurrency(totals.dividends)}</Table.Cell>
      <Table.Cell>{formatCurrency(totals.interest)}</Table.Cell>
      <Table.Cell>{formatCurrency(totals.lendingIncome)}</Table.Cell>
      <Table.Cell>{formatCurrency(totals.withholdingTax)}</Table.Cell>
      <Table.Cell>{formatCurrency(totals.fees)}</Table.Cell>
      <Table.Cell>{totals.fxConversions}</Table.Cell>
      <Table.Cell>{formatCurrency(totals.fxConversionAmount)}</Table.Cell>
    </Table.Row>
  );
}

/** Every year the corpus covers, oldest first; the selected row carries `aria-current` and its own tint. */
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
          <Table.ColumnHeaderCell>FX converted</Table.ColumnHeaderCell>
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

/** One chequing account's interest, stated apart from the year table: it never counts toward the portfolio total. */
function ChequingInterestLine({ row }: { row: ChequingInterest }) {
  return (
    <Text size="2" color="gray" data-chequing-interest={row.maskedId}>
      {row.label}: {formatCurrency(row.interest)} in chequing interest, not in the portfolio total.
    </Text>
  );
}

function AccountIncomeRow({ row }: { row: AccountIncome }) {
  const { totals } = row;
  return (
    <Table.Row data-account-income-row={row.maskedId}>
      <Table.RowHeaderCell>{row.label}</Table.RowHeaderCell>
      <Table.Cell>{formatCurrency(totals.dividends)}</Table.Cell>
      <Table.Cell>{formatCurrency(totals.interest)}</Table.Cell>
      <Table.Cell>{formatCurrency(totals.lendingIncome)}</Table.Cell>
      <Table.Cell>{formatCurrency(totals.withholdingTax)}</Table.Cell>
      <Table.Cell>{formatCurrency(totals.fees)}</Table.Cell>
    </Table.Row>
  );
}

/** Income and costs by account, for the selected year, sorted by what each account actually pays. */
function AccountIncomeTable({ rows, year }: { rows: readonly AccountIncome[]; year: number }) {
  if (rows.length === 0) {
    return (
      <Text size="2" color="gray" data-account-income-empty="">
        No account had income or costs in {year}.
      </Text>
    );
  }
  return (
    <Table.Root data-account-income-table="" variant="surface">
      <Table.Header>
        <Table.Row>
          <Table.ColumnHeaderCell>Account</Table.ColumnHeaderCell>
          <Table.ColumnHeaderCell>Dividends</Table.ColumnHeaderCell>
          <Table.ColumnHeaderCell>Interest</Table.ColumnHeaderCell>
          <Table.ColumnHeaderCell>Securities lending</Table.ColumnHeaderCell>
          <Table.ColumnHeaderCell>Foreign withholding tax</Table.ColumnHeaderCell>
          <Table.ColumnHeaderCell>Fees</Table.ColumnHeaderCell>
        </Table.Row>
      </Table.Header>
      <Table.Body>
        {rows.map((row) => (
          <AccountIncomeRow key={row.maskedId} row={row} />
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
      {row.label} (spousal RRSP, your spouse's asset, not counted above) had{" "}
      {formatCurrency(row.withholdingTax)} withheld. {RECOVERY_TEXT[row.recovery]}.
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

/** "All time" silently shows the latest year's figures, so the heading has to say so -- `TaxView` follows the same rule. */
function headingFor(year: number, scope: YearScope): string {
  return scope === "all" ? `Income and costs, latest year ${year}` : `Income and costs, ${year}`;
}

/**
 * What the portfolio pays and what it costs: a year table over the whole
 * corpus, a monthly dividend chart, income by account and a withholding
 * table for the selected year, and the personal taxable income view
 * `TaxView` already renders. Every section heading here is an `h2`, `TaxView`'s
 * own included -- siblings answering different questions about the same
 * year, not a nested outline where one section is a subsection of another.
 * The year table and the chart are built on `incomeByYear`/`incomeByMonth`,
 * which read the same reversal-netted activity totals `activity.ts` already
 * produces for the This month page, rather than a second pass over the
 * statements.
 */
export function IncomeCosts({ analytics, year, scope }: IncomeCostsProps) {
  const years = incomeByYear(analytics);
  const months = incomeByMonth(analytics, year);
  const byAccount = incomeByAccountForYear(analytics, year);
  const chequing = chequingInterestByAccount(analytics, year);
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
        {chequing.map((row) => (
          <ChequingInterestLine key={row.maskedId} row={row} />
        ))}
      </Flex>

      <DividendsChart year={year} months={months} />

      <Flex direction="column" gap="3">
        <Heading size="5" as="h2">
          Income by account, {year}
        </Heading>
        <AccountIncomeTable rows={byAccount} year={year} />
      </Flex>

      <Flex direction="column" gap="3">
        <Heading size="5" as="h2">
          Foreign withholding tax by account, {year}
        </Heading>
        <WithholdingTable rows={counted} year={year} />
        {spousal === undefined ? null : <SpousalRow row={spousal} />}
      </Flex>

      <TaxView analytics={analytics} year={year} scope={scope} />
    </Flex>
  );
}
