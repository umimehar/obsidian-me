/**
 * The currency formatter every view shares, so a figure cannot read as
 * `$7,000.00` in one card and `$7000` in the next. Cents are always kept: a
 * rounded dollar figure next to a stated statement figure invites a false
 * mismatch. A negative amount keeps its sign, because a loss is a loss.
 *
 * Two deliberate exceptions live in `charts/ValueOverTime.tsx`: a 0-decimal
 * one for the axis ticks, where cents are noise on a $250,000 scale, and a
 * 2-decimal one for the accessible summary, which must not round the ending
 * value the way the axis does. Both are argued in their own comments there.
 * Anything else that formats money belongs here.
 */
export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-CA", {
    style: "currency",
    currency: "CAD",
    minimumFractionDigits: 2,
  }).format(amount);
}
