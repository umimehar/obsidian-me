import { Badge, Card, Flex, Heading, Text } from "@radix-ui/themes";
import type { ForeignPropertySummary } from "../../analytics/foreignProperty";
import { t1135ThresholdStatus } from "../../analytics/foreignProperty";
import type { T1135Thresholds } from "../../tax";
import { formatCurrency } from "../format";

export interface T1135CardProps {
  summary: ForeignPropertySummary;
  thresholds: T1135Thresholds;
}

/**
 * The T1135 foreign property card: cost amount (never market value) of
 * specified foreign property, the maximum during the year and at year end,
 * against the filing and detailed-method thresholds. Crypto and
 * unclassified holdings are shown apart, never folded into the foreign
 * total either way -- see `foreignProperty.ts` for why.
 */
export function T1135Card({ summary, thresholds }: T1135CardProps) {
  const status = t1135ThresholdStatus(summary.maxForeignCost, thresholds);
  return (
    <Card data-t1135-card="">
      <Flex direction="column" gap="2">
        <Heading size="4" as="h3">
          T1135 foreign property
        </Heading>
        <Text size="2" color="gray" data-t1135-caveat="">
          Cost amount (book cost, not market value). The maximum during the year is the highest of
          the month-end costs across {summary.monthsConsidered} statement
          {summary.monthsConsidered === 1 ? "" : "s"} this year, an acceptable approximation of the
          true daily maximum, never a filing figure on its own.
        </Text>
        <Text size="2" data-t1135-max="">
          Maximum during {summary.year}:{" "}
          <Text weight="bold">{formatCurrency(summary.maxForeignCost)}</Text>
        </Text>
        <Text size="2" data-t1135-year-end="">
          At year end: <Text weight="bold">{formatCurrency(summary.yearEndForeignCost)}</Text>
        </Text>
        <Flex gap="2" wrap="wrap">
          <Badge
            color={status.filingThresholdExceeded ? "red" : "jade"}
            variant="soft"
            highContrast
            data-t1135-filing-status=""
          >
            {status.filingThresholdExceeded ? "Over" : "Under"} the{" "}
            {formatCurrency(thresholds.filingThreshold)} filing threshold
          </Badge>
          <Badge
            color={status.detailedThresholdExceeded ? "red" : "jade"}
            variant="soft"
            highContrast
            data-t1135-detailed-status=""
          >
            {status.detailedThresholdExceeded ? "Over" : "Under"} the{" "}
            {formatCurrency(thresholds.detailedThreshold)} detailed-method threshold
          </Badge>
        </Flex>
        {summary.cryptoCostAtYearEnd > 0 ? (
          <Text size="2" color="gray" data-t1135-crypto="">
            Crypto cost at year end {formatCurrency(summary.cryptoCostAtYearEnd)} -- unclear, ask
            the accountant whether this counts as specified foreign property.
          </Text>
        ) : null}
        {summary.unclassifiedCostAtYearEnd > 0 ? (
          <Text size="2" color="gray" data-t1135-unclassified="">
            {formatCurrency(summary.unclassifiedCostAtYearEnd)} of holdings at year end are not yet
            classified Canadian or foreign -- never guessed, excluded from the figures above until
            reviewed.
          </Text>
        ) : null}
      </Flex>
    </Card>
  );
}
