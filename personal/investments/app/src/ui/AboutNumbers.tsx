import { Text } from "@radix-ui/themes";

export interface AboutNumbersProps {
  notes: readonly string[];
}

/**
 * One caveat note per tab, in a native disclosure rather than printed inline
 * on every card that would otherwise repeat it.
 *
 * `GroupGainLine`'s USD book-cost sentence used to print once per group card
 * plus once on the headline -- the same caveat repeated seven or eight
 * times on the Portfolio tab alone. A caveat that repeats belongs here,
 * once; a caveat that appears only once on its own card stays there.
 */
export function AboutNumbers({ notes }: AboutNumbersProps) {
  if (notes.length === 0) return null;
  return (
    <details data-about-numbers="">
      <summary>About these numbers</summary>
      {notes.map((note) => (
        <Text key={note} as="p" size="2" color="gray" mt="2">
          {note}
        </Text>
      ))}
    </details>
  );
}
