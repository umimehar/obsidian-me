import { Table } from "@radix-ui/themes";
import type { KeyboardEvent } from "react";
import type { FlowGraph } from "../analytics/flows/graph";
import { linkKey } from "./charts/sankeyLayout";
import { formatCurrency, formatShare } from "./format";

export interface FlowTableProps {
  graph: FlowGraph;
  selected: string | null;
  onSelect: (key: string | null) => void;
}

function labelsOf(graph: FlowGraph): Map<string, string> {
  return new Map(graph.nodes.map((n) => [n.id, n.label]));
}

function handleKeyDown(
  event: KeyboardEvent<HTMLTableRowElement>,
  key: string,
  onSelect: (k: string | null) => void,
) {
  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    onSelect(key);
  }
}

/**
 * The period's flows as a table -- source, destination, amount and share of
 * money in, sorted largest first. Clicking a row selects that band, the same
 * selection the Sankey and the drill down below it share, so the three views
 * of one period always point at the same link.
 */
export function FlowTable({ graph, selected, onSelect }: FlowTableProps) {
  const labels = labelsOf(graph);
  const links = [...graph.links].sort((a, b) => b.value - a.value);

  return (
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
        {links.map((link) => {
          const key = linkKey(link);
          const share = graph.totalIn > 0 ? link.value / graph.totalIn : 0;
          return (
            <Table.Row
              key={key}
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
        })}
      </Table.Body>
    </Table.Root>
  );
}
