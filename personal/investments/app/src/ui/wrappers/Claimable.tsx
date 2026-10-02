import { Flex, Heading, Table, Text } from "@radix-ui/themes";
import type { ClaimableLine, ClaimableYear } from "../../analytics/claimable";
import { formatCurrency } from "../format";

const TREATMENT_LABEL: Record<ClaimableLine["treatment"], string> = {
  "foreign-tax-credit": "Foreign tax credit",
  "carrying-charge": "Deductible carrying charge",
  "excluded-registered": "Excluded -- registered account",
  "not-deductible": "Not deductible -- adjusts ACB/proceeds",
  "ask-accountant": "Ask the accountant",
};

function ClaimableRow({ line }: { line: ClaimableLine }) {
  return (
    <Table.Row data-claimable-row={`${line.maskedId}:${line.treatment}`}>
      <Table.RowHeaderCell>{line.label}</Table.RowHeaderCell>
      <Table.Cell>{line.what}</Table.Cell>
      <Table.Cell>{formatCurrency(line.amount)}</Table.Cell>
      <Table.Cell>{line.form ?? "—"}</Table.Cell>
      <Table.Cell data-claimable-treatment={line.treatment}>
        {TREATMENT_LABEL[line.treatment]}
      </Table.Cell>
      <Table.Cell>
        {line.taxEffectEstimate === null
          ? "—"
          : `${formatCurrency(line.taxEffectEstimate)} (estimate)`}
      </Table.Cell>
    </Table.Row>
  );
}

/**
 * Every deductible expense and creditable tax for the year, in one table:
 * what it is, the amount per account, the form/line it belongs to, and a
 * treatment label. Nothing here is dropped silently -- a registered
 * account's fee is listed as excluded rather than omitted, so the owner
 * sees why it does not reduce anything.
 */
export function Claimable({ year }: { year: ClaimableYear }) {
  if (year.lines.length === 0) {
    return (
      <Text size="2" color="gray" data-claimable-empty="">
        No claimable fees, credits or costs this year.
      </Text>
    );
  }
  return (
    <Flex direction="column" gap="3">
      <Heading size="5" as="h2">
        Claimable
      </Heading>
      <Table.Root data-claimable-table="" variant="surface">
        <Table.Header>
          <Table.Row>
            <Table.ColumnHeaderCell>Account</Table.ColumnHeaderCell>
            <Table.ColumnHeaderCell>What</Table.ColumnHeaderCell>
            <Table.ColumnHeaderCell>Amount</Table.ColumnHeaderCell>
            <Table.ColumnHeaderCell>Form / line</Table.ColumnHeaderCell>
            <Table.ColumnHeaderCell>Treatment</Table.ColumnHeaderCell>
            <Table.ColumnHeaderCell>Tax effect</Table.ColumnHeaderCell>
          </Table.Row>
        </Table.Header>
        <Table.Body>
          {year.lines.map((line) => (
            <ClaimableRow key={`${line.maskedId}:${line.treatment}:${line.what}`} line={line} />
          ))}
        </Table.Body>
      </Table.Root>
      <Flex direction="column" gap="1">
        <Text size="2" data-claimable-deductions-total="">
          Deductions total: <Text weight="bold">{formatCurrency(year.deductionsTotal)}</Text>,
          estimated tax effect {formatCurrency(year.deductionsTaxEffectEstimate)}
        </Text>
        <Text size="2" data-claimable-credits-total="">
          Credits total: <Text weight="bold">{formatCurrency(year.creditsTotal)}</Text>
        </Text>
      </Flex>
    </Flex>
  );
}
