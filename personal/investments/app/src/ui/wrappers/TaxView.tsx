import { Card, Flex, Heading, Text } from "@radix-ui/themes";
import type { AnalyticsOutput } from "../../analytics/build";
import { type IncomeSummary, estimateTax } from "../../analytics/income";
import { formatCurrency } from "../format";

export interface TaxViewProps {
  analytics: AnalyticsOutput;
  year: number;
}

/**
 * The flat rate the estimate applies. A single rate standing in for the real
 * progressive schedule is one of the several reasons this is not a filing
 * figure, which is what the disclaimer beside it says.
 */
const ESTIMATE_RATE = 0.3;

const ZERO_INCOME: IncomeSummary = {
  interest: 0,
  eligibleDividends: 0,
  foreignIncome: 0,
  realizedGains: 0,
};

function Row({ label, value }: { label: string; value: string }) {
  return (
    <Flex justify="between" align="baseline" py="1">
      <Text size="2" color="gray">
        {label}
      </Text>
      <Text size="2">{value}</Text>
    </Flex>
  );
}

/**
 * The realized figure, labelled for what it actually is. Both years in the
 * corpus are losses, and a loss shown under a "gains" label reads as money
 * made. The sign is kept on the figure for the same reason.
 */
function RealizedRow({ realizedGains }: { realizedGains: number }) {
  return (
    <Flex justify="between" align="baseline" py="1">
      <Text size="2" color="gray">
        {realizedGains < 0 ? "Realized loss" : "Realized gains"}
      </Text>
      <Text size="2" color={realizedGains < 0 ? "red" : undefined}>
        {formatCurrency(realizedGains)}
      </Text>
    </Flex>
  );
}

/** The RRSP contributed in `year`, which is what the estimate deducts. Zero when the corpus has no RRSP line that year. */
function rrspContributedIn(analytics: AnalyticsOutput, year: number): number {
  const lines = analytics.rooms[String(year)] ?? [];
  return lines.find((line) => line.group === "RRSP")?.used ?? 0;
}

/**
 * Personal taxable investment income for one year, straight off
 * `analytics.income[year]`, plus the rough estimate from `estimateTax`.
 *
 * What is missing from these figures is stated on the page rather than left
 * to be noticed: the corporate account is outside the personal estimate by
 * design, and the estimate's own disclaimer sits with the estimate, not in a
 * footnote a reader can scroll past.
 */
export function TaxView({ analytics, year }: TaxViewProps) {
  const income = analytics.income[String(year)] ?? ZERO_INCOME;
  const rrspContributed = rrspContributedIn(analytics, year);
  const estimate = estimateTax(income, rrspContributed, ESTIMATE_RATE);

  return (
    <Flex direction="column" gap="3">
      <Heading size="5">Personal taxable income, {year}</Heading>

      <Card data-tax-income="">
        <Row label="Interest" value={formatCurrency(income.interest)} />
        <Row label="Canadian eligible dividends" value={formatCurrency(income.eligibleDividends)} />
        <Row label="Foreign income" value={formatCurrency(income.foreignIncome)} />
        <RealizedRow realizedGains={income.realizedGains} />
      </Card>

      <Card data-tax-estimate="">
        <Row label="RRSP contributed this year" value={formatCurrency(estimate.rrspDeduction)} />
        <Row label="Taxable income" value={formatCurrency(estimate.taxableIncome)} />
        <Row
          label={`Estimated tax at a flat ${Math.round(ESTIMATE_RATE * 100)}% rate`}
          value={formatCurrency(estimate.estimatedTax)}
        />
        <Text size="1" color="gray">
          {estimate.disclaimer}
        </Text>
      </Card>

      <Card data-tax-exclusions="">
        <Flex direction="column" gap="1">
          <Text size="2" color="gray">
            The corporate account is not counted here. Investment income inside a corporation is
            taxed in the corporation, and only reaches you when it is dividended out.
          </Text>
          <Text size="2" color="gray">
            Registered wrappers are not counted either. Income earned inside them is not taxable as
            earned.
          </Text>
        </Flex>
      </Card>
    </Flex>
  );
}
