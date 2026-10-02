import { Card, Flex, Heading, Table, Text } from "@radix-ui/themes";
import { PERSONAL_NONREG_KINDS, accountIdsOfKind } from "../analytics/accountScopes";
import type { AnalyticsOutput } from "../analytics/build";
import { claimableYear } from "../analytics/claimable";
import type { SaleDetail } from "../analytics/income";
import { withholdingByAccount } from "../analytics/incomeCosts";
import type { TaxTable } from "../tax";
import { taxYear } from "../tax";
import { formatCurrency } from "./format";
import type { YearScope } from "./scope";
import { Claimable } from "./wrappers/Claimable";
import { SuperficialLossWatch } from "./wrappers/SuperficialLossWatch";
import { T1135Card } from "./wrappers/T1135Card";
import { TaxableHoldings } from "./wrappers/TaxableHoldings";

export interface NonRegisteredProps {
  analytics: AnalyticsOutput;
  year: number;
  scope: YearScope;
  taxTable: TaxTable;
}

function SaleRow({ sale }: { sale: SaleDetail }) {
  return (
    <Table.Row data-sale-row={`${sale.maskedId}:${sale.symbol}:${sale.date}`}>
      <Table.RowHeaderCell>{sale.date}</Table.RowHeaderCell>
      <Table.Cell>{sale.symbol}</Table.Cell>
      <Table.Cell>{formatCurrency(sale.proceeds)}</Table.Cell>
      <Table.Cell>{sale.acb === null ? "unknown" : formatCurrency(sale.acb)}</Table.Cell>
      <Table.Cell>
        <Text color={sale.gain < 0 ? "red" : "jade"}>{formatCurrency(sale.gain)}</Text>
      </Table.Cell>
    </Table.Row>
  );
}

/** Every sale realized in the year, date order -- the Schedule 3 / T5008 level detail the owner checks against a slip. */
function SalesTable({ sales }: { sales: readonly SaleDetail[] }) {
  if (sales.length === 0) {
    return (
      <Text size="2" color="gray" data-sales-empty="">
        No sales this year.
      </Text>
    );
  }
  const costUnknown = sales.filter((s) => s.costUnknown).length;
  return (
    <Flex direction="column" gap="2">
      <Table.Root data-sales-table="" variant="surface">
        <Table.Header>
          <Table.Row>
            <Table.ColumnHeaderCell>Date</Table.ColumnHeaderCell>
            <Table.ColumnHeaderCell>Symbol</Table.ColumnHeaderCell>
            <Table.ColumnHeaderCell>Proceeds</Table.ColumnHeaderCell>
            <Table.ColumnHeaderCell>ACB</Table.ColumnHeaderCell>
            <Table.ColumnHeaderCell>Gain</Table.ColumnHeaderCell>
          </Table.Row>
        </Table.Header>
        <Table.Body>
          {sales.map((sale, index) => (
            <SaleRow key={`${sale.maskedId}:${sale.symbol}:${sale.date}:${index}`} sale={sale} />
          ))}
        </Table.Body>
      </Table.Root>
      {costUnknown > 0 ? (
        <Text size="1" color="gray" data-sales-cost-unknown="">
          {costUnknown} sale{costUnknown === 1 ? "" : "s"} above have no cost basis and are counted,
          never silently dropped.
        </Text>
      ) : null}
    </Flex>
  );
}

/** Net allowable capital loss per year (|loss| x inclusion, only for a net-loss year), running cumulative -- an estimate, never applied automatically against a future gain. */
function capitalLossCarryforward(
  income: AnalyticsOutput["income"],
  inclusion: number,
): { year: number; yearLoss: number; running: number }[] {
  const years = Object.keys(income)
    .map(Number)
    .sort((a, b) => a - b);
  let running = 0;
  return years.map((year) => {
    const realized = income[String(year)]?.realizedGains ?? 0;
    const yearLoss = realized < 0 ? Math.abs(realized) * inclusion : 0;
    running += yearLoss;
    return { year, yearLoss, running };
  });
}

function EstimatedTax({
  income,
  rates,
}: {
  income: AnalyticsOutput["income"][string];
  rates: NonNullable<ReturnType<typeof taxYear>>["personal"];
}) {
  const taxableGain = Math.max(income.realizedGains, 0) * rates.capitalGainsInclusion.value;
  const grossedUpDividends =
    income.canadianDistributions * (1 + rates.eligibleDividendGrossUp.value);
  const dtc =
    grossedUpDividends * (rates.federalEligibleDtcRate.value + rates.ontarioEligibleDtcRate.value);
  const taxableIncome =
    income.interest + income.foreignDividends + grossedUpDividends + taxableGain;
  const grossTax = taxableIncome * rates.marginalRate.value;
  const estimatedTax = grossTax - dtc - income.foreignTaxWithheld;
  return (
    <Card data-estimated-tax="">
      <Flex direction="column" gap="1">
        <Heading size="4" as="h3">
          Estimated tax (estimate, never a filing number)
        </Heading>
        <Text size="2">
          At a {(rates.marginalRate.value * 100).toFixed(2)}% marginal rate (owner estimate):{" "}
          <Text weight="bold">{formatCurrency(estimatedTax)}</Text>
        </Text>
        <Text size="1" color="gray">
          Grossed-up eligible dividends {formatCurrency(grossedUpDividends)}, dividend tax credit{" "}
          {formatCurrency(dtc)}, foreign tax credit {formatCurrency(income.foreignTaxWithheld)}.
        </Text>
      </Flex>
    </Card>
  );
}

function CarryforwardTable({ rows }: { rows: ReturnType<typeof capitalLossCarryforward> }) {
  return (
    <Flex direction="column" gap="2">
      <Heading size="4" as="h3">
        Capital loss carryforward (estimate)
      </Heading>
      <Table.Root data-carryforward-table="" variant="surface">
        <Table.Header>
          <Table.Row>
            <Table.ColumnHeaderCell>Year</Table.ColumnHeaderCell>
            <Table.ColumnHeaderCell>Year's net allowable loss</Table.ColumnHeaderCell>
            <Table.ColumnHeaderCell>Running balance</Table.ColumnHeaderCell>
          </Table.Row>
        </Table.Header>
        <Table.Body>
          {rows.map((row) => (
            <Table.Row key={row.year} data-carryforward-row={row.year}>
              <Table.RowHeaderCell>{row.year}</Table.RowHeaderCell>
              <Table.Cell>{formatCurrency(row.yearLoss)}</Table.Cell>
              <Table.Cell>{formatCurrency(row.running)}</Table.Cell>
            </Table.Row>
          ))}
        </Table.Body>
      </Table.Root>
    </Flex>
  );
}

function MultiYearHistory({ income }: { income: AnalyticsOutput["income"] }) {
  const years = Object.keys(income)
    .map(Number)
    .sort((a, b) => a - b);
  return (
    <Flex direction="column" gap="2">
      <Heading size="4" as="h3">
        Multi-year history
      </Heading>
      <Table.Root data-history-table="" variant="surface">
        <Table.Header>
          <Table.Row>
            <Table.ColumnHeaderCell>Year</Table.ColumnHeaderCell>
            <Table.ColumnHeaderCell>Realized net gain</Table.ColumnHeaderCell>
            <Table.ColumnHeaderCell>Dividends</Table.ColumnHeaderCell>
            <Table.ColumnHeaderCell>Interest</Table.ColumnHeaderCell>
            <Table.ColumnHeaderCell>Foreign tax withheld</Table.ColumnHeaderCell>
          </Table.Row>
        </Table.Header>
        <Table.Body>
          {years.map((y) => {
            const row = income[String(y)];
            if (!row) return null;
            return (
              <Table.Row key={y} data-history-row={y}>
                <Table.RowHeaderCell>{y}</Table.RowHeaderCell>
                <Table.Cell>
                  <Text color={row.realizedGains < 0 ? "red" : "jade"}>
                    {formatCurrency(row.realizedGains)}
                  </Text>
                </Table.Cell>
                <Table.Cell>
                  {formatCurrency(row.canadianDistributions + row.foreignDividends)}
                </Table.Cell>
                <Table.Cell>{formatCurrency(row.interest)}</Table.Cell>
                <Table.Cell>{formatCurrency(row.foreignTaxWithheld)}</Table.Cell>
              </Table.Row>
            );
          })}
        </Table.Body>
      </Table.Root>
    </Flex>
  );
}

function headingFor(year: number, scope: YearScope): string {
  return scope === "all" ? `Non-registered, latest year ${year}` : `Non-registered, ${year}`;
}

/**
 * Personal non-registered (and Crypto) investing and tax tab -- holdings,
 * per-sale realized gains, dividends/interest/foreign tax, estimated tax,
 * capital loss carryforward, the superficial-loss watch, claimable items
 * and the T1135 foreign property card, all for the selected year. "All
 * time" shows the latest year's tax panel plus the multi-year history
 * tables below it.
 */
export function NonRegistered({ analytics, year, scope, taxTable }: NonRegisteredProps) {
  const income = analytics.income[String(year)];
  const rates = taxYear(taxTable, year);
  const personalIds = accountIdsOfKind(analytics.series, PERSONAL_NONREG_KINDS);
  const foreignTaxByAccount = new Map(
    withholdingByAccount(analytics, year)
      .filter((w) => personalIds.has(w.maskedId))
      .map((w) => [w.maskedId, w.withholdingTax]),
  );
  const claimable =
    rates === null
      ? null
      : claimableYear(
          analytics,
          year,
          personalIds,
          rates.personal.marginalRate.value,
          false,
          foreignTaxByAccount,
        );
  const superficialLoss = analytics.superficialLoss[String(year)] ?? [];
  const foreignProperty = analytics.foreignPropertyPersonal[String(year)];

  return (
    <Flex direction="column" gap="6">
      <Heading size="5" as="h2">
        {headingFor(year, scope)}
      </Heading>

      <TaxableHoldings
        holdings={analytics.personalHoldings}
        harvestRates={
          rates === null
            ? null
            : {
                inclusion: rates.personal.capitalGainsInclusion.value,
                rate: rates.personal.marginalRate.value,
              }
        }
      />

      {income === undefined ? (
        <Text size="2" color="gray" data-no-income="">
          No income data for {year}.
        </Text>
      ) : rates === null ? (
        <Text size="2" color="gray" data-rates-not-entered="">
          Tax rates for {year} are not entered yet in data/tax.json. Realized gains and income
          figures below still show; the estimated tax and tax-value-if-harvested figures do not.
        </Text>
      ) : null}

      {income !== undefined ? (
        <Flex direction="column" gap="3">
          <Heading size="4" as="h3">
            Realized gains and losses, {year}
          </Heading>
          <SalesTable sales={income.sales} />
        </Flex>
      ) : null}

      {income !== undefined && rates !== null ? (
        <EstimatedTax income={income} rates={rates.personal} />
      ) : null}

      <CarryforwardTable
        rows={capitalLossCarryforward(
          analytics.income,
          rates?.personal.capitalGainsInclusion.value ?? 0.5,
        )}
      />

      <SuperficialLossWatch candidates={superficialLoss} />

      {claimable !== null ? <Claimable year={claimable} /> : null}

      {foreignProperty !== undefined && rates !== null ? (
        <T1135Card summary={foreignProperty} thresholds={rates.t1135} />
      ) : null}

      <MultiYearHistory income={analytics.income} />
    </Flex>
  );
}
