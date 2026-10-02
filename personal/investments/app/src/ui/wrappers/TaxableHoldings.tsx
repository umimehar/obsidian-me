import { Badge, Flex, Heading, Table, Text } from "@radix-ui/themes";
import type { HoldingSummary, HoldingsOutput } from "../../analytics/holdings";
import { formatCurrency, formatGainWithShare } from "../format";

export interface TaxableHoldingsProps {
  holdings: HoldingsOutput;
  /** Loss-row "tax value if harvested" needs the inclusion rate and marginal/passive rate -- null when the year has no rates entered, which hides that column rather than printing a wrong estimate. */
  harvestRates: { inclusion: number; rate: number } | null;
}

/** A row's gain, sorted losses first (most negative first), then by value descending within each side. */
function sortLossesFirst(rows: readonly HoldingSummary[]): HoldingSummary[] {
  return [...rows].sort((a, b) => {
    const gainA = a.value - a.bookCost;
    const gainB = b.value - b.bookCost;
    if (gainA < 0 && gainB >= 0) return -1;
    if (gainA >= 0 && gainB < 0) return 1;
    if (gainA < 0 && gainB < 0) return gainA - gainB;
    return gainB - gainA;
  });
}

/** `|loss| x inclusion x marginalRate` -- the tax value of harvesting this loss, estimate labelled. */
function harvestValue(gain: number, rates: TaxableHoldingsProps["harvestRates"]): number | null {
  if (gain >= 0 || rates === null) return null;
  return Math.abs(gain) * rates.inclusion * rates.rate;
}

function HoldingRow({
  holding,
  harvestRates,
}: {
  holding: HoldingSummary;
  harvestRates: TaxableHoldingsProps["harvestRates"];
}) {
  const gain = holding.value - holding.bookCost;
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
      </Table.RowHeaderCell>
      <Table.Cell>{formatCurrency(holding.value)}</Table.Cell>
      <Table.Cell>
        {formatCurrency(holding.bookCost)}
        {holding.bookCostConverted ? (
          <Badge color="gray" variant="soft" ml="2" data-book-cost-converted="">
            est.
          </Badge>
        ) : null}
      </Table.Cell>
      <Table.Cell data-holding-gain="">{formatGainWithShare(gain, holding.bookCost)}</Table.Cell>
      <Table.Cell data-tax-value-if-harvested="">
        {harvest === null ? "—" : `${formatCurrency(harvest)} (estimate)`}
      </Table.Cell>
      <Table.Cell>
        {holding.accounts.join(", ")}
        {pooled ? (
          <Text size="1" color="gray" data-pooled-acb="">
            {" "}
            (pooled ACB across {holding.accounts.length} accounts)
          </Text>
        ) : null}
      </Table.Cell>
    </Table.Row>
  );
}

/**
 * The combined holdings table for a tax-scoped tab (Non-registered or
 * Corporate): one row per symbol AND price currency -- never symbol alone,
 * see the Loblaw/Loews lesson in `holdings.ts` -- with value, book cost,
 * unrealized gain, the accounts holding it, and a loss row's tax value if
 * harvested. Losses sort first, since a reader opening this tab in
 * December is almost always looking for harvesting candidates.
 */
export function TaxableHoldings({ holdings, harvestRates }: TaxableHoldingsProps) {
  const rows = sortLossesFirst(holdings.holdings.filter((h) => h.symbol !== "" || h.value !== 0));
  if (rows.length === 0) {
    return (
      <Text size="2" color="gray" data-taxable-holdings-empty="">
        No holdings for this scope at {holdings.period || "the latest period"}.
      </Text>
    );
  }
  return (
    <Flex direction="column" gap="3">
      <Heading size="5" as="h2">
        Holdings
      </Heading>
      <Table.Root data-taxable-holdings-table="" variant="surface">
        <Table.Header>
          <Table.Row>
            <Table.ColumnHeaderCell>Symbol</Table.ColumnHeaderCell>
            <Table.ColumnHeaderCell>Value</Table.ColumnHeaderCell>
            <Table.ColumnHeaderCell>Book cost</Table.ColumnHeaderCell>
            <Table.ColumnHeaderCell>Unrealized gain</Table.ColumnHeaderCell>
            <Table.ColumnHeaderCell>Tax value if harvested</Table.ColumnHeaderCell>
            <Table.ColumnHeaderCell>Accounts</Table.ColumnHeaderCell>
          </Table.Row>
        </Table.Header>
        <Table.Body>
          {rows.map((holding) => (
            <HoldingRow
              key={`${holding.symbol || holding.name}:${holding.priceCurrency}`}
              holding={holding}
              harvestRates={harvestRates}
            />
          ))}
        </Table.Body>
      </Table.Root>
      <Text size="1" color="gray" data-acb-note="">
        In Canada, identical property held in more than one of your non-registered accounts shares
        one ACB pool across all of them -- flagged above as "pooled ACB" where it applies. This
        table does not recompute ACB beyond the realized-gain ledger this project already keeps.
      </Text>
    </Flex>
  );
}
