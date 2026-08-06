/**
 * The one currency formatter every view shares, so a figure cannot read as
 * `$7,000.00` in one card and `$7000` in the next. Cents are always kept: a
 * rounded dollar figure next to a stated statement figure invites a false
 * mismatch. A negative amount keeps its sign, because a loss is a loss.
 */
export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-CA", {
    style: "currency",
    currency: "CAD",
    minimumFractionDigits: 2,
  }).format(amount);
}
