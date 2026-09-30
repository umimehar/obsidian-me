import { Button, Flex, Heading, Table, Text } from "@radix-ui/themes";
import type { CSSProperties } from "react";
import { useState } from "react";
import type { FlowGraph } from "../analytics/flows/graph";
import type { FlowAccount, FlowRow, FlowsData } from "../analytics/flows/types";
import { linkKey } from "./charts/sankeyLayout";
import { formatCurrency } from "./format";

export interface FlowRowsProps {
  flows: FlowsData;
  graph: FlowGraph;
  selected: string | null;
  /** Below 40rem, a five-column table clips its own last two columns rather than scrolling cleanly; see `NarrowDrillRow`. */
  narrow?: boolean;
}

const CASH_EXPLANATION =
  "Change in cash balances over the period, from each statement's opening and closing cash.";

/**
 * The heading's id, stable because the page ever renders one drill down at
 * once: `Flow` scrolls this into view and focuses it on every new
 * selection, the same target whichever band or table row triggered it.
 */
export const DRILL_DOWN_HEADING_ID = "flow-drilldown-heading";

/** No band's own rows exceed this without help -- the Non registered -> Invested band alone carries 1,057. */
const ROW_CAP = 50;

/**
 * Windows the drill down's own table the same way `FlowTable` windows the
 * flows table -- "Show all N rows" un-caps the data, but 1,057 rows is
 * still too long for a summary view to grow the page by, so the region
 * scrolls in place with its header pinned rather than the page scrolling
 * past a table taller than the tab. Applied as a `max-height` on
 * `.rt-ScrollAreaViewport` in `app.css`, not a `height` computed here from
 * an assumed row height: see that rule's own comment and `FlowTable.tsx`'s
 * identical `TABLE_MAX_HEIGHT` comment for why an estimate drifted from
 * the real rendered row and silently hid rows with no hint.
 */
const TABLE_MAX_HEIGHT = 360;

/**
 * Applied to each header CELL, not the `<tr>` -- see `FlowTable.tsx`'s
 * identical `STICKY_HEADER_CELL` comment for why, and `app.css`'s
 * `.rt-TableRootTable { overflow: visible }` rule this also depends on.
 * Verified by scrolling the real 60-row expanded table.
 */
const STICKY_HEADER_CELL: CSSProperties = {
  position: "sticky",
  top: 0,
  background: "var(--color-panel-solid)",
  zIndex: 1,
};

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

/**
 * "US$1,234.56 at 1.3542" for a USD row, or null for a CAD one -- the rate
 * at its own four decimals, not a money figure. The sign leads the whole
 * string, from `formatCurrency`'s own negative rendering on the magnitude
 * alone: `US${formatCurrency(row.amount)}` on a negative row put the minus
 * sign after the currency prefix ("US-$1,200.00"), a sign nobody reads as
 * negative at a glance.
 */
function usdAside(row: FlowRow): string | null {
  if (row.currency !== "USD" || row.fxRate === null) return null;
  const magnitude = formatCurrency(Math.abs(row.amount));
  const sign = row.amount < 0 ? "-" : "";
  return `${sign}US${magnitude} at ${row.fxRate.toFixed(4)}`;
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
 * A row as two lines rather than five columns: "date · account · code",
 * then the amount (with its USD aside) and the partner account -- right
 * where the wide table's own Amount and Partner columns clipped at 390px.
 * The date and the amount each keep `white-space: nowrap`, so neither the
 * day nor a long negative figure breaks mid-token onto a third line.
 */
function NarrowDrillRow({ row, accountsById, rowsById }: DrillRowProps) {
  const usd = usdAside(row);
  const partner = partnerLabel(row, rowsById, accountsById);
  const accountLabel = accountsById.get(row.accountId)?.label ?? row.accountId;
  return (
    <Flex
      direction="column"
      gap="1"
      py="2"
      data-flow-row={row.id}
      style={{ borderBottom: "1px solid var(--gray-a4)" }}
    >
      <Text size="2">
        <Text as="span" style={{ whiteSpace: "nowrap" }}>
          {row.date}
        </Text>{" "}
        · {accountLabel} · {row.code}
      </Text>
      <Text size="2" color="gray">
        <Text as="span" style={{ whiteSpace: "nowrap" }}>
          {formatCurrency(row.amountCad)}
        </Text>
        {usd === null ? null : ` (${usd})`}
        {partner === null ? null : ` · ${partner}`}
      </Text>
    </Flex>
  );
}

/** Every row behind `link`, largest `|amountCad|` first -- the figure a reader scanning a long band cares most about. */
function rowsFor(
  link: { rowIds: readonly string[] },
  rowsById: ReadonlyMap<string, FlowRow>,
): FlowRow[] {
  return link.rowIds
    .map((id) => rowsById.get(id))
    .filter((r): r is FlowRow => r !== undefined)
    .sort((a, b) => Math.abs(b.amountCad) - Math.abs(a.amountCad));
}

/** The drill down's own heading, the scroll and focus target `Flow` uses on every new selection. */
function DrillDownHeading() {
  return (
    <Heading
      id={DRILL_DOWN_HEADING_ID}
      size="3"
      as="h3"
      tabIndex={-1}
      style={{ outline: "none" }}
      data-flow-rows-heading=""
    >
      Selected flow
    </Heading>
  );
}

/**
 * The statement rows behind the selected band. A cash-change or
 * unreconciled link carries no `rowIds` at all -- it comes from a
 * statement's own opening/closing cash, not from individual activity rows
 * -- and explains itself in one sentence instead of an empty table. No row
 * here ever carries a statement description, only its code: `FlowRow`
 * itself has no description field.
 *
 * A band with more than `ROW_CAP` rows -- Non registered to Invested alone
 * carries 1,057 on the real corpus -- shows only the largest `ROW_CAP`
 * until the reader asks for the rest, so selecting a big band never drops
 * a thousand-row table into the page.
 */
export function FlowRows({ flows, graph, selected, narrow = false }: FlowRowsProps) {
  // A fresh selection always opens capped: `Flow` remounts this component on
  // every new `selected` key (`key={selectedKey}`), which is what resets
  // this state rather than an effect watching a value the effect body never
  // reads.
  const [expanded, setExpanded] = useState(false);

  if (selected === null) return null;
  const link = graph.links.find((l) => linkKey(l) === selected);
  if (link === undefined) return null;

  if (link.rowIds.length === 0) {
    return (
      <Flex direction="column" gap="2" data-flow-rows="">
        <DrillDownHeading />
        <Text size="2" color="gray">
          {CASH_EXPLANATION}
        </Text>
      </Flex>
    );
  }

  const rowsById = new Map(flows.rows.map((r) => [r.id, r]));
  const accountsById = new Map(flows.accounts.map((a) => [a.accountId, a]));
  const allRows = rowsFor(link, rowsById);
  const rows = expanded ? allRows : allRows.slice(0, ROW_CAP);

  const expandButton =
    !expanded && allRows.length > ROW_CAP ? (
      <Button
        size="1"
        variant="soft"
        color="gray"
        data-flow-rows-expand=""
        onClick={() => setExpanded(true)}
      >
        Show all {allRows.length} rows
      </Button>
    ) : null;

  if (narrow) {
    return (
      <Flex direction="column" gap="2" data-flow-rows="">
        <DrillDownHeading />
        <Flex
          direction="column"
          data-flow-rows-table=""
          style={{ maxHeight: TABLE_MAX_HEIGHT, overflowY: "auto" }}
        >
          {rows.map((row) => (
            <NarrowDrillRow
              key={row.id}
              row={row}
              accountsById={accountsById}
              rowsById={rowsById}
            />
          ))}
        </Flex>
        {expandButton}
      </Flex>
    );
  }

  return (
    <Flex direction="column" gap="2" data-flow-rows="">
      <DrillDownHeading />
      <Table.Root size="1" variant="surface" data-flow-rows-table="">
        <Table.Header>
          <Table.Row>
            <Table.ColumnHeaderCell style={STICKY_HEADER_CELL}>Date</Table.ColumnHeaderCell>
            <Table.ColumnHeaderCell style={STICKY_HEADER_CELL}>Account</Table.ColumnHeaderCell>
            <Table.ColumnHeaderCell style={STICKY_HEADER_CELL}>Code</Table.ColumnHeaderCell>
            <Table.ColumnHeaderCell align="right" style={STICKY_HEADER_CELL}>
              Amount
            </Table.ColumnHeaderCell>
            <Table.ColumnHeaderCell style={STICKY_HEADER_CELL}>
              Partner account
            </Table.ColumnHeaderCell>
          </Table.Row>
        </Table.Header>
        <Table.Body>
          {rows.map((row) => (
            <DrillRow key={row.id} row={row} accountsById={accountsById} rowsById={rowsById} />
          ))}
        </Table.Body>
      </Table.Root>
      {expandButton}
    </Flex>
  );
}
