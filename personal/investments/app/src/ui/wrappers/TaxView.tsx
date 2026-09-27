import { Card, Flex, Heading, Text } from "@radix-ui/themes";
import type { AnalyticsOutput } from "../../analytics/build";
import type { CorporateAction } from "../../analytics/income";
import { formatCurrency } from "../format";
import type { YearScope } from "../scope";

export interface TaxViewProps {
  analytics: AnalyticsOutput;
  year: number;
  scope: YearScope;
}

/** `data-tax-row` is a stable test hook, not styling -- it is what lets a test pin one figure rather than one of several equal-looking ones. */
function Row({
  label,
  value,
  hook,
  tone,
}: {
  label: string;
  value: string;
  hook: string;
  tone?: "jade" | "red";
}) {
  return (
    <Flex justify="between" align="baseline" py="1" data-tax-row={hook}>
      <Text size="2" color="gray">
        {label}
      </Text>
      <Text size="2" color={tone}>
        {value}
      </Text>
    </Flex>
  );
}

/**
 * The realized figure, labelled for what it actually is. Both years in the
 * corpus can be a loss, and a loss shown under a "gains" label reads as
 * money made. The sign is kept on the figure for the same reason.
 */
function RealizedRow({ realizedGains }: { realizedGains: number }) {
  return (
    <Row
      hook="realized"
      label={realizedGains < 0 ? "Realized loss" : "Realized gains"}
      value={formatCurrency(realizedGains)}
      tone={realizedGains < 0 ? "red" : "jade"}
    />
  );
}

function CostUnknownRow({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <Text size="1" color="gray" data-tax-row="cost-unknown">
      {count} sale{count === 1 ? "" : "s"} without a cost basis.
    </Text>
  );
}

/** A USD figure above converts at a statement's own month end rate, an approximation of the actual trade day rate -- stated once, beside the figures it qualifies. */
const USD_CONVERSION_CAVEAT =
  "A USD figure above is converted at each statement's month end rate, an approximation of the actual trade day rate.";

function CorporateActionsCard({ actions }: { actions: readonly CorporateAction[] }) {
  if (actions.length === 0) return null;
  return (
    <Card data-tax-corporate-actions="">
      <Flex direction="column" gap="2">
        <Text size="2" weight="bold">
          Corporate actions to check against your tax slips
        </Text>
        {actions.map((action, index) => (
          <Text size="2" color="gray" key={`${action.symbol}-${action.date}-${index}`}>
            {action.symbol}, {action.date}
          </Text>
        ))}
      </Flex>
    </Card>
  );
}

/** The RRSP contributed in `year`, which is what the deduction line states. Zero when the corpus has no RRSP line that year. */
function rrspContributedIn(analytics: AnalyticsOutput, year: number): number {
  const lines = analytics.rooms[String(year)] ?? [];
  return lines.find((line) => line.group === "RRSP")?.used ?? 0;
}

/** "All time" silently shows the latest year's figures, so the heading has to say so rather than let the year read as the one the reader chose. */
function headingFor(year: number, scope: YearScope): string {
  return scope === "all" ? `Investment income, latest year ${year}` : `Investment income, ${year}`;
}

/**
 * Personal taxable investment income for one year, straight off
 * `analytics.income[year]`: interest, dividends split Canadian versus
 * foreign, foreign tax withheld (a credit, not an expense), and realized
 * gains or losses. The RRSP deduction is stated as a separate fact -- money
 * contributed this year, deductible against total income -- never netted
 * against investment income into a fabricated "taxable income" figure.
 */
export function TaxView({ analytics, year, scope }: TaxViewProps) {
  const income = analytics.income[String(year)];
  const rrspContributed = rrspContributedIn(analytics, year);
  const heading = headingFor(year, scope);

  if (income === undefined) {
    // A year can reach here with room lines but no income entry, since the
    // year control is driven by the rooms map. Zeros would read as a real
    // position rather than as data that is not there.
    return (
      <Flex direction="column" gap="3">
        <Heading size="5" as="h2">
          {heading}
        </Heading>
        <Card>
          <Text size="2" color="gray">
            No income data for {year}.
          </Text>
        </Card>
      </Flex>
    );
  }

  return (
    <Flex direction="column" gap="3">
      <Heading size="5" as="h2">
        {heading}
      </Heading>

      <Card data-tax-income="">
        <Row hook="interest" label="Interest" value={formatCurrency(income.interest)} />
        <Row
          hook="canadian-distributions"
          label="Distributions from Canadian listed securities"
          value={formatCurrency(income.canadianDistributions)}
        />
        <Row
          hook="foreign-dividends"
          label="Foreign dividends"
          value={formatCurrency(income.foreignDividends)}
        />
        <Row
          hook="foreign-tax-withheld"
          label="Foreign tax withheld (a credit you can claim)"
          value={formatCurrency(income.foreignTaxWithheld)}
        />
        <RealizedRow realizedGains={income.realizedGains} />
        <CostUnknownRow count={income.costUnknownSales} />
        <Text size="1" color="gray" data-tax-row="usd-conversion-caveat">
          {USD_CONVERSION_CAVEAT}
        </Text>
      </Card>

      <CorporateActionsCard actions={income.corporateActions} />

      <Card data-tax-rrsp="">
        <Text size="2" color="gray" data-tax-row="rrsp-deduction">
          RRSP deduction available:{" "}
          <Text as="span" weight="bold">
            {formatCurrency(rrspContributed)}
          </Text>{" "}
          contributed in {year}, deductible against your total income, including salary.
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
