import { Badge, Card, Flex, Heading, Progress, Text } from "@radix-ui/themes";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useState } from "react";
import type { AnalyticsOutput } from "../analytics/build";
import type { Lens, Rollup, RollupAccount } from "../analytics/rollup";
import { LensToggle } from "./LensToggle";
import { ValueOverTime } from "./charts/ValueOverTime";
import { grandTotal, latestPeriod } from "./data";
import { formatCurrency } from "./format";

export interface OverviewProps {
  analytics: AnalyticsOutput;
}

/** One decimal place -- enough to distinguish two small groups without a false sense of precision. */
function formatShare(share: number): string {
  return new Intl.NumberFormat("en-CA", {
    style: "percent",
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(share);
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
          <Badge color="gray" variant="soft">
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
}

/**
 * One rollup group: label, account count, market value, share of total,
 * then every account in it. `data-overview-group` is a stable test hook,
 * not styling -- the group's DOM position is what changes between lenses,
 * so tests need a way to scope into "this card" that survives the reorder.
 */
function GroupCard({ group, grandTotalValue, motionSpec }: GroupCardProps) {
  const share = grandTotalValue > 0 ? group.total / grandTotalValue : 0;
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
      <Card mb="3">
        <Flex justify="between" align="baseline" mb="2">
          <Heading size="3" as="h3">
            {group.label}
          </Heading>
          <Text size="2" color="gray">
            {group.accounts.length} {group.accounts.length === 1 ? "account" : "accounts"}
          </Text>
        </Flex>
        <Flex justify="between" align="center" mb="2">
          <Text size="5" weight="bold">
            {formatCurrency(group.total)}
          </Text>
          <Text size="2" color="gray">
            {formatShare(share)} of total
          </Text>
        </Flex>
        <Progress value={share * 100} mb="3" />
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
 * The dashboard's home view: headline total, the value-over-time chart,
 * the lens toggle, and the grouped account list for whichever lens is
 * selected. It never recomputes a rollup -- `analytics.rollups[lens]` is
 * already built into the committed `analytics.json` -- so switching lens
 * is purely a read of a different array, which is also why the grand
 * total never moves when the lens does.
 */
export function Overview({ analytics }: OverviewProps) {
  const [lens, setLens] = useState<Lens>("registration");
  const motionSpec = useCardMotion();
  const total = grandTotal(analytics);
  const period = latestPeriod(analytics);
  const groups = analytics.rollups[lens];

  return (
    <Flex direction="column" gap="4">
      <Flex direction="column" gap="1">
        {/* The heading is the label, not the figure. A screen reader's heading
            list is a table of contents, and "$241,739.67" is not a section name. */}
        <Heading size="2" as="h2" color="gray" weight="regular">
          Portfolio total{period !== null ? ` as of ${period}` : ""}
        </Heading>
        <Text size="8" weight="bold" data-portfolio-total="">
          {formatCurrency(total)}
        </Text>
      </Flex>
      <ValueOverTime series={analytics.series} />
      <LensToggle lens={lens} onLensChange={setLens} />
      <AnimatePresence mode="popLayout">
        {groups.map((group) => (
          <GroupCard
            key={group.key}
            group={group}
            grandTotalValue={total}
            motionSpec={motionSpec}
          />
        ))}
      </AnimatePresence>
    </Flex>
  );
}
