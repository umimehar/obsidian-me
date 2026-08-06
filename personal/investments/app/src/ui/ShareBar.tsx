export interface ShareBarProps {
  /** The group's name. Used by nothing an assistive technology reads, see below. */
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
 * It announces nothing at all, and that is the point.
 *
 * The bar this replaces was a Radix `Progress`, which derives
 * `aria-valuetext` from the value and rounds to whole percent, so a card
 * reading `1.6% of total` announced `2%`. An explicit `aria-valuetext` fixes
 * that only where the assistive technology honours it over
 * `aria-valuenow`/`aria-valuemax`; where it does not, the same 1.6% is
 * computed back to `2%`. Defending a precision rule with an attribute whose
 * precedence is an implementation detail is not defending it. The adjacent
 * text already carries the figure at the right precision, so this is
 * `aria-hidden` decoration and the failure mode is gone rather than guarded.
 *
 * `label` is kept because the card owns the naming of its own bar if this
 * ever becomes exposed again, and dropping it would make that a two-file
 * change.
 */
export function ShareBar({ label, share }: ShareBarProps) {
  const percent = share * 100;
  return (
    <div
      aria-hidden="true"
      data-share-bar={label}
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
