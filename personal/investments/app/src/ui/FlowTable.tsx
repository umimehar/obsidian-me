import { Flex, Table, Text } from "@radix-ui/themes";
import type { CSSProperties, KeyboardEvent } from "react";
import { useState } from "react";
import type { FlowGraph, FlowLink } from "../analytics/flows/graph";
import { linkKey } from "./charts/sankeyLayout";
import { formatCurrency, formatShare } from "./format";
import { useScrollOverflow } from "./useScrollOverflow";

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
 *
 * Applied as a `max-height`, never a computed `height`: a row's real
 * rendered height (36px) does not match a Radix size-1 row's nominal 33px,
 * and sizing the box from that estimate hid a short period's last row with
 * no hint anything was cut off (2024-11's 6-row table hid 23px of its
 * sixth row; 2023-06's zero-row table hid 5px of empty space). A
 * `max-height` costs nothing when the content is shorter than it -- the box
 * simply shrinks to fit -- so there is no estimate left to drift.
 */
const TABLE_MAX_HEIGHT = 360;

/** The caption naming the row count and sort order, shared by both variants. */
function TableCaption({ count }: { count: number }) {
  return (
    <Text size="1" color="gray" as="p" data-flow-table-caption="" style={{ margin: 0 }}>
      {count} flows, largest first
    </Text>
  );
}

/**
 * Shown only when the region that actually scrolls measures more content
 * than it can show -- `useScrollOverflow`'s own `scrollHeight >
 * clientHeight` read off the real DOM, not a row count compared against an
 * estimated capacity. The row-count estimate this replaced was exactly
 * the class of bug the measurement can't have: right on the periods it was
 * tuned against and wrong everywhere else.
 */
function ScrollHint({ overflowing }: { overflowing: boolean }) {
  if (!overflowing) return null;
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
 * first, and it never moves, so the cell never does either. `app.css` also
 * gives `.rt-ScrollAreaViewport` the actual `max-height` that windows this
 * table: setting it there, directly on the element `overflow: hidden`
 * naturally already applies to, needs no definite height flowing down from
 * `Table.Root` the way an estimated inline `height` used to. All three
 * fixes were verified the same way: scrolling the real rendered table and
 * watching whether the header followed.
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

  // Narrow: the `Flex` itself is the scrolling element, and its own box
  // never changes size once capped, so `useScrollOverflow` watches the
  // inner content `div` -- whose natural height does grow and shrink with
  // the row count -- instead. Wide: `Table.Root` exposes no ref into
  // Radix's own internals, so `rootEl`'s children are found by selector
  // once it mounts; see `STICKY_HEADER_CELL`'s comment for why those two
  // selectors are the real scrolling and content elements.
  const [scrollEl, setScrollEl] = useState<HTMLDivElement | null>(null);
  const [contentEl, setContentEl] = useState<HTMLDivElement | null>(null);
  const [rootEl, setRootEl] = useState<HTMLDivElement | null>(null);
  const narrowOverflowing = useScrollOverflow(scrollEl, contentEl);
  const wideOverflowing = useScrollOverflow(
    rootEl?.querySelector<HTMLElement>(".rt-ScrollAreaViewport") ?? null,
    rootEl?.querySelector<HTMLElement>("table") ?? null,
  );

  if (narrow) {
    return (
      <Flex direction="column" gap="1" data-flow-table-wrap="">
        <TableCaption count={links.length} />
        <Flex
          direction="column"
          data-flow-table=""
          ref={setScrollEl}
          style={{ maxHeight: TABLE_MAX_HEIGHT, overflowY: "auto" }}
        >
          <div ref={setContentEl}>
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
          </div>
        </Flex>
        <ScrollHint overflowing={narrowOverflowing} />
      </Flex>
    );
  }

  return (
    <Flex direction="column" gap="1" data-flow-table-wrap="">
      <TableCaption count={links.length} />
      <Table.Root size="1" variant="surface" data-flow-table="" ref={setRootEl}>
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
      <ScrollHint overflowing={wideOverflowing} />
    </Flex>
  );
}
