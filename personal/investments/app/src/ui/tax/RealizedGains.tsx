import { Flex, Heading, Table, Text } from "@radix-ui/themes";
import type { SaleDetail } from "../../analytics/income";
import { formatCurrency } from "../format";
import { type AccountSalesSummary, type MonthSalesSummary, unknownCostSummary } from "./summaries";

function SummaryTable({
  title,
  rows,
  dataAttr,
}: {
  title: string;
  rows: readonly { key: string; label: string; count: number; proceeds: number; netGain: number }[];
  dataAttr: string;
}) {
  return (
    <Flex direction="column" gap="2">
      <Heading size="4" as="h3">
        {title}
      </Heading>
      <div className="ivt-table-scroll">
        <Table.Root data-realized-summary={dataAttr} variant="surface" size="1">
          <Table.Header>
            <Table.Row>
              <Table.ColumnHeaderCell>
                {title.includes("account") ? "Account" : "Month"}
              </Table.ColumnHeaderCell>
              <Table.ColumnHeaderCell>Sales</Table.ColumnHeaderCell>
              <Table.ColumnHeaderCell>Proceeds</Table.ColumnHeaderCell>
              <Table.ColumnHeaderCell>Net gain</Table.ColumnHeaderCell>
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {rows.map((row) => (
              <Table.Row key={row.key}>
                <Table.RowHeaderCell>{row.label}</Table.RowHeaderCell>
                <Table.Cell className="ivt-num">{row.count}</Table.Cell>
                <Table.Cell className="ivt-num">{formatCurrency(row.proceeds)}</Table.Cell>
                <Table.Cell className="ivt-num">
                  <Text color={row.netGain < 0 ? "red" : "jade"}>
                    {formatCurrency(row.netGain)}
                  </Text>
                </Table.Cell>
              </Table.Row>
            ))}
          </Table.Body>
        </Table.Root>
      </div>
    </Flex>
  );
}

function SaleRow({ sale }: { sale: SaleDetail }) {
  return (
    <Table.Row data-sale-row={`${sale.maskedId}:${sale.symbol}:${sale.date}`}>
      <Table.RowHeaderCell>{sale.date}</Table.RowHeaderCell>
      <Table.Cell>{sale.symbol}</Table.Cell>
      <Table.Cell className="ivt-num">{formatCurrency(sale.proceeds)}</Table.Cell>
      <Table.Cell className="ivt-num">
        {sale.costUnknown ? "unknown" : formatCurrency(sale.acb ?? 0)}
      </Table.Cell>
      <Table.Cell className="ivt-num">
        <Text color={sale.gain < 0 ? "red" : "jade"}>{formatCurrency(sale.gain)}</Text>
      </Table.Cell>
    </Table.Row>
  );
}

function FullLedger({ sales }: { sales: readonly SaleDetail[] }) {
  const sorted = [...sales].sort((a, b) => a.date.localeCompare(b.date));
  return (
    <div className="ivt-table-scroll">
      <Table.Root data-sales-table="" variant="surface" size="1">
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
          {sorted.map((sale, index) => (
            <SaleRow key={`${sale.maskedId}:${sale.symbol}:${sale.date}:${index}`} sale={sale} />
          ))}
        </Table.Body>
      </Table.Root>
    </div>
  );
}

export interface RealizedGainsProps {
  year: number;
  sales: readonly SaleDetail[];
  byAccount: readonly AccountSalesSummary[];
  byMonth: readonly MonthSalesSummary[];
}

/**
 * Section 6 of the redesign spec, personal scope only: the summary first --
 * by account, by month -- with the full sale ledger (date order, unknown-cost
 * rows labelled) behind an expander.
 */
export function RealizedGains({ year, sales, byAccount, byMonth }: RealizedGainsProps) {
  if (sales.length === 0) {
    return (
      <Flex direction="column" gap="2" id="realized-gains">
        <Heading size="5" as="h2">
          Realized gains, {year}
        </Heading>
        <Text size="2" color="gray" data-sales-empty="">
          No sales this year.
        </Text>
      </Flex>
    );
  }
  const unknown = unknownCostSummary(sales);
  return (
    <Flex direction="column" gap="3" id="realized-gains">
      <Heading size="5" as="h2">
        Realized gains, {year}
      </Heading>
      <SummaryTable
        title="By account"
        dataAttr="account"
        rows={byAccount.map((r) => ({ ...r, key: r.maskedId }))}
      />
      <SummaryTable
        title="By month"
        dataAttr="month"
        rows={byMonth.map((r) => ({ ...r, key: r.month, label: r.month }))}
      />
      {unknown.count > 0 ? (
        <Text size="2" color="gray" data-sales-cost-unknown="">
          {unknown.count} sale{unknown.count === 1 ? "" : "s"} with unknown cost, counted as{" "}
          {formatCurrency(unknown.gain)} gain; check against your T5008.
        </Text>
      ) : null}
      <details data-sales-ledger="">
        <summary>Show all {sales.length} sales</summary>
        <FullLedger sales={sales} />
      </details>
    </Flex>
  );
}
