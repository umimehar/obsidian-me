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

/**
 * A share of the portfolio, to one decimal place: enough to tell two small
 * groups apart without implying a precision the figure does not have.
 *
 * That decimal is the whole point. In the purpose lens Education is 1.6% and
 * Business 21.2%, and rounded to whole percent they read 2% and 21%, which
 * both overstates the small one and collapses the distinction the decimal
 * exists for. Every rendering of a share, visible text and announced value
 * alike, goes through this one function so a card and its bar cannot end up
 * stating the same share two ways.
 */
export function formatShare(share: number): string {
  return new Intl.NumberFormat("en-CA", {
    style: "percent",
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(share);
}
