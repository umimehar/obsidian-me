/**
 * The currency formatter every view shares, so a figure cannot read as
 * `$7,000.00` in one card and `$7000` in the next. Cents are always kept: a
 * rounded dollar figure next to a stated statement figure invites a false
 * mismatch. A negative amount keeps its sign, because a loss is a loss.
 *
 * One deliberate exception lives in `charts/ValueOverTime.tsx`: a 0-decimal
 * formatter for the axis ticks, where cents are noise on a $250,000 scale.
 * It is argued in its own comment there, and it is confined to the ticks --
 * every accessible summary, including both charts', formats through this
 * function, so a summary can never announce a coarser figure than the one
 * on screen. Anything else that formats money belongs here.
 */
export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-CA", {
    style: "currency",
    currency: "CAD",
    minimumFractionDigits: 2,
  }).format(amount);
}
