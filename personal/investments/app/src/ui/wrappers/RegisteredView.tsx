import { Flex, Heading, Text } from "@radix-ui/themes";
import type { AnalyticsOutput } from "../../analytics/build";
import { RoomBar } from "./RoomBar";
import { contributionsSourceFor } from "./roomSource";

export interface RegisteredViewProps {
  analytics: AnalyticsOutput;
  year: number;
}

/**
 * Every registered wrapper's room for one year, read straight off
 * `analytics.rooms[year]` -- nothing is recomputed here. A group with no
 * accounts is absent from that array rather than reported at zero, so an
 * empty list means the corpus covers no registered wrapper that year, which
 * is what the empty state says.
 */
export function RegisteredView({ analytics, year }: RegisteredViewProps) {
  const lines = analytics.rooms[String(year)] ?? [];

  return (
    <Flex direction="column" gap="2">
      <Heading size="5" as="h2">
        Registered wrappers, {year}
      </Heading>
      {lines.length === 0 ? (
        <Text size="2" color="gray">
          No registered wrapper has a statement for {year}.
        </Text>
      ) : (
        lines.map((line) => (
          <RoomBar
            key={line.group}
            line={line}
            contributionsSource={contributionsSourceFor(analytics.series, line.group, year)}
          />
        ))
      )}
    </Flex>
  );
}
