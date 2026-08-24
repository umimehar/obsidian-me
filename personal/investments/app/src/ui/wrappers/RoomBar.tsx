import { Badge, Card, Flex, Heading, Text } from "@radix-ui/themes";
import type {
  LifetimePosition,
  RegisteredGroup,
  RespGrantPosition,
  RoomLine,
} from "../../analytics/rooms";
import { ShareBar } from "../ShareBar";
import { formatCurrency } from "../format";
import type { ContributionsSource } from "./roomSource";

export interface RoomBarProps {
  line: RoomLine;
  /** From `contributionsSourceFor` -- null when nothing was contributed that year. */
  contributionsSource: ContributionsSource;
}

/**
 * The annual limit block, and the only place the null-remaining contract is
 * expressed visually.
 *
 * Three shapes, never blended:
 * - No annual limit at all (RESP). No ceiling, no bar, no placeholder zero.
 * - An assessed limit. Carry-forward is already inside it, so `remaining` is
 *   a real figure and a fill against it means something.
 * - A generic annual maximum. Carry-forward is invisible in statement data,
 *   so there is no remaining figure and deliberately no fill: a percentage
 *   against an annual maximum would imply a completeness this does not have,
 *   and at used equal to the maximum it would read as a full or blown room
 *   when the person may have years of unused room behind it.
 */
function AnnualLimit({ line }: { line: RoomLine }) {
  if (line.limit === null) {
    return (
      <Text size="2" color="gray">
        No annual contribution limit.
      </Text>
    );
  }

  if (!line.assessed) {
    return (
      <Flex direction="column" gap="1">
        <Text size="2" color="gray">
          Against the {formatCurrency(line.limit)} annual maximum.
        </Text>
        <Text size="2" color="gray">
          Carry-forward not visible in statement data.
        </Text>
      </Flex>
    );
  }

  return (
    <AssessedLimit
      group={line.group}
      limit={line.limit}
      used={line.used}
      remaining={line.remaining}
    />
  );
}

interface AssessedLimitProps {
  group: RegisteredGroup;
  limit: number;
  used: number;
  remaining: number | null;
}

/**
 * An assessed limit's fill and its remaining figure. A remaining below zero
 * is stated as an excess rather than printed with a minus sign, so no line
 * ever renders a negative remaining. The fill is clamped for the same
 * reason -- a bar past its own end says nothing the excess line does not.
 *
 * The bar is `ShareBar`, which announces nothing, and it is the same
 * component the Overview draws for the same reason. It replaced a Radix
 * `Progress`, which derives `aria-valuetext` from the value and rounds to
 * whole percent: this line announced "47%" against a true 46.641% used, and
 * "25%" against 24.921%, the seventh and eighth instances of a figure
 * announced coarser than the one rendered.
 *
 * What makes it the clear case rather than the arguable one: no percentage
 * is printed anywhere on this card. The money is, in full -- `$33,000.00`
 * contributed and `$37,752.00 remaining of $70,752.00` -- so a sighted
 * reader never had the percentage either, and the announcement was the only
 * place it existed. Hiding the bar puts both readers on the same figures
 * instead of handing one an extra number that is wrong. An explicit
 * `aria-valuetext` was rejected for the reason `ShareBar` records: it only
 * helps where the assistive technology honours it over `aria-valuenow` and
 * `aria-valuemax`, and where it does not the same share is recomputed back
 * to a whole percent.
 *
 * The clamp stays here rather than moving into `ShareBar`, because it is
 * this line's rule: only an assessed limit can be exceeded at all, and the
 * excess is already stated in words directly below the bar.
 */
function AssessedLimit({ group, limit, used, remaining }: AssessedLimitProps) {
  const share = limit > 0 ? Math.min(1, Math.max(0, used / limit)) : 0;

  return (
    <Flex direction="column" gap="1">
      <ShareBar label={`${group} room used`} share={share} />
      {remaining === null ? null : <AssessedRemaining limit={limit} remaining={remaining} />}
    </Flex>
  );
}

function AssessedRemaining({ limit, remaining }: { limit: number; remaining: number }) {
  if (remaining < 0) {
    return (
      <Text size="2" color="amber">
        {formatCurrency(-remaining)} over the assessed limit of {formatCurrency(limit)}.
      </Text>
    );
  }
  return (
    <Text size="2" color="gray">
      {formatCurrency(remaining)} remaining of {formatCurrency(limit)}.
    </Text>
  );
}

/**
 * The lifetime contribution position, which unlike the annual one against a
 * generic maximum IS a real remaining: a lifetime cap has no carry-forward
 * to be invisible about.
 */
function LifetimeLine({ position }: { position: LifetimePosition }) {
  return (
    <Text size="2" color="gray">
      Lifetime: {formatCurrency(position.contributed)} of {formatCurrency(position.cap)}{" "}
      contributed, {formatCurrency(position.remaining)} remaining.
    </Text>
  );
}

/**
 * The RESP's grant position. `maximizingContribution` is stated as what
 * attracts the maximum basic grant in a normal year, never as a limit --
 * RESP has no annual contribution limit, and unused grant room carries
 * forward, so a catch-up year can attract grant on more than this.
 */
function GrantLine({ grant }: { grant: RespGrantPosition }) {
  return (
    <Flex direction="column" gap="1" data-cesg-line="">
      <Text size="2" color="gray">
        CESG received: {formatCurrency(grant.received)} of the {formatCurrency(grant.cap)} lifetime
        cap.
      </Text>
      <Text size="2" color="gray">
        {formatCurrency(grant.maximizingContribution)} a year attracts the maximum basic grant.
      </Text>
    </Flex>
  );
}

/**
 * One registered wrapper's room for one year. Every uncertain figure is
 * labelled rather than rounded off into a number: the derived marker, the
 * assessed marker, and the carry-forward caveat all exist so a reader can
 * tell a stated figure from a reconstructed one and a real ceiling from a
 * generic one.
 *
 * `data-room-line` is a stable test hook, not styling.
 */
export function RoomBar({ line, contributionsSource }: RoomBarProps) {
  return (
    <Card mb="3" data-room-line={line.group}>
      <Flex direction="column" gap="2">
        <Flex justify="between" align="center" gap="2" wrap="wrap">
          <Heading size="3" as="h3">
            {line.group}
          </Heading>
          <Flex gap="2">
            {line.assessed ? (
              <Badge color="jade" variant="soft" highContrast>
                From your notice of assessment
              </Badge>
            ) : null}
            {contributionsSource === "derived" ? (
              <Badge color="amber" variant="soft" highContrast>
                Derived, not printed on the statement
              </Badge>
            ) : null}
          </Flex>
        </Flex>

        <Flex justify="between" align="baseline">
          <Text size="2" color="gray">
            Contributed in {line.year}
          </Text>
          <Text size="5" weight="bold">
            {formatCurrency(line.used)}
          </Text>
        </Flex>

        <AnnualLimit line={line} />

        {line.spousalUsed !== null && line.spousalUsed > 0 ? (
          <Text size="2" color="gray">
            Includes {formatCurrency(line.spousalUsed)} to a spousal RRSP, which counts against your
            own room.
          </Text>
        ) : null}

        {line.lifetimeContributions !== null ? (
          <LifetimeLine position={line.lifetimeContributions} />
        ) : null}

        {line.lifetimeGrant !== null ? <GrantLine grant={line.lifetimeGrant} /> : null}
      </Flex>
    </Card>
  );
}
