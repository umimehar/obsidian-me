import { Flex, Table, Text } from "@radix-ui/themes";
import type { KeyboardEvent } from "react";
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
 * The period's flows as a table -- source, destination, amount and share of
 * money in, sorted largest first. Clicking a row selects that band, the same
 * selection the Sankey and the drill down below it share, so the three views
 * of one period always point at the same link. Below 40rem it renders as a
 * list of two-line rows instead, per `NarrowRow`.
 */
export function FlowTable({ graph, selected, onSelect, narrow = false }: FlowTableProps) {
  const labels = labelsOf(graph);
  const links = [...graph.links].sort((a, b) => b.value - a.value);
  const Row = narrow ? NarrowRow : WideRow;

  if (narrow) {
    return (
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
    );
  }

  return (
    <div style={{ maxHeight: TABLE_MAX_HEIGHT, overflowY: "auto" }}>
      <Table.Root size="1" variant="surface" data-flow-table="">
        <Table.Header>
          <Table.Row>
            <Table.ColumnHeaderCell>From</Table.ColumnHeaderCell>
            <Table.ColumnHeaderCell>To</Table.ColumnHeaderCell>
            <Table.ColumnHeaderCell align="right">Amount</Table.ColumnHeaderCell>
            <Table.ColumnHeaderCell align="right">Share of money in</Table.ColumnHeaderCell>
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
    </div>
  );
}
