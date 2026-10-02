import { Callout, Flex, Heading } from "@radix-ui/themes";
import type { AttentionItem } from "./summaries";

export interface NeedsAttentionProps {
  items: readonly AttentionItem[];
  year: number;
}

/**
 * Section 3 of the redesign spec: everything the owner needs to act on for
 * `year`, each line carrying its own figure and a "see details" anchor. A
 * single quiet line when nothing qualifies -- never an empty section that
 * reads as broken.
 */
export function NeedsAttention({ items, year }: NeedsAttentionProps) {
  return (
    <Flex direction="column" gap="2" data-needs-attention="">
      <Heading size="5" as="h2">
        Needs attention
      </Heading>
      {items.length === 0 ? (
        <Callout.Root color="gray" size="1" data-attention-empty="">
          <Callout.Text>Nothing needs attention for {year}.</Callout.Text>
        </Callout.Root>
      ) : (
        items.map((item) => (
          <Callout.Root
            key={item.key}
            color="amber"
            highContrast
            size="1"
            data-attention-item={item.key}
          >
            <Callout.Text>
              {item.text} <a href={item.anchor}>See details</a>
            </Callout.Text>
          </Callout.Root>
        ))
      )}
    </Flex>
  );
}
