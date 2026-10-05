import { Badge, Flex, Heading, Table, Text } from "@radix-ui/themes";
import type { HoldingSummary, HoldingsOutput } from "../../analytics/holdings";
import type { AccountSeries } from "../../analytics/types";
import { formatCurrency, formatGainWithShare } from "../format";
import { holdingsForAccount } from "../tax/summaries";

export interface TaxableHoldingsProps {
  holdings: HoldingsOutput;
  accounts: readonly AccountSeries[];
  /** Loss-row "tax value if harvested" needs the inclusion rate and marginal/passive rate -- null when the year has no rates entered, which hides that column rather than printing a wrong estimate. */
  harvestRates: { inclusion: number; rate: number } | null;
}

const TOP_COUNT = 10;
const SMALL_ACCOUNT_THRESHOLD = 15;

function gainOf(h: HoldingSummary): number {
  return h.value - h.bookCost;
}

function sortLossesFirst(rows: readonly HoldingSummary[]): HoldingSummary[] {
  return [...rows].sort((a, b) => {
    const gainA = gainOf(a);
    const gainB = gainOf(b);
    if (gainA < 0 && gainB >= 0) return -1;
    if (gainA >= 0 && gainB < 0) return 1;
    if (gainA < 0 && gainB < 0) return gainA - gainB;
    return gainB - gainA;
  });
}

function harvestValue(gain: number, rates: TaxableHoldingsProps["harvestRates"]): number | null {
  if (gain >= 0 || rates === null) return null;
  return Math.abs(gain) * rates.inclusion * rates.rate;
}

function HoldingRow({
  holding,
  harvestRates,
  showHarvestColumn,
}: {
  holding: HoldingSummary;
  harvestRates: TaxableHoldingsProps["harvestRates"];
  showHarvestColumn: boolean;
}) {
  const gain = gainOf(holding);
  const harvest = harvestValue(gain, harvestRates);
  const pooled = holding.accounts.length > 1;
  return (
    <Table.Row data-taxable-holding-row={`${holding.symbol}:${holding.priceCurrency}`}>
      <Table.RowHeaderCell>
        {holding.symbol || holding.name}
        <Text size="1" color="gray">
          {" "}
          ({holding.priceCurrency})
        </Text>
        {pooled ? (
          <Badge color="gray" variant="soft" ml="2" data-pooled-acb="">
            pooled ACB across {holding.accounts.length} accounts
          </Badge>
        ) : null}
      </Table.RowHeaderCell>
      <Table.Cell className="ivt-num">{formatCurrency(holding.value)}</Table.Cell>
      <Table.Cell className="ivt-num">
        {formatCurrency(holding.bookCost)}
        {holding.bookCostConverted ? (
          <Badge color="gray" variant="soft" ml="2" data-book-cost-converted="">
            est.
          </Badge>
        ) : null}
      </Table.Cell>
      <Table.Cell className="ivt-num" data-holding-gain="">
        {formatGainWithShare(gain, holding.bookCost)}
      </Table.Cell>
      {showHarvestColumn ? (
        <Table.Cell className="ivt-num" data-tax-value-if-harvested="">
          {harvest === null ? "—" : `${formatCurrency(harvest)} (estimate)`}
        </Table.Cell>
      ) : null}
    </Table.Row>
  );
}

function HoldingsTable({
  rows,
  harvestRates,
}: {
  rows: readonly HoldingSummary[];
  harvestRates: TaxableHoldingsProps["harvestRates"];
}) {
  const sorted = sortLossesFirst(rows);
  const showHarvestColumn = sorted.some((h) => gainOf(h) < 0);
  return (
    <div className="ivt-table-scroll">
      <Table.Root variant="surface" size="1">
        <Table.Header>
          <Table.Row>
            <Table.ColumnHeaderCell>Symbol</Table.ColumnHeaderCell>
            <Table.ColumnHeaderCell>Value</Table.ColumnHeaderCell>
            <Table.ColumnHeaderCell>Book cost</Table.ColumnHeaderCell>
            <Table.ColumnHeaderCell>Unrealized gain</Table.ColumnHeaderCell>
            {showHarvestColumn ? (
              <Table.ColumnHeaderCell>Tax value if harvested</Table.ColumnHeaderCell>
            ) : null}
          </Table.Row>
        </Table.Header>
        <Table.Body>
          {sorted.map((holding) => (
            <HoldingRow
              key={`${holding.symbol || holding.name}:${holding.priceCurrency}`}
              holding={holding}
              harvestRates={harvestRates}
              showHarvestColumn={showHarvestColumn}
            />
          ))}
        </Table.Body>
      </Table.Root>
    </div>
  );
}

/** A direct-indexing account's own view: top 10 by value plus every loss, then an expander for the rest. Small accounts list everything. */
function AccountHoldingsBody({
  rows,
  harvestRates,
}: {
  rows: readonly HoldingSummary[];
  harvestRates: TaxableHoldingsProps["harvestRates"];
}) {
  if (rows.length <= SMALL_ACCOUNT_THRESHOLD) {
    return <HoldingsTable rows={rows} harvestRates={harvestRates} />;
  }
  const byValue = [...rows].sort((a, b) => b.value - a.value);
  const topIds = new Set(byValue.slice(0, TOP_COUNT).map((h) => `${h.symbol}:${h.priceCurrency}`));
  const lossRows = rows.filter((h) => gainOf(h) < 0);
  const shown = new Map<string, HoldingSummary>();
  for (const h of byValue.slice(0, TOP_COUNT)) shown.set(`${h.symbol}:${h.priceCurrency}`, h);
  for (const h of lossRows) shown.set(`${h.symbol}:${h.priceCurrency}`, h);
  const rest = rows.filter((h) => !shown.has(`${h.symbol}:${h.priceCurrency}`));
  return (
    <Flex direction="column" gap="2">
      <HoldingsTable rows={[...shown.values()]} harvestRates={harvestRates} />
      {rest.length > 0 ? (
        <details data-holdings-show-all={topIds.size}>
          <summary>Show all {rows.length} holdings</summary>
          <HoldingsTable rows={rest} harvestRates={harvestRates} />
        </details>
      ) : null}
    </Flex>
  );
}

function AccountGroup({
  account,
  holdings,
  harvestRates,
}: {
  account: AccountSeries;
  holdings: HoldingsOutput;
  harvestRates: TaxableHoldingsProps["harvestRates"];
}) {
  const rows = holdingsForAccount(holdings, account.label);
  const cashTotal = holdings.cashByAccount[account.maskedId] ?? 0;
  if (rows.length === 0 && cashTotal === 0) return null;
  return (
    <details data-account-holdings={account.maskedId}>
      <summary>
        {account.label} ({rows.length} holding{rows.length === 1 ? "" : "s"}
        {cashTotal > 0 ? `, cash ${formatCurrency(cashTotal)}` : ""})
      </summary>
      <Flex direction="column" gap="2" mt="2">
        {rows.length > 0 ? (
          <AccountHoldingsBody rows={rows} harvestRates={harvestRates} />
        ) : (
          <Text size="2" color="gray">
            No holdings, only cash.
          </Text>
        )}
      </Flex>
    </details>
  );
}

/**
 * Section 5 of the redesign spec: holdings grouped per account, collapsed by
 * default. Cash never appears as a holding row -- it is named in the
 * account's own summary line and on its account card. A pooled holding (one
 * ACB shared across accounts) appears under every account it is pooled
 * across, each time at its full combined value, flagged with a badge.
 */
export function TaxableHoldings({ holdings, accounts, harvestRates }: TaxableHoldingsProps) {
  if (holdings.holdings.length === 0) {
    return (
      <Text size="2" color="gray" data-taxable-holdings-empty="">
        No holdings for this scope at {holdings.period || "the latest period"}.
      </Text>
    );
  }
  return (
    <Flex direction="column" gap="3" id="holdings">
      <Heading size="5" as="h2">
        Holdings
      </Heading>
      <Flex direction="column" gap="2">
        {accounts.map((account) => (
          <AccountGroup
            key={account.maskedId}
            account={account}
            holdings={holdings}
            harvestRates={harvestRates}
          />
        ))}
      </Flex>
    </Flex>
  );
}
