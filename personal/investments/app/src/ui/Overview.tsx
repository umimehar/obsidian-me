import { Badge, Box, Card, Flex, Grid, Heading, Text } from "@radix-ui/themes";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useMemo, useState } from "react";
import type { AnalyticsOutput } from "../analytics/build";
import { latestGroupGain } from "../analytics/groupGain";
import {
  buildPortfolioSeries,
  periodExtent,
  seriesForAccounts,
} from "../analytics/portfolioSeries";
import type { Lens, Rollup, RollupAccount } from "../analytics/rollup";
import type { AccountSeries } from "../analytics/types";
import { LensToggle } from "./LensToggle";
import { ShareBar } from "./ShareBar";
import { GroupSparkline } from "./charts/GroupSparkline";
import { grandTotal } from "./data";
import { formatCurrency, formatGainWithShare, formatShare } from "./format";

export interface OverviewProps {
  analytics: AnalyticsOutput;
}

/**
 * One account line inside a group card. The exclusion marker is keyed off
 * `account.inTotals`, never off the group's name or lens -- a Cash account
 * is a whole group in the registration lens, its own group in the account
 * lens, and one of several accounts in the purpose lens's spending group,
 * so the group shape cannot carry this decision.
 */
function AccountRow({ account }: { account: RollupAccount }) {
  return (
    <Flex justify="between" align="center" gap="2" py="1">
      <Flex align="center" gap="2">
        <Text size="2">{account.label}</Text>
        {!account.inTotals ? (
          <Badge color="gray" variant="soft" highContrast>
            Excluded from totals
          </Badge>
        ) : null}
      </Flex>
      <Text size="2" color="gray">
        {account.marketValue === null ? "No figure" : formatCurrency(account.marketValue)}
      </Text>
    </Flex>
  );
}

/**
 * The book value and the gain against it, directly under the card's total
 * -- the total they qualify, and the figures the owner asked to see
 * alongside it. Both come from `latestGroupGain`, which reads market value
 * and book cost from the same series point, so this line can never state
 * a market-basis total beside a series-basis book cost.
 *
 * A `null` figures means the group has no period with a stated market
 * value and book cost at all (Cash in the registration lens, Spending in
 * the purpose lens) -- never zero, since a coerced "$0.00" gain would read
 * as a real position that happens to be flat rather than as no history to
 * compare against.
 *
 * The colour is `jade` for a gain, `red` for a loss, matching this app's
 * existing `jade`/`amber` split in `GoalsPanel`; a loss here is a shortfall
 * against cost rather than a goal warning, so `red` reads more accurately
 * than reusing `amber`. The leading "+"/"-" from `formatGainWithShare`
 * carries the sign on its own, so the colour only reinforces what the
 * character already says -- a colour-blind or greyscale reading still gets
 * it right.
 *
 * The figure carries its own percentage of book cost in brackets, from the
 * SAME call that formats the dollars: $995.74 on the RRSP and $3,911.35 on
 * the TFSA are four times apart in dollars and less than two apart as
 * returns (1.93% against 8.96%), which is the comparison the dollar figure
 * alone cannot support.
 *
 * The USD book-cost caveat used to print here too, once per card -- seven or
 * eight repeats of the same sentence on one tab. It now lives once, in the
 * Portfolio tab's `AboutNumbers`.
 */
export function GroupGainLine({ figures }: { figures: ReturnType<typeof latestGroupGain> }) {
  if (figures === null) {
    return (
      <Text size="2" color="gray" mb="3" data-group-gain-absent="">
        No market value to compare against book cost.
      </Text>
    );
  }
  const { bookCost, gain } = figures;
  return (
    <Text size="2" color="gray" mb="3" data-group-book-value="">
      Book value {formatCurrency(bookCost)}
      {" · "}
      Gain against book cost{" "}
      <Text color={gain >= 0 ? "jade" : "red"} data-group-gain="">
        {formatGainWithShare(gain, bookCost)}
      </Text>
    </Text>
  );
}

export interface CardMotion {
  layout: boolean;
  initial: { opacity: number } | false;
  exit: { opacity: number } | undefined;
  /** Seconds. Zero under the preference, never a smaller non-zero. */
  duration: number;
}

/**
 * How a group card enters, leaves and reflows when the lens changes.
 *
 * Under `prefers-reduced-motion` the card does not fade or reflow at all: it
 * is simply in its new place. Shortening the fade instead would still move,
 * which is the thing the preference asks not to happen. Exported and pure
 * because motion applies its final values immediately under happy-dom, so
 * this rule is not observable from the rendered DOM.
 */
export function cardMotion(prefersReducedMotion: boolean): CardMotion {
  if (prefersReducedMotion) return { layout: false, initial: false, exit: undefined, duration: 0 };
  return { layout: true, initial: { opacity: 0 }, exit: { opacity: 0 }, duration: 0.25 };
}

/**
 * `cardMotion` wired to the OS preference. Exported so the wiring itself is
 * testable: `useReducedMotion` reads `matchMedia`, which a test can stub, so
 * `renderHook` pins that the preference actually reaches the rule rather than
 * only that the rule is correct in isolation.
 */
export function useCardMotion(): CardMotion {
  return cardMotion(useReducedMotion() === true);
}

interface GroupCardProps {
  group: Rollup;
  grandTotalValue: number;
  motionSpec: CardMotion;
  /** The whole corpus, narrowed to this group's accounts for its sparkline. */
  series: readonly AccountSeries[];
  /** The portfolio's full period range, shared by every card's chart. */
  xDomain: readonly [string, string] | null;
}

/**
 * One rollup group: label, account count, market value, share of total,
 * then every account in it. `data-overview-group` is a stable test hook,
 * not styling -- the group's DOM position is what changes between lenses,
 * so tests need a way to scope into "this card" that survives the reorder.
 */
function GroupCard({ group, grandTotalValue, motionSpec, series, xDomain }: GroupCardProps) {
  const share = grandTotalValue > 0 ? group.total / grandTotalValue : 0;
  // A group whose every account is excluded contributes nothing to the total,
  // and `Rollup.total` is therefore 0 for it. Printing that as "$0.00" is a
  // claim, and it was a contradiction: the spousal RRSP card read $0.00 above
  // an account line reading $15,818.27, which is real money the owner simply
  // does not own. Such a group states its own excluded value instead, or
  // "No figure" when its accounts state none (the chequing accounts, whose
  // last statement carries no market value), and it takes no share of a total
  // it is not part of.
  const counted = group.accounts.filter((account) => account.inTotals);
  const allExcluded = group.accounts.length > 0 && counted.length === 0;
  const excludedValue = group.accounts.reduce(
    (sum, account) => sum + (account.marketValue ?? 0),
    0,
  );
  const statesExcludedValue = allExcluded && excludedValue > 0;
  const groupSeries = useMemo(
    () =>
      seriesForAccounts(
        series,
        group.accounts.map((account) => account.maskedId),
      ),
    [series, group.accounts],
  );
  const gainFigures = useMemo(() => latestGroupGain(groupSeries), [groupSeries]);
  return (
    <motion.div
      key={group.key}
      layout={motionSpec.layout}
      initial={motionSpec.initial}
      animate={{ opacity: 1 }}
      exit={motionSpec.exit}
      transition={{ duration: motionSpec.duration }}
      data-overview-group=""
    >
      <Card mb="3" className="ivt-group-card">
        <Flex justify="between" align="baseline" mb="2">
          <Heading size="3" as="h3">
            {group.label}
          </Heading>
          <Text size="2" color="gray">
            {group.accounts.length} {group.accounts.length === 1 ? "account" : "accounts"}
          </Text>
        </Flex>
        <Flex justify="between" align="center" mb="1">
          <Text size="5" weight="bold" data-group-total="">
            {statesExcludedValue ? formatCurrency(excludedValue) : null}
            {!statesExcludedValue && allExcluded ? "No figure" : null}
            {allExcluded ? null : formatCurrency(group.total)}
          </Text>
          {allExcluded ? (
            <Text size="2" color="gray" data-group-excluded="">
              Not counted in the total
            </Text>
          ) : (
            <Text size="2" color="gray" data-group-share="">
              {formatShare(share)} of total
            </Text>
          )}
        </Flex>
        <GroupGainLine figures={gainFigures} />
        {allExcluded ? null : (
          <Box mb="3">
            <ShareBar label={group.label} share={share} />
          </Box>
        )}
        <Box mb="3">
          <GroupSparkline label={group.label} series={groupSeries} xDomain={xDomain} />
        </Box>
        {group.accounts.length === 0 ? (
          <Text size="2" color="gray">
            No accounts in this group.
          </Text>
        ) : (
          <Flex direction="column">
            {group.accounts.map((account) => (
              <AccountRow key={account.maskedId} account={account} />
            ))}
          </Flex>
        )}
      </Card>
    </motion.div>
  );
}

/**
 * The dashboard's account-groups view: the lens toggle, and the grouped
 * account list for whichever lens is selected. It never recomputes a
 * rollup -- `analytics.rollups[lens]` is already built into the committed
 * `analytics.json` -- so switching lens is purely a read of a different
 * array. The headline total and the value-over-time chart are the page's
 * subject rather than one view of it, so `App` renders them once above
 * every panel; `total` is still read here, to compute each group's share.
 */
export function Overview({ analytics }: OverviewProps) {
  const [lens, setLens] = useState<Lens>("registration");
  const motionSpec = useCardMotion();
  const total = grandTotal(analytics);
  const groups = analytics.rollups[lens];
  const xDomain = useMemo(
    () => periodExtent(buildPortfolioSeries(analytics.series)),
    [analytics.series],
  );

  return (
    <Flex direction="column" gap="4">
      <LensToggle lens={lens} onLensChange={setLens} />
      <Grid columns={{ initial: "1", md: "2" }} gap="4">
        <AnimatePresence mode="popLayout">
          {groups.map((group) => (
            <GroupCard
              key={group.key}
              group={group}
              grandTotalValue={total}
              motionSpec={motionSpec}
              series={analytics.series}
              xDomain={xDomain}
            />
          ))}
        </AnimatePresence>
      </Grid>
    </Flex>
  );
}
