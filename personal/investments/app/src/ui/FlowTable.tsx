import { Flex, Table, Text } from "@radix-ui/themes";
import type { CSSProperties, KeyboardEvent } from "react";
import type { FlowGraph, FlowLink } from "../analytics/flows/graph";
import { linkKey } from "./charts/sankeyLayout";
import { formatCurrency, formatShare } from "./format";

export interface FlowTableProps {
  graph: FlowGraph;
  selected: string | null;
  onSelect: (key: string | null) => void;
  /** Below 40rem, a four-column table clips its own last two columns rather than scrolling cleanly; see `NarrowRow`. */
  narrow?: boolean;
}

function labelsOf(graph: FlowGraph): Map<string, string> {
  return new Map(graph.nodes.map((n) => [n.id, n.label]));
}

function handleKeyDown(
  event: KeyboardEvent<HTMLElement>,
  key: string,
  onSelect: (k: string | null) => void,
) {
  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    onSelect(key);
  }
}

interface RowProps {
  link: FlowLink;
  labels: Map<string, string>;
  totalIn: number;
  selected: string | null;
  onSelect: (key: string | null) => void;
}

function WideRow({ link, labels, totalIn, selected, onSelect }: RowProps) {
  const key = linkKey(link);
  const share = totalIn > 0 ? link.value / totalIn : 0;
  return (
    <Table.Row
      data-flow-table-row={key}
      tabIndex={0}
      // biome-ignore lint/a11y/useSemanticElements: a table row selecting a chart band, not a link
      role="button"
      aria-pressed={selected === key}
      onClick={() => onSelect(key)}
      onKeyDown={(event) => handleKeyDown(event, key, onSelect)}
      style={{ cursor: "pointer" }}
    >
      <Table.Cell>{labels.get(link.source) ?? link.source}</Table.Cell>
      <Table.Cell>{labels.get(link.target) ?? link.target}</Table.Cell>
      <Table.Cell align="right">{formatCurrency(link.value)}</Table.Cell>
      <Table.Cell align="right">{formatShare(share)}</Table.Cell>
    </Table.Row>
  );
}

/**
 * A flow as two lines rather than four columns: "From -> To" then
 * "amount · share" beneath it, right where the wide table's own last two
 * columns clipped at 390px -- a 410px table content box inside a 334px
 * card, the Amount and Share columns cut off with no way to reach them.
 */
function NarrowRow({ link, labels, totalIn, selected, onSelect }: RowProps) {
  const key = linkKey(link);
  const share = totalIn > 0 ? link.value / totalIn : 0;
  const from = labels.get(link.source) ?? link.source;
  const to = labels.get(link.target) ?? link.target;
  return (
    <Flex
      asChild
      direction="column"
      gap="1"
      p="2"
      data-flow-table-row={key}
      tabIndex={0}
      // biome-ignore lint/a11y/useSemanticElements: a list row selecting a chart band, not a link
      role="button"
      aria-pressed={selected === key}
      onClick={() => onSelect(key)}
      onKeyDown={(event) => handleKeyDown(event, key, onSelect)}
      style={{ cursor: "pointer", borderBottom: "1px solid var(--gray-a4)" }}
    >
      <div>
        <Text size="2" style={{ display: "block" }}>
          {from} → {to}
        </Text>
        <Text size="1" color="gray">
          {formatCurrency(link.value)} · {formatShare(share)}
        </Text>
      </div>
    </Flex>
  );
}

/**
 * A cap on how tall the table sits before it scrolls in its own region --
 * the period's flows run 58 to 64 rows on the real corpus, too long for a
 * summary view to push the rest of the tab down by. The data is not
 * truncated, only the viewport: every row is still in the DOM and reachable
 * by scrolling or by keyboard.
 */
const TABLE_MAX_HEIGHT = 360;

/**
 * A Radix size-1 table row and its header are both about this tall; the
 * narrow variant's two-line `NarrowRow` is about this much taller again,
 * with no header row to add. Used two ways: sizing the wide table's own
 * `height` (below) and estimating `WIDE_VISIBLE_ROWS`/`NARROW_VISIBLE_ROWS`
 * for the "scroll for more" hint. Both share one constant so the box and
 * the hint can never disagree about how many rows fit.
 */
const ROW_HEIGHT_PX = 33;
const NARROW_ROW_HEIGHT_PX = 52;

const WIDE_VISIBLE_ROWS = Math.floor((TABLE_MAX_HEIGHT - ROW_HEIGHT_PX) / ROW_HEIGHT_PX);
const NARROW_VISIBLE_ROWS = Math.floor(TABLE_MAX_HEIGHT / NARROW_ROW_HEIGHT_PX);

/**
 * `Table.Root` always wraps its rows in Radix's own `ScrollArea`
 * (`node_modules/@radix-ui/themes/src/components/table.tsx`), which sizes
 * itself to `height: 100%` of `Table.Root`'s own box. A `max-height` on an
 * ancestor with `overflow: visible` does not give that 100% anything
 * definite to resolve against, so the header's sticky positioning ends up
 * computed against the OUTER wrapper this file used to add around
 * `Table.Root` -- a second, redundant scroll region -- rather than
 * Radix's own inner one, which is the one that actually scrolls. Verified
 * by scrolling the real rendered table: the header scrolled away with the
 * body. Giving `Table.Root` itself a definite `height`, sized to the real
 * row count and capped at `TABLE_MAX_HEIGHT`, makes Radix's own ScrollArea
 * the one true scrolling ancestor, and lets a short table stay its natural
 * height instead of always claiming the full cap.
 */
function wideTableHeight(rowCount: number): number {
  return Math.min(TABLE_MAX_HEIGHT, ROW_HEIGHT_PX + rowCount * ROW_HEIGHT_PX);
}

/** The caption naming the row count and sort order, shared by both variants. */
function TableCaption({ count }: { count: number }) {
  return (
    <Text size="1" color="gray" as="p" data-flow-table-caption="" style={{ margin: 0 }}>
      {count} flows, largest first
    </Text>
  );
}

/** Shown only when the row count exceeds what the windowed region can show without scrolling. */
function ScrollHint({ count, visibleRows }: { count: number; visibleRows: number }) {
  if (count <= visibleRows) return null;
  return (
    <Text size="1" color="gray" as="p" data-flow-table-scroll-hint="" style={{ margin: 0 }}>
      Scroll for more.
    </Text>
  );
}

/**
 * Applied to each header CELL, not the `<tr>` -- a `<tr>`'s own box does not
 * establish the positioning context a `<th>` needs, so `position: sticky`
 * on the row alone left the header floating at its normal position while
 * the cells inside scrolled past it. The row still needs `app.css`'s
 * `.rt-TableRootTable { overflow: visible }` rule alongside this: without
 * it, `Table.Root`'s own `<table>` -- `overflow: hidden` by default, for
 * its rounded corners -- is the nearer scroll container a sticky cell finds
 * first, and it never moves, so the cell never does either. Both fixes were
 * verified the same way: scrolling the real rendered table and watching
 * whether the header followed.
 */
const STICKY_HEADER_CELL: CSSProperties = {
  position: "sticky",
  top: 0,
  background: "var(--color-panel-solid)",
  zIndex: 1,
};

/**
 * The period's flows as a table -- source, destination, amount and share of
 * money in, sorted largest first. Clicking a row selects that band, the same
 * selection the Sankey and the drill down below it share, so the three views
 * of one period always point at the same link. Below 40rem it renders as a
 * list of two-line rows instead, per `NarrowRow`. Windowed to
 * `TABLE_MAX_HEIGHT` rather than growing the page by every one of the
 * period's 58 to 64 flows; the caption states the count so the window never
 * reads as the whole table, and the header stays pinned while the body
 * scrolls under it.
 */
export function FlowTable({ graph, selected, onSelect, narrow = false }: FlowTableProps) {
  const labels = labelsOf(graph);
  const links = [...graph.links].sort((a, b) => b.value - a.value);
  const Row = narrow ? NarrowRow : WideRow;

  if (narrow) {
    return (
      <Flex direction="column" gap="1" data-flow-table-wrap="">
        <TableCaption count={links.length} />
        <Flex
          direction="column"
          data-flow-table=""
          style={{ maxHeight: TABLE_MAX_HEIGHT, overflowY: "auto" }}
        >
          {links.map((link) => (
            <Row
              key={linkKey(link)}
              link={link}
              labels={labels}
              totalIn={graph.totalIn}
              selected={selected}
              onSelect={onSelect}
            />
          ))}
        </Flex>
        <ScrollHint count={links.length} visibleRows={NARROW_VISIBLE_ROWS} />
      </Flex>
    );
  }

  return (
    <Flex direction="column" gap="1" data-flow-table-wrap="">
      <TableCaption count={links.length} />
      <Table.Root
        size="1"
        variant="surface"
        data-flow-table=""
        style={{ height: wideTableHeight(links.length) }}
      >
        <Table.Header>
          <Table.Row>
            <Table.ColumnHeaderCell style={STICKY_HEADER_CELL}>From</Table.ColumnHeaderCell>
            <Table.ColumnHeaderCell style={STICKY_HEADER_CELL}>To</Table.ColumnHeaderCell>
            <Table.ColumnHeaderCell align="right" style={STICKY_HEADER_CELL}>
              Amount
            </Table.ColumnHeaderCell>
            <Table.ColumnHeaderCell align="right" style={STICKY_HEADER_CELL}>
              Share of money in
            </Table.ColumnHeaderCell>
          </Table.Row>
        </Table.Header>
        <Table.Body>
          {links.map((link) => (
            <Row
              key={linkKey(link)}
              link={link}
              labels={labels}
              totalIn={graph.totalIn}
              selected={selected}
              onSelect={onSelect}
            />
          ))}
        </Table.Body>
      </Table.Root>
      <ScrollHint count={links.length} visibleRows={WIDE_VISIBLE_ROWS} />
    </Flex>
  );
}
