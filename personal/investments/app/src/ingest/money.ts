const MONEY = /^[–−-]?\$?-?[\d,]+\.\d+$/;

/**
 * Parses a money token to dollars. Three negative forms appear in the corpus: a
 * leading hyphen, a leading en dash (CASH template), and a minus placed after
 * the dollar sign (managed brokerage balance column). The sign is looked for
 * anywhere before the first digit, which is what makes the third form work.
 */
export function parseMoney(raw: string): number {
  const trimmed = raw.trim();
  const firstDigit = trimmed.search(/\d/);
  const prefix = firstDigit === -1 ? trimmed : trimmed.slice(0, firstDigit);
  const negative = /[-–−]/.test(prefix) || (trimmed.startsWith("(") && trimmed.endsWith(")"));
  const digits = trimmed.replace(/[$,()\s–−-]/g, "");

  if (digits === "" || !/^\d+(\.\d+)?$/.test(digits)) {
    throw new Error(`unparseable money: ${JSON.stringify(raw)}`);
  }
  return negative ? -Number(digits) : Number(digits);
}

/**
 * True for the money tokens the corpus actually prints -- always to the
 * cent, so a decimal point is required here. This is narrower than
 * `parseMoney`: `parseMoney("$50")` succeeds (no decimal required), but
 * `isMoney("$50")` is false. Percentages are deliberately excluded too.
 */
export function isMoney(text: string): boolean {
  return MONEY.test(text.trim());
}
