import { Card, Flex, Grid, Heading, Text } from "@radix-ui/themes";
import type { HoldingsOutput } from "../../analytics/holdings";
import type { AccountSeries } from "../../analytics/types";
import { formatCurrency, formatGainWithShare } from "../format";
import { holdingsForAccount } from "./summaries";

export interface AccountsSummaryProps {
  accounts: readonly AccountSeries[];
  holdings: HoldingsOutput;
}

function latestMonth(account: AccountSeries) {
  return account.months[account.months.length - 1];
}

function AccountCard({ account, holdings }: { account: AccountSeries; holdings: HoldingsOutput }) {
  const month = latestMonth(account);
  const marketValue = month?.marketValue ?? 0;
  const bookCost = month?.bookCost ?? 0;
  const gain = marketValue - bookCost;
  const holdingCount = holdingsForAccount(holdings, account.label).length;
  const cash = holdings.cashByAccount[account.maskedId] ?? 0;
  return (
    <Card data-account-card={account.maskedId}>
      <Flex direction="column" gap="1">
        <Text size="3" weight="bold">
          {account.label}
        </Text>
        <Text size="4" data-account-market-value="">
          {formatCurrency(marketValue)}
        </Text>
        <Text size="2" color="gray">
          Book cost {formatCurrency(bookCost)}
        </Text>
        <Text size="2" data-account-gain="">
          {formatGainWithShare(gain, bookCost)}
        </Text>
        <Text size="2" color="gray">
          {holdingCount} holding{holdingCount === 1 ? "" : "s"}, cash {formatCurrency(cash)}
        </Text>
      </Flex>
    </Card>
  );
}

/**
 * Section 4 of the redesign spec: one card per account in scope, with
 * market value, book cost, gain and holdings count. Cash is never a
 * holding row -- it is a line on this card.
 */
export function AccountsSummary({ accounts, holdings }: AccountsSummaryProps) {
  if (accounts.length === 0) {
    return (
      <Text size="2" color="gray" data-accounts-empty="">
        No accounts in scope.
      </Text>
    );
  }
  return (
    <Flex direction="column" gap="3" data-accounts-summary="">
      <Heading size="5" as="h2">
        Accounts
      </Heading>
      <Grid columns={{ initial: "1", sm: "2", md: "3" }} gap="3">
        {accounts.map((account) => (
          <AccountCard key={account.maskedId} account={account} holdings={holdings} />
        ))}
      </Grid>
    </Flex>
  );
}
