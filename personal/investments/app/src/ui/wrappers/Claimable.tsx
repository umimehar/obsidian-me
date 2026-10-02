import { Flex, Heading, Table, Text } from "@radix-ui/themes";
import type { ClaimableLine, ClaimableTreatment, ClaimableYear } from "../../analytics/claimable";
import { formatCurrency } from "../format";

const TREATMENT_LABEL: Record<ClaimableTreatment, string> = {
  "foreign-tax-credit": "Foreign tax credit",
  "carrying-charge": "Deductible carrying charge",
  "excluded-registered": "Excluded, registered account",
  "not-deductible": "Already inside your cost base and sale proceeds",
  "ask-accountant": "Ask the accountant",
};

interface ClaimableGroupDef {
  key: string;
  title: string;
  treatments: readonly ClaimableTreatment[];
}

const GROUPS: readonly ClaimableGroupDef[] = [
  { key: "deductions", title: "Deductions", treatments: ["carrying-charge"] },
  { key: "credits", title: "Credits", treatments: ["foreign-tax-credit"] },
  {
    key: "not-claimable",
    title: "Not claimable",
    treatments: ["excluded-registered", "not-deductible"],
  },
  { key: "ask-accountant", title: "Ask the accountant", treatments: ["ask-accountant"] },
];

function ClaimableRow({ line }: { line: ClaimableLine }) {
  const hasNoAmount = line.conversionVolume !== null;
  return (
    <Table.Row data-claimable-row={`${line.maskedId}:${line.treatment}`}>
      <Table.RowHeaderCell>{line.label}</Table.RowHeaderCell>
      <Table.Cell>
        {line.what}
        {line.conversionVolume !== null ? (
          <Text as="p" size="1" color="gray" data-conversion-volume="">
            CAD converted: {formatCurrency(line.conversionVolume)} (volume, not a fee)
          </Text>
        ) : null}
      </Table.Cell>
      <Table.Cell className="ivt-num" data-claimable-amount="">
        {hasNoAmount ? "Not stated separately" : formatCurrency(line.amount)}
      </Table.Cell>
      <Table.Cell>{line.form ?? "Ask the accountant"}</Table.Cell>
      <Table.Cell data-claimable-treatment={line.treatment}>
        {TREATMENT_LABEL[line.treatment]}
      </Table.Cell>
    </Table.Row>
  );
}

function ClaimableGroup({ group, lines }: { group: ClaimableGroupDef; lines: ClaimableLine[] }) {
  if (lines.length === 0) return null;
  // A conversion-volume line never carries a claimable amount (see
  // `commissionsLine`'s own doc) -- excluded again here, belt and
  // suspenders, so a future line that forgets to zero its `amount` cannot
  // silently inflate a subtotal with a currency-conversion volume.
  const subtotal = lines
    .filter((l) => l.conversionVolume === null)
    .reduce((sum, l) => sum + l.amount, 0);
  return (
    <Flex direction="column" gap="2" data-claimable-group={group.key}>
      <Heading size="4" as="h3">
        {group.title}
      </Heading>
      <div className="ivt-table-scroll">
        <Table.Root data-claimable-table={group.key} variant="surface" size="1">
          <Table.Header>
            <Table.Row>
              <Table.ColumnHeaderCell>Account</Table.ColumnHeaderCell>
              <Table.ColumnHeaderCell>What</Table.ColumnHeaderCell>
              <Table.ColumnHeaderCell>Amount</Table.ColumnHeaderCell>
              <Table.ColumnHeaderCell>Form / line</Table.ColumnHeaderCell>
              <Table.ColumnHeaderCell>Treatment</Table.ColumnHeaderCell>
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {lines.map((line) => (
              <ClaimableRow key={`${line.maskedId}:${line.treatment}:${line.what}`} line={line} />
            ))}
          </Table.Body>
        </Table.Root>
      </div>
      <Text size="2" data-claimable-group-subtotal={group.key}>
        {group.title} subtotal: <Text weight="bold">{formatCurrency(subtotal)}</Text>
      </Text>
    </Flex>
  );
}

/**
 * Section 8 of the redesign spec: every claimable or excluded item for the
 * year, grouped into Deductions, Credits, Not claimable (with why) and Ask
 * the accountant, each with its own subtotal. Nothing is dropped silently --
 * a registered account's fee lands in "Not claimable" rather than vanishing.
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
    <Flex direction="column" gap="3" id="claimable">
      <Heading size="5" as="h2">
        Claimable
      </Heading>
      {GROUPS.map((group) => (
        <ClaimableGroup
          key={group.key}
          group={group}
          lines={year.lines.filter((l) => group.treatments.includes(l.treatment))}
        />
      ))}
    </Flex>
  );
}
