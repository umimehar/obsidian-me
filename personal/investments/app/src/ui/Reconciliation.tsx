import { Badge, Box, Card, Flex, Heading, Text } from "@radix-ui/themes";
import type { ReconciliationReport, ReportedFinding } from "../validate/report";
import { type FindingGroup, groundTruthFinding, groupFindings } from "./findings";
import { formatCurrency } from "./format";

export interface ReconciliationProps {
  report: ReconciliationReport;
}

/** Human wording for a check's machine name, so the page never prints an identifier at a reader. */
const CHECK_LABELS: Readonly<Record<string, string>> = {
  "statement-arithmetic": "Statement arithmetic",
  "missing-portfolio": "Missing portfolio",
  "cash-continuity": "Cash continuity",
  "coverage-gap": "Coverage gaps",
  "cross-document": "Across documents",
  superseded: "Superseded statements",
  "kind-drift": "Account type drift",
  "style-drift": "Management style drift",
  "balance-chain": "Balance chain",
  ingest: "Ingestion",
  "ground-truth": "Against the app",
};

/** A group this large is opened on request; anything at or below it, and every group carrying an error, is open already. */
const COLLAPSE_ABOVE = 12;

function checkLabel(check: string): string {
  return CHECK_LABELS[check] ?? check;
}

function plural(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

/**
 * One labelled figure. Rendered only by callers that have already checked
 * the figure is not null: a check that could not compute a number leaves it
 * null, and a null drawn as $0.00 would be this page inventing a figure on
 * the one screen whose entire purpose is not to.
 */
function FigureRow({ label, value }: { label: string; value: number }) {
  return (
    <Flex justify="between" align="baseline" gap="4" py="1">
      <Text size="2" color="gray">
        {label}
      </Text>
      <Text size="2">{formatCurrency(value)}</Text>
    </Flex>
  );
}

/**
 * The reason an acknowledgement gives, with the badge that marks the finding
 * as expected. It never replaces the finding: the figures stay on the page
 * above it, because an acknowledgement explains a discrepancy and does not
 * cancel one.
 */
function Reason({ reason }: { reason: string }) {
  return (
    <Flex direction="column" gap="1" mt="2" data-recon-reason="">
      <Box>
        <Badge color="jade" variant="soft">
          Acknowledged
        </Badge>
      </Box>
      <Text size="2" color="gray">
        {reason}
      </Text>
    </Flex>
  );
}

/**
 * The headline: what this system computes for the whole portfolio against
 * what the owner read off the Wealthsimple app on the day, and the gap
 * between them. `expected` and `actual` are the field names on the finding,
 * but they read backwards here, so both are labelled by what they are.
 */
function GroundTruth({ finding }: { finding: ReportedFinding }) {
  return (
    <Card data-recon-ground-truth="">
      <Flex direction="column" gap="2">
        <Heading size="4" as="h3">
          Against the Wealthsimple app, {finding.period}
        </Heading>
        <Text size="2" color="gray">
          {finding.message}
        </Text>
        {finding.actual === null ? null : (
          <FigureRow label="This system computes" value={finding.actual} />
        )}
        {finding.expected === null ? null : (
          <FigureRow label="The app showed" value={finding.expected} />
        )}
        {finding.delta === null ? null : <FigureRow label="Difference" value={finding.delta} />}
        {finding.reason === null ? null : <Reason reason={finding.reason} />}
        <Text size="1" color="gray">
          The reason above is on record, not proven. It has not been tested against an amended
          statement, so the difference stands.
        </Text>
      </Flex>
    </Card>
  );
}

/** The stated figure against the computed one, for any finding that is not the ground-truth line. */
function Figures({ finding }: { finding: ReportedFinding }) {
  return (
    <Flex direction="column">
      {finding.expected === null ? null : <FigureRow label="Stated" value={finding.expected} />}
      {finding.actual === null ? null : <FigureRow label="Computed" value={finding.actual} />}
      {finding.delta === null ? null : <FigureRow label="Difference" value={finding.delta} />}
    </Flex>
  );
}

function FindingRow({ finding }: { finding: ReportedFinding }) {
  return (
    <Card mb="2" data-finding-row="">
      <Flex direction="column" gap="1">
        <Flex justify="between" align="baseline" gap="2" wrap="wrap">
          <Text size="2" weight="bold">
            {finding.accountShortId} {finding.period}
          </Text>
          <Badge color={finding.severity === "error" ? "red" : "amber"} variant="soft">
            {finding.severity === "error" ? "Error" : "Warning"}
          </Badge>
        </Flex>
        <Text size="2">{finding.message}</Text>
        <Figures finding={finding} />
        {finding.sourceFile === "" ? null : (
          <Text size="1" color="gray">
            {finding.sourceFile}
          </Text>
        )}
        {finding.reason === null ? null : <Reason reason={finding.reason} />}
      </Flex>
    </Card>
  );
}

function groupSummary(group: FindingGroup): string {
  const parts = [plural(group.findings.length, "finding")];
  if (group.errorCount > 0) parts.push(plural(group.errorCount, "error"));
  if (group.warningCount > 0) parts.push(plural(group.warningCount, "warning"));
  if (group.acknowledgedCount > 0) parts.push(`${group.acknowledgedCount} acknowledged`);
  return parts.join(", ");
}

/**
 * One check's findings. `<details>` rather than a button and a state hook:
 * it is keyboard reachable and screen-reader announced without any code
 * here, and its contents stay in the DOM either way, so a collapsed group
 * is a disclosure and not a filter. Groups carrying an error open by
 * default, so an error is never one click away from being missed.
 */
function GroupSection({ group }: { group: FindingGroup }) {
  const open = group.errorCount > 0 || group.findings.length <= COLLAPSE_ABOVE;
  return (
    <details open={open} data-finding-group={group.check}>
      <summary style={{ padding: "0.5rem 0" }}>
        <Text size="3" weight="bold">
          {checkLabel(group.check)}
        </Text>
        <Text size="2" color="gray">
          {" "}
          {groupSummary(group)}
        </Text>
      </summary>
      <Box pt="2">
        {/* Indexed keys: two findings can be identical in check, account, period and
            message (the CAD credits and debits pair on one statement), so nothing
            on a finding identifies it uniquely. The list is static per report. */}
        {group.findings.map((finding, index) => (
          <FindingRow key={`${group.check}-${index}`} finding={finding} />
        ))}
      </Box>
    </details>
  );
}

/**
 * What the system got wrong, or cannot yet explain, shown as data. A visible
 * wrong number beats a clean dashboard that is quietly off, so nothing here
 * is filtered: acknowledged findings keep their figures and gain a reason,
 * and the 84 rounding warnings are collapsed behind a summary that states
 * their own count rather than dropped.
 */
export function Reconciliation({ report }: ReconciliationProps) {
  const truth = groundTruthFinding(report.findings);
  const groups = groupFindings(report.findings);
  const errors = report.findings.filter((f) => f.severity === "error").length;
  const acknowledged = report.findings.filter((f) => f.acknowledged).length;

  return (
    <Flex direction="column" gap="3" data-recon="">
      <Heading size="5" as="h2">
        Reconciliation
      </Heading>

      <Card data-recon-summary="">
        <Text size="2" color="gray">
          {plural(report.statementCount, "statement")} checked.{" "}
          {plural(report.findings.length, "finding")}: {plural(errors, "error")},{" "}
          {plural(report.findings.length - errors, "warning")}, {acknowledged} acknowledged.
        </Text>
      </Card>

      {truth === null ? (
        <Card>
          <Text size="2" color="gray">
            No figure from the app to compare against yet. Add an observation to truth.ts once you
            have read one off.
          </Text>
        </Card>
      ) : (
        <GroundTruth finding={truth} />
      )}

      {groups.length === 0 ? (
        <Card>
          <Text size="2" color="gray">
            No check reported anything against this corpus.
          </Text>
        </Card>
      ) : (
        groups.map((group) => <GroupSection key={group.check} group={group} />)
      )}
    </Flex>
  );
}
