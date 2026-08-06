/**
 * The currency formatter every view shares, so a figure cannot read as
 * `$7,000.00` in one card and `$7000` in the next. Cents are always kept: a
 * rounded dollar figure next to a stated statement figure invites a false
 * mismatch. A negative amount keeps its sign, because a loss is a loss.
 *
 * One deliberate exception lives in `charts/plot.ts`: `formatAxisCurrency`,
 * a 0-decimal formatter for the axis ticks, where cents are noise on a
 * $250,000 scale. It is argued in its own comment there, and it is confined
 * to the ticks -- every accessible summary, every tooltip and every bar
 * label formats through this function, so a summary can never announce a
 * coarser figure than the one on screen. Anything else that formats money
 * belongs here.
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

/**
 * A return rate, already in percent, to two decimal places.
 *
 * Two is the precision Wealthsimple's own statements print: `3.22`, `-4.01`,
 * `17.15`. Rounding further would state a rate the statement does not, and
 * this project has four times shipped an announced figure coarser than the
 * printed one. Every rendering of a rate goes through here, tooltip and
 * accessible name alike, so the two cannot disagree.
 *
 * The value is a rate in percent, not a fraction, so it is formatted as a
 * plain number with a percent sign rather than through `style: "percent"`,
 * which would divide it by a hundred.
 */
export function formatRate(rate: number): string {
  const digits = new Intl.NumberFormat("en-CA", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(rate);
  return `${digits}%`;
}
