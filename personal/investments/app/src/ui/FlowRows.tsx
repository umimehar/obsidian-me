import { Table, Text } from "@radix-ui/themes";
import type { FlowGraph } from "../analytics/flows/graph";
import type { FlowAccount, FlowRow, FlowsData } from "../analytics/flows/types";
import { linkKey } from "./charts/sankeyLayout";
import { formatCurrency } from "./format";

export interface FlowRowsProps {
  flows: FlowsData;
  graph: FlowGraph;
  selected: string | null;
}

const CASH_EXPLANATION =
  "Change in cash balances over the period, from each statement's opening and closing cash.";

/** The other leg of a paired row's account label, or null when the row is unpaired or its partner is missing. */
function partnerLabel(
  row: FlowRow,
  rowsById: ReadonlyMap<string, FlowRow>,
  accountsById: ReadonlyMap<string, FlowAccount>,
): string | null {
  if (row.pairId === null) return null;
  const [outId, inId] = row.pairId.split(">");
  const partnerId = row.id === outId ? inId : outId;
  const partner = partnerId === undefined ? undefined : rowsById.get(partnerId);
  if (partner === undefined) return null;
  return accountsById.get(partner.accountId)?.label ?? null;
}

/** "US$1,234.56 at 1.3542" for a USD row, or null for a CAD one -- the rate at its own four decimals, not a money figure. */
function usdAside(row: FlowRow): string | null {
  if (row.currency !== "USD" || row.fxRate === null) return null;
  return `US${formatCurrency(row.amount)} at ${row.fxRate.toFixed(4)}`;
}

interface DrillRowProps {
  row: FlowRow;
  accountsById: ReadonlyMap<string, FlowAccount>;
  rowsById: ReadonlyMap<string, FlowRow>;
}

function DrillRow({ row, accountsById, rowsById }: DrillRowProps) {
  const usd = usdAside(row);
  const partner = partnerLabel(row, rowsById, accountsById);
  return (
    <Table.Row data-flow-row={row.id}>
      <Table.Cell>{row.date}</Table.Cell>
      <Table.Cell>{accountsById.get(row.accountId)?.label ?? row.accountId}</Table.Cell>
      <Table.Cell>{row.code}</Table.Cell>
      <Table.Cell align="right">
        {formatCurrency(row.amountCad)}
        {usd === null ? null : (
          <Text size="1" color="gray">
            {" "}
            ({usd})
          </Text>
        )}
      </Table.Cell>
      <Table.Cell>{partner ?? ""}</Table.Cell>
    </Table.Row>
  );
}

/**
 * The statement rows behind the selected band. A cash-change or
 * unreconciled link carries no `rowIds` at all -- it comes from a
 * statement's own opening/closing cash, not from individual activity rows
 * -- and explains itself in one sentence instead of an empty table. No row
 * here ever carries a statement description, only its code: `FlowRow`
 * itself has no description field.
 */
export function FlowRows({ flows, graph, selected }: FlowRowsProps) {
  if (selected === null) return null;
  const link = graph.links.find((l) => linkKey(l) === selected);
  if (link === undefined) return null;

  if (link.rowIds.length === 0) {
    return (
      <Text size="2" color="gray" data-flow-rows="">
        {CASH_EXPLANATION}
      </Text>
    );
  }

  const rowsById = new Map(flows.rows.map((r) => [r.id, r]));
  const accountsById = new Map(flows.accounts.map((a) => [a.accountId, a]));
  const rows = link.rowIds
    .map((id) => rowsById.get(id))
    .filter((r): r is FlowRow => r !== undefined)
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

  return (
    <Table.Root size="1" variant="surface" data-flow-rows="">
      <Table.Header>
        <Table.Row>
          <Table.ColumnHeaderCell>Date</Table.ColumnHeaderCell>
          <Table.ColumnHeaderCell>Account</Table.ColumnHeaderCell>
          <Table.ColumnHeaderCell>Code</Table.ColumnHeaderCell>
          <Table.ColumnHeaderCell align="right">Amount</Table.ColumnHeaderCell>
          <Table.ColumnHeaderCell>Partner account</Table.ColumnHeaderCell>
        </Table.Row>
      </Table.Header>
      <Table.Body>
        {rows.map((row) => (
          <DrillRow key={row.id} row={row} accountsById={accountsById} rowsById={rowsById} />
        ))}
      </Table.Body>
    </Table.Root>
  );
}
