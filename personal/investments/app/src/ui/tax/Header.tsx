import { Flex, Heading, Text } from "@radix-ui/themes";
import type { YearScope } from "../scope";

export interface TaxHeaderProps {
  title: string;
  year: number;
  scope: YearScope;
  accountLabels: readonly string[];
  latestPeriod: string;
}

/**
 * Section 1 of the redesign spec: the page's own heading, which accounts it
 * covers, and the latest statement period in scope -- so it is obvious on
 * sight that, say, September and later are not in yet.
 */
export function TaxHeader({ title, year, scope, accountLabels, latestPeriod }: TaxHeaderProps) {
  return (
    <Flex direction="column" gap="1">
      <Heading size="5" as="h2">
        {title}, {year}
      </Heading>
      <Text size="2" color="gray">
        {accountLabels.length > 0 ? accountLabels.join(", ") : "No accounts in scope"} · Statements
        through {latestPeriod || "no statement yet"}
        {scope === "all" ? " (All time shows the latest year)" : null}
      </Text>
    </Flex>
  );
}
