import { Callout, Flex, Heading, Text } from "@radix-ui/themes";
import { useEffect, useMemo, useState } from "react";
import { type GroupBy, buildFlowGraph, depositsByDestination } from "../analytics/flows/graph";
import { type FlowPeriod, inPeriod, missingAccounts } from "../analytics/flows/period";
import { flowSummary } from "../analytics/flows/summary";
import type { FlowAccount, FlowsData } from "../analytics/flows/types";
import type { AccountSeries } from "../analytics/types";
import { FlowControls } from "./FlowControls";
import { DRILL_DOWN_HEADING_ID, FlowRows } from "./FlowRows";
import { FlowTable } from "./FlowTable";
import { FlowTiles } from "./FlowTiles";
import { ShareBar } from "./ShareBar";
import { DestinationChart } from "./charts/DestinationChart";
import { Sankey } from "./charts/Sankey";
import { linkKey } from "./charts/sankeyLayout";
import { buildFlowNotes } from "./flowNotes";
import { periodInCorpus, resolvePeriod } from "./flowPeriods";
import { formatCurrency, formatShare } from "./format";
import { useNarrowFlow } from "./useNarrowFlow";

export interface FlowProps {
  flows: FlowsData;
  series: readonly AccountSeries[];
  period: FlowPeriod | "all";
  onPeriodChange: (p: FlowPeriod | "all") => void;
}

/**
 * Scrolls the drill down's own heading into view and moves focus to it,
 * whenever `selectedKey` names a real selection -- a band or a table row
 * chosen while the drill down sits well below the fold otherwise leaves the
 * reader looking at wherever they already were, with no visible sign
 * anything happened.
 */
function useScrollDrillDownIntoView(selectedKey: string | null): void {
  useEffect(() => {
    if (selectedKey === null) return;
    const heading = document.getElementById(DRILL_DOWN_HEADING_ID);
    if (heading === null) return;
    heading.scrollIntoView({ block: "nearest" });
    heading.focus();
  }, [selectedKey]);
}

/** Every selected account with no statement yet at the period's end, named -- never read as a silent $0. */
function MissingCallout({
  period,
  accounts,
}: { period: FlowPeriod; accounts: readonly FlowAccount[] }) {
  if (accounts.length === 0) return null;
  const names = accounts.map((a) => a.label).join(", ");
  return (
    <Callout.Root color="amber" variant="surface" data-flow-missing="">
      <Callout.Text>
        No statement yet for {period.to}: {names}
      </Callout.Text>
    </Callout.Root>
  );
}

interface RankedRow {
  id: string;
  label: string;
  value: number;
}

function RankedList({
  title,
  rows,
  totalIn,
}: { title: string; rows: readonly RankedRow[]; totalIn: number }) {
  return (
    <Flex direction="column" gap="2" data-flow-ranked-list={title}>
      <Heading size="3" as="h3">
        {title}
      </Heading>
      {rows.map((row) => {
        const share = totalIn > 0 ? row.value / totalIn : 0;
        return (
          <Flex key={row.id} direction="column" gap="1" data-flow-ranked-row={row.id}>
            <Flex justify="between" gap="2">
              <Text size="2">{row.label}</Text>
              <Text size="2">
                {formatCurrency(row.value)} · {formatShare(share)}
              </Text>
            </Flex>
            <ShareBar label={row.label} share={share} />
          </Flex>
        );
      })}
    </Flex>
  );
}

/** The narrow layout's replacement for the Sankey: two ranked lists, no links between them. */
function NarrowFlowLists({
  graph,
}: {
  graph: ReturnType<typeof buildFlowGraph>;
}) {
  const cameFrom = graph.nodes.filter((n) => n.column === 0);
  const whereNow = graph.nodes.filter((n) => n.column === 3);
  return (
    <Flex direction="column" gap="5" data-flow-narrow="">
      <RankedList title="Came from" rows={cameFrom} totalIn={graph.totalIn} />
      <RankedList title="Where it is now" rows={whereNow} totalIn={graph.totalIn} />
    </Flex>
  );
}

/** Every accountId the default selection opens with: all of them, chequing and the spousal RRSP included. */
function allAccountIds(flows: FlowsData): Set<string> {
  return new Set(flows.accounts.map((a) => a.accountId));
}

/** The Flow tab's own account list, every account sorted by label, adapted for the shared `AccountFilter`. */
function flowAccountOptions(series: readonly AccountSeries[]): AccountSeries[] {
  return [...series].sort((a, b) => a.label.localeCompare(b.label));
}

function inKindCount(flows: FlowsData, p: FlowPeriod, accounts: ReadonlySet<string>): number {
  return flows.rows.filter(
    (r) => accounts.has(r.accountId) && inPeriod(r.period, p) && r.category === "inKind",
  ).length;
}

/**
 * The Flow tab: a period, group by and account control, summary tiles, the
 * Sankey (or, below 40rem, two ranked lists), a drill down for the selected
 * band, a destination chart, a flows table and a note block.
 */
export function Flow({ flows, series, period, onPeriodChange }: FlowProps) {
  const [groupBy, setGroupBy] = useState<GroupBy>("accountType");
  const [accounts, setAccounts] = useState<Set<string>>(() => allAccountIds(flows));
  const [selected, setSelected] = useState<string | null>(null);
  const narrow = useNarrowFlow();

  const accountOptions = useMemo(() => flowAccountOptions(series), [series]);
  const isDefaultAccounts = accounts.size === flows.accounts.length;

  // The hash decoder cannot see the data, so a shape it accepts -- #flow/2030,
  // a real YYYY the corpus has not reached -- still decodes to a concrete
  // period. Falling back here, where the period meets the data, reads no
  // rows and no blocks rather than five $0.00 tiles and an empty year
  // select; the hash is rewritten to "all" in an effect, once, so the URL
  // stops naming a period that was never real.
  const outOfCorpus = period !== "all" && !periodInCorpus(flows, period);
  const resolved = useMemo(
    () => (outOfCorpus ? resolvePeriod(flows, "all") : resolvePeriod(flows, period)),
    [flows, period, outOfCorpus],
  );
  useEffect(() => {
    if (outOfCorpus) onPeriodChange("all");
  }, [outOfCorpus, onPeriodChange]);

  const graph = useMemo(
    () => buildFlowGraph(flows, resolved, groupBy, accounts),
    [flows, resolved, groupBy, accounts],
  );
  const summary = useMemo(
    () => flowSummary(flows, resolved, accounts),
    [flows, resolved, accounts],
  );
  const buckets = useMemo(
    () => depositsByDestination(flows, resolved, groupBy, accounts),
    [flows, resolved, groupBy, accounts],
  );
  const missing = useMemo(
    () => missingAccounts(flows, resolved, accounts),
    [flows, resolved, accounts],
  );
  const notes = useMemo(
    () => buildFlowNotes(summary, inKindCount(flows, resolved, accounts)),
    [flows, resolved, accounts, summary],
  );

  const selectedKey =
    selected !== null && graph.links.some((l) => linkKey(l) === selected) ? selected : null;
  useScrollDrillDownIntoView(selectedKey);

  return (
    <Flex direction="column" gap="5" data-flow-tab="">
      <FlowControls
        flows={flows}
        period={period}
        onPeriodChange={onPeriodChange}
        groupBy={groupBy}
        onGroupByChange={setGroupBy}
        accountOptions={accountOptions}
        accounts={accounts}
        onAccountsChange={setAccounts}
        isDefaultAccounts={isDefaultAccounts}
        onResetAccounts={() => setAccounts(allAccountIds(flows))}
      />
      <MissingCallout period={resolved} accounts={missing} />
      <FlowTiles summary={summary} />
      {narrow ? (
        <NarrowFlowLists graph={graph} />
      ) : (
        <Sankey graph={graph} selected={selectedKey} onSelect={setSelected} />
      )}
      <FlowRows
        key={selectedKey ?? "none"}
        flows={flows}
        graph={graph}
        selected={selectedKey}
        narrow={narrow}
      />
      <DestinationChart buckets={buckets} />
      <FlowTable graph={graph} selected={selectedKey} onSelect={setSelected} narrow={narrow} />
      {notes.length === 0 ? null : (
        <Flex direction="column" gap="1" data-flow-notes="">
          {notes.map((note) => (
            <Text key={note} size="1" color="gray">
              {note}
            </Text>
          ))}
        </Flex>
      )}
    </Flex>
  );
}
