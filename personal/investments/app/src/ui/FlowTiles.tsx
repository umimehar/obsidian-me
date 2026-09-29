import { Card, Flex, Grid, Text } from "@radix-ui/themes";
import { KIND_LABELS } from "../analytics/flows/graph";
import { CONTRIBUTION_KINDS, type FlowSummary } from "../analytics/flows/summary";
import type { AccountKind } from "../store/mask";
import { formatCurrency, formatShare } from "./format";

export interface FlowTilesProps {
  summary: FlowSummary;
}

/**
 * One tile: a label and one formatted figure, stated twice from the one
 * `value` string the caller already formatted -- once as the visible text,
 * once in `aria-label` -- so a screen reader and a sighted reader are always
 * looking at the same figure. `white-space: nowrap` on the figure keeps a
 * long one (`-$18,285.69`) from wrapping mid-number in the single narrow
 * column the tiles render as below 40rem.
 */
function Tile({ label, value }: { label: string; value: string }) {
  return (
    <Card size="1" data-flow-tile={label} aria-label={`${label} ${value}`}>
      <Flex direction="column" gap="1">
        <Text size="1" color="gray">
          {label}
        </Text>
        <Text size="5" weight="bold" style={{ whiteSpace: "nowrap" }}>
          {value}
        </Text>
      </Flex>
    </Card>
  );
}

/**
 * Every registered kind the period's rows contributed to, in
 * `CONTRIBUTION_KINDS` order, only when nonzero -- one kind and one figure
 * per entry, a definition list rather than a comma-joined sentence, so a
 * kind and its own figure stay visually paired instead of running together
 * ("Spousal RRSP (spouse's asset) $17,000.00, FHSA $8,000.00" reading as one
 * clause). Entries wrap left to right rather than stacking one per line, so
 * the block stays a couple of rows tall under the tile grid rather than a
 * tall column beside it.
 */
function ContributionsLine({ summary }: { summary: FlowSummary }) {
  const entries: { kind: AccountKind; amount: number }[] = [];
  for (const kind of CONTRIBUTION_KINDS) {
    const amount = summary.contributionsByKind[kind];
    if (amount !== undefined) entries.push({ kind, amount });
  }
  if (entries.length === 0) return null;
  return (
    <Flex asChild direction="column" gap="1" data-flow-contributions="">
      <dl style={{ margin: 0 }}>
        <Text size="1" color="gray" weight="medium">
          Contributions
        </Text>
        <Flex wrap="wrap" gap="3">
          {entries.map((e) => (
            <Flex key={e.kind} gap="1">
              <Text asChild size="1" color="gray">
                <dt>{KIND_LABELS[e.kind]}</dt>
              </Text>
              <Text asChild size="1" color="gray" weight="medium" style={{ whiteSpace: "nowrap" }}>
                <dd style={{ margin: 0 }}>{formatCurrency(e.amount)}</dd>
              </Text>
            </Flex>
          ))}
        </Flex>
      </dl>
    </Flex>
  );
}

const NOT_ENOUGH_IN = "Not enough money in";

/**
 * The period's summary tiles. Every figure is one `formatCurrency` or
 * `formatShare` call, and none is toned as a gain or a loss: paid in,
 * invested, left in cash, income, costs and the invested rate are all
 * neutral facts about where the money went, not a return on it.
 */
export function FlowTiles({ summary }: FlowTilesProps) {
  const investedRateText =
    summary.investedRate === null ? NOT_ENOUGH_IN : formatShare(summary.investedRate);
  return (
    <Flex direction="column" gap="3" data-flow-tiles="">
      <Grid columns={{ initial: "1", xs: "2", sm: "3", md: "6" }} gap="3">
        <Tile label="Paid in from outside" value={formatCurrency(summary.paidIn)} />
        <Tile label="Invested" value={formatCurrency(summary.invested)} />
        <Tile label="Left in cash" value={formatCurrency(summary.leftInCash)} />
        <Tile label="Income earned" value={formatCurrency(summary.income)} />
        <Tile label="Costs" value={formatCurrency(summary.costs)} />
        <Tile label="Invested rate" value={investedRateText} />
      </Grid>
      <ContributionsLine summary={summary} />
      <Text size="2" color="gray">
        Payroll deposited here is only the part that reached Wealthsimple. Total income and spending
        are not in these statements.
      </Text>
    </Flex>
  );
}
