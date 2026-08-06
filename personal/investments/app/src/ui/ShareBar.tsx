import { formatShare } from "./format";

export interface ShareBarProps {
  /** The group's name, so the bar says which group's share it is. */
  label: string;
  /** The group's total over the portfolio total, as a fraction of one. */
  share: number;
}

/**
 * One group's share of the portfolio, as a bar against a full hundred
 * percent. It sits beside the card's own `20.4% of total` text and beside
 * the sparkline, and the three say different things: the text is the figure,
 * the bar is that figure against the whole, and the sparkline is the shape
 * over time. Only the bar makes a small group visibly small.
 *
 * This is a plain element rather than Radix's `Progress` on purpose. That
 * component derives `aria-valuetext` from the value and rounds it to whole
 * percent, so a card reading `1.6% of total` announced `2%` and a card
 * reading `20.4%` announced `20%`. Both shipped. Here the announced value is
 * `formatShare`'s own output, the same call the visible text makes, so the
 * two cannot say different things about one figure.
 *
 * It is deliberately not a tab stop. A progressbar here is a read-only
 * graphic rather than a widget, and a stop on every group card that does
 * nothing when it is reached is worse than no stop at all.
 */
export function ShareBar({ label, share }: ShareBarProps) {
  const percent = share * 100;
  return (
    // biome-ignore lint/a11y/useFocusableInteractive: read-only bar, see the note above
    <div
      role="progressbar"
      aria-label={`${label} share of the portfolio`}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={percent}
      aria-valuetext={formatShare(share)}
      data-share-bar=""
      style={{
        background: "var(--gray-a4)",
        borderRadius: "var(--radius-1)",
        height: 6,
        overflow: "hidden",
        width: "100%",
      }}
    >
      <div
        data-share-bar-fill=""
        style={{
          background: "var(--jade-a11)",
          borderRadius: "var(--radius-1)",
          height: "100%",
          width: `${percent}%`,
        }}
      />
    </div>
  );
}
