import { Button, Card, Flex, Grid, Popover, Text } from "@radix-ui/themes";
import type {
  BreakdownPart,
  TileBreakdown,
  TileBreakdowns,
  TileKey,
} from "../analytics/flows/breakdown";
import { KIND_LABELS } from "../analytics/flows/graph";
import { CONTRIBUTION_KINDS, type FlowSummary } from "../analytics/flows/summary";
import type { AccountKind } from "../store/mask";
import { formatCurrency, formatShare } from "./format";

export interface FlowTilesProps {
  summary: FlowSummary;
  breakdowns: TileBreakdowns;
  onShowRows: (title: string, rowIds: readonly string[]) => void;
}

interface TileMeta {
  key: TileKey;
  label: string;
  /** Owner approved wording, sentence case, no hyphens. Shown beneath the figure and folded into the accessible name. */
  explanation: string;
}

const TILES: readonly TileMeta[] = [
  {
    key: "paidIn",
    label: "Paid in from outside",
    explanation:
      "New money that arrived from outside Wealthsimple. Moves between your own accounts are not counted.",
  },
  {
    key: "invested",
    label: "Invested",
    explanation: "What you bought, minus what you sold. Cash like funds are not counted.",
  },
  {
    key: "leftInCash",
    label: "Left in cash",
    explanation:
      "The change in money not invested: cash balances plus cash like funds such as PSA.",
  },
  {
    key: "income",
    label: "Income earned",
    explanation: "What your money earned inside Wealthsimple. Not salary, and not price gains.",
  },
  {
    key: "costs",
    label: "Costs",
    explanation:
      "Management fees and foreign withholding tax, less fee rebates. The currency conversion spread is not in the statements.",
  },
  {
    key: "left",
    label: "Left Wealthsimple",
    explanation:
      "Money that went to somewhere outside Wealthsimple, such as bill and card payments.",
  },
  {
    key: "investedRate",
    label: "Invested rate",
    explanation:
      "Invested divided by what came in (paid in, CESG and income). Over 100% means earlier cash was invested.",
  },
];

/**
 * Whether a tile's parts get a "share of the tile" figure, and if not, the
 * one line explaining why -- `leftInCash` always omits it (money can leave
 * one account's cash and land in another's within the period, so a "share"
 * would misstate what moved), `investedRate` always omits it (its parts are
 * a ratio's numerator and denominator terms, not a sum), and any tile omits
 * it when it totals zero or its parts carry mixed signs, since a share is
 * only a meaningful fraction of a single-signed whole.
 */
function shareInfo(breakdown: TileBreakdown): { show: boolean; reason: string | null } {
  if (breakdown.tile === "leftInCash") {
    return {
      show: false,
      reason: "Shares are not shown here, since money can move between accounts within the period.",
    };
  }
  if (breakdown.tile === "investedRate") {
    return {
      show: false,
      reason: "The invested rate is a ratio, so its parts have no share of the tile.",
    };
  }
  if (breakdown.total === 0) {
    return { show: false, reason: "Shares are not shown because the tile totals zero." };
  }
  const signs = new Set(breakdown.parts.map((p) => Math.sign(p.amount)).filter((s) => s !== 0));
  if (signs.size > 1) {
    return { show: false, reason: "Shares are not shown because the parts have mixed signs." };
  }
  return { show: true, reason: null };
}

function PartRow({
  part,
  total,
  showShare,
  tileLabel,
  onShowRows,
}: {
  part: BreakdownPart;
  total: number;
  showShare: boolean;
  tileLabel: string;
  onShowRows: (title: string, rowIds: readonly string[]) => void;
}) {
  const share = showShare && total !== 0 ? formatShare(part.amount / total) : null;
  return (
    <Flex justify="between" align="center" gap="3" data-flow-tile-part={part.key}>
      <Text size="2">{part.label}</Text>
      <Flex align="center" gap="2">
        <Text size="2" style={{ whiteSpace: "nowrap" }}>
          {formatCurrency(part.amount)}
          {share === null ? "" : ` · ${share}`}
        </Text>
        {part.rowIds.length === 0 ? null : (
          <Popover.Close>
            <Button
              size="1"
              variant="soft"
              color="gray"
              data-flow-tile-show-rows=""
              onClick={() => onShowRows(`${tileLabel}: ${part.label}`, part.rowIds)}
            >
              Show rows
            </Button>
          </Popover.Close>
        )}
      </Flex>
    </Flex>
  );
}

function TileBreakdownPopover({
  tileLabel,
  breakdown,
  onShowRows,
}: {
  tileLabel: string;
  breakdown: TileBreakdown;
  onShowRows: (title: string, rowIds: readonly string[]) => void;
}) {
  const { show, reason } = shareInfo(breakdown);
  return (
    <Flex direction="column" gap="3" style={{ maxWidth: "min(22rem, calc(100vw - 3rem))" }}>
      <Flex direction="column" gap="2">
        {breakdown.parts.map((part) => (
          <PartRow
            key={part.key}
            part={part}
            total={breakdown.total}
            showShare={show}
            tileLabel={tileLabel}
            onShowRows={onShowRows}
          />
        ))}
      </Flex>
      {reason === null ? null : (
        <Text size="1" color="gray">
          {reason}
        </Text>
      )}
      {breakdown.sections.map((section) => (
        <Flex key={section.title} direction="column" gap="2" data-flow-tile-section={section.title}>
          <Text size="1" color="gray" weight="medium">
            {section.title} (not part of the sum)
          </Text>
          {section.parts.map((part) => (
            <PartRow
              key={part.key}
              part={part}
              total={breakdown.total}
              showShare={false}
              tileLabel={tileLabel}
              onShowRows={onShowRows}
            />
          ))}
        </Flex>
      ))}
    </Flex>
  );
}

/**
 * One tile: a figure, a one line explanation beneath it, and a popover with
 * the parts behind the figure. The accessible name is the figure plus the
 * explanation -- one `formatCurrency`/`formatShare` call already produced
 * `value`, so the name and the visible text can never disagree.
 */
function Tile({
  meta,
  value,
  breakdown,
  onShowRows,
}: {
  meta: TileMeta;
  value: string;
  breakdown: TileBreakdown;
  onShowRows: (title: string, rowIds: readonly string[]) => void;
}) {
  return (
    <Popover.Root>
      <Popover.Trigger>
        <Card asChild size="1" data-flow-tile={meta.label}>
          <button
            type="button"
            aria-label={`${value} ${meta.explanation}`}
            style={{
              all: "unset",
              display: "block",
              width: "100%",
              cursor: "pointer",
              boxSizing: "border-box",
            }}
          >
            <Flex direction="column" gap="1">
              <Text size="1" color="gray">
                {meta.label}
              </Text>
              <Text size="5" weight="bold" style={{ whiteSpace: "nowrap" }}>
                {value}
              </Text>
              <Text size="1" color="gray">
                {meta.explanation}
              </Text>
            </Flex>
          </button>
        </Card>
      </Popover.Trigger>
      <Popover.Content data-flow-tile-popover={meta.label}>
        <TileBreakdownPopover
          tileLabel={meta.label}
          breakdown={breakdown}
          onShowRows={onShowRows}
        />
      </Popover.Content>
    </Popover.Root>
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
 * "How the tiles fit": the identity that ties every tile together, each
 * term from one `formatCurrency` call on `breakdowns.identity`'s own
 * fields, so the sentence can never state a figure the tiles themselves
 * do not.
 */
function IdentityLine({ breakdowns }: { breakdowns: TileBreakdowns }) {
  const i = breakdowns.identity;
  return (
    <Text size="2" color="gray" data-flow-identity="">
      How the tiles fit: {formatCurrency(i.paidIn)} paid in plus {formatCurrency(i.cesg)} CESG plus{" "}
      {formatCurrency(i.income)} income, minus {formatCurrency(i.costs)} costs, minus{" "}
      {formatCurrency(i.left)} left Wealthsimple, minus {formatCurrency(i.currencyConversion)}{" "}
      currency conversion, equals {formatCurrency(i.invested)} invested plus{" "}
      {formatCurrency(i.leftInCash)} left in cash.
    </Text>
  );
}

/**
 * The period's summary tiles. Every figure is one `formatCurrency` or
 * `formatShare` call, and none is toned as a gain or a loss: paid in,
 * invested, left in cash, income, costs, left Wealthsimple and the invested
 * rate are all neutral facts about where the money went, not a return on
 * it. Each tile is a button that opens a popover with the parts behind its
 * figure.
 */
export function FlowTiles({ summary, breakdowns, onShowRows }: FlowTilesProps) {
  const investedRateText =
    summary.investedRate === null ? NOT_ENOUGH_IN : formatShare(summary.investedRate);
  const valueFor = (key: TileKey): string => {
    if (key === "paidIn") return formatCurrency(summary.paidIn);
    if (key === "invested") return formatCurrency(summary.invested);
    if (key === "leftInCash") return formatCurrency(summary.leftInCash);
    if (key === "income") return formatCurrency(summary.income);
    if (key === "costs") return formatCurrency(summary.costs);
    if (key === "left") return formatCurrency(summary.left);
    return investedRateText;
  };
  return (
    <Flex direction="column" gap="3" data-flow-tiles="">
      <Grid columns={{ initial: "1", xs: "2", sm: "3", md: "4" }} gap="3">
        {TILES.map((meta) => (
          <Tile
            key={meta.key}
            meta={meta}
            value={valueFor(meta.key)}
            breakdown={breakdowns[meta.key]}
            onShowRows={onShowRows}
          />
        ))}
      </Grid>
      <ContributionsLine summary={summary} />
      <IdentityLine breakdowns={breakdowns} />
      <Text size="2" color="gray">
        Payroll deposited here is only the part that reached Wealthsimple. Total income and spending
        are not in these statements.
      </Text>
    </Flex>
  );
}
