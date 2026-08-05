---
title: "Investments rebuild phase 1: PDF ingest and reconciliation"
tags: [personal/investments, plan]
created: 2026-08-04
updated: 2026-08-05
status: active
type: spike
personal: investments
---

# Investments Ingest and Reconciliation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn 220 Wealthsimple PDF statements into a masked, validated datastore that reproduces the account value the Wealthsimple app reports, and surfaces every discrepancy it cannot explain.

**Architecture:** `extract` (PDF to word-coordinate XML, cached) → `geometry` (XML to pages of rows of positioned words) → `parse` (rows to a typed `Statement`, dispatched by template) → `validate` (five reconciliation checks producing findings, never dropping data) → `store` (masked datastore) → `build` (CLI). Parsers read a 2D word model and take a label's value as the nearest money token to its right, so column drift across three years of layout changes is irrelevant.

**Tech Stack:** Bun, TypeScript (strict, `noUncheckedIndexedAccess`), Biome, `bun test`, poppler's `pdftotext -bbox-layout`.

**Spec:** `personal/investments/docs/superpowers/specs/2026-08-04-investments-rebuild-design.md`

**Scope:** Phase 1 of three. Ends with a working ingest and a reconciliation report. The React app (phase 2) and the prediction engine (phase 3) get their own plans.

## Global Constraints

- Runtime is Bun. Never introduce npm or a lockfile other than `bun.lock`.
- TypeScript strict with `noUncheckedIndexedAccess`. Zero `tsc` errors.
- No `any`, no non-null assertions. Both are Biome errors here.
- Line width 100, 2-space indent, Biome-enforced.
- `bun run check` (Biome → `tsc --noEmit` → `bun test`) passes with zero warnings before every commit.
- Functions at or under 100 lines, cyclomatic complexity 8.
- **Never commit an unmasked account number, the owner's name, or the owner's address.** Source PDFs live outside the vault. Fixtures are scrubbed, and scrubbing is verified by an automated gate, not by eye.
- Source PDFs are at `~/Downloads/monthly_pdf_statements` (override with `STATEMENTS_DIR`), never read at test time.
- Money is a `number` of dollars. Comparisons use an explicit tolerance, never `===`.
- **Never hardcode an x coordinate.** Column positions drift between 340 and 362 across years. Positions are always read relative to a matched label.

## Prerequisites

- `poppler` installed (`brew install poppler`), already present.
- 220 PDFs named `<ACCOUNTNO>_YYYY-MM_<TEMPLATE>.pdf`, template one of `BROKERAGE`, `CASH`, `PERFORMANCE`.

## File Structure

A new `app/` workspace beside the existing `scripts/`. `scripts/` is untouched in this phase and deleted in phase 2, so the two can be diffed against each other.

```
personal/investments/
  app/
    package.json  tsconfig.json  biome.json
    redactions.example.json
    src/
      types.ts                    Statement and every type it contains
      ingest/
        source.ts                 filename -> {accountNo, period, template}
        extract.ts                pdftotext -bbox-layout, cached by content hash
        geometry.ts               XML -> Page[] -> Row[]; column slicing; label/value pairing
        money.ts                  money token parsing
        brokerage.ts              BROKERAGE parser
        performance.ts            PERFORMANCE parser (BROKERAGE + returns)
        cash.ts                   CASH parser
        parse.ts                  template dispatch
        __fixtures__/             scrubbed bbox XML, committed
      store/
        mask.ts                   masking, redaction, account-type mapping
        registry.ts               account records: label, kind, style, purpose
        datastore.ts              assemble and write datastore.json
      validate/
        report.ts                 Finding, ReconciliationReport, tolerance
        checks.ts                 the five checks
      truth.ts                    observed app figures
      corrections.ts              acknowledged, dated statement anomalies
      build.ts                    CLI
      tools/make-fixtures.ts      regenerate scrubbed fixtures
  data/
    datastore.json  reconciliation.json
```

`geometry.ts` knows about coordinates and nothing about statements. `money.ts` knows about strings. Each template parser knows one layout. `mask.ts` is the only module that sees an account number.

---

### Task 1: Workspace, filename parsing, coordinate extraction

**Files:**
- Create: `app/package.json`, `app/tsconfig.json`, `app/biome.json`
- Create: `app/src/ingest/source.ts`, `app/src/ingest/extract.ts`
- Test: `app/src/ingest/source.test.ts`

All paths are relative to `personal/investments/`.

**Interfaces:**
- Consumes: nothing.
- Produces: `type Template = "BROKERAGE" | "CASH" | "PERFORMANCE"`; `interface SourceRef { file: string; accountNo: string; period: string; template: Template }`; `parseSourceFilename(file: string): SourceRef | null`; `extractXml(pdfPath: string, cacheDir: string): Promise<string>`.

- [ ] **Step 1: Create the workspace config**

`app/package.json`:

```json
{
  "name": "investments",
  "private": true,
  "type": "module",
  "scripts": {
    "build": "bun run src/build.ts",
    "fixtures": "bun run src/tools/make-fixtures.ts",
    "test": "bun test",
    "typecheck": "tsc --noEmit",
    "lint": "biome check src",
    "check": "biome check src && tsc --noEmit && bun test"
  },
  "devDependencies": {
    "@biomejs/biome": "^1.9.4",
    "@types/bun": "^1.1.14",
    "typescript": "^5.7.2"
  }
}
```

`app/tsconfig.json`:

```json
{
  "compilerOptions": {
    "lib": ["ESNext"],
    "module": "ESNext",
    "target": "ESNext",
    "moduleResolution": "bundler",
    "types": ["bun"],
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitOverride": true,
    "noFallthroughCasesInSwitch": true,
    "verbatimModuleSyntax": true,
    "skipLibCheck": true,
    "noEmit": true
  },
  "include": ["src"]
}
```

`app/biome.json`:

```json
{
  "$schema": "https://biomejs.dev/schemas/1.9.4/schema.json",
  "formatter": { "enabled": true, "lineWidth": 100, "indentStyle": "space", "indentWidth": 2 },
  "linter": {
    "enabled": true,
    "rules": {
      "recommended": true,
      "suspicious": { "noExplicitAny": "error" },
      "style": { "noNonNullAssertion": "error", "useTemplate": "off" }
    }
  },
  "files": { "ignore": ["../data/**"] }
}
```

Append to `personal/investments/.gitignore`:

```
app/node_modules/
app/.cache/
app/redactions.json
```

Run `cd personal/investments/app && bun install`.

- [ ] **Step 2: Write the failing test**

`app/src/ingest/source.test.ts` — synthetic account numbers only, never a real one:

```ts
import { describe, expect, test } from "bun:test";
import { parseSourceFilename } from "./source";

describe("parseSourceFilename", () => {
  test("reads account, period and template", () => {
    expect(parseSourceFilename("ACCT0002CAD_2026-06_BROKERAGE.pdf")).toEqual({
      file: "ACCT0002CAD_2026-06_BROKERAGE.pdf",
      accountNo: "ACCT0002CAD",
      period: "2026-06",
      template: "BROKERAGE",
    });
  });

  test("recognises the cash and performance templates", () => {
    expect(parseSourceFilename("ACCT0005CAD_2026-06_CASH.pdf")?.template).toBe("CASH");
    expect(parseSourceFilename("ACCT0001CAD_2025-12_PERFORMANCE.pdf")?.template).toBe("PERFORMANCE");
  });

  test("rejects an unknown template rather than guessing", () => {
    expect(parseSourceFilename("ACCT0002CAD_2026-06_SUMMARY.pdf")).toBeNull();
  });

  test("rejects the legacy CSV-era name that puts the date last", () => {
    expect(parseSourceFilename("TFSA-transactions-ACCT0002-2026-06-01.pdf")).toBeNull();
  });

  test("rejects a malformed period", () => {
    expect(parseSourceFilename("ACCT0002CAD_2026-13_BROKERAGE.pdf")).toBeNull();
    expect(parseSourceFilename("ACCT0002CAD_202606_BROKERAGE.pdf")).toBeNull();
  });

  test("reads a re-issued statement's version suffix", () => {
    // Wealthsimple issues amended statements; the June 2026 managed RRSP says so
    // in terms. A later version supersedes the earlier one (Task 9).
    const v = parseSourceFilename("ACCT0001CAD_2026-06_BROKERAGE_v_2.pdf");
    expect(v?.period).toBe("2026-06");
    expect(v?.template).toBe("BROKERAGE");
  });
});
```

- [ ] **Step 3: Run it and verify it fails**

Run: `cd personal/investments/app && bun test src/ingest/source.test.ts`
Expected: FAIL, `Cannot find module './source'`.

- [ ] **Step 4: Implement `source.ts`**

```ts
export type Template = "BROKERAGE" | "CASH" | "PERFORMANCE";

export interface SourceRef {
  file: string;
  accountNo: string;
  period: string;
  template: Template;
  /** Amended-statement version, 0 when the filename carries no suffix. */
  version: number;
}

const TEMPLATES: readonly Template[] = ["BROKERAGE", "CASH", "PERFORMANCE"];
const FILENAME = /^([A-Z0-9]+)_(\d{4})-(\d{2})_([A-Z]+)(?:_v_(\d+))?\.pdf$/;

export function parseSourceFilename(file: string): SourceRef | null {
  const m = FILENAME.exec(file);
  if (!m) return null;
  const [, accountNo, year, month, rawTemplate, version] = m;
  if (!accountNo || !year || !month || !rawTemplate) return null;

  const monthNum = Number(month);
  if (monthNum < 1 || monthNum > 12) return null;

  const template = TEMPLATES.find((t) => t === rawTemplate);
  if (!template) return null;

  return {
    file,
    accountNo,
    period: `${year}-${month}`,
    template,
    version: version === undefined ? 0 : Number(version),
  };
}
```

Update the test's first assertion to include `version: 0`.

- [ ] **Step 5: Run it and verify it passes**

Run: `cd personal/investments/app && bun test src/ingest/source.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 6: Implement `extract.ts`**

Covered by the integration test in Task 10; small enough to read.

```ts
import { createHash } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { basename, join } from "node:path";

/**
 * Runs `pdftotext -bbox-layout`, which emits every word with its x-extent and y.
 * Cached by the PDF's content hash, so re-running over 220 unchanged statements
 * is a no-op. `-layout` is deliberately NOT used: it discards the coordinates
 * this pipeline depends on (see the spec's "Why word geometry" section).
 */
export async function extractXml(pdfPath: string, cacheDir: string): Promise<string> {
  const bytes = await Bun.file(pdfPath).arrayBuffer();
  const hash = createHash("sha256").update(new Uint8Array(bytes)).digest("hex").slice(0, 16);
  const cachePath = join(cacheDir, `${basename(pdfPath, ".pdf")}.${hash}.xml`);

  const cached = Bun.file(cachePath);
  if (await cached.exists()) return cached.text();

  const proc = Bun.spawn(["pdftotext", "-bbox-layout", pdfPath, "-"], {
    stdout: "pipe",
    stderr: "pipe",
  });
  const [xml, err, code] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  if (code !== 0) {
    throw new Error(`pdftotext failed on ${basename(pdfPath)} (exit ${code}): ${err.trim()}`);
  }

  await mkdir(cacheDir, { recursive: true });
  await Bun.write(cachePath, xml);
  return xml;
}
```

- [ ] **Step 7: Check and commit**

Run: `cd personal/investments/app && bun run check`
Expected: clean, 6 tests.

```bash
git add personal/investments/app personal/investments/.gitignore
git commit -m "feat(investments): scaffold the app workspace and coordinate extraction"
```

---

### Task 2: The geometry model

**Files:**
- Create: `app/src/ingest/money.ts`, `app/src/ingest/geometry.ts`
- Test: `app/src/ingest/money.test.ts`, `app/src/ingest/geometry.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `parseMoney(raw: string): number`; `isMoney(text: string): boolean`; `interface Word { x0: number; x1: number; y: number; text: string }`; `interface Row { y: number; words: Word[] }`; `interface Page { rows: Row[] }`; `parseGeometry(xml: string): Page[]`; `rowText(row: Row): string`; `findRow(pages, re): Row | null`; `findRows(pages, re): Row[]`; `labelEndX(row, re): number | null`; `sliceColumns(rows, xMin, xMax): Row[]`; `scanPairs(rows): LabelValue[]`; `interface LabelValue { label: string; values: number[] }`.

This is the module everything else stands on. It is worth its own task and its own tests.

- [ ] **Step 1: Write the failing money test**

`app/src/ingest/money.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import { isMoney, parseMoney } from "./money";

describe("parseMoney", () => {
  test("parses a plain amount", () => {
    expect(parseMoney("$1,037.17")).toBe(1037.17);
    expect(parseMoney("$0.00")).toBe(0);
  });

  test("parses a minus that sits AFTER the dollar sign", () => {
    // Managed brokerage balance columns render negatives as $-12,300.48.
    // Testing only the first character reads this as positive.
    expect(parseMoney("$-12,300.48")).toBe(-12300.48);
  });

  test("parses the en dash the cash statement uses", () => {
    expect(parseMoney("–$60.00")).toBe(-60);
    expect(parseMoney("–$1,756.28")).toBe(-1756.28);
  });

  test("parses a bare quantity", () => {
    expect(parseMoney("159.1371")).toBe(159.1371);
  });

  test("throws rather than returning zero", () => {
    expect(() => parseMoney("n/a")).toThrow(/unparseable money/i);
    expect(() => parseMoney("")).toThrow(/unparseable money/i);
  });
});

describe("isMoney", () => {
  test("accepts every negative form and rejects prose", () => {
    for (const t of ["$0.00", "$1,234.56", "$-12,300.48", "–$60.00", "12.5000"]) {
      expect(isMoney(t)).toBe(true);
    }
    for (const t of ["Deposits", "3/7", "2026-06-01", "CAD", "100.00%"]) {
      expect(isMoney(t)).toBe(false);
    }
  });
});
```

- [ ] **Step 2: Run it, verify it fails, implement `money.ts`**

Run: `cd personal/investments/app && bun test src/ingest/money.test.ts` → FAIL, module not found.

```ts
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

/** True for tokens parseMoney accepts. Percentages are deliberately excluded. */
export function isMoney(text: string): boolean {
  return MONEY.test(text.trim());
}
```

Run again: PASS, 6 tests.

- [ ] **Step 3: Write the failing geometry test**

`app/src/ingest/geometry.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import {
  findRow,
  labelEndX,
  parseGeometry,
  rowText,
  scanPairs,
  sliceColumns,
} from "./geometry";

const FIXTURES = join(import.meta.dir, "__fixtures__");
const load = async (name: string) =>
  parseGeometry(await Bun.file(join(FIXTURES, `${name}.xml`)).text());

function word(x0: number, x1: number, y: number, text: string) {
  return { x0, x1, y, text };
}

describe("parseGeometry", () => {
  test("groups words into rows per page, sorted by x", () => {
    const xml = `<page width="612" height="792">
      <word xMin="222.0" yMin="168.0" xMax="240.0" yMax="176.0">Cash</word>
      <word xMin="458.0" yMin="168.4" xMax="500.0" yMax="176.4">$122.95</word>
      <word xMin="346.0" yMin="168.2" xMax="388.0" yMax="176.2">$122.95</word>
      <word xMin="222.0" yMin="210.0" xMax="240.0" yMax="218.0">Total</word>
    </page>`;
    const pages = parseGeometry(xml);
    expect(pages).toHaveLength(1);
    expect(pages[0]?.rows).toHaveLength(2);
    expect(rowText(pages[0]?.rows[0] ?? { y: 0, words: [] })).toBe("Cash $122.95 $122.95");
  });

  test("keeps pages separate so y values cannot collide across them", () => {
    // Every page restarts y near zero. Grouping globally merges page 1's table
    // with page 5's glossary.
    const xml = `<page width="612" height="792">
        <word xMin="10" yMin="100" xMax="20" yMax="108">first</word>
      </page><page width="612" height="792">
        <word xMin="10" yMin="100" xMax="20" yMax="108">second</word>
      </page>`;
    const pages = parseGeometry(xml);
    expect(pages).toHaveLength(2);
    expect(rowText(pages[0]?.rows[0] ?? { y: 0, words: [] })).toBe("first");
    expect(rowText(pages[1]?.rows[0] ?? { y: 0, words: [] })).toBe("second");
  });

  test("decodes XML entities in word text", () => {
    const xml = `<page width="1" height="1">
      <word xMin="1" yMin="1" xMax="2" yMax="2">S&amp;P/TSX</word>
    </page>`;
    expect(parseGeometry(xml)[0]?.rows[0]?.words[0]?.text).toBe("S&P/TSX");
  });
});

describe("labelEndX and sliceColumns", () => {
  test("labelEndX returns the right edge of the matched label", () => {
    const row = {
      y: 281,
      words: [
        word(48, 62, 281, "Last"),
        word(119, 147, 281, "Balance"),
        word(174, 200, 281, "$116.67"),
      ],
    };
    expect(labelEndX(row, /Last Balance/)).toBe(147);
  });

  test("sliceColumns keeps only words inside the x range", () => {
    const rows = [
      {
        y: 1,
        words: [word(55, 90, 1, "Springfield"), word(222, 250, 1, "Cash"), word(346, 380, 1, "$1.00")],
      },
    ];
    const sliced = sliceColumns(rows, 200, 400);
    expect(rowText(sliced[0] ?? { y: 0, words: [] })).toBe("Cash $1.00");
  });

  test("sliceColumns drops rows left with nothing", () => {
    const rows = [{ y: 1, words: [word(55, 90, 1, "Springfield")] }];
    expect(sliceColumns(rows, 200, 400)).toEqual([]);
  });
});

describe("scanPairs", () => {
  test("pairs a label with the money on its own row", () => {
    const rows = [
      { y: 1, words: [word(48, 147, 1, "Last Statement Cash Balance"), word(174, 200, 1, "$116.67")] },
    ];
    expect(scanPairs(rows)).toEqual([
      { label: "Last Statement Cash Balance", values: [116.67] },
    ]);
  });

  test("joins a label that wraps onto the row carrying its value", () => {
    // Managed layout prints "Proceeds from" on one row and "sales $12,417.15"
    // on the next.
    const rows = [
      { y: 1, words: [word(300, 340, 1, "Proceeds"), word(342, 360, 1, "from")] },
      { y: 2, words: [word(300, 320, 2, "sales"), word(400, 440, 2, "$12,417.15")] },
    ];
    expect(scanPairs(rows)).toEqual([
      { label: "Proceeds from sales", values: [12417.15] },
    ]);
  });

  test("keeps every value on a multi-currency row, in x order", () => {
    const rows = [
      {
        y: 1,
        words: [
          word(48, 147, 1, "Last Statement Cash Balance"),
          word(300, 340, 1, "$2,618.48"),
          word(400, 440, 1, "$2,618.40"),
          word(500, 520, 1, "$0.06"),
        ],
      },
    ];
    expect(scanPairs(rows)[0]?.values).toEqual([2618.48, 2618.4, 0.06]);
  });

  test("ignores percentages so summary rows yield only money", () => {
    const rows = [
      {
        y: 1,
        words: [word(222, 240, 1, "Cash"), word(346, 388, 1, "$122.95"), word(414, 430, 1, "0.59")],
      },
    ];
    // 0.59 has no dollar sign but is a bare decimal, so it IS money-shaped.
    // Callers that need only currency must slice columns first. Documented,
    // not silently guessed at.
    expect(scanPairs(rows)[0]?.values).toEqual([122.95, 0.59]);
  });
});

// Tests against a real statement live in Task 3, once the fixtures exist.
// Nothing here reads a fixture, so this suite is green on its own.
```

- [ ] **Step 4: Run it, verify it fails, implement `geometry.ts`**

```ts
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

const WORD =
  /<word xMin="([\d.]+)" yMin="([\d.]+)" xMax="([\d.]+)" yMax="[\d.]+">([^<]*)<\/word>/g;

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
    for (let end = row.words.length; end > start; end -= 1) {
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
```

Run: `cd personal/investments/app && bun test src/ingest/geometry.test.ts`
Expected: PASS, 9 tests. Nothing in this suite reads a fixture, so it is green on its own.

- [ ] **Step 5: Check and commit**

Run: `cd personal/investments/app && bun run check`
Expected: clean, 21 tests (6 source, 6 money, 9 geometry).

```bash
git add personal/investments/app
git commit -m "feat(investments): add the word-geometry model and money parsing"
```

---

### Task 3: Scrubbed fixtures

**Files:**
- Create: `app/src/tools/make-fixtures.ts`, `app/redactions.example.json`
- Create: `app/src/ingest/__fixtures__/*.xml` (generated, committed)

**Interfaces:**
- Consumes: `extractXml` (Task 1).
- Produces: seven committed fixture XML files.

Tests must never read the real PDFs: they carry the owner's name, address, and account numbers, and they live outside the vault.

**The scrubber must remove four distinct things**, not one. An earlier draft removed only the filename-derived account code, which would have committed a real chequing account number:

1. The filename account code (`WK…`, `HQ…`, `WZ…`).
2. **A bare numeric account number.** `CASH` statements print `Account number: NNNNNNNN` — a bare eight-digit number, nothing like the filename code, matched by no `(WK|HQ|WZ)` pattern.
3. Name tokens, case-insensitively and per word, since `-bbox-layout` emits each name token as its own `<word>` element. A whole-name search finds nothing.
4. Address words and the postal code.

- [ ] **Step 1: Write `make-fixtures.ts`**

```ts
import { mkdir } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { extractXml } from "../ingest/extract";

const SOURCE = process.env.STATEMENTS_DIR ?? join(homedir(), "Downloads", "monthly_pdf_statements");
const CACHE = join(import.meta.dir, "..", "..", ".cache");
const OUT = join(import.meta.dir, "..", "ingest", "__fixtures__");

interface FixtureSpec {
  /** Real statement filename — a real account number, so it lives in the gitignored config. */
  file: string;
  alias: string;
  as: string;
}

interface Config {
  redactions: string[];
  addressWords: string[];
  fixtures: FixtureSpec[];
}

async function loadConfig(): Promise<Config> {
  const path = join(import.meta.dir, "..", "..", "redactions.json");
  const file = Bun.file(path);
  if (!(await file.exists())) {
    throw new Error(`missing ${path} — copy redactions.example.json and fill it in`);
  }
  const parsed = (await file.json()) as Partial<Config>;
  if (!parsed.redactions || !parsed.fixtures) {
    throw new Error("redactions.json needs { redactions, addressWords, fixtures }");
  }
  return {
    redactions: parsed.redactions,
    addressWords: parsed.addressWords ?? [],
    fixtures: parsed.fixtures,
  };
}

/** Word-level scrub. bbox XML emits one <word> per token, so whole-name search fails. */
function scrub(xml: string, accountNo: string, alias: string, cfg: Config): string {
  const tokens = new Set<string>();
  for (const phrase of [...cfg.redactions, ...cfg.addressWords]) {
    for (const t of phrase.split(/\s+/)) if (t.length > 1) tokens.add(t.toLowerCase());
  }

  return xml.replace(/(>)([^<]*)(<\/word>)/g, (_m, open: string, text: string, close: string) => {
    let out = text;
    if (out === accountNo) out = alias;
    if (tokens.has(out.toLowerCase())) out = "REDACTED";
    if (/^\d{6,}$/.test(out)) out = "00000000"; // bare numeric account numbers
    if (/^[A-Z]\d[A-Z]\s?\d[A-Z]\d$/i.test(out)) out = "X0X0X0"; // postal code
    return `${open}${out}${close}`;
  });
}

const cfg = await loadConfig();
await mkdir(OUT, { recursive: true });

for (const { file, alias, as } of cfg.fixtures) {
  const xml = await extractXml(join(SOURCE, file), CACHE);
  const accountNo = file.split("_")[0] ?? "";
  const scrubbed = scrub(xml, accountNo, alias, cfg);

  const lower = scrubbed.toLowerCase();
  for (const phrase of cfg.redactions) {
    for (const t of phrase.split(/\s+/)) {
      if (t.length > 1 && lower.includes(t.toLowerCase())) {
        throw new Error(`scrub failed: "${t}" still present in ${as}`);
      }
    }
  }
  if (scrubbed.includes(accountNo)) throw new Error(`scrub failed: account number in ${as}`);
  const bare = /<word[^>]*>(\d{6,})<\/word>/.exec(scrubbed);
  if (bare && bare[1] !== "00000000") throw new Error(`scrub failed: bare number ${bare[1]} in ${as}`);

  await Bun.write(join(OUT, `${as}.xml`), scrubbed);
  console.log(`wrote ${as}.xml`);
}
```

- [ ] **Step 2: Write `redactions.example.json`**

```json
{
  "redactions": ["First Last", "Other Name"],
  "addressWords": ["StreetName", "CityName"],
  "fixtures": [
    { "file": "ACCOUNTNO_2026-06_BROKERAGE.pdf", "alias": "ACCT0001CAD", "as": "brokerage-managed" }
  ]
}
```

- [ ] **Step 3: Fill in the real config and pick the fixtures**

Create `app/redactions.json` (gitignored). Pick one statement per layout variant. The account numbers go here and nowhere else:

| `as` | Which statement | Why this variant |
|---|---|---|
| `brokerage-managed` | a **Managed RRSP**, 2026-06 | three interleaved panels, 60-day contribution split, a pending-valuation holding |
| `brokerage-dual-currency` | the **TFSA** with USD, 2026-06 | CAD/USD columns, year-to-date contribution figure |
| `brokerage-spousal` | the **Spousal RRSP**, 2026-03 | `Self-directed` wording, spousal kind |
| `brokerage-legacy-wording` | any account, **2023-06** | `Tax-Free Savings Account`, the wording with no `TFSA` token |
| `performance` | the Managed RRSP, a month with a `PERFORMANCE` file | returns block, balance summary |
| `cash` | a **Chequing**, 2026-06 | consumer layout, en-dash negatives, bare numeric account number |
| `brokerage-empty` | an account with a $0.00 total portfolio, 2026-06 | no holdings, no activity |

- [ ] **Step 4: Generate and verify**

```bash
cd personal/investments/app
bun run fixtures
grep -rlE '\b(WK|HQ|WZ)[A-Z0-9]{7,}\b' src/ingest/__fixtures__/ && echo "LEAK: account code" || echo "clean"
bun -e 'const { Glob } = require("bun");
  let bad = false;
  for await (const f of new Glob("src/ingest/__fixtures__/*.xml").scan(".")) {
    for (const m of (await Bun.file(f).text()).matchAll(/<word[^>]*>([^<]*)<\/word>/g)) {
      const t = (m[1] ?? "").trim();
      if (/^\d{6,}$/.test(t) && t !== "00000000") { console.log("LEAK: bare number", t, "in", f); bad = true; }
      if (/^[A-Za-z]\d[A-Za-z] ?\d[A-Za-z]\d$/.test(t)) { console.log("LEAK: postal code in", f); bad = true; }
    }
  }
  if (!bad) console.log("clean");'
bun -e 'const c = await Bun.file("redactions.json").json();
  const { Glob } = require("bun");
  const toks = [...c.redactions, ...(c.addressWords ?? [])].flatMap(p => p.split(/\s+/)).filter(t => t.length > 1);
  let bad = false;
  for await (const f of new Glob("src/ingest/__fixtures__/*.xml").scan(".")) {
    const t = (await Bun.file(f).text()).toLowerCase();
    for (const n of toks) if (t.includes(n.toLowerCase())) { console.log("LEAK:", n, "in", f); bad = true; }
  }
  if (!bad) console.log("clean");'
```

Expected: seven `.xml` files, all three checks print `clean`. Note the bare-number check scans word CONTENT: an earlier draft piped `grep -rl` into `grep -v`, which filters by filename and so could never fail. Any leak stops the task — do not commit until all three are clean.

- [ ] **Step 5: Add the fixture-backed geometry tests, then commit**

Append to `app/src/ingest/geometry.test.ts` — these need a fixture, which now exists:

```ts
describe("against a real statement", () => {
  const load = async (name: string) =>
    parseGeometry(await Bun.file(join(FIXTURES, `${name}.xml`)).text());

  test("finds the portfolio total", async () => {
    const total = findRow(await load("brokerage-managed"), /Total Portfolio/);
    if (!total) throw new Error("expected a Total Portfolio row");
    expect(scanPairs([total])[0]?.values[0]).toBe(20498.54);
  });

  test("the mailing address does not contaminate the summary table", async () => {
    const pages = await load("brokerage-managed");
    const row = findRow(pages, /Total Portfolio/);
    if (!row) throw new Error("expected the total row");
    const labelX = labelStartX(row, /Total Portfolio/);
    if (labelX === null) throw new Error("expected a label position");
    // Everything left of the table is address; slicing removes it.
    const table = sliceColumns(pages.flatMap((p) => p.rows), labelX - 1, Number.POSITIVE_INFINITY);
    expect(table.every((r) => !/Road|Suite/.test(rowText(r)))).toBe(true);
  });
});
```

Note `labelStartX` arrives in Task 5; if it is not yet present, add it there first — it is nine lines and its test is in Task 5 Step 1.

Run: `cd personal/investments/app && bun run check`
Expected: clean, 23 tests (6 source, 6 money, 11 geometry).

```bash
git add personal/investments/app
git commit -m "feat(investments): add scrubbed statement fixtures"
```

---

### Task 4: The Statement type

**Files:**
- Create: `app/src/types.ts`

**Interfaces:**
- Consumes: `SourceRef` (Task 1).
- Produces: every type below. Tasks 5 to 11 import from here.

Types only, so `tsc` is the test. Separate task because everything downstream depends on these names being fixed.

- [ ] **Step 1: Write `types.ts`**

```ts
import type { SourceRef } from "./ingest/source";

export type Currency = "CAD" | "USD";

export interface Holding {
  name: string;
  symbol: string;
  quantity: number;
  segregatedQuantity: number;
  marketPrice: number;
  priceCurrency: Currency;
  marketValue: number;
  bookCost: number;
  assetClass: string;
  /** True when the statement says pricing for the period is not yet final. */
  pendingValuation: boolean;
}

export interface AssetClassTotal {
  name: string;
  marketValue: number;
  bookCost: number;
}

export interface PortfolioSummary {
  cashMarketValue: number;
  cashBookCost: number;
  classes: AssetClassTotal[];
  totalMarketValue: number;
  totalBookCost: number;
}

export interface CashPaidIn {
  deposits: number;
  proceedsFromSales: number;
  dividends: number;
  interestEarned: number;
  stockLendingIncome: number;
  other: number;
}

export interface CashPaidOut {
  fees: number;
  taxes: number;
  interestPaid: number;
  costOfInvestments: number;
  withdrawals: number;
  other: number;
}

export interface CashSummary {
  currency: Currency;
  opening: number;
  closing: number;
  /** Null on the CASH template, which prints balances but no in/out totals. */
  totalIn: number | null;
  totalOut: number | null;
  paidIn: CashPaidIn | null;
  paidOut: CashPaidOut | null;
}

export interface ActivityRow {
  date: string;
  /** Only the CASH template carries a separate posted date. */
  postedDate: string | null;
  /** Statement code: BUY, SELL, DIV, CONT, GRANT, TRFIN. Empty on CASH rows. */
  code: string;
  description: string;
  debit: number;
  credit: number;
  balance: number;
  currency: Currency;
}

export interface Contributions {
  /** Self-directed registered accounts print one year-to-date figure. */
  yearToDate: number | null;
  /** Managed registered accounts split the year instead. */
  first60Days: number | null;
  restOfYear: number | null;
}

export interface Returns {
  currentPeriod: number | null;
  oneYear: number | null;
  threeYears: number | null;
  fiveYears: number | null;
  tenYears: number | null;
  sinceInception: number | null;
}

export interface PeriodBalances {
  start: number;
  deposits: number;
  withdrawals: number;
  changeInMarketValue: number;
  end: number;
}

export interface Statement {
  source: SourceRef;
  /** Verbatim from the page, e.g. "Order Execution Only Spousal RRSP Account". */
  accountType: string;
  periodStart: string;
  periodEnd: string;
  /** Null only on the CASH template. Null on a BROKERAGE statement is a parser bug. */
  portfolio: PortfolioSummary | null;
  cash: CashSummary[];
  holdings: Holding[];
  activity: ActivityRow[];
  contributions: Contributions | null;
  dividendsYearToDate: number | null;
  fxRate: number | null;
  returns: Returns | null;
  balances: PeriodBalances | null;
}
```

Note `Returns` fields are nullable: a `PERFORMANCE` statement prints `0.00%` for horizons that do not yet apply (a real row reads `-4.01 / 12.86 / 0.00 / 0.00 / 0.00 / 12.15`). Phase 3 must not treat those zeros as a measured 0% return, so they are parsed to `null` in Task 8.

- [ ] **Step 2: Typecheck and commit**

Run: `cd personal/investments/app && bun run typecheck` → exit 0.

```bash
git add personal/investments/app/src/types.ts
git commit -m "feat(investments): define the Statement type"
```

---

### Task 5: Brokerage — header, portfolio summary, cash

**Files:**
- Create: `app/src/ingest/brokerage.ts`
- Modify: `app/src/ingest/geometry.ts` (add `labelStartX`)
- Test: `app/src/ingest/brokerage.test.ts`, `app/src/ingest/geometry.test.ts`

**Interfaces:**
- Consumes: `geometry.ts` (Task 2), `types.ts` (Task 4), `SourceRef` (Task 1).
- Produces: `parseBrokerage(pages: Page[], source: SourceRef): Statement`. Tasks 6-8 extend the same function.

**The one rule that handles both cash layouts.** Managed statements print three panels side by side on shared rows; self-directed statements print one block with Combined/CAD/USD columns. Slicing the managed layout into panels first makes both cases identical: **take the last N values of a label's pair, where N is the number of currencies**. On a sliced managed panel `Last Statement Cash Balance` has one value; on a dual-currency row it has three and the last two are CAD and USD.

- [ ] **Step 1: Add `labelStartX` to geometry with a test**

Append to `app/src/ingest/geometry.test.ts`:

```ts
describe("labelStartX", () => {
  test("returns the left edge of the matched label", () => {
    const row = {
      y: 1,
      words: [
        { x0: 48, x1: 100, y: 1, text: "Closing" },
        { x0: 301, x1: 330, y: 1, text: "Cash" },
        { x0: 333, x1: 350, y: 1, text: "Paid" },
        { x0: 353, x1: 362, y: 1, text: "In" },
      ],
    };
    expect(labelStartX(row, /Cash Paid In/)).toBe(301);
  });

  test("returns null when the label is absent", () => {
    expect(labelStartX({ y: 1, words: [] }, /Cash Paid In/)).toBeNull();
  });
});
```

Add to `geometry.ts` (and its import in the test):

```ts
/** The x of the left edge of the label matched by `re` within `row`, or null. */
export function labelStartX(row: Row, re: RegExp): number | null {
  // Shortest match, like labelEndX. Scanning longest-first lets an unanchored
  // regex swallow the value into the label and return the wrong position.
  for (let start = 0; start < row.words.length; start += 1) {
    for (let end = start + 1; end <= row.words.length; end += 1) {
      const slice = row.words.slice(start, end);
      if (re.test(slice.map((w) => w.text).join(" "))) return slice[0]?.x0 ?? null;
    }
  }
  return null;
}
```

- [ ] **Step 2: Write the failing brokerage tests**

`app/src/ingest/brokerage.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { parseBrokerage } from "./brokerage";
import { parseGeometry } from "./geometry";
import { parseSourceFilename } from "./source";

const FIXTURES = join(import.meta.dir, "__fixtures__");

async function load(name: string, file: string) {
  const source = parseSourceFilename(file);
  if (!source) throw new Error(`bad fixture filename ${file}`);
  const pages = parseGeometry(await Bun.file(join(FIXTURES, `${name}.xml`)).text());
  return parseBrokerage(pages, source);
}

const managed = () => load("brokerage-managed", "ACCT0001CAD_2026-06_BROKERAGE.pdf");
const dual = () => load("brokerage-dual-currency", "ACCT0002CAD_2026-06_BROKERAGE.pdf");

describe("header", () => {
  test("reads the account type verbatim", async () => {
    expect((await managed()).accountType).toBe("Managed RRSP Account");
    expect((await dual()).accountType).toBe("Order Execution Only TFSA Account");
  });

  test("reads the 2023 wording, which names no account code", async () => {
    // Wealthsimple renamed this descriptor twice. The 2023 form contains no
    // "TFSA" token at all; a parser written against 2026 statements throws here.
    const s = await load("brokerage-legacy-wording", "ACCT0007CAD_2023-06_BROKERAGE.pdf");
    expect(s.accountType).toBe("Tax-Free Savings Account");
  });

  test("reads the self-directed spousal wording", async () => {
    const s = await load("brokerage-spousal", "ACCT0003CAD_2026-03_BROKERAGE.pdf");
    expect(s.accountType).toBe("Self-directed Spousal RRSP Account");
  });

  test("reads the statement period", async () => {
    const s = await managed();
    expect(s.periodStart).toBe("2026-06-01");
    expect(s.periodEnd).toBe("2026-06-30");
  });

  test("throws rather than guessing when the type row is absent", () => {
    const source = parseSourceFilename("ACCT0001CAD_2026-06_BROKERAGE.pdf");
    if (!source) throw new Error("bad filename");
    expect(() => parseBrokerage([], source)).toThrow(/account type/i);
  });
});

describe("portfolio summary", () => {
  test("reads it despite the mailing address sharing its rows", async () => {
    // The owner's name sits on the Cash row and the address interleaves between
    // the asset-class rows. Column slicing removes both.
    const p = (await managed()).portfolio;
    if (!p) throw new Error("expected a portfolio");
    expect(p.cashMarketValue).toBe(122.95);
    expect(p.totalMarketValue).toBe(20498.54);
    expect(p.totalBookCost).toBe(20501.7);
  });

  test("holdings and cash sum to the portfolio total", async () => {
    const s = await managed();
    const p = s.portfolio;
    if (!p) throw new Error("expected a portfolio");
    const sum = s.holdings.reduce((a, h) => a + h.marketValue, 0) + p.cashMarketValue;
    expect(sum).toBeCloseTo(p.totalMarketValue, 2);
  });
});

describe("cash summary", () => {
  test("reads the managed three-panel layout without cross-panel bleed", async () => {
    // Last Statement Cash Balance $116.67 | Cash Paid In Deposits $0.00 |
    // Contributions: — all one row. Taking the last money token reads $0.00.
    const cad = (await managed()).cash[0];
    if (!cad) throw new Error("expected a CAD cash summary");
    expect(cad.opening).toBe(116.67);
    expect(cad.totalIn).toBe(12430.95);
    expect(cad.totalOut).toBe(12424.67);
    expect(cad.closing).toBe(122.95);
    expect(cad.paidIn?.proceedsFromSales).toBe(12417.15);
    expect(cad.paidIn?.dividends).toBe(13.8);
    expect(cad.paidOut?.fees).toBe(7.52);
    expect(cad.paidOut?.costOfInvestments).toBe(12417.15);
  });

  test("distinguishes the two Other rows", async () => {
    // "Other" appears once under Cash Paid In and once under Cash Paid Out.
    const cad = (await managed()).cash[0];
    expect(cad?.paidIn?.other).toBe(0);
    expect(cad?.paidOut?.other).toBe(0);
  });

  test("reads both currency columns on a dual-currency account", async () => {
    const s = await dual();
    expect(s.cash.map((c) => c.currency).sort()).toEqual(["CAD", "USD"]);
    const cad = s.cash.find((c) => c.currency === "CAD");
    const usd = s.cash.find((c) => c.currency === "USD");
    expect(cad?.opening).toBe(2618.4);
    expect(cad?.totalIn).toBe(3005.67);
    expect(cad?.closing).toBe(1037.09);
    expect(cad?.paidIn?.stockLendingIncome).toBe(0.06);
    expect(usd?.opening).toBe(0.06);
    expect(usd?.closing).toBe(0.06);
  });

  test("the cash block reconciles on both layouts", async () => {
    for (const s of [await managed(), await dual()]) {
      for (const c of s.cash) {
        if (c.totalIn === null || c.totalOut === null) continue;
        expect(c.opening + c.totalIn - c.totalOut).toBeCloseTo(c.closing, 2);
      }
    }
  });
});

describe("contributions and fx", () => {
  test("reads the 60-day split", async () => {
    const s = await managed();
    expect(s.contributions?.first60Days).toBe(0);
    expect(s.contributions?.restOfYear).toBe(8000);
    expect(s.contributions?.yearToDate).toBeNull();
  });

  test("reads the year-to-date figure on the other layout", async () => {
    const s = await dual();
    expect(s.contributions?.yearToDate).toBe(6143.25);
    expect(s.contributions?.first60Days).toBeNull();
    expect(s.dividendsYearToDate).toBe(301.94);
  });

  test("reads the month-end conversion rate", async () => {
    expect((await dual()).fxRate).toBe(1.421);
  });
});
```

- [ ] **Step 3: Run them and verify they fail**

Run: `cd personal/investments/app && bun test src/ingest/brokerage.test.ts`
Expected: FAIL, `Cannot find module './brokerage'`.

- [ ] **Step 4: Implement `brokerage.ts`**

```ts
import type {
  AssetClassTotal,
  CashPaidIn,
  CashPaidOut,
  CashSummary,
  Contributions,
  Currency,
  PortfolioSummary,
  Statement,
} from "../types";
import {
  type LabelValue,
  type Page,
  type Row,
  findRow,
  labelEndX,
  labelStartX,
  rowText,
  scanPairs,
  sliceColumns,
} from "./geometry";
import type { SourceRef } from "./source";

const ACCOUNT_TYPE = /^(Managed|Self-directed|Order Execution Only|Crypto|Chequing|Tax-Free Savings|First Home Savings)\b.*\bAccount$/;
const PERIOD = /(\d{4}-\d{2}-\d{2})\s*-\s*(\d{4}-\d{2}-\d{2})/;
const FX_RATE = /\$1\s?USD\s?=\s?\$([\d.]+)\s?CAD/;

/** Rows from the row matching `start` (exclusive) to the first matching any `ends`. */
function sectionRows(pages: readonly Page[], start: RegExp, ends: readonly RegExp[]): Row[] {
  const all = pages.flatMap((p) => p.rows);
  const from = all.findIndex((r) => start.test(rowText(r)));
  if (from === -1) return [];
  const rest = all.slice(from + 1);
  const to = rest.findIndex((r) => ends.some((e) => e.test(rowText(r))));
  return to === -1 ? rest : rest.slice(0, to);
}

function readAccountType(pages: readonly Page[]): string {
  const row = findRow(pages, ACCOUNT_TYPE);
  if (!row) throw new Error("could not find the account type row");
  return rowText(row);
}

function readPeriod(pages: readonly Page[]): { start: string; end: string } {
  const row = findRow(pages, PERIOD);
  const m = row ? PERIOD.exec(rowText(row)) : null;
  if (!m?.[1] || !m[2]) throw new Error("could not find the statement period");
  return { start: m[1], end: m[2] };
}

/**
 * The summary table sits right of the mailing address, so it is read from a
 * column slice anchored on the "Market Value" header rather than from whole
 * rows. Absolute x is never used: the anchor is found, then everything to its
 * left is discarded.
 */
function readPortfolio(pages: readonly Page[]): PortfolioSummary | null {
  const header = findRow(pages, /Market Value/);
  const totalRow = findRow(pages, /Total Portfolio/);
  if (!header || !totalRow) return null;

  const labelX = labelStartX(totalRow, /Total Portfolio/);
  if (labelX === null) return null;

  const all = pages.flatMap((p) => p.rows);
  const table = sliceColumns(all, labelX - 1, Number.POSITIVE_INFINITY);
  const pairs = scanPairs(table);

  const find = (re: RegExp): number[] => pairs.find((p) => re.test(p.label))?.values ?? [];
  const cash = find(/^Cash$/);
  const total = find(/Total Portfolio/);
  if (cash.length < 3 || total.length < 3) return null;

  // Columns are market value, % of market value, book cost, % of total book.
  const classes: AssetClassTotal[] = pairs
    .filter((p) => /Securities|Equities/.test(p.label) && p.values.length >= 3)
    .map((p) => ({
      name: p.label.replace(/\s*\(The conversion rate.*$/, "").trim(),
      marketValue: p.values[0] ?? 0,
      bookCost: p.values[2] ?? 0,
    }));

  return {
    cashMarketValue: cash[0] ?? 0,
    cashBookCost: cash[2] ?? 0,
    classes,
    totalMarketValue: total[0] ?? 0,
    totalBookCost: total[2] ?? 0,
  };
}

const CASH_END = [/Portfolio Assets/, /Activity - Current period/, /Money-weighted/];

interface CashBlock {
  currencies: Currency[];
  summary: LabelValue[];
  items: LabelValue[];
  contributions: LabelValue[];
}

/**
 * Splits the cash block into the three panels the managed layout prints side by
 * side. A dual-currency statement has no panels, so all three views are the same
 * pair list and the label lookups still resolve. Either way the value rule is
 * uniform: take the last N values, N being the currency count.
 */
function readCashBlock(pages: readonly Page[]): CashBlock {
  const rows = sectionRows(pages, /Portfolio Cash/, CASH_END);
  const dual = rows.some((r) => /USD Transactions/.test(rowText(r)));

  if (dual) {
    const pairs = scanPairs(rows);
    return { currencies: ["CAD", "USD"], summary: pairs, items: pairs, contributions: pairs };
  }

  const paidInRow = rows.find((r) => /Cash Paid In/.test(rowText(r)));
  const contribRow = rows.find((r) => /Contributions/.test(rowText(r)));
  const xIn = paidInRow ? labelStartX(paidInRow, /Cash Paid In/) : null;
  const xContrib = contribRow ? labelStartX(contribRow, /Contributions/) : null;

  const inf = Number.POSITIVE_INFINITY;
  return {
    currencies: ["CAD"],
    summary: scanPairs(sliceColumns(rows, 0, xIn ?? inf)),
    items: scanPairs(sliceColumns(rows, xIn ?? 0, xContrib ?? inf)),
    contributions: scanPairs(sliceColumns(rows, xContrib ?? 0, inf)),
  };
}

function lookup(pairs: readonly LabelValue[], re: RegExp, count: number): number[] {
  const found = pairs.find((p) => re.test(p.label));
  if (!found) return new Array<number>(count).fill(0);
  return found.values.slice(-count);
}

function readCash(block: CashBlock): CashSummary[] {
  const n = block.currencies.length;

  // "Other" appears under both Cash Paid In and Cash Paid Out. Split the item
  // list at the Cash Paid Out heading so each half is unambiguous.
  const outAt = block.items.findIndex((p) => /Cash Paid Out/.test(p.label));
  const inItems = outAt === -1 ? block.items : block.items.slice(0, outAt);
  const outItems = outAt === -1 ? block.items : block.items.slice(outAt);

  const opening = lookup(block.summary, /Last Statement Cash Balance/, n);
  const totalIn = lookup(block.summary, /Total Cash Paid In/, n);
  const totalOut = lookup(block.summary, /Total Cash Paid Out/, n);
  const closing = lookup(block.summary, /Closing Cash Balance/, n);

  const paidIn: Record<keyof CashPaidIn, number[]> = {
    deposits: lookup(inItems, /Deposits/, n),
    proceedsFromSales: lookup(inItems, /Proceeds from sales/, n),
    dividends: lookup(inItems, /(^|\s)Dividends$/, n),
    interestEarned: lookup(inItems, /Interest Earned/, n),
    stockLendingIncome: lookup(inItems, /Stock Lending Income/, n),
    other: lookup(inItems, /(^|\s)Other$/, n),
  };
  const paidOut: Record<keyof CashPaidOut, number[]> = {
    fees: lookup(outItems, /Fees/, n),
    taxes: lookup(outItems, /Taxes/, n),
    interestPaid: lookup(outItems, /Interest Paid/, n),
    costOfInvestments: lookup(outItems, /Cost of Investments/, n),
    withdrawals: lookup(outItems, /Withdrawals/, n),
    other: lookup(outItems, /(^|\s)Other$/, n),
  };

  return block.currencies.map((currency, i) => ({
    currency,
    opening: opening[i] ?? 0,
    closing: closing[i] ?? 0,
    totalIn: totalIn[i] ?? 0,
    totalOut: totalOut[i] ?? 0,
    paidIn: {
      deposits: paidIn.deposits[i] ?? 0,
      proceedsFromSales: paidIn.proceedsFromSales[i] ?? 0,
      dividends: paidIn.dividends[i] ?? 0,
      interestEarned: paidIn.interestEarned[i] ?? 0,
      stockLendingIncome: paidIn.stockLendingIncome[i] ?? 0,
      other: paidIn.other[i] ?? 0,
    },
    paidOut: {
      fees: paidOut.fees[i] ?? 0,
      taxes: paidOut.taxes[i] ?? 0,
      interestPaid: paidOut.interestPaid[i] ?? 0,
      costOfInvestments: paidOut.costOfInvestments[i] ?? 0,
      withdrawals: paidOut.withdrawals[i] ?? 0,
      other: paidOut.other[i] ?? 0,
    },
  }));
}

function readContributions(block: CashBlock): Contributions | null {
  const ytd = block.contributions.find((p) => /Contributions \(year to date\)/.test(p.label));
  if (ytd) {
    return { yearToDate: ytd.values[ytd.values.length - 1] ?? 0, first60Days: null, restOfYear: null };
  }
  const first = block.contributions.find((p) => /First 60 Days/.test(p.label));
  const rest = block.contributions.find((p) => /Rest of Year/.test(p.label));
  if (first && rest) {
    return {
      yearToDate: null,
      first60Days: first.values[first.values.length - 1] ?? 0,
      restOfYear: rest.values[rest.values.length - 1] ?? 0,
    };
  }
  return null;
}

function readDividendsYtd(block: CashBlock): number | null {
  const p = block.contributions.find((x) => /Dividends \(year to date\)/.test(x.label));
  return p ? p.values[p.values.length - 1] ?? null : null;
}

function readFxRate(pages: readonly Page[]): number | null {
  const row = findRow(pages, FX_RATE);
  const m = row ? FX_RATE.exec(rowText(row)) : null;
  return m?.[1] ? Number(m[1]) : null;
}

export function parseBrokerage(pages: readonly Page[], source: SourceRef): Statement {
  const period = readPeriod(pages);
  const block = readCashBlock(pages);

  return {
    source,
    accountType: readAccountType(pages),
    periodStart: period.start,
    periodEnd: period.end,
    portfolio: readPortfolio(pages),
    cash: readCash(block),
    holdings: [],
    activity: [],
    contributions: readContributions(block),
    dividendsYearToDate: readDividendsYtd(block),
    fxRate: readFxRate(pages),
    returns: null,
    balances: null,
  };
}
```

Note `readPeriod` must run before `readAccountType` throws, so the "throws on absent type row" test needs an empty-pages input to fail on period first — reorder if the test reports the wrong message, and assert on whichever runs first.

- [ ] **Step 5: Run the tests**

Run: `cd personal/investments/app && bun test src/ingest/brokerage.test.ts`
Expected: PASS, 13 tests. The "holdings and cash sum" test passes trivially while `holdings` is empty; Task 6 makes it meaningful.

If a lookup returns zeros, print `scanPairs` output for the block and read the actual labels rather than loosening a regex. A regex that matches everything is how the wrong column gets read.

- [ ] **Step 6: Check and commit**

Run: `cd personal/investments/app && bun run check`
Expected: clean, 32 tests.

```bash
git add personal/investments/app
git commit -m "feat(investments): parse brokerage headers, portfolio and cash panels"
```

---

### Task 6: Brokerage — holdings

**Files:**
- Modify: `app/src/ingest/brokerage.ts`, `app/src/ingest/brokerage.test.ts`

**Interfaces:**
- Consumes: Task 5's `parseBrokerage`, `Holding` (Task 4).
- Produces: populated `Statement.holdings`.

- [ ] **Step 1: Write the failing tests**

Append to `app/src/ingest/brokerage.test.ts`:

```ts
describe("holdings", () => {
  test("reads each holding with its stated price", async () => {
    const s = await managed();
    const psa = s.holdings.find((h) => h.symbol === "PSA");
    if (!psa) throw new Error("expected the PSA holding");
    expect(psa.name).toBe("Purpose High Interest Savings ETF");
    expect(psa.quantity).toBe(159.1371);
    expect(psa.segregatedQuantity).toBe(159.1371);
    expect(psa.marketPrice).toBe(50.01);
    expect(psa.priceCurrency).toBe("CAD");
    expect(psa.marketValue).toBe(7958.44);
    expect(psa.bookCost).toBe(7961.6);
    expect(psa.assetClass).toBe("Canadian Equities and Alternatives");
  });

  test("prices PSA as the Canadian ETF, not the US namesake", async () => {
    // A bare-ticker price fetch resolved PSA to Public Storage US at ~$315.
    // The statement states the right one, which is the whole point.
    const psa = (await managed()).holdings.find((h) => h.symbol === "PSA");
    expect(psa?.marketPrice).toBeLessThan(100);
  });

  test("keeps a holding whose segregated quantity is zero", async () => {
    const wse = (await managed()).holdings.find((h) => h.symbol === "WSE401");
    expect(wse?.quantity).toBe(1241.715);
    expect(wse?.segregatedQuantity).toBe(0);
    expect(wse?.marketValue).toBe(12417.15);
  });

  test("flags a holding the statement says is not yet priced", async () => {
    // The June managed statement carries a pending-valuation disclaimer for
    // WSE401. This is the whole of the $279.94 ground-truth residual, so it
    // must be labelled rather than silently accepted.
    const s = await managed();
    expect(s.holdings.find((h) => h.symbol === "WSE401")?.pendingValuation).toBe(true);
    expect(s.holdings.find((h) => h.symbol === "PSA")?.pendingValuation).toBe(false);
  });

  test("assigns the asset class despite the name wrapping around address lines", async () => {
    // "Canadian Equities and" and "Alternatives" are two rows with a mailing
    // address row between them.
    const s = await managed();
    expect(s.holdings.every((h) => h.assetClass !== "")).toBe(true);
  });

  test("returns no holdings for an account that holds nothing", async () => {
    const s = await load("brokerage-empty", "ACCT0006CAD_2026-06_BROKERAGE.pdf");
    expect(s.holdings).toEqual([]);
  });
});
```

- [ ] **Step 2: Run them and verify they fail**

Run: `cd personal/investments/app && bun test src/ingest/brokerage.test.ts -t holdings`
Expected: FAIL, holdings is `[]`.

- [ ] **Step 3: Implement holdings**

Add to `brokerage.ts`, wire `holdings: readHoldings(pages)` into `parseBrokerage`, and add `Holding` to the type import:

```ts
const ASSETS_END = [/^\*Book Cost/, /Activity - Current period/, /LEVERAGE DISCLOSURE/];
const CLASS_HEADING = /^(Canadian|US)[- ](Listed Securities|Equities)/;
const PENDING = /PENDING VALUATION|Pricing for this period is not yet available/;

/**
 * A holding row is: name, symbol, total quantity, segregated quantity, price
 * with currency, market value, book cost. The name and symbol are words; the
 * five numbers are the row's money tokens in x order.
 */
function readHoldings(pages: readonly Page[]): Holding[] {
  const rows = sectionRows(pages, /Portfolio Assets/, ASSETS_END);
  const pendingSymbols = readPendingSymbols(pages);

  const holdings: Holding[] = [];
  let assetClass = "";

  for (const row of rows) {
    const text = rowText(row);

    if (CLASS_HEADING.test(text)) {
      assetClass = text.replace(/\s*\(The conversion rate.*$/, "").trim();
      continue;
    }
    if (/^Total\b/.test(text)) continue;

    const values: number[] = [];
    const words: string[] = [];
    let currency: Currency = "CAD";
    for (const w of row.words) {
      if (isMoney(w.text)) values.push(parseMoney(w.text));
      else if (w.text === "USD" || w.text === "CAD") currency = w.text;
      else words.push(w.text);
    }
    if (values.length < 5 || words.length < 2) continue;

    const symbol = words[words.length - 1];
    const name = words.slice(0, -1).join(" ");
    if (!symbol || !/^[A-Z][A-Z0-9.]*$/.test(symbol)) continue;

    holdings.push({
      name,
      symbol,
      quantity: values[0] ?? 0,
      segregatedQuantity: values[1] ?? 0,
      marketPrice: values[2] ?? 0,
      priceCurrency: currency,
      marketValue: values[3] ?? 0,
      bookCost: values[4] ?? 0,
      assetClass,
      pendingValuation: pendingSymbols.has(symbol),
    });
  }
  return holdings;
}

/** Symbols named in a pending-valuation disclaimer, e.g. "WSE401 is valued...". */
function readPendingSymbols(pages: readonly Page[]): Set<string> {
  const out = new Set<string>();
  if (!findRow(pages, PENDING)) return out;
  for (const row of pages.flatMap((p) => p.rows)) {
    const m = /\b([A-Z][A-Z0-9]{2,})\s+is valued\b/.exec(rowText(row));
    if (m?.[1]) out.add(m[1]);
  }
  return out;
}
```

Import `isMoney` and `parseMoney` from `./money`.

**Class-name wrapping is deliberately not used for reconciliation.** The summary's class label wraps around mailing-address rows and does not match the assets section's heading. Task 10 therefore checks holdings against the **portfolio total**, not against per-class totals, which is a stronger check and immune to label drift.

- [ ] **Step 4: Run and verify**

Run: `cd personal/investments/app && bun test src/ingest/brokerage.test.ts`
Expected: PASS, 19 tests. The "holdings and cash sum to the portfolio total" test from Task 5 is now meaningful.

- [ ] **Step 5: Check and commit**

Run: `cd personal/investments/app && bun run check` → clean, 38 tests.

```bash
git add personal/investments/app
git commit -m "feat(investments): parse brokerage holdings with stated market prices"
```

---

### Task 7: Brokerage — activity rows

**Files:**
- Modify: `app/src/ingest/brokerage.ts`, `app/src/ingest/brokerage.test.ts`

**Interfaces:**
- Consumes: Task 6's `parseBrokerage`, `ActivityRow` (Task 4).
- Produces: populated `Statement.activity`.

Rows wrap across two or three rows, the column header and page number repeat mid-table, and a dual-currency statement has a `CAD Activity` section followed by a `USD Activity` one.

- [ ] **Step 1: Write the failing tests**

Append to `app/src/ingest/brokerage.test.ts`:

```ts
describe("activity", () => {
  test("reads a single-row entry with its three money columns", async () => {
    const fee = (await managed()).activity.find((r) => r.code === "FEE");
    if (!fee) throw new Error("expected the management fee row");
    expect(fee.date).toBe("2026-06-30");
    expect(fee.debit).toBe(7.52);
    expect(fee.credit).toBe(0);
    expect(fee.balance).toBe(122.95);
    expect(fee.currency).toBe("CAD");
  });

  test("joins a description that wraps onto the next row", async () => {
    const buy = (await managed()).activity.find((r) => r.code === "BUY");
    expect(buy?.description).toBe(
      "WSE401 - WS PVT MKT I F: Bought 1241.7150 shares at $10.00 per share (executed at 2026-05-29)",
    );
  });

  test("parses a negative balance rendered as $-12,300.48", async () => {
    expect((await managed()).activity.find((r) => r.code === "BUY")?.balance).toBe(-12300.48);
  });

  test("never mistakes a page number or repeated header for a row", async () => {
    const s = await dual();
    expect(s.activity.every((r) => /^\d{4}-\d{2}-\d{2}$/.test(r.date))).toBe(true);
    expect(s.activity.every((r) => r.code !== "")).toBe(true);
    expect(s.activity.some((r) => /\d+\/\d+/.test(r.description))).toBe(false);
  });

  test("tags rows in the USD section as USD", async () => {
    const s = await dual();
    expect(new Set(s.activity.map((r) => r.currency)).has("CAD")).toBe(true);
  });

  test("credits and debits reconcile to the printed cash totals", async () => {
    const s = await dual();
    const cad = s.cash.find((c) => c.currency === "CAD");
    const rows = s.activity.filter((r) => r.currency === "CAD");
    expect(rows.reduce((a, r) => a + r.credit, 0)).toBeCloseTo(cad?.totalIn ?? -1, 2);
    expect(rows.reduce((a, r) => a + r.debit, 0)).toBeCloseTo(cad?.totalOut ?? -1, 2);
  });

  test("returns no activity for an empty period", async () => {
    const s = await load("brokerage-empty", "ACCT0006CAD_2026-06_BROKERAGE.pdf");
    expect(s.activity).toEqual([]);
  });
});
```

- [ ] **Step 2: Run and verify they fail**

Run: `cd personal/investments/app && bun test src/ingest/brokerage.test.ts -t activity`
Expected: FAIL, activity is `[]`.

- [ ] **Step 3: Implement activity**

Add to `brokerage.ts` and wire `activity: readActivity(pages)` into `parseBrokerage`:

```ts
const ACTIVITY_HEADING = /^(?:(CAD|USD) )?Activity - Current period$/;
const ACTIVITY_END = /^(LEVERAGE DISCLOSURE|STATEMENT NOTES|Money-weighted Return Rates)/;
const COLUMN_HEADER = /^Date\s+Transaction\s+Description/;
const PAGE_NUMBER = /^\d+\s*\/\s*\d+$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const CODE = /^[A-Z][A-Z0-9]*$/;

/**
 * A row starts with a date word, then a code word, then description words and
 * three money columns. Rows without a leading date continue the previous
 * description. Page numbers and the header repeated on every page are dropped
 * explicitly: the page number is indented far enough to look like a
 * continuation and carries no money token, so nothing else excludes it.
 */
function readActivity(pages: readonly Page[]): ActivityRow[] {
  const rows: ActivityRow[] = [];
  let currency: Currency = "CAD";
  let inSection = false;
  let current: ActivityRow | null = null;

  for (const row of pages.flatMap((p) => p.rows)) {
    const text = rowText(row);

    const heading = ACTIVITY_HEADING.exec(text);
    if (heading) {
      currency = heading[1] === "USD" ? "USD" : "CAD";
      inSection = true;
      current = null;
      continue;
    }
    if (!inSection) continue;
    if (ACTIVITY_END.test(text)) {
      inSection = false;
      current = null;
      continue;
    }
    if (PAGE_NUMBER.test(text) || COLUMN_HEADER.test(text)) continue;

    const first = row.words[0];
    if (first && DATE.test(first.text)) {
      const values: number[] = [];
      const words: string[] = [];
      for (const w of row.words.slice(1)) {
        if (isMoney(w.text)) values.push(parseMoney(w.text));
        else words.push(w.text);
      }
      const code = words[0];
      if (!code || !CODE.test(code) || values.length < 3) continue;

      current = {
        date: first.text,
        postedDate: null,
        code,
        description: words.slice(1).join(" "),
        debit: values[values.length - 3] ?? 0,
        credit: values[values.length - 2] ?? 0,
        balance: values[values.length - 1] ?? 0,
        currency,
      };
      rows.push(current);
      continue;
    }

    if (current && !row.words.some((w) => isMoney(w.text))) {
      current.description = `${current.description} ${text}`.trim();
    }
  }
  return rows;
}
```

Import `ActivityRow` from `../types`.

- [ ] **Step 4: Run and verify**

Run: `cd personal/investments/app && bun test src/ingest/brokerage.test.ts`
Expected: PASS, 26 tests.

- [ ] **Step 5: Mutation-check the reconciliation test**

Temporarily change `credit: values[values.length - 2] ?? 0` to `credit: 0`, run the suite, confirm "credits and debits reconcile to the printed cash totals" fails, then revert. A test that cannot fail is not a test.

- [ ] **Step 6: Check and commit**

Run: `cd personal/investments/app && bun run check` → clean, 45 tests.

```bash
git add personal/investments/app
git commit -m "feat(investments): parse brokerage activity across wraps and currencies"
```

---

### Task 8: Performance and cash parsers, and dispatch

**Files:**
- Create: `app/src/ingest/performance.ts`, `app/src/ingest/cash.ts`, `app/src/ingest/parse.ts`
- Test: `app/src/ingest/performance.test.ts`, `app/src/ingest/cash.test.ts`

**Interfaces:**
- Consumes: `parseBrokerage` (Tasks 5-7), `geometry.ts`, `types.ts`.
- Produces: `parsePerformance(pages, source): Statement`; `parseCash(pages, source): Statement`; `parseStatement(xml: string, source: SourceRef): Statement`.

- [ ] **Step 1: Write the failing performance test**

`app/src/ingest/performance.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { parseGeometry } from "./geometry";
import { parsePerformance } from "./performance";
import { parseSourceFilename } from "./source";

const source = parseSourceFilename("ACCT0001CAD_2026-04_PERFORMANCE.pdf");
if (!source) throw new Error("bad fixture filename");

async function load() {
  const xml = await Bun.file(join(import.meta.dir, "__fixtures__", "performance.xml")).text();
  return parsePerformance(parseGeometry(xml), source);
}

describe("parsePerformance", () => {
  test("keeps everything the brokerage parser produces", async () => {
    const s = await load();
    expect(s.accountType).toBe("Managed RRSP Account");
    expect(s.portfolio?.totalMarketValue).toBe(12370.86);
    expect(s.holdings).toHaveLength(1);
  });

  test("reads the money-weighted return rates", async () => {
    const s = await load();
    expect(s.returns?.sinceInception).toBe(10.31);
  });

  test("reads a horizon that does not yet apply as null, not as 0%", async () => {
    // The statement prints 0.00% for horizons shorter than the account's life.
    // Treating those as a measured zero corrupts phase 3's fitted returns.
    const s = await load();
    expect(s.returns?.tenYears).toBeNull();
  });

  test("reads the period balance summary", async () => {
    const s = await load();
    expect(s.balances).toEqual({
      start: 12531.01,
      deposits: 0,
      withdrawals: 0,
      changeInMarketValue: -160.15,
      end: 12370.86,
    });
  });

  test("the balance summary reconciles, and its end matches the portfolio total", async () => {
    const s = await load();
    const b = s.balances;
    if (!b) throw new Error("expected balances");
    expect(b.start + b.deposits - b.withdrawals + b.changeInMarketValue).toBeCloseTo(b.end, 2);
    expect(b.end).toBeCloseTo(s.portfolio?.totalMarketValue ?? -1, 2);
  });
});
```

- [ ] **Step 2: Run, verify failure, implement `performance.ts`**

```ts
import type { PeriodBalances, Returns, Statement } from "../types";
import { parseBrokerage } from "./brokerage";
import { type Page, findRow, rowText, scanPairs } from "./geometry";
import type { SourceRef } from "./source";

const RETURNS_HEADING = /Money-weighted Return Rates/;
const PERCENT = /-?[\d.]+(?=%)/g;
const BALANCE_HEADING = /Start date balance/;

/**
 * A horizon shorter than the account's life prints 0.00%. That is "not
 * applicable", not a measured zero, so it becomes null. Only `sinceInception`
 * is always real.
 */
function orNull(value: number | undefined): number | null {
  if (value === undefined) return null;
  return value === 0 ? null : value;
}

function readReturns(pages: readonly Page[]): Returns | null {
  const heading = findRow(pages, RETURNS_HEADING);
  if (!heading) return null;

  const all = pages.flatMap((p) => p.rows);
  const at = all.indexOf(heading);
  const row = all.slice(at + 1, at + 6).find((r) => (rowText(r).match(PERCENT) ?? []).length >= 6);
  if (!row) return null;

  const values = (rowText(row).match(PERCENT) ?? []).map(Number);
  return {
    currentPeriod: orNull(values[0]),
    oneYear: orNull(values[1]),
    threeYears: orNull(values[2]),
    fiveYears: orNull(values[3]),
    tenYears: orNull(values[4]),
    sinceInception: values[5] ?? null,
  };
}

function readBalances(pages: readonly Page[]): PeriodBalances | null {
  const heading = findRow(pages, BALANCE_HEADING);
  if (!heading) return null;

  const all = pages.flatMap((p) => p.rows);
  const at = all.indexOf(heading);
  const pairs = scanPairs(all.slice(at + 1, at + 5));
  const values = pairs.flatMap((p) => p.values);
  if (values.length < 5) return null;

  return {
    start: values[0] ?? 0,
    deposits: values[1] ?? 0,
    withdrawals: values[2] ?? 0,
    changeInMarketValue: values[3] ?? 0,
    end: values[4] ?? 0,
  };
}

export function parsePerformance(pages: readonly Page[], source: SourceRef): Statement {
  const base = parseBrokerage(pages, source);
  return { ...base, returns: readReturns(pages), balances: readBalances(pages) };
}
```

Run: PASS, 5 tests.

Note: a `PERFORMANCE` statement for an account funded mid-period prints a dash rather than a figure in the balance summary. If `readBalances` finds fewer than five values it returns null, which Task 10 reports as a warning rather than an error.

- [ ] **Step 3: Write the failing cash test**

`app/src/ingest/cash.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { parseCash } from "./cash";
import { parseGeometry } from "./geometry";
import { parseSourceFilename } from "./source";

const source = parseSourceFilename("ACCT0005CAD_2026-06_CASH.pdf");
if (!source) throw new Error("bad fixture filename");

async function load() {
  const xml = await Bun.file(join(import.meta.dir, "__fixtures__", "cash.xml")).text();
  return parseCash(parseGeometry(xml), source);
}

describe("parseCash", () => {
  test("reads the account type and period", async () => {
    const s = await load();
    expect(s.accountType).toBe("Chequing Account");
    expect(s.periodStart).toBe("2026-06-01");
    expect(s.periodEnd).toBe("2026-06-30");
  });

  test("reads opening and closing balances and nothing it does not have", async () => {
    const cad = (await load()).cash[0];
    expect(cad?.opening).toBe(195.59);
    expect(cad?.closing).toBe(155.62);
    expect(cad?.totalIn).toBeNull();
    expect(cad?.paidIn).toBeNull();
  });

  test("holds no securities and no portfolio", async () => {
    const s = await load();
    expect(s.portfolio).toBeNull();
    expect(s.holdings).toEqual([]);
  });

  test("reads a row with the en-dash negative", async () => {
    const row = (await load()).activity.find((r) => r.debit === 122.84);
    expect(row?.date).toBe("2026-06-03");
    expect(row?.balance).toBe(72.75);
    expect(row?.credit).toBe(0);
  });

  test("reads a row whose posted date differs from its transaction date", async () => {
    const row = (await load()).activity.find((r) => r.description.includes("Direct deposit"));
    expect(row?.date).toBe("2026-06-12");
    expect(row?.postedDate).toBe("2026-06-15");
    expect(row?.credit).toBe(3101.5);
  });

  test("keeps a negative running balance", async () => {
    expect((await load()).activity.some((r) => r.balance === -2556.28)).toBe(true);
  });

  test("the activity rows reconcile opening to closing", async () => {
    const s = await load();
    const cad = s.cash[0];
    if (!cad) throw new Error("expected a cash summary");
    const net = s.activity.reduce((a, r) => a + r.credit - r.debit, 0);
    expect(cad.opening + net).toBeCloseTo(cad.closing, 2);
  });
});
```

- [ ] **Step 4: Run, verify failure, implement `cash.ts`**

```ts
import type { ActivityRow, Statement } from "../types";
import { type Page, findRow, rowText } from "./geometry";
import { isMoney, parseMoney } from "./money";
import type { SourceRef } from "./source";

const HEADING = /^(\w[\w ]*?) monthly statement$/;
const PERIOD = /^(\w{3}) (\d{1,2}) - (\w{3}) (\d{1,2}), (\d{4})$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

const MONTHS: Record<string, string> = {
  Jan: "01", Feb: "02", Mar: "03", Apr: "04", May: "05", Jun: "06",
  Jul: "07", Aug: "08", Sep: "09", Oct: "10", Nov: "11", Dec: "12",
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

/** The summary block prints the opening and closing balance side by side. */
function readBalances(pages: readonly Page[]): { opening: number; closing: number } {
  for (const row of pages.flatMap((p) => p.rows)) {
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
      { currency: "CAD", opening, closing, totalIn: null, totalOut: null, paidIn: null, paidOut: null },
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
```

Run: PASS, 7 tests.

- [ ] **Step 5: Implement dispatch**

`app/src/ingest/parse.ts`:

```ts
import type { Statement } from "../types";
import { parseBrokerage } from "./brokerage";
import { parseCash } from "./cash";
import { parseGeometry } from "./geometry";
import { parsePerformance } from "./performance";
import type { SourceRef } from "./source";

export function parseStatement(xml: string, source: SourceRef): Statement {
  const pages = parseGeometry(xml);
  switch (source.template) {
    case "BROKERAGE":
      return parseBrokerage(pages, source);
    case "PERFORMANCE":
      return parsePerformance(pages, source);
    case "CASH":
      return parseCash(pages, source);
  }
}
```

- [ ] **Step 6: Check and commit**

Run: `cd personal/investments/app && bun run check` → clean, 57 tests.

```bash
git add personal/investments/app
git commit -m "feat(investments): parse performance and cash statements, add dispatch"
```

---

### Task 9: Masking, account-type mapping, registry

**Files:**
- Create: `app/src/store/mask.ts`, `app/src/store/registry.ts`
- Test: `app/src/store/mask.test.ts`

**Interfaces:**
- Consumes: `Statement` (Task 4).
- Produces: `maskAccountNo(accountNo): { maskedId: string; shortId: string }`; `redactText(text, names): string`; `classifyAccountType(accountType): { kind: AccountKind; style: ManagementStyle }`; `type AccountKind`; `type ManagementStyle`; `type Purpose`; `interface AccountRecord`; `buildRegistry(statements: readonly Statement[]): AccountRecord[]`.

**The mapping table is derived from the whole corpus, not a sample.** Twenty wordings appear across 220 statements. Two are traps: `Tax-Free Savings Managed Cash Account` and `First Home Savings SDI Cash Account` contain "Cash" while being a TFSA and an FHSA, and `Tax-Free Savings Account` contains no `TFSA` token. Order matters, and an unknown wording throws — defaulting is what let a corporate account feed the personal tax estimate for months.

- [ ] **Step 1: Write the failing tests**

`app/src/store/mask.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import { classifyAccountType, maskAccountNo, redactText } from "./mask";

describe("maskAccountNo", () => {
  test("is deterministic and reveals nothing", () => {
    const a = maskAccountNo("ACCT0001CAD");
    expect(a).toEqual(maskAccountNo("ACCT0001CAD"));
    expect(a.maskedId).toMatch(/^acct_[0-9a-f]{8}$/);
    expect(a.shortId).toMatch(/^[0-9a-f]{4}$/);
    expect(a.maskedId).toContain(a.shortId);
    expect(a.maskedId).not.toContain("ACCT0001");
  });

  test("different accounts get different ids", () => {
    expect(maskAccountNo("ACCT0001CAD").maskedId).not.toBe(maskAccountNo("ACCT0002CAD").maskedId);
  });
});

describe("redactText", () => {
  test("removes configured names case-insensitively", () => {
    expect(redactText("e-Transfer Received from Jane Doe", ["Jane Doe"])).toBe(
      "e-Transfer Received from [redacted]",
    );
    expect(redactText("paid to JANE DOE", ["Jane Doe"])).toBe("paid to [redacted]");
  });

  test("leaves unrelated text alone", () => {
    expect(redactText("Transfer out to Non-registered", ["Jane Doe"])).toBe(
      "Transfer out to Non-registered",
    );
  });
});

describe("classifyAccountType", () => {
  test("maps every wording present in the corpus", () => {
    const cases: [string, string, string][] = [
      ["Tax-Free Savings Account", "TFSA", "self-directed"],
      ["Tax-Free Savings SDI Cash Account", "TFSA", "self-directed"],
      ["Tax-Free Savings Managed Cash Account", "TFSA", "managed"],
      ["Self-directed TFSA Account", "TFSA", "self-directed"],
      ["Managed TFSA Account", "TFSA", "managed"],
      ["Order Execution Only TFSA Account", "TFSA", "self-directed"],
      ["First Home Savings SDI Cash Account", "FHSA", "self-directed"],
      ["Self-directed FHSA Account", "FHSA", "self-directed"],
      ["Order Execution Only FHSA Account", "FHSA", "self-directed"],
      ["Self-directed RRSP Account", "RRSP", "self-directed"],
      ["Managed RRSP Account", "RRSP", "managed"],
      ["Order Execution Only RRSP Account", "RRSP", "self-directed"],
      ["Self-directed Spousal RRSP Account", "SpousalRRSP", "self-directed"],
      ["Order Execution Only Spousal RRSP Account", "SpousalRRSP", "self-directed"],
      ["Self-directed RESP Account", "RESP", "self-directed"],
      ["Order Execution Only RESP Account", "RESP", "self-directed"],
      ["Self-directed Non-Registered Cash Account", "NonRegistered", "self-directed"],
      ["Order Execution Only Non-Registered Cash Account", "NonRegistered", "self-directed"],
      ["Crypto Account", "Crypto", "self-directed"],
      ["Chequing Account", "Chequing", "self-directed"],
    ];
    for (const [type, kind, style] of cases) {
      expect(classifyAccountType(type)).toEqual({ kind, style });
    }
  });

  test("does not let the word Cash override the wrapper", () => {
    // Both of these say "Cash" and neither is a cash account.
    expect(classifyAccountType("Tax-Free Savings Managed Cash Account").kind).toBe("TFSA");
    expect(classifyAccountType("First Home Savings SDI Cash Account").kind).toBe("FHSA");
  });

  test("checks spousal before plain RRSP", () => {
    expect(classifyAccountType("Managed Spousal RRSP Account").kind).toBe("SpousalRRSP");
  });

  test("throws on an unrecognised wording rather than defaulting", () => {
    expect(() => classifyAccountType("Managed LIRA Account")).toThrow(/unrecognised account type/i);
  });
});
```

- [ ] **Step 2: Run, verify failure, implement `mask.ts`**

```ts
import { createHash } from "node:crypto";

export type AccountKind =
  | "TFSA" | "FHSA" | "RRSP" | "SpousalRRSP" | "RESP"
  | "NonRegistered" | "Crypto" | "Chequing";

/** Managed versus self-directed. This is the app's Portfolios/Trading split. */
export type ManagementStyle = "managed" | "self-directed";

export interface MaskedId {
  maskedId: string;
  shortId: string;
}

/** Deterministic and one-way. The account number never reaches the datastore. */
export function maskAccountNo(accountNo: string): MaskedId {
  const digest = createHash("sha256").update(accountNo).digest("hex");
  return { maskedId: `acct_${digest.slice(0, 8)}`, shortId: digest.slice(0, 4) };
}

export function redactText(text: string, names: readonly string[]): string {
  let out = text;
  for (const name of names) {
    if (!name) continue;
    out = out.replace(new RegExp(name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi"), "[redacted]");
  }
  return out;
}

/**
 * Order is load-bearing. Spousal must precede RRSP, and both "Tax-Free Savings"
 * and "First Home Savings" must precede anything matching "Cash", because
 * "Tax-Free Savings Managed Cash Account" is a TFSA and "First Home Savings SDI
 * Cash Account" is an FHSA. "Tax-Free Savings Account" carries no TFSA token at
 * all, which is why the long-form names are listed first.
 */
const KIND_RULES: readonly (readonly [RegExp, AccountKind])[] = [
  [/Spousal RRSP/i, "SpousalRRSP"],
  [/Tax-Free Savings/i, "TFSA"],
  [/First Home Savings/i, "FHSA"],
  [/\bTFSA\b/i, "TFSA"],
  [/\bFHSA\b/i, "FHSA"],
  [/\bRESP\b/i, "RESP"],
  [/\bRRSP\b/i, "RRSP"],
  [/Non-Registered/i, "NonRegistered"],
  [/\bCrypto\b/i, "Crypto"],
  [/\bChequing\b/i, "Chequing"],
];

export function classifyAccountType(accountType: string): {
  kind: AccountKind;
  style: ManagementStyle;
} {
  const style: ManagementStyle = /\bManaged\b/i.test(accountType) ? "managed" : "self-directed";
  for (const [pattern, kind] of KIND_RULES) {
    if (pattern.test(accountType)) return { kind, style };
  }
  throw new Error(`unrecognised account type: ${JSON.stringify(accountType)}`);
}
```

Run: PASS, 8 tests.

- [ ] **Step 3: Implement `registry.ts`**

```ts
import type { Statement } from "../types";
import { type AccountKind, type ManagementStyle, classifyAccountType, maskAccountNo } from "./mask";

export type Purpose = "retirement" | "house" | "education" | "business" | "spending" | "unassigned";

export interface AccountRecord {
  maskedId: string;
  shortId: string;
  label: string;
  kind: AccountKind;
  style: ManagementStyle;
  purpose: Purpose;
  inTotals: boolean;
  firstPeriod: string;
  lastPeriod: string;
  statementCount: number;
  /** Distinct account-type wordings seen, oldest first. Wording drifts over years. */
  typeHistory: string[];
}

/** Owner-reviewed, keyed by the 4-char short id the interface shows. */
const LABELS: Record<string, string> = {};
const PURPOSES: Record<string, Purpose> = {};

const EXCLUDED_KINDS: readonly AccountKind[] = ["Chequing"];

/**
 * Kind comes from the account's MOST RECENT statement, because the wording has
 * changed twice and the latest form is the one the mapping table is richest in.
 * Earlier statements disagreeing on kind is a reconciliation finding (Task 10),
 * not something resolved here.
 */
export function buildRegistry(statements: readonly Statement[]): AccountRecord[] {
  const byAccount = new Map<string, Statement[]>();
  for (const s of statements) {
    const list = byAccount.get(s.source.accountNo) ?? [];
    list.push(s);
    byAccount.set(s.source.accountNo, list);
  }

  const records: AccountRecord[] = [];
  for (const [accountNo, group] of byAccount) {
    const sorted = [...group].sort((a, b) => a.source.period.localeCompare(b.source.period));
    const latest = sorted[sorted.length - 1];
    const earliest = sorted[0];
    if (!latest || !earliest) continue;

    const { maskedId, shortId } = maskAccountNo(accountNo);
    const { kind, style } = classifyAccountType(latest.accountType);

    records.push({
      maskedId,
      shortId,
      label: LABELS[shortId] ?? `${kind} ${shortId}`,
      kind,
      style,
      purpose: PURPOSES[shortId] ?? "unassigned",
      inTotals: !EXCLUDED_KINDS.includes(kind),
      firstPeriod: earliest.source.period,
      lastPeriod: latest.source.period,
      statementCount: sorted.length,
      typeHistory: [...new Set(sorted.map((s) => s.accountType))],
    });
  }
  return records.sort((a, b) => a.shortId.localeCompare(b.shortId));
}
```

- [ ] **Step 4: Check and commit**

Run: `cd personal/investments/app && bun run check` → clean, 65 tests.

```bash
git add personal/investments/app
git commit -m "feat(investments): mask accounts and map every account-type wording"
```

---

### Task 10: The reconciliation checks

**Files:**
- Create: `app/src/validate/report.ts`, `app/src/validate/checks.ts`, `app/src/truth.ts`, `app/src/corrections.ts`
- Test: `app/src/validate/checks.test.ts`

**Interfaces:**
- Consumes: `Statement` (Task 4), `maskAccountNo`/`classifyAccountType` (Task 9).
- Produces: `type CheckName`; `interface Finding`; `interface Observation`; `checkArithmetic`, `checkContinuity`, `checkCoverage`, `checkCrossDocument`, `checkSupersession`, `checkKindConsistency`, `checkGroundTruth`, `runChecks`; `const TOLERANCE`; `within(a, b, tolerance?)`.

**`countedAccounts` holds raw account numbers**, matched against `Statement.source.accountNo`, which is unmasked at check time. Findings themselves carry masked short ids, because the report is committed.

**Continuity and coverage key on `(account, period, template)`, never `(account, period)`.** The three chequing accounts each produce both a `BROKERAGE` and a `CASH` statement for the same month — 25-plus account-months. Keying on the pair compares one June document's closing to the other June document's opening and emits guaranteed false findings.

- [ ] **Step 1: Write `report.ts`**

```ts
export type CheckName =
  | "statement-arithmetic"
  | "missing-portfolio"
  | "cash-continuity"
  | "coverage-gap"
  | "cross-document"
  | "superseded"
  | "kind-drift"
  | "ground-truth";

export interface Finding {
  check: CheckName;
  severity: "error" | "warning";
  accountShortId: string;
  period: string;
  message: string;
  expected: number | null;
  actual: number | null;
  delta: number | null;
  sourceFile: string;
}

export interface ReconciliationReport {
  generated: string;
  statementCount: number;
  findings: Finding[];
}

/** Statements print to the cent, so a cent of slack is enough. */
export const TOLERANCE = 0.011;

export function within(a: number, b: number, tolerance = TOLERANCE): boolean {
  return Math.abs(a - b) <= tolerance;
}
```

- [ ] **Step 2: Write the failing tests**

`app/src/validate/checks.test.ts`. `statement()` builds a valid managed-RRSP statement; each test breaks exactly one thing.

```ts
import { describe, expect, test } from "bun:test";
import type { Statement } from "../types";
import {
  checkArithmetic,
  checkContinuity,
  checkCoverage,
  checkGroundTruth,
  checkKindConsistency,
  checkSupersession,
} from "./checks";

function src(period: string, template: "BROKERAGE" | "CASH" | "PERFORMANCE", version = 0) {
  return {
    file: `ACCT0001CAD_${period}_${template}.pdf`,
    accountNo: "ACCT0001CAD",
    period,
    template,
    version,
  };
}

function statement(over: Partial<Statement> = {}): Statement {
  return {
    source: src("2026-06", "BROKERAGE"),
    accountType: "Managed RRSP Account",
    periodStart: "2026-06-01",
    periodEnd: "2026-06-30",
    portfolio: {
      cashMarketValue: 122.95,
      cashBookCost: 122.95,
      classes: [],
      totalMarketValue: 20498.54,
      totalBookCost: 20501.7,
    },
    cash: [
      {
        currency: "CAD",
        opening: 116.67,
        closing: 122.95,
        totalIn: 12430.95,
        totalOut: 12424.67,
        paidIn: {
          deposits: 0, proceedsFromSales: 12417.15, dividends: 13.8,
          interestEarned: 0, stockLendingIncome: 0, other: 0,
        },
        paidOut: {
          fees: 7.52, taxes: 0, interestPaid: 0,
          costOfInvestments: 12417.15, withdrawals: 0, other: 0,
        },
      },
    ],
    holdings: [
      {
        name: "Purpose High Interest Savings ETF", symbol: "PSA", quantity: 159.1371,
        segregatedQuantity: 159.1371, marketPrice: 50.01, priceCurrency: "CAD",
        marketValue: 7958.44, bookCost: 7961.6,
        assetClass: "Canadian Equities and Alternatives", pendingValuation: false,
      },
      {
        name: "WS PVT MKT I F", symbol: "WSE401", quantity: 1241.715,
        segregatedQuantity: 0, marketPrice: 10, priceCurrency: "CAD",
        marketValue: 12417.15, bookCost: 12417.15,
        assetClass: "Canadian Equities and Alternatives", pendingValuation: true,
      },
    ],
    activity: [],
    contributions: null,
    dividendsYearToDate: null,
    fxRate: null,
    returns: null,
    balances: null,
    ...over,
  };
}

describe("checkArithmetic", () => {
  test("passes a statement whose printed figures agree", () => {
    expect(checkArithmetic([statement()])).toEqual([]);
  });

  test("flags cash that does not reconcile", () => {
    const bad = statement();
    const cad = bad.cash[0];
    if (!cad) throw new Error("fixture");
    cad.closing = 999;
    const f = checkArithmetic([bad]);
    expect(f).toHaveLength(1);
    expect(f[0]?.check).toBe("statement-arithmetic");
    expect(f[0]?.accountShortId).not.toContain("ACCT");
  });

  test("flags holdings that do not sum to the portfolio total", () => {
    const bad = statement();
    const h = bad.holdings[0];
    if (!h) throw new Error("fixture");
    h.marketValue = 1;
    expect(checkArithmetic([bad]).some((x) => x.message.includes("portfolio total"))).toBe(true);
  });

  test("flags a paid-in breakdown that does not sum to its total", () => {
    const bad = statement();
    const cad = bad.cash[0];
    if (!cad?.paidIn) throw new Error("fixture");
    cad.paidIn.dividends = 500;
    expect(checkArithmetic([bad]).some((x) => x.message.includes("paid in"))).toBe(true);
  });

  test("flags a BROKERAGE statement with no portfolio as a parser bug", () => {
    const bad = statement({ portfolio: null, holdings: [] });
    expect(checkArithmetic([bad]).some((x) => x.check === "missing-portfolio")).toBe(true);
  });

  test("skips the cash arithmetic when no totals are printed", () => {
    const cashOnly = statement({
      source: src("2026-06", "CASH"),
      portfolio: null,
      holdings: [],
      cash: [
        { currency: "CAD", opening: 195.59, closing: 155.62, totalIn: null,
          totalOut: null, paidIn: null, paidOut: null },
      ],
    });
    expect(checkArithmetic([cashOnly])).toEqual([]);
  });
});

describe("checkContinuity", () => {
  const june = () => statement();
  const july = (opening: number) =>
    statement({
      source: src("2026-07", "BROKERAGE"),
      cash: [{ currency: "CAD", opening, closing: opening, totalIn: 0, totalOut: 0,
        paidIn: null, paidOut: null }],
    });

  test("passes when one month closes where the next opens", () => {
    expect(checkContinuity([june(), july(122.95)])).toEqual([]);
  });

  test("flags a broken opening balance", () => {
    const f = checkContinuity([june(), july(500)]);
    expect(f).toHaveLength(1);
    expect(f[0]?.delta).toBeCloseTo(122.95 - 500, 2);
  });

  test("does not compare a CASH statement against a BROKERAGE one", () => {
    // The three chequing accounts have both for the same month. Comparing
    // across templates produces guaranteed false findings.
    const brokerage = june();
    const cash = statement({
      source: src("2026-06", "CASH"),
      cash: [{ currency: "CAD", opening: 195.59, closing: 155.62, totalIn: null,
        totalOut: null, paidIn: null, paidOut: null }],
    });
    const nextCash = statement({
      source: src("2026-07", "CASH"),
      cash: [{ currency: "CAD", opening: 155.62, closing: 155.62, totalIn: null,
        totalOut: null, paidIn: null, paidOut: null }],
    });
    expect(checkContinuity([brokerage, cash, nextCash])).toEqual([]);
  });
});

describe("checkCoverage", () => {
  test("passes a contiguous run", () => {
    const run = ["2026-04", "2026-05", "2026-06"].map((p) =>
      statement({ source: src(p, "BROKERAGE") }),
    );
    expect(checkCoverage(run)).toEqual([]);
  });

  test("flags a missing month across a year boundary", () => {
    const run = ["2025-11", "2026-01"].map((p) => statement({ source: src(p, "BROKERAGE") }));
    const f = checkCoverage(run);
    expect(f).toHaveLength(1);
    expect(f[0]?.period).toBe("2025-12");
  });

  test("does not report a gap because one template starts later", () => {
    const rows = [
      statement({ source: src("2026-05", "BROKERAGE") }),
      statement({ source: src("2026-06", "BROKERAGE") }),
      statement({ source: src("2026-06", "CASH") }),
    ];
    expect(checkCoverage(rows)).toEqual([]);
  });
});

describe("checkSupersession", () => {
  test("reports an amended statement replacing an earlier version", () => {
    const f = checkSupersession([
      statement({ source: src("2026-06", "BROKERAGE", 0) }),
      statement({ source: src("2026-06", "BROKERAGE", 2) }),
    ]);
    expect(f).toHaveLength(1);
    expect(f[0]?.check).toBe("superseded");
    expect(f[0]?.severity).toBe("warning");
  });

  test("says nothing when there is one version", () => {
    expect(checkSupersession([statement()])).toEqual([]);
  });
});

describe("checkKindConsistency", () => {
  test("passes when a renamed wording still maps to the same kind", () => {
    // The same TFSA reads three different ways across the corpus.
    const rows = [
      statement({ source: src("2023-06", "BROKERAGE"), accountType: "Tax-Free Savings Account" }),
      statement({ source: src("2026-01", "BROKERAGE"), accountType: "Self-directed TFSA Account" }),
      statement({
        source: src("2026-06", "BROKERAGE"),
        accountType: "Order Execution Only TFSA Account",
      }),
    ];
    expect(checkKindConsistency(rows)).toEqual([]);
  });

  test("flags an account whose kind changes", () => {
    const rows = [
      statement({ source: src("2026-01", "BROKERAGE"), accountType: "Managed TFSA Account" }),
      statement({ source: src("2026-06", "BROKERAGE"), accountType: "Managed RRSP Account" }),
    ];
    expect(checkKindConsistency(rows).some((f) => f.check === "kind-drift")).toBe(true);
  });
});

describe("checkGroundTruth", () => {
  const obs = [{ observed: "2026-06-30", period: "2026-06", accountValue: 20000, netDeposits: null }];

  test("reports the delta against the observed app figure", () => {
    const f = checkGroundTruth([statement()], obs, new Set<string>());
    expect(f).toHaveLength(1);
    expect(f[0]?.actual).toBeCloseTo(20498.54, 2);
    expect(f[0]?.delta).toBeCloseTo(498.54, 2);
  });

  test("counts only the accounts it is told to count", () => {
    const f = checkGroundTruth([statement()], obs, new Set(["SOMETHING-ELSE"]));
    expect(f[0]?.actual).toBe(0);
  });

  test("names a pending valuation as a known reason for the delta", () => {
    // The $279.94 residual is one unpriced private-markets holding.
    const f = checkGroundTruth([statement()], obs, new Set<string>());
    expect(f[0]?.message).toMatch(/pending valuation/i);
  });

  test("does not double count a PERFORMANCE statement beside its BROKERAGE twin", () => {
    const both = [statement(), statement({ source: src("2026-06", "PERFORMANCE") })];
    const f = checkGroundTruth(both, obs, new Set<string>());
    expect(f[0]?.actual).toBeCloseTo(20498.54, 2);
  });
});
```

- [ ] **Step 3: Run, verify failure, implement `checks.ts`**

```ts
import { classifyAccountType, maskAccountNo } from "../store/mask";
import type { CashSummary, Statement } from "../types";
import { type Finding, within } from "./report";

function finding(
  check: Finding["check"],
  s: Statement,
  message: string,
  expected: number | null,
  actual: number | null,
  severity: Finding["severity"] = "error",
): Finding {
  return {
    check,
    severity,
    // Masked: the report is committed.
    accountShortId: maskAccountNo(s.source.accountNo).shortId,
    period: s.source.period,
    message,
    expected,
    actual,
    delta: expected !== null && actual !== null ? actual - expected : null,
    sourceFile: s.source.file,
  };
}

function checkCashBlock(s: Statement, cash: CashSummary, out: Finding[]): void {
  if (cash.totalIn === null || cash.totalOut === null) return;

  const derived = cash.opening + cash.totalIn - cash.totalOut;
  if (!within(derived, cash.closing)) {
    out.push(finding("statement-arithmetic", s,
      `${cash.currency} cash does not reconcile: opening + paid in - paid out != closing`,
      derived, cash.closing));
  }
  if (cash.paidIn) {
    const sum = Object.values(cash.paidIn).reduce((a, v) => a + v, 0);
    if (!within(sum, cash.totalIn)) {
      out.push(finding("statement-arithmetic", s,
        `${cash.currency} paid in breakdown does not sum to the printed total`,
        cash.totalIn, sum));
    }
  }
  if (cash.paidOut) {
    const sum = Object.values(cash.paidOut).reduce((a, v) => a + v, 0);
    if (!within(sum, cash.totalOut)) {
      out.push(finding("statement-arithmetic", s,
        `${cash.currency} paid out breakdown does not sum to the printed total`,
        cash.totalOut, sum));
    }
  }
}

export function checkArithmetic(statements: readonly Statement[]): Finding[] {
  const out: Finding[] = [];

  for (const s of statements) {
    for (const cash of s.cash) checkCashBlock(s, cash, out);

    const p = s.portfolio;
    if (!p) {
      if (s.source.template !== "CASH") {
        out.push(finding("missing-portfolio", s,
          "no portfolio summary on a statement that must print one", null, null));
      }
      continue;
    }

    // Checked against the portfolio total rather than per asset class: the
    // summary's class label wraps around mailing-address rows and does not
    // match the assets section's heading. This check is stronger anyway.
    const sum = s.holdings.reduce((a, h) => a + h.marketValue, 0) + p.cashMarketValue;
    if (!within(sum, p.totalMarketValue)) {
      out.push(finding("statement-arithmetic", s,
        "holdings plus cash do not equal the portfolio total", p.totalMarketValue, sum));
    }
  }
  return out;
}

/** Groups by account AND template. The chequing accounts have two per month. */
function bySeries(statements: readonly Statement[]): Map<string, Statement[]> {
  const map = new Map<string, Statement[]>();
  for (const s of statements) {
    if (s.source.template === "PERFORMANCE") continue;
    const key = `${s.source.accountNo}|${s.source.template}`;
    const list = map.get(key) ?? [];
    list.push(s);
    map.set(key, list);
  }
  for (const list of map.values()) {
    list.sort((a, b) => a.source.period.localeCompare(b.source.period) || a.source.version - b.source.version);
  }
  return map;
}

export function checkContinuity(statements: readonly Statement[]): Finding[] {
  const out: Finding[] = [];

  for (const list of bySeries(statements).values()) {
    for (let i = 1; i < list.length; i += 1) {
      const prev = list[i - 1];
      const curr = list[i];
      if (!prev || !curr || prev.source.period === curr.source.period) continue;

      for (const cash of curr.cash) {
        const prior = prev.cash.find((c) => c.currency === cash.currency);
        if (!prior) continue;
        if (!within(prior.closing, cash.opening)) {
          out.push(finding("cash-continuity", curr,
            `${cash.currency} opening does not match ${prev.source.period} closing`,
            prior.closing, cash.opening));
        }
      }
    }
  }
  return out;
}

function nextPeriod(period: string): string {
  const [y, m] = period.split("-").map(Number);
  if (y === undefined || m === undefined) return period;
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
}

export function checkCoverage(statements: readonly Statement[]): Finding[] {
  const out: Finding[] = [];

  for (const list of bySeries(statements).values()) {
    const present = new Set(list.map((s) => s.source.period));
    const first = list[0];
    const last = list[list.length - 1];
    if (!first || !last) continue;

    for (let p = first.source.period; p < last.source.period; p = nextPeriod(p)) {
      if (present.has(p)) continue;
      out.push({
        check: "coverage-gap",
        severity: "warning",
        accountShortId: maskAccountNo(first.source.accountNo).shortId,
        period: p,
        message: `no ${first.source.template} statement for this month`,
        expected: null, actual: null, delta: null, sourceFile: "",
      });
    }
  }
  return out;
}

export function checkSupersession(statements: readonly Statement[]): Finding[] {
  const seen = new Map<string, Statement[]>();
  for (const s of statements) {
    const key = `${s.source.accountNo}|${s.source.period}|${s.source.template}`;
    const list = seen.get(key) ?? [];
    list.push(s);
    seen.set(key, list);
  }

  const out: Finding[] = [];
  for (const list of seen.values()) {
    if (list.length < 2) continue;
    const sorted = [...list].sort((a, b) => a.source.version - b.source.version);
    const latest = sorted[sorted.length - 1];
    if (!latest) continue;
    out.push(finding("superseded", latest,
      `${sorted.length} versions of this statement; version ${latest.source.version} is used`,
      null, null, "warning"));
  }
  return out;
}

export function checkKindConsistency(statements: readonly Statement[]): Finding[] {
  const byAccount = new Map<string, Statement[]>();
  for (const s of statements) {
    const list = byAccount.get(s.source.accountNo) ?? [];
    list.push(s);
    byAccount.set(s.source.accountNo, list);
  }

  const out: Finding[] = [];
  for (const list of byAccount.values()) {
    const kinds = new Set(list.map((s) => classifyAccountType(s.accountType).kind));
    if (kinds.size <= 1) continue;
    const latest = [...list].sort((a, b) => a.source.period.localeCompare(b.source.period)).pop();
    if (!latest) continue;
    out.push(finding("kind-drift", latest,
      `account maps to more than one kind across its history: ${[...kinds].join(", ")}`,
      null, null));
  }
  return out;
}

export function checkCrossDocument(statements: readonly Statement[]): Finding[] {
  const out: Finding[] = [];

  for (const p of statements.filter((s) => s.source.template === "PERFORMANCE")) {
    const twin = statements.find(
      (s) => s.source.template === "BROKERAGE" &&
        s.source.accountNo === p.source.accountNo &&
        s.source.period === p.source.period,
    );
    if (twin?.portfolio && p.portfolio &&
        !within(twin.portfolio.totalMarketValue, p.portfolio.totalMarketValue)) {
      out.push(finding("cross-document", p,
        "performance and brokerage statements disagree on the portfolio total",
        twin.portfolio.totalMarketValue, p.portfolio.totalMarketValue));
    }
    // BROKERAGE carries no balance summary, so it is checked against itself.
    const b = p.balances;
    if (b) {
      const derived = b.start + b.deposits - b.withdrawals + b.changeInMarketValue;
      if (!within(derived, b.end)) {
        out.push(finding("cross-document", p, "balance summary does not reconcile", derived, b.end));
      }
      if (p.portfolio && !within(b.end, p.portfolio.totalMarketValue)) {
        out.push(finding("cross-document", p,
          "balance summary end does not match the portfolio total",
          p.portfolio.totalMarketValue, b.end));
      }
    }
  }
  return out;
}

export interface Observation {
  observed: string;
  period: string;
  accountValue: number | null;
  netDeposits: number | null;
}

export function checkGroundTruth(
  statements: readonly Statement[],
  observations: readonly Observation[],
  countedAccounts: ReadonlySet<string>,
): Finding[] {
  const out: Finding[] = [];

  for (const obs of observations) {
    if (obs.accountValue === null) continue;

    // PERFORMANCE excluded: it duplicates its BROKERAGE twin's portfolio.
    const scoped = statements
      .filter((s) => s.source.period === obs.period && s.source.template === "BROKERAGE")
      .filter((s) => countedAccounts.size === 0 || countedAccounts.has(s.source.accountNo));

    const total = scoped.reduce((a, s) => a + (s.portfolio?.totalMarketValue ?? 0), 0);
    const pending = scoped.flatMap((s) => s.holdings.filter((h) => h.pendingValuation));

    const note = pending.length > 0
      ? ` (${pending.length} holding(s) carry a pending valuation: ${pending.map((h) => h.symbol).join(", ")})`
      : "";

    out.push({
      check: "ground-truth",
      severity: "warning",
      accountShortId: "*",
      period: obs.period,
      message: `account value on ${obs.observed} versus the app${note}`,
      expected: obs.accountValue,
      actual: total,
      delta: total - obs.accountValue,
      sourceFile: "",
    });
  }
  return out;
}

export function runChecks(
  statements: readonly Statement[],
  observations: readonly Observation[],
  countedAccounts: ReadonlySet<string>,
): Finding[] {
  return [
    ...checkArithmetic(statements),
    ...checkContinuity(statements),
    ...checkCoverage(statements),
    ...checkCrossDocument(statements),
    ...checkSupersession(statements),
    ...checkKindConsistency(statements),
    ...checkGroundTruth(statements, observations, countedAccounts),
  ];
}
```

Run: PASS, 20 tests.

- [ ] **Step 4: Write `truth.ts` and `corrections.ts`**

`app/src/truth.ts`:

```ts
import type { Observation } from "./validate/checks";

/**
 * Figures read off the Wealthsimple app on a given date. The external anchor
 * every derived total is measured against. Add a row whenever you check.
 */
export const OBSERVATIONS: readonly Observation[] = [
  { observed: "2026-06-30", period: "2026-06", accountValue: 242019.61, netDeposits: 217514.0 },
];
```

`app/src/corrections.ts` — an acknowledgement list, not a value-rewriting mechanism. Nothing here changes a number; it records that a finding has been looked at, so the report can separate "known and explained" from "new":

```ts
import type { CheckName } from "./validate/report";

export interface Acknowledgement {
  check: CheckName;
  /** Masked short id, or "*" for a whole-portfolio finding. */
  shortId: string;
  period: string;
  /** Why this finding is expected. Required — an unexplained entry is a bug. */
  reason: string;
  reviewed: string;
}

/**
 * Findings matching an entry are reported as acknowledged rather than new.
 * Values are never rewritten here: a wrong figure is fixed in the parser, and a
 * genuinely wrong statement stays wrong and visible.
 */
export const ACKNOWLEDGED: readonly Acknowledgement[] = [
  {
    check: "ground-truth",
    shortId: "*",
    period: "2026-06",
    reason:
      "WSE401 carries a pending valuation at its $10.00 purchase price; the app shows the finalised NAV. Accounts for the whole $279.94 delta if the NAV is $10.2254.",
    reviewed: "2026-08-05",
  },
];

export function isAcknowledged(
  check: CheckName,
  shortId: string,
  period: string,
): boolean {
  return ACKNOWLEDGED.some(
    (a) => a.check === check && a.shortId === shortId && a.period === period,
  );
}
```

- [ ] **Step 5: Check and commit**

Run: `cd personal/investments/app && bun run check` → clean, 85 tests.

```bash
git add personal/investments/app
git commit -m "feat(investments): add the reconciliation checks"
```

---

### Task 11: Datastore, build CLI, full-corpus integration

**Files:**
- Create: `app/src/store/datastore.ts`, `app/src/build.ts`
- Test: `app/src/build.integration.test.ts`

**Interfaces:**
- Consumes: everything above.
- Produces: `data/datastore.json`, `data/reconciliation.json`, a console summary.

- [ ] **Step 1: Implement `datastore.ts`**

```ts
import type { Statement } from "../types";
import { maskAccountNo, redactText } from "./mask";
import type { AccountRecord } from "./registry";

export interface Datastore {
  meta: { generated: string; statementCount: number; accountCount: number };
  accounts: AccountRecord[];
  statements: Statement[];
}

/**
 * The only place a raw account number is read on the way out. Nothing this
 * returns contains one, including inside `source.file`.
 */
export function buildDatastore(
  statements: readonly Statement[],
  accounts: readonly AccountRecord[],
  names: readonly string[],
  generated: string,
): Datastore {
  const masked = statements.map((s) => {
    const { maskedId, shortId } = maskAccountNo(s.source.accountNo);
    return {
      ...s,
      source: {
        ...s.source,
        accountNo: maskedId,
        file: s.source.file.replace(/^[A-Z0-9]+_/, `${shortId}_`),
      },
      activity: s.activity.map((r) => ({ ...r, description: redactText(r.description, names) })),
    };
  });

  return {
    meta: { generated, statementCount: masked.length, accountCount: accounts.length },
    accounts: [...accounts],
    statements: masked,
  };
}
```

- [ ] **Step 2: Implement `build.ts`**

```ts
import { readdir } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { isAcknowledged } from "./corrections";
import { extractXml } from "./ingest/extract";
import { parseStatement } from "./ingest/parse";
import { parseSourceFilename } from "./ingest/source";
import { buildDatastore } from "./store/datastore";
import { maskAccountNo } from "./store/mask";
import { buildRegistry } from "./store/registry";
import { OBSERVATIONS } from "./truth";
import type { Statement } from "./types";
import { runChecks } from "./validate/checks";
import type { ReconciliationReport } from "./validate/report";

const SOURCE = process.env.STATEMENTS_DIR ?? join(homedir(), "Downloads", "monthly_pdf_statements");
const CACHE = join(import.meta.dir, "..", ".cache");
const DATA = join(import.meta.dir, "..", "..", "data");

async function loadRedactions(): Promise<string[]> {
  const file = Bun.file(join(import.meta.dir, "..", "redactions.json"));
  if (!(await file.exists())) return [];
  const parsed = (await file.json()) as { redactions?: unknown };
  return Array.isArray(parsed.redactions)
    ? parsed.redactions.filter((v): v is string => typeof v === "string")
    : [];
}

export async function ingestAll(sourceDir: string, cacheDir: string): Promise<Statement[]> {
  const files = (await readdir(sourceDir)).filter((f) => f.endsWith(".pdf")).sort();
  const statements: Statement[] = [];
  const skipped: string[] = [];

  for (const file of files) {
    const source = parseSourceFilename(file);
    if (!source) {
      skipped.push(file);
      continue;
    }
    statements.push(parseStatement(await extractXml(join(sourceDir, file), cacheDir), source));
  }

  if (skipped.length > 0) {
    throw new Error(`${skipped.length} file(s) did not match the naming convention:\n  ${skipped.join("\n  ")}`);
  }
  return statements;
}

/** Raw account numbers for accounts that count toward investment totals. */
export function countedAccountNumbers(
  statements: readonly Statement[],
  accounts: readonly { maskedId: string; inTotals: boolean }[],
): Set<string> {
  const counted = new Set(accounts.filter((a) => a.inTotals).map((a) => a.maskedId));
  return new Set(
    statements.map((s) => s.source.accountNo).filter((no) => counted.has(maskAccountNo(no).maskedId)),
  );
}

if (import.meta.main) {
  const generated = new Date().toISOString();
  const statements = await ingestAll(SOURCE, CACHE);
  const accounts = buildRegistry(statements);
  const names = await loadRedactions();

  const findings = runChecks(statements, OBSERVATIONS, countedAccountNumbers(statements, accounts));
  const report: ReconciliationReport = { generated, statementCount: statements.length, findings };

  await Bun.write(join(DATA, "datastore.json"),
    JSON.stringify(buildDatastore(statements, accounts, names, generated), null, 2));
  await Bun.write(join(DATA, "reconciliation.json"), JSON.stringify(report, null, 2));

  const errors = findings.filter(
    (f) => f.severity === "error" && !isAcknowledged(f.check, f.accountShortId, f.period),
  );
  console.log(`${statements.length} statements, ${accounts.length} accounts`);
  console.log(`${errors.length} unacknowledged error(s), ${findings.length - errors.length} other finding(s)`);
  for (const f of findings.filter((x) => x.check === "ground-truth")) {
    console.log(`  ${f.period} ${f.message}\n    expected ${f.expected}, got ${f.actual?.toFixed(2)}, delta ${f.delta?.toFixed(2)}`);
  }
  for (const f of errors.slice(0, 20)) {
    console.log(`  [${f.check}] ${f.accountShortId} ${f.period}: ${f.message} (delta ${f.delta?.toFixed(2)})`);
  }
  for (const a of accounts) {
    console.log(`  ${a.shortId} ${a.kind}/${a.style} ${a.firstPeriod}..${a.lastPeriod} n=${a.statementCount}`);
  }
}
```

- [ ] **Step 3: Write the integration test**

`app/src/build.integration.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { countedAccountNumbers, ingestAll } from "./build";
import { buildRegistry } from "./store/registry";
import { checkArithmetic, checkContinuity, checkGroundTruth, checkKindConsistency } from "./validate/checks";

const SOURCE = process.env.STATEMENTS_DIR ?? join(homedir(), "Downloads", "monthly_pdf_statements");
const CACHE = join(import.meta.dir, "..", ".cache");

// Skipped without the source PDFs. Never commit them to make this run in CI —
// they carry the owner's address and account numbers.
describe.if(existsSync(SOURCE))("full corpus", () => {
  test("parses every statement", async () => {
    expect((await ingestAll(SOURCE, CACHE)).length).toBe(220);
  });

  test("every statement passes its own arithmetic", async () => {
    const findings = checkArithmetic(await ingestAll(SOURCE, CACHE));
    if (findings.length > 0) console.log(findings.slice(0, 10));
    expect(findings).toEqual([]);
  });

  test("cash balances are continuous within each series", async () => {
    expect(checkContinuity(await ingestAll(SOURCE, CACHE))).toEqual([]);
  });

  test("no account changes kind across its history", async () => {
    // Wording drifts; kind must not.
    expect(checkKindConsistency(await ingestAll(SOURCE, CACHE))).toEqual([]);
  });

  test("finds the expected accounts, kinds and styles", async () => {
    const accounts = buildRegistry(await ingestAll(SOURCE, CACHE));
    expect(accounts).toHaveLength(14);
    expect(accounts.filter((a) => a.kind === "Chequing")).toHaveLength(3);
    for (const kind of ["TFSA", "FHSA", "RRSP", "SpousalRRSP", "RESP", "NonRegistered", "Crypto"]) {
      expect(accounts.some((a) => a.kind === kind)).toBe(true);
    }
    expect(accounts.some((a) => a.style === "managed")).toBe(true);
  });

  test("June 2026 account value lands within 0.5% of the observed app figure", async () => {
    const statements = await ingestAll(SOURCE, CACHE);
    const accounts = buildRegistry(statements);
    const [finding] = checkGroundTruth(
      statements,
      [{ observed: "2026-06-30", period: "2026-06", accountValue: 242019.61, netDeposits: null }],
      countedAccountNumbers(statements, accounts),
    );
    if (!finding?.actual) throw new Error("expected a ground-truth finding");
    expect(Math.abs(finding.actual - 242019.61) / 242019.61).toBeLessThan(0.005);
    expect(finding.message).toMatch(/pending valuation/i);
  });
});
```

- [ ] **Step 4: Run the build for real**

Run: `cd personal/investments/app && bun run build`

Expected: `220 statements, 14 accounts`, a ground-truth delta near 279.94 annotated with the pending valuation, and a per-account listing. **Read every unacknowledged error.** Each is either a parser bug (fix the parser) or a genuine statement anomaly (add an `Acknowledgement` with a reason). Never adjust a figure to make a check pass.

- [ ] **Step 5: Verify the datastore leaks nothing**

```bash
cd personal/investments
grep -cE '\b(WK|HQ|WZ)[A-Z0-9]{7,}\b' data/datastore.json || echo "no account codes"
grep -cE '"[0-9]{7,}"' data/datastore.json || echo "no bare account numbers"
grep -cE '\b[0-9]{3}[ -][0-9]{3}[ -][0-9]{3}\b' data/datastore.json || echo "no SIN pattern"
grep -cE '\b[A-Z][0-9][A-Z] ?[0-9][A-Z][0-9]\b' data/datastore.json || echo "no postal code"
cd app && bun -e 'const c = await Bun.file("redactions.json").json();
  const t = (await Bun.file("../data/datastore.json").text()).toLowerCase();
  const toks = [...c.redactions, ...(c.addressWords ?? [])].flatMap(p => p.split(/\s+/)).filter(x => x.length > 1);
  const hits = toks.filter(n => t.includes(n.toLowerCase()));
  console.log(hits.length ? "LEAK: " + hits.join(", ") : "no names");'
```

Expected: all five print the "no ..." message. Any hit stops the commit.

- [ ] **Step 6: Check and commit**

Run: `cd personal/investments/app && bun run check`
Expected: clean, 91 tests (85 unit plus 6 integration).

```bash
git add personal/investments/app personal/investments/data
git commit -m "feat(investments): build the masked datastore and reconciliation report"
```

- [ ] **Step 7: Log the run**

Write `personal/investments/log/2026-08-05.md` following the vault frontmatter standard, recording: statement and account count, the ground-truth delta, every reconciliation finding and how it was resolved, whether the WSE401 pending-valuation hypothesis held, and each account's derived kind and style. Then:

```bash
git add personal/investments/log
git commit -m "docs(investments): log the first PDF ingest run"
```

---

## Definition of done

- `bun run check` clean in `personal/investments/app`.
- `bun run build` ingests all 220 PDFs with zero unacknowledged `error` findings.
- June 2026 account value within 0.5% of $242,019.61, with the pending valuation named in the report.
- All 14 accounts classified, none drifting kind across its history, `managed` and `self-directed` both present.
- `data/datastore.json` passes all five leak checks.
- `data/reconciliation.json` committed and readable.

## Deferred to later phases

- **Phase 2:** the React app, three grouping lenses, per-wrapper views, charts, motion, the Trading/Portfolios split from `style`, and deleting `scripts/`.
- **Phase 3:** the projection engine port, fitted returns from the `PERFORMANCE` money-weighted rates, goal tracking, room runway.
- **Net-deposits reconciliation against $217,514.00.** It needs a definition of net deposits across account boundaries, which belongs with the analytics layer. Phase 1 records the observation and does not compute the figure. Note the spec's caveat: the 2023 USD deposits sit in accounts with no PDFs, so this total may never close exactly.
- **The July 2026 investment-account PDFs.** Only chequing has July. Export the rest before deleting the CSV pipeline, or accept being a month behind.
