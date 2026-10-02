import { Badge, Flex, Heading, Table, Text } from "@radix-ui/themes";
import type { SuperficialLossCandidate } from "../../analytics/superficialLoss";
import { formatCurrency } from "../format";

function CandidateRow({ candidate }: { candidate: SuperficialLossCandidate }) {
  const { sale, windowEnd, stillOpen, matchedBuy } = candidate;
  return (
    <Table.Row data-superficial-loss-row={`${sale.maskedId}:${sale.symbol}:${sale.date}`}>
      <Table.RowHeaderCell>{sale.date}</Table.RowHeaderCell>
      <Table.Cell>{sale.symbol}</Table.Cell>
      <Table.Cell>
        <Text color="red">{formatCurrency(sale.gain)}</Text>
      </Table.Cell>
      <Table.Cell>{windowEnd}</Table.Cell>
      <Table.Cell>
        {matchedBuy ? (
          <Badge color="red" variant="soft" highContrast data-superficial-loss-matched="">
            Replacement buy {matchedBuy.date}
          </Badge>
        ) : stillOpen ? (
          <Badge color="amber" variant="soft" highContrast data-superficial-loss-open="">
            Window still open
          </Badge>
        ) : (
          <Text size="2" color="gray">
            No replacement buy found
          </Text>
        )}
      </Table.Cell>
    </Table.Row>
  );
}

/**
 * Every loss sale whose 30-day superficial-loss window is either still open
 * or matched a replacement buy -- see `superficialLoss.ts`. The denied
 * amount is never computed here: CRA's formula needs the replacement
 * shares still held at the window's end, which this project's statement
 * ledger cannot state as a filing figure, so this flags the sale and the
 * window and leaves the amount to the owner.
 */
export function SuperficialLossWatch({
  candidates,
}: {
  candidates: readonly SuperficialLossCandidate[];
}) {
  const flagged = candidates.filter((c) => c.stillOpen || c.matchedBuy !== null);
  if (flagged.length === 0) {
    return (
      <Text size="2" color="gray" data-superficial-loss-empty="">
        No loss sale this year has an open or matched 30-day window.
      </Text>
    );
  }
  return (
    <Flex direction="column" gap="3">
      <Heading size="5" as="h2">
        Superficial loss watch
      </Heading>
      <Table.Root data-superficial-loss-table="" variant="surface">
        <Table.Header>
          <Table.Row>
            <Table.ColumnHeaderCell>Sale date</Table.ColumnHeaderCell>
            <Table.ColumnHeaderCell>Symbol</Table.ColumnHeaderCell>
            <Table.ColumnHeaderCell>Loss</Table.ColumnHeaderCell>
            <Table.ColumnHeaderCell>Window ends</Table.ColumnHeaderCell>
            <Table.ColumnHeaderCell>Status</Table.ColumnHeaderCell>
          </Table.Row>
        </Table.Header>
        <Table.Body>
          {flagged.map((c, index) => (
            <CandidateRow
              key={`${c.sale.maskedId}:${c.sale.symbol}:${c.sale.date}:${index}`}
              candidate={c}
            />
          ))}
        </Table.Body>
      </Table.Root>
      <Text size="1" color="gray">
        The denied amount is not computed here -- it depends on replacement shares still held at the
        window's end, which this project's statement ledger cannot state precisely. Check each
        flagged sale before claiming the loss.
      </Text>
    </Flex>
  );
}
