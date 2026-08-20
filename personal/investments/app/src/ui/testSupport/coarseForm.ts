import { expect } from "bun:test";

/**
 * The whole-dollar form of a figure, rounded the way a reader would round it
 * -- never assumed to be a truncation. Shared by every test that guards
 * against an announced or rendered figure quietly reverting to its coarser
 * axis-precision form: several of this project's real figures round UP
 * ($92,547.67 to $92,548, not $92,547), so a truncated guess would miss
 * exactly the direction the project's own ancestor defect (`plot.ts`'s
 * $241,740 beside $241,739.67) took.
 */
export function coarseForm(amount: number): string {
  return new Intl.NumberFormat("en-CA", {
    style: "currency",
    currency: "CAD",
    maximumFractionDigits: 0,
  }).format(amount);
}

/**
 * Fails unless the coarse, whole-dollar form of `amount` is absent from
 * `text` as its own standalone reading. Some real figures round DOWN
 * ($50,180.10 to $50,180), which makes the coarse form a literal prefix of
 * the precise one -- a plain `not.toContain` would fail on text printing
 * only the correct precise figure, since the prefix is still there as its
 * leading digits. The negative lookahead accepts that prefix only when a
 * digit follows the period, since only a digit continues the coarse prefix
 * into the real figure's cents -- `(?!\.)` alone was tried first and missed
 * a sentence-final coarse figure, where a period follows the digits too but
 * ends the sentence rather than introducing cents.
 */
export function expectNoCoarseForm(text: string, amount: number): void {
  const escaped = coarseForm(amount).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  expect(text).not.toMatch(new RegExp(`${escaped}(?!\\.\\d)`));
}
