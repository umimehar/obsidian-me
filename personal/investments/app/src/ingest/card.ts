import { type Page, type Row, findRow, labelEndX, rowText } from "./geometry";
import { isMoney, parseMoney } from "./money";

/**
 * A Wealthsimple credit card statement.
 *
 * A credit card is NOT an investment account, and nothing in this file feeds
 * the portfolio. A card balance is money owed, so folding it into a total
 * built from money held would overstate the portfolio by the amount of a
 * debt -- which is why it lives in its own datastore, its own build and its
 * own view rather than in `Statement`. The two pipelines share the geometry
 * and money parsing and nothing else.
 */
export interface CardStatement {
  /** Masked filename, as the datastore writes it. Never the raw one. */
  file: string;
  /** Masked card id, from `maskCardNumber`. */
  cardId: string;
  /** `YYYY-MM` of the statement date, so a card period sorts beside a statement period. */
  period: string;
  periodStart: string;
  periodEnd: string;
  statementDate: string;
  paymentDueDate: string;
  /** As printed under STATEMENT BALANCE. Equal to `newBalance` on every statement seen so far, but a separately printed figure. */
  statementBalance: number;
  creditLimit: number;
  previousBalance: number;
  newBalance: number;
  minimumPayment: number;
  purchases: number;
  payments: number;
  otherCredits: number;
  fees: number;
  interest: number;
  cashAdvances: number;
  /** Annual interest rates, as fractions. */
  purchaseRate: number;
  cashAdvanceRate: number;
  activity: CardActivityRow[];
}

export interface CardActivityRow {
  transactionDate: string;
  postedDate: string;
  /** As printed: Purchase, Payment, Refund, Fee, Interest. */
  type: string;
  description: string;
  /** Positive is a charge, negative is a payment or credit -- the statement's own sign. */
  amount: number;
}

const MONTHS: Record<string, string> = {
  Jan: "01",
  Feb: "02",
  Mar: "03",
  Apr: "04",
  May: "05",
  Jun: "06",
  Jul: "07",
  Aug: "08",
  Sep: "09",
  Oct: "10",
  Nov: "11",
  Dec: "12",
};

/** "Jun 25 — Jul 24, 2026", the header's own period line. The dash is an em dash. */
const PERIOD = /\b(\w{3}) (\d{1,2})\s*[—–-]\s*(\w{3}) (\d{1,2}), (\d{4})\b/;
/** "Statement date July 25, 2026" and "Aug 18, 2026" both appear; long and short month names. */
const LONG_DATE = /\b(\w{3,9}) (\d{1,2}), (\d{4})\b/;
const ACTIVITY_ROW =
  /^(\w{3}) (\d{1,2})\s+(\w{3}) (\d{1,2})\s+(Purchase|Payment|Refund|Fee|Interest|Cash advance)\s+(.*?)\s+([–−-]?\$[\d,]+\.\d{2})$/;
const RATE = /(\d+\.\d+)%/;

function monthNumber(name: string): string | undefined {
  return MONTHS[name.slice(0, 3)];
}

/**
 * A credit card's billing period straddles two calendar months and, unlike
 * every other statement here, its year is printed once at the end. A period
 * that starts in December and ends in January therefore has to roll the start
 * year back, which is what the end-before-start comparison does.
 */
function readPeriod(pages: readonly Page[]): { start: string; end: string } {
  const row = findRow(pages, PERIOD);
  const m = row ? PERIOD.exec(rowText(row)) : null;
  const startMonth = m?.[1] ? monthNumber(m[1]) : undefined;
  const endMonth = m?.[3] ? monthNumber(m[3]) : undefined;
  if (!m || !startMonth || !endMonth || !m[2] || !m[4] || !m[5]) {
    throw new Error("could not find the card statement period");
  }
  const pad = (n: string) => n.padStart(2, "0");
  const endYear = Number(m[5]);
  const startYear = startMonth > endMonth ? endYear - 1 : endYear;
  return {
    start: `${startYear}-${startMonth}-${pad(m[2])}`,
    end: `${endYear}-${endMonth}-${pad(m[4])}`,
  };
}

/** An ISO date from a row matching `label`, e.g. the statement date or the payment due date. */
function readLabelledDate(pages: readonly Page[], label: RegExp): string {
  const row = findRow(pages, label);
  const m = row ? LONG_DATE.exec(rowText(row)) : null;
  const month = m?.[1] ? monthNumber(m[1]) : undefined;
  if (!m || !month || !m[2] || !m[3]) {
    throw new Error(`could not find a date on the ${label.source} row`);
  }
  return `${m[3]}-${month}-${m[2].padStart(2, "0")}`;
}

/**
 * The first money token to the RIGHT of `label` on the row that carries it.
 *
 * Position, not order-in-row: the account summary prints TWO labelled figures
 * per line -- "- Payments $711.02   + Purchases $651.27" -- so taking the
 * row's first money token reads Payments' figure for Purchases, and taking
 * its last reads Purchases' figure for Payments. Both are wrong on the same
 * row, and both are wrong by a plausible amount, which is the kind of error
 * that survives review.
 */
function readMoney(pages: readonly Page[], label: RegExp): number {
  const row = findRow(pages, label);
  const x = row ? labelEndX(row, label) : null;
  if (!row || x === null) throw new Error(`could not find the ${label.source} row`);
  const value = row.words.find((w) => w.x0 >= x && isMoney(w.text));
  if (value === undefined) {
    throw new Error(`could not find a figure to the right of ${label.source}`);
  }
  return parseMoney(value.text);
}

/**
 * A figure printed UNDER its column header rather than beside it -- the
 * statement balance and the payment due date sit on the row below the
 * "STATEMENT BALANCE / PAYMENT DUE DATE" header, not on it.
 */
function rowBelow(pages: readonly Page[], header: RegExp): Row {
  const rows = pages.flatMap((p) => p.rows);
  const index = rows.findIndex((r) => header.test(rowText(r)));
  const below = index === -1 ? undefined : rows[index + 1];
  if (below === undefined) throw new Error(`no row below the ${header.source} header`);
  return below;
}

function readRate(pages: readonly Page[], label: RegExp): number {
  const row = findRow(pages, label);
  const m = row ? RATE.exec(rowText(row)) : null;
  if (!m?.[1]) throw new Error(`could not find a rate on the ${label.source} row`);
  return Number(m[1]) / 100;
}

/**
 * Activity rows, in the order the statement prints them.
 *
 * Each row carries its own transaction and posted dates but no year -- the
 * period supplies it, and a row whose month is the period's start month takes
 * the start year. That is what keeps a December transaction on a
 * December-to-January statement in the right year.
 */
function readActivity(
  pages: readonly Page[],
  period: { start: string; end: string },
): CardActivityRow[] {
  const startYear = Number(period.start.slice(0, 4));
  const endYear = Number(period.end.slice(0, 4));
  const startMonth = period.start.slice(5, 7);

  const yearFor = (month: string) => (month === startMonth ? startYear : endYear);
  const toRow = (text: string): CardActivityRow | null => {
    const m = ACTIVITY_ROW.exec(text);
    if (!m) return null;
    const [, tMonth, tDay, pMonth, pDay, type, description, amount] = m;
    const tm = tMonth ? monthNumber(tMonth) : undefined;
    const pm = pMonth ? monthNumber(pMonth) : undefined;
    if (!tm || !pm || !tDay || !pDay || !type || description === undefined || !amount) return null;
    return {
      transactionDate: `${yearFor(tm)}-${tm}-${tDay.padStart(2, "0")}`,
      postedDate: `${yearFor(pm)}-${pm}-${pDay.padStart(2, "0")}`,
      type,
      description: description.trim(),
      amount: parseMoney(amount),
    };
  };

  return pages
    .flatMap((page) => page.rows)
    .map((row) => toRow(rowText(row)))
    .filter((row): row is CardActivityRow => row !== null);
}

/**
 * The card's masked id: the last four digits only, which is what a statement
 * itself prints and the only part that identifies one card among several.
 * The BIN (the leading six) is dropped rather than hashed -- it identifies the
 * issuer and product, not the card, and keeping it buys nothing.
 */
export function maskCardNumber(pages: readonly Page[]): string {
  const row = findRow(pages, /\d{4} \d{2}\*{2} \*{4} \d{4}/);
  const m = row ? /(\d{4})\s*$/.exec(rowText(row).trim()) : null;
  if (!m?.[1]) throw new Error("could not find the card number to mask");
  return `card_${m[1]}`;
}

/** True when this document is a credit card statement rather than an investment one. */
export function isCardStatement(pages: readonly Page[]): boolean {
  const firstPage = pages[0];
  return firstPage !== undefined && findRow([firstPage], /Credit card statement/i) !== null;
}

/** Unwraps a field the document must carry, or throws naming what was missing. */
function required<T>(value: T | undefined, what: string): T {
  if (value === undefined) throw new Error(`the card statement carries no ${what}`);
  return value;
}

export function parseCardStatement(pages: readonly Page[], file: string): CardStatement {
  const period = readPeriod(pages);
  const statementDate = readLabelledDate(pages, /Statement date/i);
  // The header pair prints the balance and the due date side by side on the
  // row BELOW their labels, so neither can be read by label position.
  const summaryRow = rowBelow(pages, /PAYMENT DUE DATE/i);
  const dueMatch = LONG_DATE.exec(rowText(summaryRow));
  const dueMonth = dueMatch?.[1] ? monthNumber(dueMatch[1]) : undefined;
  if (!dueMatch || !dueMonth || !dueMatch[2] || !dueMatch[3]) {
    throw new Error("could not find the payment due date");
  }
  const dueDate = `${dueMatch[3]}-${dueMonth}-${dueMatch[2].padStart(2, "0")}`;
  return {
    file,
    cardId: maskCardNumber(pages),
    period: statementDate.slice(0, 7),
    periodStart: period.start,
    periodEnd: period.end,
    statementDate,
    paymentDueDate: dueDate,
    statementBalance: parseMoney(
      required(summaryRow.words.find((w) => isMoney(w.text))?.text, "a statement balance"),
    ),
    creditLimit: readMoney(pages, /Credit limit/i),
    previousBalance: readMoney(pages, /Previous balance/i),
    newBalance: readMoney(pages, /New balance/i),
    minimumPayment: readMoney(pages, /Minimum payment/i),
    // Positive as printed. The activity rows carry the statement's own signs;
    // these summary figures are magnitudes the statement labels with a + or -
    // in prose, so flipping one here would contradict the page.
    purchases: readMoney(pages, /\+ Purchases/i),
    payments: readMoney(pages, /- Payments/i),
    otherCredits: readMoney(pages, /- Other credits/i),
    fees: readMoney(pages, /\+ Fees/i),
    interest: readMoney(pages, /\+ Interest/i),
    cashAdvances: readMoney(pages, /\+ Cash advances/i),
    purchaseRate: readRate(pages, /Annual interest rate/i),
    cashAdvanceRate: readRate(pages, /Cash advance interest rate/i),
    activity: readActivity(pages, period),
  };
}
