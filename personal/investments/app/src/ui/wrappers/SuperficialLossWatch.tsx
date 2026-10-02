import { Badge, Flex, Heading, Table, Text } from "@radix-ui/themes";
import type { SuperficialLossCandidate } from "../../analytics/superficialLoss";
import { formatCurrency } from "../format";
import { splitSuperficialLosses } from "../tax/summaries";

function StatusBadge({ candidate }: { candidate: SuperficialLossCandidate }) {
  const { status, matchedBuy } = candidate;
  if (status === "confirmed") {
    return (
      <Badge color="red" variant="soft" highContrast data-superficial-loss-confirmed="">
        Superficial, replacement buy {matchedBuy?.date}
      </Badge>
    );
  }
  if (status === "pending") {
    return (
      <Badge color="amber" variant="soft" highContrast data-superficial-loss-pending="">
        Pending, window not settled yet
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
      <Table.Cell className="ivt-num">
        <Text color="red">{formatCurrency(sale.gain)}</Text>
      </Table.Cell>
      <Table.Cell>{windowEnd}</Table.Cell>
      <Table.Cell>
        <StatusBadge candidate={candidate} />
      </Table.Cell>
    </Table.Row>
  );
}

function CandidatesTable({ rows }: { rows: readonly SuperficialLossCandidate[] }) {
  return (
    <div className="ivt-table-scroll">
      <Table.Root variant="surface" size="1">
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
          {rows.map((c, index) => (
            <CandidateRow
              key={`${c.sale.maskedId}:${c.sale.symbol}:${c.sale.date}:${index}`}
              candidate={c}
            />
          ))}
        </Table.Body>
      </Table.Root>
    </div>
  );
}

/**
 * Section 7 of the redesign spec: counts by status and by cause, cross
 * -account confirmed losses always visible (the owner's own doing, worth
 * seeing without a click), the rest -- same-account repurchases, pending
 * windows, and the cleared sales -- behind an expander.
 */
export function SuperficialLossWatch({
  candidates,
}: {
  candidates: readonly SuperficialLossCandidate[];
}) {
  if (candidates.length === 0) {
    return (
      <Text size="2" color="gray" data-superficial-loss-empty="">
        No loss sale this year is confirmed or pending superficial.
      </Text>
    );
  }
  const confirmed = candidates.filter((c) => c.status === "confirmed");
  const pending = candidates.filter((c) => c.status === "pending");
  const clear = candidates.filter((c) => c.status === "clear");
  const split = splitSuperficialLosses(candidates);
  const crossAccountRows = confirmed.filter(
    (c) => c.matchedBuy !== null && c.matchedBuy.maskedId !== c.sale.maskedId,
  );
  const sameAccountRows = confirmed.filter(
    (c) => c.matchedBuy !== null && c.matchedBuy.maskedId === c.sale.maskedId,
  );
  const rest = [...sameAccountRows, ...pending, ...clear];

  return (
    <Flex direction="column" gap="3" id="superficial-loss-watch">
      <Heading size="5" as="h2">
        Superficial loss watch
      </Heading>
      <Text size="2" color="gray">
        A loss sale is superficial when you (or your spouse) buy the identical security within 30
        days before or after the sale and still hold it at the window's end: the loss is denied and
        added to the new shares' cost instead of being lost.
      </Text>
      <Text size="2" data-superficial-loss-counts="">
        {confirmed.length} confirmed, {pending.length} pending, {clear.length} clear. Of the
        confirmed losses, {crossAccountRows.length} crossed accounts and {sameAccountRows.length}{" "}
        were same-account.
      </Text>
      {crossAccountRows.length > 0 ? (
        <Flex direction="column" gap="2">
          <Heading size="4" as="h3">
            Crossed accounts (your own doing, avoidable)
          </Heading>
          <CandidatesTable rows={crossAccountRows} />
        </Flex>
      ) : null}
      {split.sameAccount !== null ? (
        <Text size="2" color="gray" data-same-account-summary="">
          {split.sameAccount.count} loss{split.sameAccount.count === 1 ? "" : "es"} deferred by
          direct indexing buying back within 30 days, {formatCurrency(split.sameAccount.total)}{" "}
          total; deferred, not lost.
        </Text>
      ) : null}
      {rest.length > 0 ? (
        <details data-superficial-loss-rest="">
          <summary>
            Show the other {rest.length} sale{rest.length === 1 ? "" : "s"} (same-account, pending
            and clear)
          </summary>
          <CandidatesTable rows={rest} />
        </details>
      ) : null}
      <Text size="1" color="gray">
        The denied amount is not computed here: it depends on replacement shares still held at the
        window's end, which this project's statement ledger cannot state precisely. Check each
        flagged sale before claiming the loss.
      </Text>
    </Flex>
  );
}
