import { isMoney, parseMoney } from "./money";

export interface Word {
  x0: number;
  x1: number;
  y: number;
  text: string;
}

export interface Row {
  y: number;
  /** Sorted by x0. */
  words: Word[];
}

export interface Page {
  rows: Row[];
}

export interface LabelValue {
  label: string;
  values: number[];
}

const WORD = /<word xMin="([\d.]+)" yMin="([\d.]+)" xMax="([\d.]+)" yMax="[\d.]+">([^<]*)<\/word>/g;

/** Rows within this many points of each other are the same row. */
const Y_TOLERANCE = 2;

const ENTITIES: Record<string, string> = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&apos;": "'",
  "&#39;": "'",
};

function decodeEntities(text: string): string {
  return text.replace(/&(amp|lt|gt|quot|apos|#39);/g, (m) => ENTITIES[m] ?? m);
}

/**
 * Turns `pdftotext -bbox-layout` XML into pages of rows. Pages are kept separate
 * because y restarts at the top of each page; grouping globally merges the
 * summary table on page 1 with the statement-code glossary on page 5.
 */
export function parseGeometry(xml: string): Page[] {
  return xml
    .split("<page ")
    .slice(1)
    .map((pageXml) => {
      const words: Word[] = [];
      WORD.lastIndex = 0;
      for (const m of pageXml.matchAll(WORD)) {
        const [, x0, y, x1, text] = m;
        if (!x0 || !y || !x1 || text === undefined) continue;
        const decoded = decodeEntities(text).trim();
        if (decoded === "") continue;
        words.push({ x0: Number(x0), x1: Number(x1), y: Number(y), text: decoded });
      }
      return { rows: groupRows(words) };
    });
}

function groupRows(words: readonly Word[]): Row[] {
  const sorted = [...words].sort((a, b) => a.y - b.y || a.x0 - b.x0);
  const rows: Row[] = [];

  for (const w of sorted) {
    const last = rows[rows.length - 1];
    if (last && Math.abs(w.y - last.y) <= Y_TOLERANCE) {
      last.words.push(w);
    } else {
      rows.push({ y: w.y, words: [w] });
    }
  }
  for (const row of rows) row.words.sort((a, b) => a.x0 - b.x0);
  return rows;
}

export function rowText(row: Row): string {
  return row.words.map((w) => w.text).join(" ");
}

export function findRow(pages: readonly Page[], re: RegExp): Row | null {
  for (const page of pages) {
    for (const row of page.rows) {
      if (re.test(rowText(row))) return row;
    }
  }
  return null;
}

export function findRows(pages: readonly Page[], re: RegExp): Row[] {
  const out: Row[] = [];
  for (const page of pages) {
    for (const row of page.rows) {
      if (re.test(rowText(row))) out.push(row);
    }
  }
  return out;
}

/**
 * The x of the right edge of the label matched by `re` within `row`, or null.
 * Callers use it to take the value to a label's right without hardcoding a
 * column position, which matters because columns drift between years.
 */
export function labelEndX(row: Row, re: RegExp): number | null {
  for (let start = 0; start < row.words.length; start += 1) {
    for (let end = start + 1; end <= row.words.length; end += 1) {
      const slice = row.words.slice(start, end);
      if (re.test(slice.map((w) => w.text).join(" "))) {
        return slice[slice.length - 1]?.x1 ?? null;
      }
    }
  }
  return null;
}

/** Keeps only words whose left edge falls in [xMin, xMax). Empty rows are dropped. */
export function sliceColumns(rows: readonly Row[], xMin: number, xMax: number): Row[] {
  return rows
    .map((row) => ({ y: row.y, words: row.words.filter((w) => w.x0 >= xMin && w.x0 < xMax) }))
    .filter((row) => row.words.length > 0);
}

/**
 * Scans rows for label-then-value pairs. Non-money words accumulate into a
 * label; the first row carrying money closes the pair. A label that wraps over
 * several rows is joined, which is how the managed layout's "Proceeds from" /
 * "sales $12,417.15" becomes one pair. Every money token on the closing row is
 * kept in x order, so a multi-currency row yields several values.
 */
export function scanPairs(rows: readonly Row[]): LabelValue[] {
  const out: LabelValue[] = [];
  let label: string[] = [];

  for (const row of rows) {
    const values: number[] = [];
    const words: string[] = [];
    for (const w of row.words) {
      if (isMoney(w.text)) values.push(parseMoney(w.text));
      else words.push(w.text);
    }
    label.push(...words);

    if (values.length > 0) {
      out.push({ label: label.join(" ").trim(), values });
      label = [];
    }
  }
  return out;
}
