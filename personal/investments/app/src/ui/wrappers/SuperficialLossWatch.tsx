import { Badge, Flex, Heading, Table, Text } from "@radix-ui/themes";
import type { SuperficialLossCandidate } from "../../analytics/superficialLoss";
import { formatCurrency } from "../format";

function StatusBadge({ candidate }: { candidate: SuperficialLossCandidate }) {
  const { status, matchedBuy } = candidate;
  if (status === "confirmed") {
    return (
      <Badge color="red" variant="soft" highContrast data-superficial-loss-confirmed="">
        Superficial -- replacement buy {matchedBuy?.date}
      </Badge>
    );
  }
  if (status === "pending") {
    return (
      <Badge color="amber" variant="soft" highContrast data-superficial-loss-pending="">
        Pending -- window not settled yet
      </Badge>
    );
  }
  return (
    <Text size="2" color="gray">
      Clear
    </Text>
  );
}

function CandidateRow({ candidate }: { candidate: SuperficialLossCandidate }) {
  const { sale, windowEnd } = candidate;
  return (
    <Table.Row data-superficial-loss-row={`${sale.maskedId}:${sale.symbol}:${sale.date}`}>
      <Table.RowHeaderCell>{sale.date}</Table.RowHeaderCell>
      <Table.Cell>{sale.symbol}</Table.Cell>
      <Table.Cell>
        <Text color="red">{formatCurrency(sale.gain)}</Text>
      </Table.Cell>
      <Table.Cell>{windowEnd}</Table.Cell>
      <Table.Cell>
        <StatusBadge candidate={candidate} />
      </Table.Cell>
    </Table.Row>
  );
}

/**
 * Every loss sale the superficial-loss rule's two conditions have not yet
 * cleared -- `"confirmed"` (a replacement acquisition landed in the
 * window and identical property was still held at its end) or
 * `"pending"` (a statement needed to settle one of the two conditions is
 * not in the corpus yet) -- see `superficialLoss.ts`. A `"clear"` sale is
 * left out entirely: the corpus has enough statements to rule it out, and
 * showing it would just be noise.
 *
 * The denied amount is never computed here: CRA's formula needs the exact
 * replacement shares still held, which a monthly statement cannot state
 * precisely. This settles whether the loss is superficial at all and
 * leaves the amount to the owner.
 */
export function SuperficialLossWatch({
  candidates,
}: {
  candidates: readonly SuperficialLossCandidate[];
}) {
  const flagged = candidates.filter((c) => c.status !== "clear");
  if (flagged.length === 0) {
    return (
      <Text size="2" color="gray" data-superficial-loss-empty="">
        No loss sale this year is confirmed or pending superficial.
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
