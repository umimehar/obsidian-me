import { Flex, Heading, Select, Table, Text } from "@radix-ui/themes";
import { useState } from "react";
import type { AnalyticsOutput } from "../analytics/build";
import { type MonthReview, monthReview, reviewPeriods } from "../analytics/monthReview";
import { formatPeriodLabel } from "./charts/plot";
import type { Checkpoint } from "./data";
import { formatCurrency, formatRate, formatSignedCurrency } from "./format";
import { type YearScope, inScope } from "./scope";

export interface ThisMonthProps {
  analytics: AnalyticsOutput;
  checkpoints: readonly Checkpoint[];
  /** Limits which months the picker offers; the review itself always reads the unscoped `analytics`. */
  scope: YearScope;
}

/** "August 2026", the month spelled out -- the chart's short form reads as an abbreviation in prose. */
function monthLabel(period: string): string {
  return formatPeriodLabel(period, { month: "long" });
}

/** The month picker, over every period `reviewPeriods` returns, newest first. */
function MonthPicker({
  periods,
  period,
  onPeriodChange,
}: {
  periods: readonly string[];
  period: string;
  onPeriodChange: (period: string) => void;
}) {
  return (
    <Select.Root value={period} onValueChange={onPeriodChange}>
      <Select.Trigger aria-label="Month" />
      <Select.Content>
        {periods.map((p) => (
          <Select.Item key={p} value={p}>
            {monthLabel(p)}
          </Select.Item>
        ))}
      </Select.Content>
    </Select.Root>
  );
}

/** "August 2026: +$15,870.75", the change over the whole period, netted or not: whatever moved the total. */
function Headline({ review }: { review: MonthReview }) {
  const change = review.start === null ? review.end : review.end - review.start;
  return (
    <Heading size="6" as="h2">
      {monthLabel(review.period)}: {formatSignedCurrency(change)}
    </Heading>
  );
}

/** Deposits versus market growth, so a well-funded month never reads as a good one. */
function DepositsAndGrowth({ review }: { review: MonthReview }) {
  const moved = review.netDeposits >= 0 ? "paid in" : "withdrawn";
  return (
    <Text size="3" data-month-flows="">
      {formatCurrency(Math.abs(review.netDeposits))} {moved}
      {review.growth === null ? null : (
        <>
          {", "}
          <Text color={review.growth >= 0 ? "jade" : "red"}>
            {formatSignedCurrency(review.growth)}
          </Text>{" "}
          market growth
        </>
      )}
    </Text>
  );
}

/** One row per account that moved, sorted by `|change|` descending (see `monthReview`). */
function MoversTable({ moves }: { moves: MonthReview["moves"] }) {
  return (
    <Table.Root size="1" variant="surface">
      <Table.Header>
        <Table.Row>
          <Table.ColumnHeaderCell>Account</Table.ColumnHeaderCell>
          <Table.ColumnHeaderCell align="right">Value</Table.ColumnHeaderCell>
          <Table.ColumnHeaderCell align="right">Change</Table.ColumnHeaderCell>
          <Table.ColumnHeaderCell align="right">Deposits</Table.ColumnHeaderCell>
          <Table.ColumnHeaderCell align="right">Growth</Table.ColumnHeaderCell>
        </Table.Row>
      </Table.Header>
      <Table.Body>
        {moves.map((m) => (
          <Table.Row key={m.maskedId} data-mover-row="">
            <Table.RowHeaderCell>{m.label}</Table.RowHeaderCell>
            <Table.Cell align="right">{formatCurrency(m.end ?? 0)}</Table.Cell>
            <Table.Cell align="right">
              {m.change === null ? (
                "new"
              ) : (
                <Text color={m.change >= 0 ? "jade" : "red"}>{formatSignedCurrency(m.change)}</Text>
              )}
            </Table.Cell>
            <Table.Cell align="right">{formatSignedCurrency(m.netDeposits)}</Table.Cell>
            <Table.Cell align="right">
              {m.growth === null ? (
                ""
              ) : (
                <Text color={m.growth >= 0 ? "jade" : "red"}>{formatSignedCurrency(m.growth)}</Text>
              )}
            </Table.Cell>
          </Table.Row>
        ))}
      </Table.Body>
    </Table.Root>
  );
}

/** Dividends, interest, lending income, withholding and fees for the accounts in totals. */
function IncomeAndCosts({ activity }: { activity: MonthReview["activity"] }) {
  return (
    <Flex direction="column" gap="1" data-month-activity="">
      <Text size="2">Dividends {formatCurrency(activity.dividends)}</Text>
      <Text size="2">Interest {formatCurrency(activity.interest)}</Text>
      <Text size="2">Lending income {formatCurrency(activity.lendingIncome)}</Text>
      <Text size="2">Withholding tax {formatCurrency(activity.withholdingTax)}</Text>
      <Text size="2">Fees {formatCurrency(activity.fees)}</Text>
    </Flex>
  );
}

/** Which accounts have no statement yet, and which opened this period -- never a $0 account, per Review Focus. */
function CoverageLine({ review }: { review: MonthReview }) {
  if (review.missing.length === 0 && review.opened.length === 0) return null;
  return (
    <Text size="2" color="gray" data-month-coverage="">
      {review.missing.length === 0 ? null : `Missing a statement: ${review.missing.join(", ")}. `}
      {review.opened.length === 0 ? null : `Newly opened: ${review.opened.join(", ")}. `}
      See <a href="#data">Data</a> for the full coverage.
    </Text>
  );
}

/** "Wealthsimple app $X against statements $Y, $Z apart (P%)", only when the owner took a reading for this period. */
function CheckpointLine({
  checkpoints,
  period,
}: {
  checkpoints: readonly Checkpoint[];
  period: string;
}) {
  const checkpoint = checkpoints.find((c) => c.coversPeriod === period && c.reconciliation);
  const recon = checkpoint?.reconciliation;
  if (recon === undefined || recon === null) return null;
  const apart = Math.abs(recon.difference);
  const percent = recon.ourTotal > 0 ? (apart / recon.ourTotal) * 100 : 0;
  return (
    <Text size="2" color="gray" data-checkpoint-line="">
      Wealthsimple app {formatCurrency(recon.appVisibleTotal)} against statements{" "}
      {formatCurrency(recon.ourTotal)}, {formatCurrency(apart)} apart ({formatRate(percent)})
    </Text>
  );
}

/**
 * What changed since the previous statement month: deposits split from
 * market growth, the accounts that moved most, income and costs, and
 * coverage -- what is missing or newly opened, never silently a $0 account.
 */
export function ThisMonth({ analytics, checkpoints, scope }: ThisMonthProps) {
  // The picker only ever offers periods inside the year scope; the review
  // itself always reads the unscoped `analytics` it was handed, so a missing
  // or newly opened account is judged against its own real history, not a
  // history the scope has clipped away.
  const periods = reviewPeriods(analytics).filter((p) => inScope(p, scope));
  const [period, setPeriod] = useState<string>(() => periods[0] ?? "");

  // A prop-driven reset, not an effect: when the scope itself changes, the
  // previous period may no longer be offered, so this picks the newest one
  // the new scope does offer, in the same render rather than one frame late.
  const [scopeAtLastRender, setScopeAtLastRender] = useState(scope);
  if (scope !== scopeAtLastRender) {
    setScopeAtLastRender(scope);
    setPeriod(periods[0] ?? "");
  }

  if (period === "" || !periods.includes(period)) {
    return <Text size="3">No statement month to review yet.</Text>;
  }
  const review = monthReview(analytics, period);

  return (
    <Flex direction="column" gap="5">
      <MonthPicker periods={periods} period={period} onPeriodChange={setPeriod} />
      <Flex direction="column" gap="1">
        <Headline review={review} />
        <DepositsAndGrowth review={review} />
      </Flex>
      <MoversTable moves={review.moves} />
      <IncomeAndCosts activity={review.activity} />
      <CoverageLine review={review} />
      <CheckpointLine checkpoints={checkpoints} period={period} />
    </Flex>
  );
}
