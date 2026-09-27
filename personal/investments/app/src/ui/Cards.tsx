import { Badge, Callout, Card, Flex, Heading, Table, Text } from "@radix-ui/themes";
import type { CardStatement } from "../ingest/card";
import { formatCurrency, formatRate } from "./format";
import { type YearScope, inScope } from "./scope";

/**
 * Credit cards, kept deliberately apart from everything else on this page.
 *
 * A card balance is money OWED. The portfolio total above the tabs is money
 * held, so the two must never be added, netted, or drawn on one axis -- and
 * none of the investment analytics apply here at all: there is no market
 * value, no book cost, no contribution room and no return rate to compute. So
 * this view shares no series, no chart and no rollup with the rest of the
 * dashboard, and reads its own `data/cards.json`.
 *
 * What it does share is the precision rule: every figure comes from
 * `formatCurrency` or `formatRate`, and the visible text and the accessible
 * name come from the same call.
 */

/** A balance owed reads as a debt, not as a holding, so it is never painted in the gain colour. */
function BalanceBadge({ balance }: { balance: number }) {
  return balance === 0 ? (
    <Badge color="jade" variant="soft" highContrast>
      Paid in full
    </Badge>
  ) : (
    <Badge color="amber" variant="soft" highContrast>
      {formatCurrency(balance)} owed
    </Badge>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <Flex justify="between" gap="4">
      <Text size="2" color="gray">
        {label}
      </Text>
      <Text size="2" weight="medium">
        {value}
      </Text>
    </Flex>
  );
}

function StatementCard({ statement }: { statement: CardStatement }) {
  const utilisation = statement.newBalance / statement.creditLimit;
  const summary =
    `Card ending ${statement.cardId.replace("card_", "")}, ` +
    `${statement.periodStart} to ${statement.periodEnd}. ` +
    `New balance ${formatCurrency(statement.newBalance)} of a ` +
    `${formatCurrency(statement.creditLimit)} limit. ` +
    `Payment due ${statement.paymentDueDate}.`;

  return (
    <Card data-card-statement={statement.cardId} aria-label={summary}>
      <Flex direction="column" gap="3">
        <Flex justify="between" align="center" gap="3" wrap="wrap">
          <Heading size="3" as="h3">
            Card ending {statement.cardId.replace("card_", "")}
          </Heading>
          <BalanceBadge balance={statement.newBalance} />
        </Flex>
        <Text size="2" color="gray">
          {statement.periodStart} to {statement.periodEnd}, statement dated{" "}
          {statement.statementDate}
        </Text>

        <Flex direction="column" gap="1" data-card-summary="">
          <SummaryRow label="Previous balance" value={formatCurrency(statement.previousBalance)} />
          <SummaryRow label="Purchases" value={formatCurrency(statement.purchases)} />
          <SummaryRow label="Payments" value={formatCurrency(statement.payments)} />
          <SummaryRow label="Other credits" value={formatCurrency(statement.otherCredits)} />
          <SummaryRow label="Fees" value={formatCurrency(statement.fees)} />
          <SummaryRow label="Interest" value={formatCurrency(statement.interest)} />
          <SummaryRow label="Cash advances" value={formatCurrency(statement.cashAdvances)} />
          <SummaryRow label="New balance" value={formatCurrency(statement.newBalance)} />
        </Flex>

        <Flex direction="column" gap="1" data-card-terms="">
          <SummaryRow label="Credit limit" value={formatCurrency(statement.creditLimit)} />
          {/* Utilisation at one decimal, the same precision the room bars use:
              a whole percent turns 0.4% into 0% and 29.6% into 30%. */}
          <SummaryRow label="Used" value={formatRate(utilisation * 100)} />
          <SummaryRow label="Minimum payment" value={formatCurrency(statement.minimumPayment)} />
          <SummaryRow label="Payment due" value={statement.paymentDueDate} />
          <SummaryRow label="Purchase rate" value={formatRate(statement.purchaseRate * 100)} />
          <SummaryRow
            label="Cash advance rate"
            value={formatRate(statement.cashAdvanceRate * 100)}
          />
        </Flex>

        {statement.activity.length > 0 ? (
          <Table.Root size="1" variant="surface" data-card-activity="">
            <Table.Header>
              <Table.Row>
                <Table.ColumnHeaderCell>Posted</Table.ColumnHeaderCell>
                <Table.ColumnHeaderCell>Type</Table.ColumnHeaderCell>
                <Table.ColumnHeaderCell>Details</Table.ColumnHeaderCell>
                <Table.ColumnHeaderCell align="right">Amount</Table.ColumnHeaderCell>
              </Table.Row>
            </Table.Header>
            <Table.Body>
              {statement.activity.map((row, index) => (
                <Table.Row key={`${row.postedDate}-${row.description}-${index}`}>
                  <Table.Cell>{row.postedDate}</Table.Cell>
                  <Table.Cell>{row.type}</Table.Cell>
                  <Table.Cell>{row.description}</Table.Cell>
                  <Table.Cell align="right">{formatCurrency(row.amount)}</Table.Cell>
                </Table.Row>
              ))}
            </Table.Body>
          </Table.Root>
        ) : (
          <Text size="2" color="gray">
            No activity on this statement.
          </Text>
        )}
      </Flex>
    </Card>
  );
}

export function Cards({
  statements,
  scope,
}: {
  statements: readonly CardStatement[];
  scope: YearScope;
}) {
  const inYear = statements.filter((statement) => inScope(statement.period, scope));
  const hidden = statements.length - inYear.length;
  if (inYear.length === 0) {
    return (
      <Callout.Root color="gray" variant="surface">
        <Callout.Text>
          {statements.length === 0 ? (
            <>
              No credit card statements imported yet. Drop them in the card statements folder and
              run <code>bun run cards</code>.
            </>
          ) : (
            // An absence caused by the filter, said in those words. "No
            // statements" for a year that simply has none would otherwise
            // read as "none were ever imported".
            <>No credit card statement for {String(scope)}.</>
          )}
        </Callout.Text>
      </Callout.Root>
    );
  }

  const latestFirst = [...inYear].sort((a, b) => b.period.localeCompare(a.period));
  return (
    <Flex direction="column" gap="4">
      <Callout.Root color="gray" variant="surface" data-cards-caveat="">
        <Callout.Text>
          A credit card balance is money owed, not money held. Nothing here is counted in the
          portfolio total, and none of the investment charts apply to it.
          {hidden > 0
            ? ` ${hidden} statement${hidden === 1 ? "" : "s"} outside ${String(scope)} hidden.`
            : ""}
        </Callout.Text>
      </Callout.Root>
      {latestFirst.map((statement) => (
        <StatementCard key={`${statement.cardId}-${statement.period}`} statement={statement} />
      ))}
    </Flex>
  );
}
