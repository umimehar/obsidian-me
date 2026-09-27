/**
 * The currency formatter every view shares, so a figure cannot read as
 * `$7,000.00` in one card and `$7000` in the next. Cents are always kept: a
 * rounded dollar figure next to a stated statement figure invites a false
 * mismatch. A negative amount keeps its sign, because a loss is a loss.
 *
 * The one deliberate 0-decimal exception is `formatWholeDollars` below --
 * every accessible summary, every tooltip and every bar label still formats
 * through this function, so a summary can never announce a coarser figure
 * than the one on screen. Anything else that formats money belongs here.
 */
export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-CA", {
    style: "currency",
    currency: "CAD",
    minimumFractionDigits: 2,
  }).format(amount);
}

/**
 * A whole-dollar figure with thousands separators, no cents.
 *
 * Confined to two contexts where cents are noise on a large, round figure:
 * a chart axis tick (`charts/plot.ts`'s `formatAxisCurrency` delegates here
 * rather than keeping its own `Intl.NumberFormat`, so the two never drift
 * apart) and a statutory lifetime cap like the room runway's $40,000 FHSA
 * bound. Both are one call to this function, not a second definition of it --
 * this codebase has been sent back three times for exactly that (a second
 * `latestMarketValue`, four kind-to-group tables, and a `money()` that
 * put a negative sign in the wrong place).
 */
export function formatWholeDollars(amount: number): string {
  return new Intl.NumberFormat("en-CA", {
    style: "currency",
    currency: "CAD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

/**
 * `formatCurrency`, with an explicit leading "+" on a nonnegative amount.
 *
 * `Intl` already prints its own minus sign for a negative amount, so a loss
 * passes straight through `formatCurrency` untouched; this only adds the
 * "+" a gain does not otherwise carry. The sign is the one channel that
 * survives without colour: in greyscale, forced-colours mode, or for a
 * colour-blind reader, "+$4,786.22" and "-$45.04" still read correctly on
 * their own, before any green or red is applied. The digits themselves
 * still come from the one `formatCurrency` call, so an accessible name
 * built from this cannot state a different figure than what is printed.
 */
export function formatSignedCurrency(amount: number): string {
  const formatted = formatCurrency(amount);
  return amount >= 0 ? `+${formatted}` : formatted;
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

/**
 * A gain or loss against a base, with its own percentage in brackets:
 * `+$16,638.34 (+7.12%)`.
 *
 * One call produces both halves, for the same reason `formatSignedCurrency`
 * exists: the dollar figure and the percentage are two statements of one
 * fact, and this project has shipped an announced figure disagreeing with a
 * rendered one eight times. A caller that formatted the percentage itself
 * would be the ninth.
 *
 * The percentage is a RETURN on the base, so it goes through `formatRate`
 * at two decimals rather than `formatShare` at one: it is the same kind of
 * figure as the fitted rate beside it in the projections, not a share of a
 * whole. Both signs are explicit, so the pair reads correctly in greyscale
 * and in forced-colours mode with no green or red applied.
 *
 * A zero or negative base yields the dollar figure ALONE, with no bracket.
 * That is not a formatting nicety: this corpus opens at 2023-06 with two
 * accounts holding a real $0.00 of book cost, and a percentage there is a
 * division by zero. `Infinity%` and `NaN%` are both figures the data does
 * not support, and an omitted bracket says so honestly.
 */
export function formatGainWithShare(gain: number, base: number): string {
  const amount = formatSignedCurrency(gain);
  if (base <= 0) return amount;
  const percent = (gain / base) * 100;
  const sign = percent >= 0 ? "+" : "";
  return `${amount} (${sign}${formatRate(percent)})`;
}
