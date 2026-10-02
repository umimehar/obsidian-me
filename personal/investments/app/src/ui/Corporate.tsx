import { Badge, Card, Flex, Heading, Table, Text } from "@radix-ui/themes";
import { CORPORATE_KINDS, accountIdsOfKind } from "../analytics/accountScopes";
import type { AnalyticsOutput } from "../analytics/build";
import { claimableYear } from "../analytics/claimable";
import { passiveIncomeYear, runningCapitalAccounts } from "../analytics/corporatePassiveIncome";
import { withholdingByAccount } from "../analytics/incomeCosts";
import type { TaxTable } from "../tax";
import { taxYear } from "../tax";
import { formatCurrency } from "./format";
import type { YearScope } from "./scope";
import { Claimable } from "./wrappers/Claimable";
import { T1135Card } from "./wrappers/T1135Card";
import { TaxableHoldings } from "./wrappers/TaxableHoldings";

export interface CorporateProps {
  analytics: AnalyticsOutput;
  year: number;
  scope: YearScope;
  taxTable: TaxTable;
}

/** Holdings that paid no distributions over the year -- derived from the year's activity, never a hardcoded list (e.g. HXQ, HXS are corporate-class funds that accrue internally rather than distribute). */
function noDistributionSymbols(analytics: AnalyticsOutput, year: number): Set<string> {
  const held = new Set(analytics.corporateHoldings.holdings.map((h) => h.symbol));
  const dividendPayers = new Set<string>();
  for (const [period, byAccount] of Object.entries(analytics.activity)) {
    if (Number(period.slice(0, 4)) !== year) continue;
    for (const totals of Object.values(byAccount)) {
      if (totals.dividends !== 0) dividendPayers.add(period);
    }
  }
  // Activity totals do not carry per-symbol dividends, so this can only
  // name an account-month, not a symbol -- the per-row dividend/holding
  // join `income.ts` does internally is not exposed at this grain. Flagging
  // a held symbol as "no distributions" is therefore limited to the case
  // where the whole corpus paid nothing at all this year.
  return dividendPayers.size === 0 ? held : new Set();
}

function PassiveIncomeCard({
  year,
  passive,
}: {
  year: number;
  passive: ReturnType<typeof passiveIncomeYear>;
}) {
  return (
    <Card data-passive-income="">
      <Flex direction="column" gap="2">
        <Heading size="4" as="h3">
          Passive income, fiscal {year}
        </Heading>
        <Text size="2" data-aaii="">
          Adjusted aggregate investment income:{" "}
          <Text weight="bold">{formatCurrency(passive.aaii)}</Text>
        </Text>
        <Flex gap="2" wrap="wrap">
          <Badge color={passive.aaii > 50000 ? "amber" : "jade"} variant="soft" highContrast>
            {passive.aaii > 50000 ? "Over" : "Under"} $50,000
          </Badge>
          <Badge color={passive.sbdEliminated ? "red" : "jade"} variant="soft" highContrast>
            {passive.sbdEliminated ? "Over" : "Under"} $150,000
          </Badge>
        </Flex>
        <Text size="2" data-sbd-grind="">
          Small business deduction grind: {formatCurrency(passive.grind)} of the $500,000 limit
          (estimate, from statements, not the T2)
        </Text>
        <Text size="1" color="gray">
          Interest and foreign income {formatCurrency(passive.interestAndForeignTaxable)} taxed at
          the passive rate; Canadian eligible dividends route through Part IV tax instead.
        </Text>
      </Flex>
    </Card>
  );
}

function TreatmentCard({
  year,
  passive,
}: {
  year: number;
  passive: ReturnType<typeof passiveIncomeYear>;
}) {
  return (
    <Card data-treatment-lines="">
      <Flex direction="column" gap="2">
        <Heading size="4" as="h3">
          Treatment, fiscal {year} (estimates from statements, not the T2)
        </Heading>
        <Text size="2" data-nerdtoh-added="">
          Interest and foreign income added to non-eligible RDTOH:{" "}
          {formatCurrency(passive.nerdtohAdded)}
        </Text>
        <Text size="2" data-part-iv-tax="">
          Canadian eligible dividends, Part IV tax (38.33%): {formatCurrency(passive.partIVTax)},
          added to eligible RDTOH
        </Text>
        <Text size="2" data-cda-addition="">
          Capital dividend account addition (non-taxable half of net realized gains, net of losses):{" "}
          {formatCurrency(passive.cdaAddition)}
        </Text>
      </Flex>
    </Card>
  );
}

function RunningAccountsTable({
  rows,
}: {
  rows: ReturnType<typeof runningCapitalAccounts>;
}) {
  return (
    <Flex direction="column" gap="2">
      <Heading size="4" as="h3">
        Running CDA and RDTOH (estimates)
      </Heading>
      <Table.Root data-running-accounts-table="" variant="surface">
        <Table.Header>
          <Table.Row>
            <Table.ColumnHeaderCell>Fiscal year</Table.ColumnHeaderCell>
            <Table.ColumnHeaderCell>CDA balance</Table.ColumnHeaderCell>
            <Table.ColumnHeaderCell>Non-eligible RDTOH</Table.ColumnHeaderCell>
            <Table.ColumnHeaderCell>Eligible RDTOH</Table.ColumnHeaderCell>
          </Table.Row>
        </Table.Header>
        <Table.Body>
          {rows.map((row) => (
            <Table.Row key={row.year} data-running-accounts-row={row.year}>
              <Table.RowHeaderCell>{row.year}</Table.RowHeaderCell>
              <Table.Cell>{formatCurrency(row.cdaBalance)}</Table.Cell>
              <Table.Cell>{formatCurrency(row.nerdtohBalance)}</Table.Cell>
              <Table.Cell>{formatCurrency(row.eligibleRdtohBalance)}</Table.Cell>
            </Table.Row>
          ))}
        </Table.Body>
      </Table.Root>
    </Flex>
  );
}

function NoDistributionsNote({ symbols }: { symbols: ReadonlySet<string> }) {
  if (symbols.size === 0) return null;
  return (
    <Text size="2" color="gray" data-no-distributions="">
      No distributions this year from: {[...symbols].filter(Boolean).sort().join(", ")}
    </Text>
  );
}

function headingFor(year: number, scope: YearScope): string {
  return scope === "all" ? `Corporate, latest year ${year}` : `Corporate, ${year}`;
}

/**
 * The corporation's own tab: holdings, passive income against the AAII
 * thresholds, treatment lines (nERDTOH, Part IV tax, CDA addition), running
 * CDA/RDTOH estimates across years, claimable items and the corporation's
 * own T1135 -- a separate taxpayer from the owner, so a separate summary.
 */
export function Corporate({ analytics, year, scope, taxTable }: CorporateProps) {
  const income = analytics.corporateIncome[String(year)];
  const rates = taxYear(taxTable, year);
  const corporateIds = accountIdsOfKind(analytics.series, CORPORATE_KINDS);
  const foreignTaxByAccount = new Map(
    withholdingByAccount(analytics, year)
      .filter((w) => corporateIds.has(w.maskedId))
      .map((w) => [w.maskedId, w.withholdingTax]),
  );
  const claimable =
    rates === null
      ? null
      : claimableYear(
          analytics,
          year,
          corporateIds,
          rates.corporate.passiveIncomeRate.value,
          true,
          foreignTaxByAccount,
        );
  const foreignProperty = analytics.foreignPropertyCorporate[String(year)];

  const allYears = Object.keys(analytics.corporateIncome)
    .map(Number)
    .sort((a, b) => a - b);
  const passiveYears =
    rates === null
      ? []
      : allYears.map((y) => {
          const yearIncome = analytics.corporateIncome[String(y)];
          return yearIncome ? passiveIncomeYear(y, yearIncome, rates.corporate) : null;
        });
  const validPassiveYears = passiveYears.filter((p): p is NonNullable<typeof p> => p !== null);
  const runningRows = runningCapitalAccounts(validPassiveYears);
  const thisYearPassive = validPassiveYears.find((p) => p.year === year) ?? null;

  return (
    <Flex direction="column" gap="6">
      <Heading size="5" as="h2">
        {headingFor(year, scope)}
      </Heading>

      <TaxableHoldings holdings={analytics.corporateHoldings} harvestRates={null} />
      <NoDistributionsNote symbols={noDistributionSymbols(analytics, year)} />

      {income === undefined ? (
        <Text size="2" color="gray" data-no-income="">
          No income data for {year}.
        </Text>
      ) : rates === null ? (
        <Text size="2" color="gray" data-rates-not-entered="">
          Tax rates for {year} are not entered yet in data/tax.json. Income figures still show;
          AAII, passive-rate and CDA/RDTOH figures do not.
        </Text>
      ) : null}

      {thisYearPassive !== null ? (
        <>
          <PassiveIncomeCard year={year} passive={thisYearPassive} />
          <TreatmentCard year={year} passive={thisYearPassive} />
        </>
      ) : null}

      {runningRows.length > 0 ? <RunningAccountsTable rows={runningRows} /> : null}

      {claimable !== null ? <Claimable year={claimable} /> : null}

      {foreignProperty !== undefined && rates !== null ? (
        <T1135Card summary={foreignProperty} thresholds={rates.t1135} />
      ) : null}
    </Flex>
  );
}
