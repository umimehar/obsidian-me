import type { ActivityRow, Statement } from "../types";
import { type Page, findRow, rowText } from "./geometry";
import { isMoney, parseMoney } from "./money";
import type { SourceRef } from "./source";

// The Wealthsimple letterhead logo sits in the top-left corner of every page,
// close enough in y to the title row that row grouping merges them into one
// row ahead of the real account type (e.g. "Wealthsimple Chequing monthly
// statement"). It is stripped as a known, literal artifact rather than by
// x-position, since it is a distinct text token, not a coordinate.
const HEADING = /^(?:Wealthsimple )?(\w[\w ]*?) monthly statement$/;
const PERIOD = /^(\w{3}) (\d{1,2}) - (\w{3}) (\d{1,2}), (\d{4})$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
/** The "Your <Month> summary" panel's header row, e.g. "JUN 1 BALANCE JUN 30 BALANCE". Two BALANCE tokens, not one, so a stray "closing balance" mention elsewhere never matches. */
const BALANCE_HEADER = /BALANCE.*BALANCE/;

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

function readPeriod(pages: readonly Page[]): { start: string; end: string } {
  const row = findRow(pages, PERIOD);
  const m = row ? PERIOD.exec(rowText(row)) : null;
  const mm1 = m?.[1] ? MONTHS[m[1]] : undefined;
  const mm2 = m?.[3] ? MONTHS[m[3]] : undefined;
  if (!m || !mm1 || !mm2 || !m[2] || !m[4] || !m[5]) {
    throw new Error("could not find the cash statement period");
  }
  const pad = (n: string) => n.padStart(2, "0");
  return { start: `${m[5]}-${mm1}-${pad(m[2])}`, end: `${m[5]}-${mm2}-${pad(m[4])}` };
}

function readAccountType(pages: readonly Page[]): string {
  const row = findRow(pages, HEADING);
  const m = row ? HEADING.exec(rowText(row)) : null;
  if (!m?.[1]) throw new Error("could not find the account type row");
  return `${m[1].trim()} Account`;
}

/**
 * The summary block prints the opening and closing balance side by side, one
 * row below the "...BALANCE...BALANCE" header. Anchored on that header,
 * rather than on the first row anywhere in the document with exactly two
 * money words: a running balance or fee table elsewhere could otherwise
 * match before the real summary is ever reached.
 */
function readBalances(pages: readonly Page[]): { opening: number; closing: number } {
  const rows = pages.flatMap((p) => p.rows);
  const headerIdx = rows.findIndex((r) => BALANCE_HEADER.test(rowText(r)));
  if (headerIdx === -1) throw new Error("could not find the opening and closing balances");

  for (const row of rows.slice(headerIdx + 1)) {
    const money = row.words.filter((w) => isMoney(w.text));
    if (money.length === 2 && row.words.length === 2) {
      const [a, b] = money;
      if (a && b) return { opening: parseMoney(a.text), closing: parseMoney(b.text) };
    }
  }
  throw new Error("could not find the opening and closing balances");
}

function readActivity(pages: readonly Page[]): ActivityRow[] {
  const rows: ActivityRow[] = [];

  for (const row of pages.flatMap((p) => p.rows)) {
    const [first, second] = row.words;
    if (!first || !second || !DATE.test(first.text) || !DATE.test(second.text)) continue;

    const values: number[] = [];
    const words: string[] = [];
    for (const w of row.words.slice(2)) {
      if (isMoney(w.text)) values.push(parseMoney(w.text));
      else words.push(w.text);
    }
    if (values.length < 2) continue;

    const amount = values[values.length - 2] ?? 0;
    rows.push({
      date: first.text,
      postedDate: second.text,
      code: "",
      description: words.join(" "),
      debit: amount < 0 ? -amount : 0,
      credit: amount > 0 ? amount : 0,
      balance: values[values.length - 1] ?? 0,
      currency: "CAD",
    });
  }
  return rows;
}

export function parseCash(pages: readonly Page[], source: SourceRef): Statement {
  const period = readPeriod(pages);
  const { opening, closing } = readBalances(pages);

  return {
    source,
    accountType: readAccountType(pages),
    periodStart: period.start,
    periodEnd: period.end,
    portfolio: null,
    cash: [
      {
        currency: "CAD",
        opening,
        closing,
        totalIn: null,
        totalOut: null,
        paidIn: null,
        paidOut: null,
      },
    ],
    holdings: [],
    activity: readActivity(pages),
    contributions: null,
    dividendsYearToDate: null,
    fxRate: null,
    returns: null,
    balances: null,
  };
}
