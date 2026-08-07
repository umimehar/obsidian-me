import { Button, Callout, Flex, Heading, Text } from "@radix-ui/themes";
import { useMemo, useState } from "react";
import type { AnalyticsOutput } from "../../analytics/build";
import { buildPortfolioSeries } from "../../analytics/portfolioSeries";
import { projectYears } from "../../projection/engine";
import { fittedReturnRate } from "../../projection/fittedRate";
import { projectedAccounts, projectionInputs } from "../../projection/inputs";
import { ProjectionChart } from "../charts/ProjectionChart";
import { buildProjectionSeries, logDecadeDomain } from "../charts/projectionSeries";
import { grandTotal } from "../data";
import { formatCurrency, formatRate } from "../format";

export interface ProjectionsViewProps {
  analytics: AnalyticsOutput;
}

/**
 * The rate the projection defaults to, and it is deliberately not the rate
 * fitted from the statements.
 *
 * Owner decision, 2026-08-07. The fit over the corpus is 24.84% a year, which
 * is arithmetically right and useless as a thirty-year assumption: it compounds
 * the opening balance to roughly $431M by 2056, and it is a three-year window
 * over one strong equity run. 6% nominal is a conventional long-run figure
 * instead, labelled on screen as an assumption that did not come from this
 * data. The fitted rate is offered beside it, with its window stated, and the
 * slider moves either way -- but the number a reader sees first must be the
 * conservative one.
 */
const DEFAULT_RATE = 0.06;

/**
 * The most the slider offers, and with it the top of the chart's axis.
 *
 * Widened past the fitted rate whenever the fit exceeds it, so applying the
 * fitted rate can never send the projected line off the top of a chart whose
 * axis was built without it.
 */
function maxRate(fitted: number): number {
  return Math.max(0.25, Math.ceil(fitted * 100) / 100);
}

/**
 * The caveat, in the open above the figures rather than in a footnote.
 *
 * Every other figure on this page was transcribed from a PDF. This one is
 * invented, which makes it the least certain thing here and the one that most
 * needs its qualification adjacent to it. Phase 2b settled that a caveat
 * belongs next to the number it qualifies.
 */
function Disclaimer() {
  return (
    <Callout.Root color="amber" variant="surface" data-projection-disclaimer="">
      <Callout.Text>
        This is a scenario, not a forecast. It assumes one flat return every year for thirty years,
        which no real portfolio delivers, and it assumes contributions keep arriving under today's
        CRA rules. It is not advice and it is not a filing figure.
      </Callout.Text>
    </Callout.Root>
  );
}

/** The end figure, at full precision, with the year and the assumption it rests on. */
function EndValue({
  value,
  year,
  rate,
}: {
  value: number;
  year: string;
  rate: number;
}) {
  return (
    <Flex direction="column" gap="1">
      <Heading size="2" as="h3" color="gray" weight="regular">
        {`Projected value at the end of ${year}`}
      </Heading>
      <Text size="8" weight="bold" data-projection-end-value="">
        {formatCurrency(value)}
      </Text>
      <Text size="2" color="gray" data-projection-rate="">
        {`Rate in use: ${formatRate(rate * 100)} a year.`}
      </Text>
    </Flex>
  );
}

/** The slider, plus the two rates worth one click each. */
function RateControl({
  rate,
  fitted,
  onRateChange,
}: {
  rate: number;
  fitted: number;
  onRateChange: (rate: number) => void;
}) {
  const limit = maxRate(fitted);
  return (
    <Flex direction="column" gap="2" data-projection-rate-control="">
      <Text as="label" size="2" htmlFor="projection-rate">
        {`Annual return assumed: ${formatRate(rate * 100)}`}
      </Text>
      <input
        id="projection-rate"
        type="range"
        min={0}
        max={limit * 100}
        step="any"
        value={rate * 100}
        onChange={(event) => onRateChange(Number(event.target.value) / 100)}
      />
      <Flex gap="2" wrap="wrap">
        <Button size="1" variant="soft" data-apply-fitted="" onClick={() => onRateChange(fitted)}>
          {`Apply your fitted ${formatRate(fitted * 100)}`}
        </Button>
        <Button
          size="1"
          variant="soft"
          color="gray"
          data-apply-default=""
          onClick={() => onRateChange(DEFAULT_RATE)}
        >
          {`Back to ${formatRate(DEFAULT_RATE * 100)}`}
        </Button>
      </Flex>
    </Flex>
  );
}

/**
 * Where each rate came from, in words, beside the control that applies it.
 *
 * The default's line says plainly that it is not from this data, because a
 * figure on a personal dashboard is otherwise read as a figure about the
 * person. The fitted rate's line states its window, its accounts and the word
 * derived, and then states what the netting behind it cannot see: securities
 * transferred in kind arrive in no cash block, so they are not subtracted as
 * money in and read as growth instead. Their dollar value is not stated
 * anywhere in the corpus, so the figure cannot be corrected, only qualified.
 */
function Provenance({
  fitted,
}: {
  fitted: ReturnType<typeof fittedReturnRate>;
}) {
  return (
    <Flex direction="column" gap="2" data-projection-provenance="">
      <Text size="2" color="gray">
        The default, {formatRate(DEFAULT_RATE * 100)} a year, is a conventional long-run assumption.
        It did not come from your data.
      </Text>
      <Text size="2" color="gray">
        Your last {fitted.months} months ran at {formatRate(fitted.rate * 100)} a year, net of
        deposits. That figure is derived here, not stated on any statement: it is fitted across{" "}
        {fitted.accounts} counted accounts over {fitted.monthsFitted} month to month steps. Three
        years is a short window over one strong run, so it is a record of a period rather than a
        thirty year expectation.
      </Text>
      <Text size="2" color="gray">
        Securities transferred in kind are not netted out of that fitted figure. Only cash deposits
        are subtracted, and a transfer of holdings arrives in no cash block and states no dollar
        value, so a month that received one reads as growth.
      </Text>
    </Flex>
  );
}

/** What the projection covers, and what it leaves out, stated rather than left as a gap in the total. */
function Coverage({
  covered,
  uncovered,
  openingTotal,
  portfolioTotal,
}: {
  covered: number;
  uncovered: number;
  openingTotal: number;
  portfolioTotal: number;
}) {
  return (
    <Text size="2" color="gray" data-projection-coverage="">
      The projection covers {covered} counted accounts, the ones with a contribution rule or a
      funding plan behind them. {uncovered} counted accounts holding{" "}
      {formatCurrency(portfolioTotal - openingTotal)} are left out, so the history line ends at{" "}
      {formatCurrency(openingTotal)} rather than at the portfolio total of{" "}
      {formatCurrency(portfolioTotal)}.
    </Text>
  );
}

/** Nothing stated to start from, which is not the same as starting from zero. */
function EmptyState() {
  return (
    <Flex direction="column" gap="2">
      <Heading size="5" as="h2">
        Thirty year projection
      </Heading>
      <Text size="2" color="gray" data-projection-empty="">
        No counted account states a market value, so there is nothing to project from. A projection
        from zero would be a figure about nothing.
      </Text>
    </Flex>
  );
}

/**
 * The one invented view in this dashboard.
 *
 * The engine, the inputs and the fitted rate all already exist and are used
 * here rather than restated: `projectionInputs` derives every input from
 * `analytics.json` at call time, so a new statement moves the seam and the
 * starting balance with no change here. What this view owns is the rate a
 * reader chooses, the words around it, and the seam.
 */
export function ProjectionsView({ analytics }: ProjectionsViewProps) {
  const fitted = useMemo(() => fittedReturnRate(analytics.series), [analytics]);
  const [rate, setRate] = useState(DEFAULT_RATE);

  const accounts = useMemo(() => projectedAccounts(analytics.series), [analytics]);
  const history = useMemo(() => buildPortfolioSeries(accounts), [accounts]);
  const rows = useMemo(
    () => projectYears(projectionInputs(analytics, { returnRate: rate })),
    [analytics, rate],
  );
  // The axis is built from the largest scenario the controls offer, never from
  // the one on screen: that is what holds the stated half still while the rate
  // slider moves.
  const domain = useMemo(() => {
    const widest = projectYears(projectionInputs(analytics, { returnRate: maxRate(fitted.rate) }));
    return logDecadeDomain([
      ...history.map((point) => point.marketValue),
      ...widest.map((row) => row.value),
    ]);
  }, [analytics, history, fitted.rate]);

  const series = useMemo(() => buildProjectionSeries(history, rows), [history, rows]);
  const openingTotal = history[history.length - 1]?.marketValue ?? 0;
  const end = rows[rows.length - 1];

  if (openingTotal <= 0 || domain === null || end === undefined) return <EmptyState />;

  return (
    <Flex direction="column" gap="4">
      <Heading size="5" as="h2">
        Thirty year projection
      </Heading>
      <EndValue value={end.value} year={end.year} rate={rate} />
      <Disclaimer />
      <RateControl rate={rate} fitted={fitted.rate} onRateChange={setRate} />
      <Provenance fitted={fitted} />
      <Coverage
        covered={accounts.length}
        uncovered={analytics.series.filter((a) => a.inTotals).length - accounts.length}
        openingTotal={openingTotal}
        portfolioTotal={grandTotal(analytics)}
      />
      <ProjectionChart series={series} domain={domain} rate={rate} />
    </Flex>
  );
}
