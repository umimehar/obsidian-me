import { Badge, Flex, Heading, Table, Text } from "@radix-ui/themes";
import type { HoldingSummary, HoldingsOutput } from "../analytics/holdings";
import { ShareBar } from "./ShareBar";
import { formatPeriodLabel } from "./charts/plot";
import { formatCurrency, formatShare } from "./format";
import type { YearScope } from "./scope";

export interface HoldingsProps {
  holdings: HoldingsOutput;
  /** The portfolio total for the same period, so a residual can be stated rather than hidden. */
  portfolioTotal: number;
  scope: YearScope;
}

const TOP_COUNT = 15;

/** One row: symbol, name, value, share, accounts holding it, a badge when its valuation is not yet final. */
function HoldingRow({ holding }: { holding: HoldingSummary }) {
  return (
    <Table.Row data-holding-row={`${holding.symbol}:${holding.priceCurrency}`}>
      <Table.RowHeaderCell>{holding.symbol || holding.name}</Table.RowHeaderCell>
      <Table.Cell>
        {holding.name}
        {holding.pendingValuation ? (
          <Badge color="amber" variant="soft" highContrast ml="2" data-pending-valuation="">
            Valuation pending
          </Badge>
        ) : null}
      </Table.Cell>
      <Table.Cell>{formatCurrency(holding.value)}</Table.Cell>
      <Table.Cell>{formatShare(holding.share)}</Table.Cell>
      <Table.Cell>{holding.priceCurrency}</Table.Cell>
      <Table.Cell>{holding.accounts.join(", ")}</Table.Cell>
    </Table.Row>
  );
}

function HoldingsTable({
  rows,
  variant,
}: {
  rows: readonly HoldingSummary[];
  variant: "top" | "rest";
}) {
  return (
    <Table.Root data-holdings-table={variant} variant="surface">
      <Table.Header>
        <Table.Row>
          <Table.ColumnHeaderCell>Symbol</Table.ColumnHeaderCell>
          <Table.ColumnHeaderCell>Name</Table.ColumnHeaderCell>
          <Table.ColumnHeaderCell>Value</Table.ColumnHeaderCell>
          <Table.ColumnHeaderCell>Share</Table.ColumnHeaderCell>
          <Table.ColumnHeaderCell>Currency</Table.ColumnHeaderCell>
          <Table.ColumnHeaderCell>Accounts</Table.ColumnHeaderCell>
        </Table.Row>
      </Table.Header>
      <Table.Body>
        {rows.map((holding) => (
          <HoldingRow
            key={`${holding.symbol}:${holding.name}:${holding.priceCurrency}`}
            holding={holding}
          />
        ))}
      </Table.Body>
    </Table.Root>
  );
}

/** The first `TOP_COUNT` rows always shown, the rest behind a disclosure naming how many more there are. */
function TopHoldings({ holdings }: { holdings: readonly HoldingSummary[] }) {
  const top = holdings.slice(0, TOP_COUNT);
  const rest = holdings.slice(TOP_COUNT);
  return (
    <Flex direction="column" gap="3">
      <Heading size="5" as="h2">
        What you own
      </Heading>
      <HoldingsTable rows={top} variant="top" />
      {rest.length === 0 ? null : (
        <details data-holdings-show-all="">
          <summary>
            Show the other {rest.length} holding{rest.length === 1 ? "" : "s"}
          </summary>
          <HoldingsTable rows={rest} variant="rest" />
        </details>
      )}
    </Flex>
  );
}

/** One index group's exposure, built entirely from the model: value, share and the accounts holding it. */
function IndexGroups({ groups }: { groups: HoldingsOutput["groups"] }) {
  if (groups.length === 0) return null;
  return (
    <Flex direction="column" gap="2" data-index-groups="">
      {groups.map((group) => (
        <Text key={group.label} size="2" data-index-group={group.label}>
          {group.label} through {group.symbols.join(" and ")}: {formatCurrency(group.value)} (
          {formatShare(group.share)}) across {group.accounts.length}{" "}
          {group.accounts.length === 1 ? "account" : "accounts"}
        </Text>
      ))}
    </Flex>
  );
}

/** The CAD versus USD split. The bar is decoration only; both figures live in the text beside it. */
function CurrencySplit({
  currency,
  total,
}: { currency: HoldingsOutput["currency"]; total: number }) {
  const cadShare = total === 0 ? 0 : currency.CAD / total;
  const usdShare = total === 0 ? 0 : currency.USD / total;
  return (
    <Flex direction="column" gap="2" data-currency-split="">
      <Heading size="5" as="h2">
        Currency
      </Heading>
      <Text size="2">
        CAD priced: {formatCurrency(currency.CAD)} ({formatShare(cadShare)}). USD priced:{" "}
        {formatCurrency(currency.USD)} ({formatShare(usdShare)}).
      </Text>
      <ShareBar label="CAD versus USD" share={cadShare} />
    </Flex>
  );
}

function AssetClasses({
  classes,
  total,
}: { classes: HoldingsOutput["assetClasses"]; total: number }) {
  return (
    <Flex direction="column" gap="2" data-asset-classes="">
      <Heading size="5" as="h2">
        Asset classes
      </Heading>
      {classes.map((c) => (
        <Text key={c.name} size="2" data-asset-class={c.name}>
          {c.name}: {formatCurrency(c.value)} ({formatShare(total === 0 ? 0 : c.value / total)})
        </Text>
      ))}
    </Flex>
  );
}

/**
 * A residual against the portfolio total, stated with its sign rather than
 * hidden. Real causes for holdings falling short include an account behind
 * on its statement for this period (see `behind`); holdings can also land a
 * few cents ahead of the portfolio total from rounding the same fx rate a
 * different way, since neither figure is derived from the other.
 */
function ResidualNote({ residual }: { residual: number }) {
  if (Math.abs(residual) < 0.01) return null;
  return residual > 0 ? (
    <Text size="2" color="gray" data-holdings-residual="short">
      {formatCurrency(residual)} of the portfolio total is not reflected above, most likely an
      account behind on its statement for this period, or a pending valuation.
    </Text>
  ) : (
    <Text size="2" color="gray" data-holdings-residual="over">
      What is shown above totals {formatCurrency(-residual)} more than the portfolio figure, almost
      always from rounding a converted currency figure a different way.
    </Text>
  );
}

/** Counted accounts with no statement for this period, named rather than silently missing from the tables above. */
function BehindNote({ behind }: { behind: readonly string[] }) {
  if (behind.length === 0) return null;
  return (
    <Text size="2" color="gray" data-holdings-behind="">
      Behind on a statement for this period, and left out of the figures above: {behind.join(", ")}.
    </Text>
  );
}

/**
 * What is actually owned, combined across every account counted toward the
 * portfolio total, all at the single latest period any counted account
 * reports. Holdings are not re-computed per year: the year filter stays
 * reachable on this tab for consistency with the rest of the dashboard, but
 * it does not change what is drawn here, which this tab says in the open
 * rather than silently ignoring the control.
 */
export function Holdings({ holdings, portfolioTotal, scope }: HoldingsProps) {
  const residual = portfolioTotal - holdings.total;
  return (
    <Flex direction="column" gap="6" data-holdings-tab="">
      <Flex direction="column" gap="1">
        <Text size="2" color="gray">
          As of {formatPeriodLabel(holdings.period, { month: "long" })},{" "}
          {formatCurrency(holdings.total)} across {holdings.holdings.length} holdings.
        </Text>
        {scope === "all" ? null : (
          <Text size="2" color="gray" data-holdings-scope-note="">
            The year filter does not change this page: holdings are always shown as of the corpus's
            latest statement period, not the selected year.
          </Text>
        )}
        <ResidualNote residual={residual} />
        <BehindNote behind={holdings.behind} />
      </Flex>
      <TopHoldings holdings={holdings.holdings} />
      <IndexGroups groups={holdings.groups} />
      <CurrencySplit currency={holdings.currency} total={holdings.total} />
      <AssetClasses classes={holdings.assetClasses} total={holdings.total} />
    </Flex>
  );
}
