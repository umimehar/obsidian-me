---
title: "Investments rebuild phase 1: PDF ingest and reconciliation"
tags: [personal/investments, plan]
created: 2026-08-04
updated: 2026-08-04
status: active
type: spike
personal: investments
---

# Investments Ingest and Reconciliation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn 220 Wealthsimple PDF statements into a masked, validated datastore that reproduces the account value and net deposits the Wealthsimple app reports, and surfaces every discrepancy it cannot explain.

**Architecture:** Six stages — `extract` (PDF to cached text), `parse` (text to typed `Statement`, dispatched by template), `validate` (five reconciliation checks producing a report, never dropping data), `mask` (account numbers and personal details stripped), `store` (masked `datastore.json`), `build` (CLI orchestrating all of it). Parsing is transcription only; every interpretation happens downstream of a `Statement` that has already checked itself against the arithmetic printed on its own page.

**Tech Stack:** Bun, TypeScript (strict, `noUncheckedIndexedAccess`), Biome, `bun test`, poppler's `pdftotext` for text extraction.

**Spec:** `personal/investments/docs/superpowers/specs/2026-08-04-investments-rebuild-design.md`

**Scope:** This plan is phase 1 of three. It ends with a working ingest and a reconciliation report. The React app (phase 2) and the prediction engine (phase 3) get their own plans, written once phase 1 has told us what the data actually says.

## Global Constraints

- Runtime is Bun. Package manager is `bun`. Never introduce npm or a lockfile other than `bun.lock`.
- TypeScript strict mode with `noUncheckedIndexedAccess`. Zero `tsc` errors.
- No `any` (`suspicious.noExplicitAny: error`), no non-null assertions (`style.noNonNullAssertion: error`). These are already Biome errors in this project.
- Line width 100, 2-space indent, enforced by Biome.
- `bun run check` (Biome, then `tsc --noEmit`, then `bun test`) must pass with zero warnings before every commit.
- Functions stay at or under 100 lines and cyclomatic complexity 8. Files stay focused on one responsibility.
- **Never commit an unmasked account number, the owner's name, or the owner's address.** Source PDFs live outside the vault. Test fixtures are scrubbed text, never raw statement text.
- Source PDF directory is `~/Downloads/monthly_pdf_statements`, configurable, and is never read at test time — tests read committed fixtures only.
- Money is parsed to a `number` of dollars. Comparisons use an explicit tolerance, never `===`.
- `pdftotext` is invoked with `-layout`. Column alignment is load-bearing for every parser.

## Prerequisites

- `poppler` installed (`brew install poppler`). Already present on this machine.
- 220 PDFs in `~/Downloads/monthly_pdf_statements`, named `<ACCOUNTNO>_YYYY-MM_<TEMPLATE>.pdf` where template is `BROKERAGE`, `CASH`, or `PERFORMANCE`.

## File Structure

A new `app/` workspace is created alongside the existing `scripts/`. `scripts/` is **not** modified in this phase and is deleted in phase 2, once the app replaces the rendered page. Running both briefly is deliberate: it lets phase 1's numbers be diffed against the numbers currently on the page.

```
personal/investments/
  app/
    package.json                     Bun workspace, scripts, deps
    tsconfig.json                    strict, noUncheckedIndexedAccess
    biome.json                       lineWidth 100
    src/
      types.ts                       Statement and every type it contains
      ingest/
        source.ts                    filename -> {accountNo, period, template}
        extract.ts                   pdftotext -layout, cached by content hash
        text.ts                      money parsing, section slicing, line helpers
        brokerage.ts                 BROKERAGE parser
        performance.ts               PERFORMANCE parser (BROKERAGE + returns block)
        cash.ts                      CASH parser
        parse.ts                     template dispatch
        __fixtures__/                scrubbed statement text, committed
      validate/
        checks.ts                    the five reconciliation checks
        report.ts                    ReconciliationReport type and formatting
      store/
        mask.ts                      account number -> masked id, text redaction
        registry.ts                  account labels, purposes, in_totals
        datastore.ts                 assemble and write datastore.json
      truth.ts                       observed app figures, owner-recorded
      corrections.ts                 explicit overrides for genuine WS errors
      build.ts                       CLI
      tools/
        make-fixtures.ts             regenerate scrubbed fixtures from PDFs
  data/
    datastore.json                   committed, masked
    reconciliation.json              committed, the report
```

Responsibility split: `text.ts` knows about strings and money and nothing about statements. Each template parser knows about one layout and produces a `Statement`. `checks.ts` knows about `Statement[]` and nothing about PDFs. `mask.ts` is the only module that ever sees an account number. This is what makes each unit testable in isolation.

---

### Task 1: Workspace scaffold and text extraction

**Files:**
- Create: `personal/investments/app/package.json`
- Create: `personal/investments/app/tsconfig.json`
- Create: `personal/investments/app/biome.json`
- Create: `personal/investments/app/src/ingest/source.ts`
- Create: `personal/investments/app/src/ingest/extract.ts`
- Test: `personal/investments/app/src/ingest/source.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `type Template = "BROKERAGE" | "CASH" | "PERFORMANCE"`; `interface SourceRef { file: string; accountNo: string; period: string; template: Template }`; `parseSourceFilename(file: string): SourceRef | null`; `extractText(pdfPath: string, cacheDir: string): Promise<string>`.

- [ ] **Step 1: Create the workspace config files**

`personal/investments/app/package.json`:

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
    "format": "biome format --write src",
    "check": "biome check src && tsc --noEmit && bun test"
  },
  "devDependencies": {
    "@biomejs/biome": "^1.9.4",
    "@types/bun": "^1.1.14",
    "typescript": "^5.7.2"
  }
}
```

`personal/investments/app/tsconfig.json`:

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

`personal/investments/app/biome.json`:

```json
{
  "$schema": "https://biomejs.dev/schemas/1.9.4/schema.json",
  "formatter": {
    "enabled": true,
    "lineWidth": 100,
    "indentStyle": "space",
    "indentWidth": 2
  },
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

Then run `cd personal/investments/app && bun install`.

- [ ] **Step 2: Write the failing test for filename parsing**

`personal/investments/app/src/ingest/source.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import { parseSourceFilename } from "./source";

// Synthetic account numbers throughout. Never put a real one in a test file.
describe("parseSourceFilename", () => {
  test("reads account, period and template from a brokerage filename", () => {
    expect(parseSourceFilename("ACCT0002CAD_2026-06_BROKERAGE.pdf")).toEqual({
      file: "ACCT0002CAD_2026-06_BROKERAGE.pdf",
      accountNo: "ACCT0002CAD",
      period: "2026-06",
      template: "BROKERAGE",
    });
  });

  test("recognises the cash and performance templates", () => {
    expect(parseSourceFilename("ACCT0005CAD_2026-06_CASH.pdf")?.template).toBe("CASH");
    expect(parseSourceFilename("ACCT0001CAD_2025-12_PERFORMANCE.pdf")?.template).toBe(
      "PERFORMANCE",
    );
  });

  test("rejects an unknown template rather than guessing", () => {
    expect(parseSourceFilename("ACCT0002CAD_2026-06_SUMMARY.pdf")).toBeNull();
  });

  test("rejects the legacy export name that puts the date last", () => {
    expect(
      parseSourceFilename("TFSA-monthly-statement-transactions-ACCT0002-2026-06-01.pdf"),
    ).toBeNull();
  });

  test("rejects a malformed period", () => {
    expect(parseSourceFilename("ACCT0002CAD_2026-13_BROKERAGE.pdf")).toBeNull();
    expect(parseSourceFilename("ACCT0002CAD_202606_BROKERAGE.pdf")).toBeNull();
  });
});
```

- [ ] **Step 3: Run the test and verify it fails**

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
}

const TEMPLATES: readonly Template[] = ["BROKERAGE", "CASH", "PERFORMANCE"];
const FILENAME = /^([A-Z0-9]+)_(\d{4})-(\d{2})_([A-Z]+)\.pdf$/;

export function parseSourceFilename(file: string): SourceRef | null {
  const m = FILENAME.exec(file);
  if (!m) return null;
  const [, accountNo, year, month, rawTemplate] = m;
  if (!accountNo || !year || !month || !rawTemplate) return null;

  const monthNum = Number(month);
  if (monthNum < 1 || monthNum > 12) return null;

  const template = TEMPLATES.find((t) => t === rawTemplate);
  if (!template) return null;

  return { file, accountNo, period: `${year}-${month}`, template };
}
```

- [ ] **Step 5: Run the test and verify it passes**

Run: `cd personal/investments/app && bun test src/ingest/source.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 6: Implement `extract.ts`**

No unit test — this shells out to `pdftotext` and is covered by the integration test in Task 10. It is small enough to read.

```ts
import { createHash } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { basename, join } from "node:path";

/**
 * Runs `pdftotext -layout` and caches the result keyed by the PDF's content
 * hash, so re-running the build over 220 unchanged statements is a no-op.
 */
export async function extractText(pdfPath: string, cacheDir: string): Promise<string> {
  const bytes = await Bun.file(pdfPath).arrayBuffer();
  const hash = createHash("sha256").update(new Uint8Array(bytes)).digest("hex").slice(0, 16);
  const cachePath = join(cacheDir, `${basename(pdfPath, ".pdf")}.${hash}.txt`);

  const cached = Bun.file(cachePath);
  if (await cached.exists()) return cached.text();

  const proc = Bun.spawn(["pdftotext", "-layout", pdfPath, "-"], {
    stdout: "pipe",
    stderr: "pipe",
  });
  const [text, err, code] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  if (code !== 0) {
    throw new Error(`pdftotext failed on ${basename(pdfPath)} (exit ${code}): ${err.trim()}`);
  }

  await mkdir(cacheDir, { recursive: true });
  await Bun.write(cachePath, text);
  return text;
}
```

- [ ] **Step 7: Add the gitignore entries**

Append to `personal/investments/.gitignore`:

```
app/node_modules/
app/.cache/
app/redactions.json
```

- [ ] **Step 8: Run the full check and commit**

Run: `cd personal/investments/app && bun run check`
Expected: Biome clean, `tsc` clean, 5 tests pass.

```bash
git add personal/investments/app personal/investments/.gitignore
git commit -m "feat(investments): scaffold the app workspace and PDF text extraction"
```

---

### Task 2: Text helpers and scrubbed fixtures

**Files:**
- Create: `personal/investments/app/src/ingest/text.ts`
- Create: `personal/investments/app/src/tools/make-fixtures.ts`
- Create: `personal/investments/app/src/ingest/__fixtures__/` (generated, committed)
- Test: `personal/investments/app/src/ingest/text.test.ts`

**Interfaces:**
- Consumes: `extractText` from Task 1.
- Produces: `parseMoney(raw: string): number`; `findMoney(line: string): number[]`; `sliceSection(lines: string[], startsWith: RegExp, endsWith: RegExp[]): string[]`; `stripPageFurniture(lines: string[]): string[]`.

**Why fixtures matter:** tests must never read the real PDFs. They contain the owner's name, address, and account numbers, and they live outside the vault. `make-fixtures.ts` produces scrubbed text files that are safe to commit and that every parser test reads.

- [ ] **Step 1: Write the failing test for money parsing**

`personal/investments/app/src/ingest/text.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import { findMoney, parseMoney, stripPageFurniture } from "./text";

describe("parseMoney", () => {
  test("parses a plain dollar amount", () => {
    expect(parseMoney("$1,037.17")).toBe(1037.17);
    expect(parseMoney("$0.00")).toBe(0);
  });

  test("parses a minus that sits after the dollar sign", () => {
    // Managed brokerage balance columns render negatives as $-12,300.48
    expect(parseMoney("$-12,300.48")).toBe(-12300.48);
  });

  test("parses the en dash the cash statement uses for negatives", () => {
    // CASH template writes –$60.00 with U+2013, not a hyphen
    expect(parseMoney("–$60.00")).toBe(-60);
    expect(parseMoney("–$1,756.28")).toBe(-1756.28);
  });

  test("parses a bare number without a currency symbol", () => {
    expect(parseMoney("159.1371")).toBe(159.1371);
  });

  test("throws on unparseable input rather than returning zero", () => {
    // Returning 0 is how a silently wrong dashboard happens.
    expect(() => parseMoney("n/a")).toThrow(/unparseable money/i);
    expect(() => parseMoney("")).toThrow(/unparseable money/i);
  });
});

describe("findMoney", () => {
  test("pulls every money column out of an activity line in order", () => {
    const line =
      "2026-06-02 BUY         QQC - Invesco NASDAQ 100 Index ETF: Bought 0.9984 shares at $50.08 per" +
      "                         $50.00            $0.00          $2,520.60";
    expect(findMoney(line).slice(-3)).toEqual([50, 0, 2520.6]);
  });
});

describe("stripPageFurniture", () => {
  test("removes page numbers and repeated column headers", () => {
    const lines = [
      "2026-06-01 DIV  something                          $0.00   $1.02   $2,619.42",
      "                                                                        3/7",
      "   CAD Activity - Current period",
      "   Date    Transaction Description       Debit ($CAD) Credit ($CAD) Balance ($CAD)",
      "2026-06-03 LOAN ZGLD                              $0.00   $0.00   $2,370.60",
    ];
    expect(stripPageFurniture(lines)).toEqual([
      "2026-06-01 DIV  something                          $0.00   $1.02   $2,619.42",
      "2026-06-03 LOAN ZGLD                              $0.00   $0.00   $2,370.60",
    ]);
  });
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `cd personal/investments/app && bun test src/ingest/text.test.ts`
Expected: FAIL, `Cannot find module './text'`.

- [ ] **Step 3: Implement `text.ts`**

```ts
const MONEY_TOKEN = /[–−-]?\$?-?[\d,]+\.\d+/g;

/**
 * Parses a money token to dollars. Handles the three negative forms the
 * statements use: a leading hyphen, a leading en dash (CASH template), and a
 * minus placed AFTER the dollar sign (managed brokerage balance column renders
 * $-12,300.48). The sign is detected anywhere before the first digit, which is
 * what makes the third form work — testing only the first character does not.
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
  const value = Number(digits);
  return negative ? -value : value;
}

/** Every money token on a line, left to right. */
export function findMoney(line: string): number[] {
  return (line.match(MONEY_TOKEN) ?? []).map(parseMoney);
}

const PAGE_NUMBER = /^\s*\d+\s*\/\s*\d+\s*$/;
const PAGE_OF = /^\s*Page \d+ of \d+/;
const ACTIVITY_HEADING = /^\s*((CAD|USD) )?Activity - Current period\s*$/;
const COLUMN_HEADER = /^\s*Date\s+Transaction\s+Description/;
const CASH_COLUMN_HEADER = /^\s*DATE\s+POSTED DATE\s+DESCRIPTION/;

/** Drops page numbers, footers and the column headers repeated on every page. */
export function stripPageFurniture(lines: string[]): string[] {
  return lines.filter(
    (line) =>
      !PAGE_NUMBER.test(line) &&
      !PAGE_OF.test(line) &&
      !ACTIVITY_HEADING.test(line) &&
      !COLUMN_HEADER.test(line) &&
      !CASH_COLUMN_HEADER.test(line),
  );
}

/**
 * Returns the lines from the first line matching `startsWith` (exclusive) up to
 * the first subsequent line matching any of `endsWith` (exclusive). Returns an
 * empty array when the section is absent, which is a legitimate outcome — a
 * non-registered account has no contributions block.
 */
export function sliceSection(
  lines: string[],
  startsWith: RegExp,
  endsWith: readonly RegExp[],
): string[] {
  const start = lines.findIndex((l) => startsWith.test(l));
  if (start === -1) return [];
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((l) => endsWith.some((r) => r.test(l)));
  return end === -1 ? rest : rest.slice(0, end);
}
```

- [ ] **Step 4: Run the test and verify it passes**

Run: `cd personal/investments/app && bun test src/ingest/text.test.ts`
Expected: PASS, 8 tests.

- [ ] **Step 5: Write the fixture generator**

`personal/investments/app/src/tools/make-fixtures.ts`:

```ts
import { mkdir } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { extractText } from "../ingest/extract";

const SOURCE = join(homedir(), "Downloads", "monthly_pdf_statements");
const CACHE = join(import.meta.dir, "..", "..", ".cache");
const OUT = join(import.meta.dir, "..", "ingest", "__fixtures__");

interface FixtureSpec {
  /** Real statement filename, which contains a real account number. */
  file: string;
  /** Synthetic account number substituted for the real one. */
  alias: string;
  /** Fixture basename written under src/ingest/__fixtures__/. */
  as: string;
}

interface Config {
  redactions: string[];
  fixtures: FixtureSpec[];
}

/**
 * Both the names to scrub AND the fixture source filenames live in the
 * gitignored config, because a statement filename IS an account number. This
 * file is committed, so it must not name a real statement.
 */
async function loadConfig(): Promise<Config> {
  const path = join(import.meta.dir, "..", "..", "redactions.json");
  const file = Bun.file(path);
  if (!(await file.exists())) {
    throw new Error(`missing ${path} — copy redactions.example.json and fill it in`);
  }
  const parsed: unknown = await file.json();
  if (
    typeof parsed !== "object" ||
    parsed === null ||
    !Array.isArray((parsed as Config).redactions) ||
    !Array.isArray((parsed as Config).fixtures)
  ) {
    throw new Error("redactions.json must be { redactions: string[], fixtures: FixtureSpec[] }");
  }
  return parsed as Config;
}

function scrub(text: string, accountNo: string, alias: string, redactions: string[]): string {
  let out = text.split(accountNo).join(alias);
  for (const name of redactions) {
    out = out.split(name).join("REDACTED");
  }
  // Postal codes and street numbers on the address block.
  out = out.replace(/\b[A-Z]\d[A-Z]\s?\d[A-Z]\d\b/gi, "X0X 0X0");
  out = out.replace(/^\s*\d{3,5}\s?-\s?\d{1,5}\s+\S.*$/gm, "  REDACTED ADDRESS");
  return out;
}

const { redactions, fixtures } = await loadConfig();
await mkdir(OUT, { recursive: true });

for (const { file, alias, as } of fixtures) {
  const text = await extractText(join(SOURCE, file), CACHE);
  const accountNo = file.split("_")[0] ?? "";
  const scrubbed = scrub(text, accountNo, alias, redactions);

  for (const name of redactions) {
    if (scrubbed.includes(name)) throw new Error(`scrub failed: ${name} still present in ${as}`);
  }
  if (scrubbed.includes(accountNo)) throw new Error(`scrub failed: ${accountNo} present in ${as}`);

  await Bun.write(join(OUT, `${as}.txt`), scrubbed);
  console.log(`wrote ${as}.txt`);
}
```

- [ ] **Step 6: Write the gitignored config, then generate the fixtures**

Create `personal/investments/app/redactions.json` (gitignored, from Task 1). It holds the names to scrub and the fixture source list. Pick one real statement per layout variant — the account numbers go here and nowhere else:

| `as` | Which statement to pick | Why this variant |
|---|---|---|
| `brokerage-managed` | any **Managed RRSP**, 2026-06 | single-currency cash block, 60-day contribution split |
| `brokerage-dual-currency` | the **Order Execution Only TFSA**, 2026-06 | CAD and USD columns, year-to-date contribution figure |
| `brokerage-60-day-split` | the **Order Execution Only Spousal RRSP**, 2026-06 | spousal type, must not classify as plain RRSP |
| `brokerage-non-registered` | any **Non-Registered Cash**, 2026-06 | no contributions block at all |
| `performance` | the same Managed RRSP, a month with a `PERFORMANCE` file | returns block and balance summary |
| `cash` | any **Chequing**, 2026-06 | the consumer layout, en-dash negatives |
| `brokerage-empty` | an account with a zero total portfolio, 2026-06 | no holdings, no activity |

```json
{
  "redactions": ["First Last", "Other Name"],
  "fixtures": [
    { "file": "REALACCT_2026-06_BROKERAGE.pdf", "alias": "ACCT0001CAD", "as": "brokerage-managed" }
  ]
}
```

Then generate and verify. The verification greps read the names out of the config rather than hardcoding them, so this plan never contains a real name:

```bash
cd personal/investments/app
bun run fixtures
grep -rlE '\b(WK|HQ|WZ)[A-Z0-9]{7,}\b' src/ingest/__fixtures__/ && echo "LEAK: account number" || echo "clean"
bun -e 'const c=await Bun.file("redactions.json").json();
  const { Glob } = require("bun");
  for await (const f of new Glob("src/ingest/__fixtures__/*.txt").scan(".")) {
    const t = await Bun.file(f).text();
    for (const n of c.redactions) if (t.toLowerCase().includes(n.toLowerCase())) {
      console.log("LEAK:", n, "in", f); process.exit(1);
    }
  }
  console.log("clean");'
```

Expected: seven `.txt` files written, both checks print `clean`. If either reports a leak, widen the scrub before committing anything.

- [ ] **Step 7: Run the full check and commit**

Run: `cd personal/investments/app && bun run check`
Expected: clean, 13 tests pass.

```bash
git add personal/investments/app
git commit -m "feat(investments): add text helpers and scrubbed statement fixtures"
```

---

### Task 3: The Statement type

**Files:**
- Create: `personal/investments/app/src/types.ts`

**Interfaces:**
- Consumes: `SourceRef`, `Template` from Task 1.
- Produces: every type below. Tasks 4 through 10 all import from here.

This task is types only, so it has no test of its own — `tsc` is the test. It exists as a separate task because every later task depends on these names being fixed.

- [ ] **Step 1: Write `types.ts`**

```ts
import type { SourceRef } from "./ingest/source";

export type Currency = "CAD" | "USD";

export interface Holding {
  /** Full security name as printed, e.g. "Purpose High Interest Savings ETF". */
  name: string;
  /** Ticker as printed on the statement, e.g. "PSA", "WSE401". */
  symbol: string;
  quantity: number;
  segregatedQuantity: number;
  marketPrice: number;
  priceCurrency: Currency;
  marketValue: number;
  bookCost: number;
  /** Asset-class heading the holding sits under, e.g. "Canadian Equities and Alternatives". */
  assetClass: string;
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
  /** Statement code, e.g. BUY, SELL, DIV, CONT, GRANT, TRFIN. Empty on CASH rows. */
  code: string;
  description: string;
  debit: number;
  credit: number;
  balance: number;
  currency: Currency;
}

export interface Contributions {
  /** Self-directed registered accounts print a single year-to-date figure. */
  yearToDate: number | null;
  /** Managed registered accounts split the year instead. */
  first60Days: number | null;
  restOfYear: number | null;
}

export interface Returns {
  currentPeriod: number;
  oneYear: number;
  threeYears: number;
  fiveYears: number;
  tenYears: number;
  sinceInception: number;
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
  /** Null on the CASH template, which holds no securities. */
  portfolio: PortfolioSummary | null;
  /** One entry per currency the account transacts in. */
  cash: CashSummary[];
  holdings: Holding[];
  activity: ActivityRow[];
  contributions: Contributions | null;
  dividendsYearToDate: number | null;
  /** Month-end USD to CAD rate, when the statement prints one. */
  fxRate: number | null;
  /** PERFORMANCE template only. */
  returns: Returns | null;
  balances: PeriodBalances | null;
}
```

- [ ] **Step 2: Verify it typechecks and commit**

Run: `cd personal/investments/app && bun run typecheck`
Expected: no output, exit 0.

```bash
git add personal/investments/app/src/types.ts
git commit -m "feat(investments): define the Statement type"
```

---

### Task 4: Brokerage parser — header, portfolio summary, cash

**Files:**
- Create: `personal/investments/app/src/ingest/brokerage.ts`
- Test: `personal/investments/app/src/ingest/brokerage.test.ts`

**Interfaces:**
- Consumes: `types.ts` (Task 3), `text.ts` (Task 2), `SourceRef` (Task 1).
- Produces: `parseBrokerage(text: string, source: SourceRef): Statement`. Tasks 5 and 6 extend this same function; Task 8 dispatches to it.

Note the two contribution layouts found in the corpus: self-directed registered accounts print `Contributions (year to date):`, managed registered accounts print `First 60 Days` and `Rest of Year`, non-registered accounts print neither.

- [ ] **Step 1: Write the failing tests**

`personal/investments/app/src/ingest/brokerage.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { parseBrokerage } from "./brokerage";
import { parseSourceFilename } from "./source";

const FIXTURES = join(import.meta.dir, "__fixtures__");

async function load(name: string, file: string) {
  const source = parseSourceFilename(file);
  if (!source) throw new Error(`bad fixture filename ${file}`);
  const text = await Bun.file(join(FIXTURES, `${name}.txt`)).text();
  return parseBrokerage(text, source);
}

describe("parseBrokerage header and portfolio", () => {
  test("reads the account type verbatim from the page", async () => {
    const managed = await load("brokerage-managed", "ACCT0001CAD_2026-06_BROKERAGE.pdf");
    expect(managed.accountType).toBe("Managed RRSP Account");

    const dual = await load("brokerage-dual-currency", "ACCT0002CAD_2026-06_BROKERAGE.pdf");
    expect(dual.accountType).toBe("Order Execution Only TFSA Account");

    const spousal = await load("brokerage-60-day-split", "ACCT0003CAD_2026-06_BROKERAGE.pdf");
    expect(spousal.accountType).toBe("Order Execution Only Spousal RRSP Account");
  });

  test("reads the statement period", async () => {
    const s = await load("brokerage-managed", "ACCT0001CAD_2026-06_BROKERAGE.pdf");
    expect(s.periodStart).toBe("2026-06-01");
    expect(s.periodEnd).toBe("2026-06-30");
  });

  test("reads the portfolio summary and its totals reconcile", async () => {
    const s = await load("brokerage-managed", "ACCT0001CAD_2026-06_BROKERAGE.pdf");
    const p = s.portfolio;
    if (!p) throw new Error("expected a portfolio");

    expect(p.cashMarketValue).toBe(122.95);
    expect(p.totalMarketValue).toBe(20498.54);
    expect(p.totalBookCost).toBe(20501.7);

    const classSum = p.classes.reduce((a, c) => a + c.marketValue, 0);
    expect(classSum + p.cashMarketValue).toBeCloseTo(p.totalMarketValue, 2);
  });

  test("reads a single-currency cash summary", async () => {
    const s = await load("brokerage-managed", "ACCT0001CAD_2026-06_BROKERAGE.pdf");
    expect(s.cash).toHaveLength(1);
    const cad = s.cash[0];
    if (!cad) throw new Error("expected a CAD cash summary");

    expect(cad.currency).toBe("CAD");
    expect(cad.opening).toBe(116.67);
    expect(cad.totalIn).toBe(12430.95);
    expect(cad.totalOut).toBe(12424.67);
    expect(cad.closing).toBe(122.95);
    expect(cad.paidIn?.proceedsFromSales).toBe(12417.15);
    expect(cad.paidOut?.fees).toBe(7.52);
    expect(cad.paidOut?.costOfInvestments).toBe(12417.15);
  });

  test("reads both currency columns on a dual-currency account", async () => {
    const s = await load("brokerage-dual-currency", "ACCT0002CAD_2026-06_BROKERAGE.pdf");
    expect(s.cash.map((c) => c.currency).sort()).toEqual(["CAD", "USD"]);

    const cad = s.cash.find((c) => c.currency === "CAD");
    const usd = s.cash.find((c) => c.currency === "USD");
    expect(cad?.opening).toBe(2618.4);
    expect(cad?.closing).toBe(1037.09);
    expect(cad?.paidIn?.stockLendingIncome).toBe(0.06);
    expect(usd?.opening).toBe(0.06);
    expect(usd?.closing).toBe(0.06);
  });

  test("reads the year-to-date contribution figure", async () => {
    const s = await load("brokerage-dual-currency", "ACCT0002CAD_2026-06_BROKERAGE.pdf");
    expect(s.contributions?.yearToDate).toBe(6143.25);
    expect(s.contributions?.first60Days).toBeNull();
    expect(s.dividendsYearToDate).toBe(301.94);
  });

  test("reads the 60-day split when the statement prints one instead", async () => {
    const s = await load("brokerage-managed", "ACCT0001CAD_2026-06_BROKERAGE.pdf");
    expect(s.contributions?.first60Days).toBe(0);
    expect(s.contributions?.restOfYear).toBe(8000);
    expect(s.contributions?.yearToDate).toBeNull();
  });

  test("returns null contributions for a non-registered account", async () => {
    const s = await load("brokerage-non-registered", "ACCT0004CAD_2026-06_BROKERAGE.pdf");
    expect(s.contributions).toBeNull();
  });

  test("reads the month-end conversion rate when present", async () => {
    const s = await load("brokerage-dual-currency", "ACCT0002CAD_2026-06_BROKERAGE.pdf");
    expect(s.fxRate).toBe(1.421);
  });

  test("throws rather than guessing when the account type line is absent", () => {
    expect(() =>
      parseBrokerage("nothing useful here", {
        file: "ACCT0001CAD_2026-06_BROKERAGE.pdf",
        accountNo: "ACCT0001CAD",
        period: "2026-06",
        template: "BROKERAGE",
      }),
    ).toThrow(/account type/i);
  });
});
```

- [ ] **Step 2: Run the tests and verify they fail**

Run: `cd personal/investments/app && bun test src/ingest/brokerage.test.ts`
Expected: FAIL, `Cannot find module './brokerage'`.

- [ ] **Step 3: Implement the header, portfolio and cash sections**

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
import type { SourceRef } from "./source";
import { findMoney, parseMoney } from "./text";

const ACCOUNT_TYPE = /^\s*((?:Managed|Order Execution Only|Crypto|Chequing)[^$]*?Account)\s*$/;
const PERIOD = /(\d{4}-\d{2}-\d{2})\s*-\s*(\d{4}-\d{2}-\d{2})/;
const FX_RATE = /\$1\s?USD\s?=\s?\$([\d.]+)\s?CAD/;

/** Rows whose label introduces an asset-class total in the summary block. */
const CLASS_LABEL =
  /^\s{2,}((?:Canadian|US)[- ](?:Listed Securities|Equities)[^$]*?)\s+\$/;

function firstMatch(lines: string[], re: RegExp): RegExpExecArray | null {
  for (const line of lines) {
    const m = re.exec(line);
    if (m) return m;
  }
  return null;
}

function readAccountType(lines: string[]): string {
  const m = firstMatch(lines, ACCOUNT_TYPE);
  if (!m?.[1]) throw new Error("could not find the account type line");
  return m[1].replace(/\s+/g, " ").trim();
}

function readPeriod(lines: string[]): { start: string; end: string } {
  const m = firstMatch(lines, PERIOD);
  if (!m?.[1] || !m[2]) throw new Error("could not find the statement period");
  return { start: m[1], end: m[2] };
}

/**
 * The summary block prints Cash, then one line per asset class, then Total
 * Portfolio — each with market value and book cost (the percentage columns in
 * between are ignored). Class names wrap across two lines in some layouts, so
 * the money columns rather than the label drive the match.
 */
function readPortfolio(lines: string[]): PortfolioSummary | null {
  const cashLine = lines.find((l) => /^\s+Cash\s+\$/.test(l));
  const totalLine = lines.find((l) => /Total Portfolio\s+\$/.test(l));
  if (!cashLine || !totalLine) return null;

  const cashMoney = findMoney(cashLine);
  const totalMoney = findMoney(totalLine);
  if (cashMoney.length < 4 || totalMoney.length < 4) {
    throw new Error("portfolio summary is missing money columns");
  }

  const classes: AssetClassTotal[] = [];
  for (const line of lines) {
    const m = CLASS_LABEL.exec(line);
    if (!m?.[1]) continue;
    const money = findMoney(line);
    if (money.length < 4) continue;
    classes.push({
      name: m[1].replace(/\s+/g, " ").trim(),
      marketValue: money[0] ?? 0,
      bookCost: money[2] ?? 0,
    });
  }

  return {
    cashMarketValue: cashMoney[0] ?? 0,
    cashBookCost: cashMoney[2] ?? 0,
    classes,
    totalMarketValue: totalMoney[0] ?? 0,
    totalBookCost: totalMoney[2] ?? 0,
  };
}

/** Reads one labelled row of the cash block, returning one value per currency column. */
function cashRow(lines: string[], label: RegExp, columns: number): number[] {
  const line = lines.find((l) => label.test(l));
  if (!line) return new Array<number>(columns).fill(0);
  const money = findMoney(line);
  return money.slice(-columns);
}

function readCash(lines: string[]): CashSummary[] {
  const dual = lines.some((l) => /USD Transactions \(\$USD\)/.test(l));
  const currencies: Currency[] = dual ? ["CAD", "USD"] : ["CAD"];
  const n = currencies.length;

  const opening = cashRow(lines, /Last Statement Cash Balance/, n);
  const totalIn = cashRow(lines, /Total Cash Paid In/, n);
  const totalOut = cashRow(lines, /Total Cash Paid Out/, n);
  const closing = cashRow(lines, /Closing Cash Balance/, n);

  const paidIn: Record<keyof CashPaidIn, number[]> = {
    deposits: cashRow(lines, /^\s*(Cash Paid In\s+)?Deposits\s/, n),
    proceedsFromSales: cashRow(lines, /Proceeds from\s*$|Proceeds from sales/, n),
    dividends: cashRow(lines, /^\s*(sales\s+)?Dividends\s+\$/, n),
    interestEarned: cashRow(lines, /Interest Earned/, n),
    stockLendingIncome: cashRow(lines, /Stock Lending Income/, n),
    other: cashRow(lines, /^\s*Other\s+\$/, n),
  };
  const paidOut: Record<keyof CashPaidOut, number[]> = {
    fees: cashRow(lines, /^\s*(Cash Paid Out\s+)?Fees\s+\$/, n),
    taxes: cashRow(lines, /^\s*Taxes\s+\$/, n),
    interestPaid: cashRow(lines, /Interest Paid/, n),
    costOfInvestments: cashRow(lines, /Cost of\s*$|Cost of Investments/, n),
    withdrawals: cashRow(lines, /Withdrawals/, n),
    other: cashRow(lines, /^\s*Other\s+\$/, n),
  };

  return currencies.map((currency, i) => ({
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

function readContributions(lines: string[]): Contributions | null {
  const ytdLine = lines.find((l) => /Contributions \(year to date\)/.test(l));
  const firstLine = lines.find((l) => /First 60 Days/.test(l));
  const restLine = lines.find((l) => /Rest of Year/.test(l));

  if (ytdLine) {
    const money = findMoney(ytdLine);
    return { yearToDate: money[money.length - 1] ?? 0, first60Days: null, restOfYear: null };
  }
  if (firstLine && restLine) {
    const first = findMoney(firstLine);
    const rest = findMoney(restLine);
    return {
      yearToDate: null,
      first60Days: first[first.length - 1] ?? 0,
      restOfYear: rest[rest.length - 1] ?? 0,
    };
  }
  return null;
}

function readDividendsYtd(lines: string[]): number | null {
  const line = lines.find((l) => /Dividends \(year to date\)/.test(l));
  if (!line) return null;
  const money = findMoney(line);
  return money[money.length - 1] ?? null;
}

function readFxRate(lines: string[]): number | null {
  const m = firstMatch(lines, FX_RATE);
  return m?.[1] ? parseMoney(m[1]) : null;
}

export function parseBrokerage(text: string, source: SourceRef): Statement {
  const lines = text.split("\n");
  const period = readPeriod(lines);

  return {
    source,
    accountType: readAccountType(lines),
    periodStart: period.start,
    periodEnd: period.end,
    portfolio: readPortfolio(lines),
    cash: readCash(lines),
    holdings: [],
    activity: [],
    contributions: readContributions(lines),
    dividendsYearToDate: readDividendsYtd(lines),
    fxRate: readFxRate(lines),
    returns: null,
    balances: null,
  };
}
```

- [ ] **Step 4: Run the tests and iterate against the real fixtures**

Run: `cd personal/investments/app && bun test src/ingest/brokerage.test.ts`
Expected: PASS, 10 tests.

The regexes above are written from four sampled layouts. If a test fails, read the corresponding fixture text directly rather than loosening a regex — a regex that matches everything is how the wrong column gets read. Assert against what the page prints.

- [ ] **Step 5: Run the full check and commit**

Run: `cd personal/investments/app && bun run check`
Expected: clean, 23 tests pass.

```bash
git add personal/investments/app
git commit -m "feat(investments): parse brokerage headers, portfolio summary and cash"
```

---

### Task 5: Brokerage parser — holdings

**Files:**
- Modify: `personal/investments/app/src/ingest/brokerage.ts`
- Modify: `personal/investments/app/src/ingest/brokerage.test.ts`

**Interfaces:**
- Consumes: `parseBrokerage` from Task 4, `Holding` from Task 3.
- Produces: populated `Statement.holdings`.

- [ ] **Step 1: Write the failing tests**

Append to `personal/investments/app/src/ingest/brokerage.test.ts`:

```ts
describe("parseBrokerage holdings", () => {
  test("reads each holding with its price, value and cost", async () => {
    const s = await load("brokerage-managed", "ACCT0001CAD_2026-06_BROKERAGE.pdf");
    expect(s.holdings).toHaveLength(2);

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
    // The statement states the right one, which is the point of using it.
    const s = await load("brokerage-managed", "ACCT0001CAD_2026-06_BROKERAGE.pdf");
    const psa = s.holdings.find((h) => h.symbol === "PSA");
    expect(psa?.marketPrice).toBeLessThan(100);
  });

  test("keeps a holding whose segregated quantity is zero", async () => {
    const s = await load("brokerage-managed", "ACCT0001CAD_2026-06_BROKERAGE.pdf");
    const wse = s.holdings.find((h) => h.symbol === "WSE401");
    expect(wse?.quantity).toBe(1241.715);
    expect(wse?.segregatedQuantity).toBe(0);
    expect(wse?.marketValue).toBe(12417.15);
  });

  test("holdings sum to the asset-class total printed on the page", async () => {
    const s = await load("brokerage-managed", "ACCT0001CAD_2026-06_BROKERAGE.pdf");
    const cls = s.portfolio?.classes.find((c) => c.name === "Canadian Equities and Alternatives");
    const sum = s.holdings
      .filter((h) => h.assetClass === "Canadian Equities and Alternatives")
      .reduce((a, h) => a + h.marketValue, 0);
    expect(sum).toBeCloseTo(cls?.marketValue ?? -1, 2);
  });

  test("returns no holdings for an account that holds nothing", async () => {
    const s = await load("brokerage-empty", "ACCT0006CAD_2026-06_BROKERAGE.pdf");
    expect(s.holdings).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the tests and verify they fail**

Run: `cd personal/investments/app && bun test src/ingest/brokerage.test.ts -t holdings`
Expected: FAIL, holdings is `[]`.

- [ ] **Step 3: Implement holdings parsing**

Add to `brokerage.ts` and wire `holdings: readHoldings(lines)` into `parseBrokerage`:

```ts
const ASSETS_HEADING = /^\s*Portfolio Assets\s*$/;
const ASSETS_END = /^\s*\*Book Cost|^\s*(CAD |USD )?Activity - Current period/;
const CLASS_HEADING = /^(Canadian|US)[- ](Listed Securities|Equities)[^$]*$/;

/**
 * A holding row: name, symbol, total quantity, segregated quantity, price with
 * currency, market value, book cost. Trailing endnote markers (1, 2, 3) may
 * follow the market value, so the tail is matched loosely and the money tokens
 * are taken from the end.
 */
const HOLDING_ROW =
  /^\s{1,3}(\S.*?)\s{2,}([A-Z][A-Z0-9.]*)\s+([\d,]+\.\d+)\s+([\d,]+\.\d+)\s+\$([\d,]+\.\d+)\s+(CAD|USD)\s+\$([\d,]+\.\d+)\s+\$([\d,]+\.\d+)/;

function readHoldings(lines: string[]): Holding[] {
  const start = lines.findIndex((l) => ASSETS_HEADING.test(l));
  if (start === -1) return [];

  const holdings: Holding[] = [];
  let assetClass = "";

  for (const line of lines.slice(start + 1)) {
    if (ASSETS_END.test(line)) break;

    const trimmed = line.trim();
    if (CLASS_HEADING.test(trimmed)) {
      assetClass = trimmed.replace(/\s*\(The conversion rate.*$/, "").trim();
      continue;
    }
    if (/^Total\s/.test(trimmed)) continue;

    const m = HOLDING_ROW.exec(line);
    if (!m) continue;
    const [, name, symbol, qty, seg, price, currency, value, cost] = m;
    if (!name || !symbol || !qty || !seg || !price || !currency || !value || !cost) continue;

    holdings.push({
      name: name.replace(/\s+/g, " ").trim(),
      symbol,
      quantity: parseMoney(qty),
      segregatedQuantity: parseMoney(seg),
      marketPrice: parseMoney(price),
      priceCurrency: currency === "USD" ? "USD" : "CAD",
      marketValue: parseMoney(value),
      bookCost: parseMoney(cost),
      assetClass,
    });
  }
  return holdings;
}
```

Add `Holding` to the type import at the top of the file.

- [ ] **Step 4: Run the tests and verify they pass**

Run: `cd personal/investments/app && bun test src/ingest/brokerage.test.ts`
Expected: PASS, 15 tests.

- [ ] **Step 5: Run the full check and commit**

Run: `cd personal/investments/app && bun run check`
Expected: clean, 28 tests pass.

```bash
git add personal/investments/app
git commit -m "feat(investments): parse brokerage holdings with stated market prices"
```

---

### Task 6: Brokerage parser — activity rows

**Files:**
- Modify: `personal/investments/app/src/ingest/brokerage.ts`
- Modify: `personal/investments/app/src/ingest/brokerage.test.ts`

**Interfaces:**
- Consumes: `parseBrokerage` from Tasks 4-5, `ActivityRow` from Task 3, `stripPageFurniture` from Task 2.
- Produces: populated `Statement.activity`.

The hard part: rows wrap across two or three lines, the column header and page number repeat mid-table, and a dual-currency statement has a `CAD Activity` section followed by a `USD Activity` section that must be tagged differently.

- [ ] **Step 1: Write the failing tests**

Append to `personal/investments/app/src/ingest/brokerage.test.ts`:

```ts
describe("parseBrokerage activity", () => {
  test("reads a single-line row with its three money columns", async () => {
    const s = await load("brokerage-managed", "ACCT0001CAD_2026-06_BROKERAGE.pdf");
    const fee = s.activity.find((r) => r.code === "FEE");
    if (!fee) throw new Error("expected the management fee row");
    expect(fee.date).toBe("2026-06-30");
    expect(fee.debit).toBe(7.52);
    expect(fee.credit).toBe(0);
    expect(fee.balance).toBe(122.95);
    expect(fee.currency).toBe("CAD");
  });

  test("joins a description that wraps onto the next line", async () => {
    const s = await load("brokerage-managed", "ACCT0001CAD_2026-06_BROKERAGE.pdf");
    const buy = s.activity.find((r) => r.code === "BUY");
    expect(buy?.description).toBe(
      "WSE401 - WS PVT MKT I F: Bought 1241.7150 shares at $10.00 per share (executed at 2026-05-29)",
    );
  });

  test("parses a negative balance rendered as $-12,300.48", async () => {
    const s = await load("brokerage-managed", "ACCT0001CAD_2026-06_BROKERAGE.pdf");
    const buy = s.activity.find((r) => r.code === "BUY");
    expect(buy?.balance).toBe(-12300.48);
  });

  test("does not treat a repeated column header or page number as a row", async () => {
    const s = await load("brokerage-dual-currency", "ACCT0002CAD_2026-06_BROKERAGE.pdf");
    expect(s.activity.every((r) => /^\d{4}-\d{2}-\d{2}$/.test(r.date))).toBe(true);
    expect(s.activity.every((r) => r.code !== "")).toBe(true);
  });

  test("tags rows from the USD section as USD", async () => {
    const s = await load("brokerage-dual-currency", "ACCT0002CAD_2026-06_BROKERAGE.pdf");
    const currencies = new Set(s.activity.map((r) => r.currency));
    expect(currencies.has("CAD")).toBe(true);
  });

  test("activity credits and debits reconcile to the printed cash totals", async () => {
    const s = await load("brokerage-dual-currency", "ACCT0002CAD_2026-06_BROKERAGE.pdf");
    const cad = s.cash.find((c) => c.currency === "CAD");
    const rows = s.activity.filter((r) => r.currency === "CAD");
    const credits = rows.reduce((a, r) => a + r.credit, 0);
    const debits = rows.reduce((a, r) => a + r.debit, 0);
    expect(credits).toBeCloseTo(cad?.totalIn ?? -1, 2);
    expect(debits).toBeCloseTo(cad?.totalOut ?? -1, 2);
  });

  test("returns no activity for a statement with an empty period", async () => {
    const s = await load("brokerage-empty", "ACCT0006CAD_2026-06_BROKERAGE.pdf");
    expect(s.activity).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the tests and verify they fail**

Run: `cd personal/investments/app && bun test src/ingest/brokerage.test.ts -t activity`
Expected: FAIL, activity is `[]`.

- [ ] **Step 3: Implement activity parsing**

Add to `brokerage.ts` and wire `activity: readActivity(lines)` into `parseBrokerage`:

```ts
const ACTIVITY_HEADING = /^\s*(?:(CAD|USD) )?Activity - Current period\s*$/;
const ACTIVITY_END = /^\s*(LEVERAGE DISCLOSURE|STATEMENT NOTES|Money-weighted Return Rates)/;
const MONEY_COL = String.raw`\$-?[\d,]+\.\d{2}`;
const ROW_START = new RegExp(
  String.raw`^(\d{4}-\d{2}-\d{2})\s+([A-Z][A-Z0-9]*)\s+(.*?)\s+(${MONEY_COL})\s+(${MONEY_COL})\s+(${MONEY_COL})\s*$`,
);
const CONTINUATION = /^\s{10,}(\S.*?)\s*$/;
/** `3/7` sits deeply indented, satisfies CONTINUATION, and holds no money token. */
const PAGE_NUMBER = /^\s*\d+\s*\/\s*\d+\s*$/;

/**
 * Walks the activity sections. A row begins on a line starting with a date and
 * ending in three money columns; any following indented line with no date and no
 * money columns continues its description. Dual-currency statements repeat the
 * whole table under a `USD Activity` heading, so the section heading sets the
 * currency for the rows that follow it.
 */
function readActivity(lines: string[]): ActivityRow[] {
  const rows: ActivityRow[] = [];
  let currency: Currency = "CAD";
  let inSection = false;
  let current: ActivityRow | null = null;

  for (const raw of lines) {
    const heading = ACTIVITY_HEADING.exec(raw);
    if (heading) {
      currency = heading[1] === "USD" ? "USD" : "CAD";
      inSection = true;
      current = null;
      continue;
    }
    if (!inSection) continue;
    if (PAGE_NUMBER.test(raw)) continue;
    if (ACTIVITY_END.test(raw)) {
      inSection = false;
      current = null;
      continue;
    }

    const start = ROW_START.exec(raw);
    if (start) {
      const [, date, code, head, debit, credit, balance] = start;
      if (!date || !code || !debit || !credit || !balance) continue;
      current = {
        date,
        postedDate: null,
        code,
        description: (head ?? "").replace(/\s+/g, " ").trim(),
        debit: parseMoney(debit),
        credit: parseMoney(credit),
        balance: parseMoney(balance),
        currency,
      };
      rows.push(current);
      continue;
    }

    const cont = CONTINUATION.exec(raw);
    if (cont?.[1] && current && findMoney(raw).length === 0) {
      current.description = `${current.description} ${cont[1].replace(/\s+/g, " ").trim()}`.trim();
    }
  }
  return rows;
}
```

Add `ActivityRow` and `Currency` to the type import.

Do **not** apply `stripPageFurniture` to `lines` here: it deletes the `CAD Activity` / `USD Activity` headings, which are exactly what `readActivity` uses to set the currency. Page furniture is rejected structurally instead — the column-header line (`Date  Transaction  Description ...`) has no leading date so it fails `ROW_START`, and it starts at column 3 so it fails `CONTINUATION`'s 10-space indent. The page number (`3/7`) is a genuine hazard: it is deeply indented, satisfies `CONTINUATION`, and contains no money token, so without the explicit `PAGE_NUMBER` skip it would be appended to the preceding row's description. Verify all three against the dual-currency fixture in step 4.

- [ ] **Step 4: Run the tests and verify they pass**

Run: `cd personal/investments/app && bun test src/ingest/brokerage.test.ts`
Expected: PASS, 22 tests.

If the repeated column header leaks into a description, apply `stripPageFurniture` to `lines` before the loop rather than loosening `CONTINUATION`.

- [ ] **Step 5: Add a mutation check**

Verify the reconciliation test is not vacuous: temporarily change `credit: parseMoney(credit)` to `credit: 0`, run the suite, confirm `activity credits and debits reconcile to the printed cash totals` fails, then revert.

Run: `cd personal/investments/app && bun test src/ingest/brokerage.test.ts`
Expected: with the mutation, at least one failure; after reverting, all pass.

- [ ] **Step 6: Run the full check and commit**

Run: `cd personal/investments/app && bun run check`
Expected: clean, 35 tests pass.

```bash
git add personal/investments/app
git commit -m "feat(investments): parse brokerage activity rows across wraps and currencies"
```

---

### Task 7: Performance and cash parsers, and dispatch

**Files:**
- Create: `personal/investments/app/src/ingest/performance.ts`
- Create: `personal/investments/app/src/ingest/cash.ts`
- Create: `personal/investments/app/src/ingest/parse.ts`
- Test: `personal/investments/app/src/ingest/performance.test.ts`
- Test: `personal/investments/app/src/ingest/cash.test.ts`

**Interfaces:**
- Consumes: `parseBrokerage` (Tasks 4-6), `types.ts` (Task 3), `text.ts` (Task 2).
- Produces: `parsePerformance(text, source): Statement`; `parseCash(text, source): Statement`; `parseStatement(text, source): Statement`.

- [ ] **Step 1: Write the failing performance test**

`personal/investments/app/src/ingest/performance.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { parsePerformance } from "./performance";
import { parseSourceFilename } from "./source";

const source = parseSourceFilename("ACCT0001CAD_2026-04_PERFORMANCE.pdf");
if (!source) throw new Error("bad fixture filename");

async function load() {
  const text = await Bun.file(join(import.meta.dir, "__fixtures__", "performance.txt")).text();
  return parsePerformance(text, source);
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
    expect(s.returns).toEqual({
      currentPeriod: 0,
      oneYear: 0,
      threeYears: 0,
      fiveYears: 0,
      tenYears: 0,
      sinceInception: 10.31,
    });
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

  test("the balance summary reconciles", async () => {
    const s = await load();
    const b = s.balances;
    if (!b) throw new Error("expected balances");
    expect(b.start + b.deposits - b.withdrawals + b.changeInMarketValue).toBeCloseTo(b.end, 2);
  });
});
```

- [ ] **Step 2: Run it and verify it fails**

Run: `cd personal/investments/app && bun test src/ingest/performance.test.ts`
Expected: FAIL, `Cannot find module './performance'`.

- [ ] **Step 3: Implement `performance.ts`**

```ts
import type { PeriodBalances, Returns, Statement } from "../types";
import { parseBrokerage } from "./brokerage";
import type { SourceRef } from "./source";
import { findMoney } from "./text";

const RETURNS_HEADING = /Money-weighted Return Rates/;
const PERCENT_ROW = /^\s*(-?[\d.]+%\s+){5}-?[\d.]+%\s*$/;
const BALANCE_HEADING = /Start date balance/;

function readReturns(lines: string[]): Returns | null {
  const at = lines.findIndex((l) => RETURNS_HEADING.test(l));
  if (at === -1) return null;

  const row = lines.slice(at + 1, at + 6).find((l) => PERCENT_ROW.test(l));
  if (!row) return null;
  const values = (row.match(/-?[\d.]+(?=%)/g) ?? []).map(Number);
  if (values.length < 6) return null;

  return {
    currentPeriod: values[0] ?? 0,
    oneYear: values[1] ?? 0,
    threeYears: values[2] ?? 0,
    fiveYears: values[3] ?? 0,
    tenYears: values[4] ?? 0,
    sinceInception: values[5] ?? 0,
  };
}

function readBalances(lines: string[]): PeriodBalances | null {
  const at = lines.findIndex((l) => BALANCE_HEADING.test(l));
  if (at === -1) return null;

  const row = lines.slice(at + 1, at + 5).find((l) => findMoney(l).length >= 5);
  if (!row) return null;
  const money = findMoney(row);

  return {
    start: money[0] ?? 0,
    deposits: money[1] ?? 0,
    withdrawals: money[2] ?? 0,
    changeInMarketValue: money[3] ?? 0,
    end: money[4] ?? 0,
  };
}

export function parsePerformance(text: string, source: SourceRef): Statement {
  const base = parseBrokerage(text, source);
  const lines = text.split("\n");
  return { ...base, returns: readReturns(lines), balances: readBalances(lines) };
}
```

- [ ] **Step 4: Run it and verify it passes**

Run: `cd personal/investments/app && bun test src/ingest/performance.test.ts`
Expected: PASS, 4 tests.

Note: `readBalances` reads `$-160.15` for change in market value. If the layout renders it as `-$160.15` instead, `parseMoney` already handles both.

- [ ] **Step 5: Write the failing cash test**

`personal/investments/app/src/ingest/cash.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { parseCash } from "./cash";
import { parseSourceFilename } from "./source";

const source = parseSourceFilename("ACCT0005CAD_2026-06_CASH.pdf");
if (!source) throw new Error("bad fixture filename");

async function load() {
  const text = await Bun.file(join(import.meta.dir, "__fixtures__", "cash.txt")).text();
  return parseCash(text, source);
}

describe("parseCash", () => {
  test("reads the account type and period", async () => {
    const s = await load();
    expect(s.accountType).toBe("Chequing Account");
    expect(s.periodStart).toBe("2026-06-01");
    expect(s.periodEnd).toBe("2026-06-30");
  });

  test("reads opening and closing balances", async () => {
    const s = await load();
    const cad = s.cash[0];
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
    const s = await load();
    const row = s.activity.find((r) => r.description === "Transfer out" && r.debit === 122.84);
    expect(row?.date).toBe("2026-06-03");
    expect(row?.balance).toBe(72.75);
    expect(row?.credit).toBe(0);
  });

  test("reads a row whose posted date differs from its transaction date", async () => {
    const s = await load();
    const row = s.activity.find((r) => r.description.includes("Direct deposit"));
    expect(row?.date).toBe("2026-06-12");
    expect(row?.postedDate).toBe("2026-06-15");
    expect(row?.credit).toBe(3101.5);
  });

  test("carries a negative running balance without losing the sign", async () => {
    const s = await load();
    const row = s.activity.find((r) => r.balance === -2556.28);
    expect(row).toBeDefined();
  });

  test("the activity rows reconcile opening to closing", async () => {
    const s = await load();
    const cad = s.cash[0];
    if (!cad) throw new Error("expected a cash summary");
    const net = s.activity.reduce((a, r) => a + r.credit - r.debit, 0);
    expect((cad.opening ?? 0) + net).toBeCloseTo(cad.closing, 2);
  });
});
```

- [ ] **Step 6: Run it and verify it fails**

Run: `cd personal/investments/app && bun test src/ingest/cash.test.ts`
Expected: FAIL, `Cannot find module './cash'`.

- [ ] **Step 7: Implement `cash.ts`**

```ts
import type { ActivityRow, Statement } from "../types";
import type { SourceRef } from "./source";
import { parseMoney } from "./text";

const HEADING = /^\s*(\w[\w ]*?) monthly statement\s*$/;
const PERIOD = /^\s*(\w{3}) (\d{1,2}) - (\w{3}) (\d{1,2}), (\d{4})\s*$/;
const BALANCE_PAIR = /^\s*(\$[\d,]+\.\d{2})\s+(\$[\d,]+\.\d{2})\s*$/;
const MONEY = String.raw`[–−-]?\$[\d,]+\.\d{2}`;
const ROW = new RegExp(
  String.raw`^(\d{4}-\d{2}-\d{2})\s+(\d{4}-\d{2}-\d{2})\s+(.*?)\s+(${MONEY})\s+(${MONEY})\s*$`,
);

const MONTHS: Record<string, string> = {
  Jan: "01", Feb: "02", Mar: "03", Apr: "04", May: "05", Jun: "06",
  Jul: "07", Aug: "08", Sep: "09", Oct: "10", Nov: "11", Dec: "12",
};

function pad(n: string): string {
  return n.padStart(2, "0");
}

function readPeriod(lines: string[]): { start: string; end: string } {
  for (const line of lines) {
    const m = PERIOD.exec(line);
    if (!m) continue;
    const [, m1, d1, m2, d2, year] = m;
    const mm1 = m1 ? MONTHS[m1] : undefined;
    const mm2 = m2 ? MONTHS[m2] : undefined;
    if (!mm1 || !mm2 || !d1 || !d2 || !year) continue;
    return { start: `${year}-${mm1}-${pad(d1)}`, end: `${year}-${mm2}-${pad(d2)}` };
  }
  throw new Error("could not find the cash statement period");
}

function readAccountType(lines: string[]): string {
  for (const line of lines) {
    const m = HEADING.exec(line);
    if (m?.[1]) return `${m[1].trim()} Account`;
  }
  throw new Error("could not find the account type line");
}

/** The summary block prints the opening and closing balance side by side. */
function readBalances(lines: string[]): { opening: number; closing: number } {
  for (const line of lines) {
    const m = BALANCE_PAIR.exec(line);
    if (m?.[1] && m[2]) return { opening: parseMoney(m[1]), closing: parseMoney(m[2]) };
  }
  throw new Error("could not find the opening and closing balances");
}

function readActivity(lines: string[]): ActivityRow[] {
  const rows: ActivityRow[] = [];
  for (const line of lines) {
    const m = ROW.exec(line);
    if (!m) continue;
    const [, date, postedDate, description, amount, balance] = m;
    if (!date || !postedDate || !amount || !balance) continue;

    const value = parseMoney(amount);
    rows.push({
      date,
      postedDate,
      code: "",
      description: (description ?? "").replace(/\s+/g, " ").trim(),
      debit: value < 0 ? -value : 0,
      credit: value > 0 ? value : 0,
      balance: parseMoney(balance),
      currency: "CAD",
    });
  }
  return rows;
}

export function parseCash(text: string, source: SourceRef): Statement {
  const lines = text.split("\n");
  const period = readPeriod(lines);
  const { opening, closing } = readBalances(lines);

  return {
    source,
    accountType: readAccountType(lines),
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
    activity: readActivity(lines),
    contributions: null,
    dividendsYearToDate: null,
    fxRate: null,
    returns: null,
    balances: null,
  };
}
```

- [ ] **Step 8: Run it and verify it passes**

Run: `cd personal/investments/app && bun test src/ingest/cash.test.ts`
Expected: PASS, 7 tests.

- [ ] **Step 9: Implement dispatch**

`personal/investments/app/src/ingest/parse.ts`:

```ts
import type { Statement } from "../types";
import { parseBrokerage } from "./brokerage";
import { parseCash } from "./cash";
import { parsePerformance } from "./performance";
import type { SourceRef } from "./source";

export function parseStatement(text: string, source: SourceRef): Statement {
  switch (source.template) {
    case "BROKERAGE":
      return parseBrokerage(text, source);
    case "PERFORMANCE":
      return parsePerformance(text, source);
    case "CASH":
      return parseCash(text, source);
  }
}
```

- [ ] **Step 10: Run the full check and commit**

Run: `cd personal/investments/app && bun run check`
Expected: clean, 46 tests pass.

```bash
git add personal/investments/app
git commit -m "feat(investments): parse performance and cash statements, add dispatch"
```

---

### Task 8: Masking and the account registry

**Files:**
- Create: `personal/investments/app/src/store/mask.ts`
- Create: `personal/investments/app/src/store/registry.ts`
- Create: `personal/investments/app/redactions.example.json`
- Test: `personal/investments/app/src/store/mask.test.ts`

**Interfaces:**
- Consumes: `Statement` (Task 3).
- Produces: `maskAccountNo(accountNo: string): { maskedId: string; shortId: string }`; `redactText(text: string, names: readonly string[]): string`; `kindFromAccountType(accountType: string): AccountKind`; `buildRegistry(statements: readonly Statement[]): AccountRecord[]`; `interface AccountRecord { maskedId: string; shortId: string; label: string; kind: AccountKind; purpose: Purpose; inTotals: boolean; firstPeriod: string; lastPeriod: string; statementCount: number }`; `type AccountKind`; `type Purpose`.

**Why the kind comes from the statement:** the previous system inferred account kind from filenames, and a `PE-` prefix mapped four RRSP accounts to a kind that fell outside the RRSP room bar, hiding $8,000 of contributions for months. Kind is now derived from the account-type line the statement prints, which is authoritative.

- [ ] **Step 1: Write the failing tests**

`personal/investments/app/src/store/mask.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import { kindFromAccountType, maskAccountNo, redactText } from "./mask";

describe("maskAccountNo", () => {
  test("produces a stable masked id and 4-char short id", () => {
    const a = maskAccountNo("ACCT0001CAD");
    const b = maskAccountNo("ACCT0001CAD");
    expect(a).toEqual(b);
    expect(a.maskedId).toMatch(/^acct_[0-9a-f]{8}$/);
    expect(a.shortId).toMatch(/^[0-9a-f]{4}$/);
    expect(a.maskedId).toContain(a.shortId);
  });

  test("never contains the account number", () => {
    const { maskedId, shortId } = maskAccountNo("ACCT0001CAD");
    expect(maskedId).not.toContain("ACCT0001");
    expect(shortId).not.toContain("ACCT");
  });

  test("different accounts get different ids", () => {
    expect(maskAccountNo("ACCT0001CAD").maskedId).not.toBe(maskAccountNo("ACCT0002CAD").maskedId);
  });
});

describe("redactText", () => {
  test("removes every configured name", () => {
    const out = redactText("Interac e-Transfer® Received from Jane Doe", ["Jane Doe"]);
    expect(out).toBe("Interac e-Transfer® Received from [redacted]");
  });

  test("removes a name regardless of case", () => {
    expect(redactText("paid to JANE DOE today", ["Jane Doe"])).toBe("paid to [redacted] today");
  });

  test("leaves text with no configured name untouched", () => {
    expect(redactText("Transfer out to Non-registered", ["Jane Doe"])).toBe(
      "Transfer out to Non-registered",
    );
  });
});

describe("kindFromAccountType", () => {
  test("maps every account type found in the corpus", () => {
    expect(kindFromAccountType("Order Execution Only TFSA Account")).toBe("TFSA");
    expect(kindFromAccountType("Managed TFSA Account")).toBe("TFSA");
    expect(kindFromAccountType("Order Execution Only FHSA Account")).toBe("FHSA");
    expect(kindFromAccountType("Order Execution Only RRSP Account")).toBe("RRSP");
    expect(kindFromAccountType("Managed RRSP Account")).toBe("RRSP");
    expect(kindFromAccountType("Order Execution Only Spousal RRSP Account")).toBe("SpousalRRSP");
    expect(kindFromAccountType("Order Execution Only RESP Account")).toBe("RESP");
    expect(kindFromAccountType("Order Execution Only Non-Registered Cash Account")).toBe(
      "NonRegistered",
    );
    expect(kindFromAccountType("Crypto Account")).toBe("Crypto");
    expect(kindFromAccountType("Chequing Account")).toBe("Chequing");
  });

  test("throws on an unrecognised type rather than defaulting", () => {
    // Defaulting to Other is how a corporate account fed the personal tax
    // estimate for months. An unknown type must be a loud failure.
    expect(() => kindFromAccountType("Managed LIRA Account")).toThrow(/unrecognised account type/i);
  });

  test("checks spousal before plain RRSP", () => {
    expect(kindFromAccountType("Managed Spousal RRSP Account")).toBe("SpousalRRSP");
  });
});
```

- [ ] **Step 2: Run the tests and verify they fail**

Run: `cd personal/investments/app && bun test src/store/mask.test.ts`
Expected: FAIL, `Cannot find module './mask'`.

- [ ] **Step 3: Implement `mask.ts`**

```ts
import { createHash } from "node:crypto";

export type AccountKind =
  | "TFSA"
  | "FHSA"
  | "RRSP"
  | "SpousalRRSP"
  | "RESP"
  | "NonRegistered"
  | "Crypto"
  | "Chequing";

export interface MaskedId {
  maskedId: string;
  shortId: string;
}

/** Deterministic, one-way. The account number never reaches the datastore. */
export function maskAccountNo(accountNo: string): MaskedId {
  const digest = createHash("sha256").update(accountNo).digest("hex");
  const shortId = digest.slice(0, 4);
  return { maskedId: `acct_${digest.slice(0, 8)}`, shortId };
}

export function redactText(text: string, names: readonly string[]): string {
  let out = text;
  for (const name of names) {
    if (!name) continue;
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    out = out.replace(new RegExp(escaped, "gi"), "[redacted]");
  }
  return out;
}

/**
 * Order matters: "Spousal RRSP" must be tested before "RRSP", and the
 * non-registered type contains the word "Cash" so it must be tested before any
 * cash rule. Unknown types throw — silently defaulting is what let a corporate
 * account feed the personal tax estimate.
 */
const KIND_RULES: readonly (readonly [RegExp, AccountKind])[] = [
  [/Spousal RRSP/i, "SpousalRRSP"],
  [/\bRRSP\b/i, "RRSP"],
  [/\bTFSA\b/i, "TFSA"],
  [/\bFHSA\b/i, "FHSA"],
  [/\bRESP\b/i, "RESP"],
  [/Non-Registered/i, "NonRegistered"],
  [/\bCrypto\b/i, "Crypto"],
  [/\bChequing\b/i, "Chequing"],
];

export function kindFromAccountType(accountType: string): AccountKind {
  for (const [pattern, kind] of KIND_RULES) {
    if (pattern.test(accountType)) return kind;
  }
  throw new Error(`unrecognised account type: ${JSON.stringify(accountType)}`);
}
```

- [ ] **Step 4: Run the tests and verify they pass**

Run: `cd personal/investments/app && bun test src/store/mask.test.ts`
Expected: PASS, 9 tests.

- [ ] **Step 5: Implement `registry.ts`**

Owner-supplied labels and purposes, keyed by `shortId` — never by account number, which must not reach source control. `inTotals` is false for Chequing, matching the spec's decision to show cash accounts and exclude them from investment figures.

```ts
import type { Statement } from "../types";
import { type AccountKind, kindFromAccountType, maskAccountNo } from "./mask";

export type Purpose = "retirement" | "house" | "education" | "business" | "spending" | "unassigned";

export interface AccountRecord {
  maskedId: string;
  shortId: string;
  label: string;
  kind: AccountKind;
  purpose: Purpose;
  inTotals: boolean;
  firstPeriod: string;
  lastPeriod: string;
  statementCount: number;
}

/**
 * Owner-reviewed labels, keyed by the 4-char short id the interface already
 * shows. Fill these in after the first build prints the discovered short ids.
 */
const LABELS: Record<string, string> = {};

/** Owner-assigned purpose, for the purpose grouping lens. */
const PURPOSES: Record<string, Purpose> = {};

const EXCLUDED_KINDS: readonly AccountKind[] = ["Chequing"];

export function buildRegistry(statements: readonly Statement[]): AccountRecord[] {
  const byAccount = new Map<string, Statement[]>();
  for (const s of statements) {
    const list = byAccount.get(s.source.accountNo) ?? [];
    list.push(s);
    byAccount.set(s.source.accountNo, list);
  }

  const records: AccountRecord[] = [];
  for (const [accountNo, group] of byAccount) {
    const { maskedId, shortId } = maskAccountNo(accountNo);
    const periods = group.map((s) => s.source.period).sort();
    const latest = group.reduce((a, b) => (a.source.period > b.source.period ? a : b));
    const kind = kindFromAccountType(latest.accountType);

    records.push({
      maskedId,
      shortId,
      label: LABELS[shortId] ?? `${kind} ${shortId}`,
      kind,
      purpose: PURPOSES[shortId] ?? "unassigned",
      inTotals: !EXCLUDED_KINDS.includes(kind),
      firstPeriod: periods[0] ?? "",
      lastPeriod: periods[periods.length - 1] ?? "",
      statementCount: group.length,
    });
  }
  return records.sort((a, b) => a.shortId.localeCompare(b.shortId));
}
```

- [ ] **Step 6: Add the redactions example file**

`personal/investments/app/redactions.example.json`:

```json
{
  "redactions": ["First Last", "Other Name"],
  "fixtures": [
    {
      "file": "ACCOUNTNO_2026-06_BROKERAGE.pdf",
      "alias": "ACCT0001CAD",
      "as": "brokerage-managed"
    }
  ]
}
```

- [ ] **Step 7: Run the full check and commit**

Run: `cd personal/investments/app && bun run check`
Expected: clean, 55 tests pass.

```bash
git add personal/investments/app
git commit -m "feat(investments): mask account numbers and derive kind from the statement"
```

---

### Task 9: The five reconciliation checks

**Files:**
- Create: `personal/investments/app/src/validate/report.ts`
- Create: `personal/investments/app/src/validate/checks.ts`
- Create: `personal/investments/app/src/truth.ts`
- Create: `personal/investments/app/src/corrections.ts`
- Test: `personal/investments/app/src/validate/checks.test.ts`

**Interfaces:**
- Consumes: `Statement` (Task 3), `AccountRecord` (Task 8).
- Produces: `interface Finding { check: CheckName; severity: "error" | "warning"; accountShortId: string; period: string; message: string; expected: number | null; actual: number | null; delta: number | null; sourceFile: string }`; `type CheckName`; `interface Observation { observed: string; period: string; accountValue: number | null; netDeposits: number | null }`; `checkArithmetic(statements: readonly Statement[]): Finding[]`; `checkContinuity(statements: readonly Statement[]): Finding[]`; `checkCoverage(statements: readonly Statement[]): Finding[]`; `checkCrossDocument(statements: readonly Statement[]): Finding[]`; `checkGroundTruth(statements: readonly Statement[], observations: readonly Observation[], countedAccounts: ReadonlySet<string>): Finding[]`; `runChecks(statements: readonly Statement[], observations: readonly Observation[], countedAccounts: ReadonlySet<string>): Finding[]`; `const TOLERANCE: number`; `within(a: number, b: number, tolerance?: number): boolean`.

**Note on `countedAccounts`:** it holds **raw** account numbers, because it is matched against `Statement.source.accountNo`, which is still unmasked at check time. Masking happens in `store/datastore.ts` on the way out. Findings themselves carry masked short ids.

- [ ] **Step 1: Write `report.ts`**

```ts
export type CheckName =
  | "statement-arithmetic"
  | "cash-continuity"
  | "coverage-gap"
  | "cross-document"
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

`personal/investments/app/src/validate/checks.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import type { Statement } from "../types";
import { checkArithmetic, checkContinuity, checkCoverage, checkGroundTruth } from "./checks";

function statement(over: Partial<Statement> = {}): Statement {
  return {
    source: {
      file: "ACCT0001CAD_2026-06_BROKERAGE.pdf",
      accountNo: "ACCT0001CAD",
      period: "2026-06",
      template: "BROKERAGE",
    },
    accountType: "Managed RRSP Account",
    periodStart: "2026-06-01",
    periodEnd: "2026-06-30",
    portfolio: {
      cashMarketValue: 122.95,
      cashBookCost: 122.95,
      classes: [{ name: "Canadian Equities and Alternatives", marketValue: 20375.59, bookCost: 20378.75 }],
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
          deposits: 0,
          proceedsFromSales: 12417.15,
          dividends: 13.8,
          interestEarned: 0,
          stockLendingIncome: 0,
          other: 0,
        },
        paidOut: {
          fees: 7.52,
          taxes: 0,
          interestPaid: 0,
          costOfInvestments: 12417.15,
          withdrawals: 0,
          other: 0,
        },
      },
    ],
    holdings: [
      {
        name: "Purpose High Interest Savings ETF",
        symbol: "PSA",
        quantity: 159.1371,
        segregatedQuantity: 159.1371,
        marketPrice: 50.01,
        priceCurrency: "CAD",
        marketValue: 7958.44,
        bookCost: 7961.6,
        assetClass: "Canadian Equities and Alternatives",
      },
      {
        name: "WS PVT MKT I F",
        symbol: "WSE401",
        quantity: 1241.715,
        segregatedQuantity: 0,
        marketPrice: 10,
        priceCurrency: "CAD",
        marketValue: 12417.15,
        bookCost: 12417.15,
        assetClass: "Canadian Equities and Alternatives",
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
    const findings = checkArithmetic([bad]);
    expect(findings).toHaveLength(1);
    expect(findings[0]?.check).toBe("statement-arithmetic");
    expect(findings[0]?.delta).toBeCloseTo(122.95 - 999, 2);
  });

  test("flags holdings that do not sum to their asset-class total", () => {
    const bad = statement();
    const holding = bad.holdings[0];
    if (!holding) throw new Error("fixture");
    holding.marketValue = 1;
    expect(checkArithmetic([bad]).some((f) => f.message.includes("asset class"))).toBe(true);
  });

  test("flags classes plus cash not equalling the portfolio total", () => {
    const bad = statement();
    if (!bad.portfolio) throw new Error("fixture");
    bad.portfolio.totalMarketValue = 1;
    expect(checkArithmetic([bad]).some((f) => f.message.includes("portfolio total"))).toBe(true);
  });

  test("flags a paid-in breakdown that does not sum to the printed total", () => {
    const bad = statement();
    const cad = bad.cash[0];
    if (!cad?.paidIn) throw new Error("fixture");
    cad.paidIn.dividends = 500;
    expect(checkArithmetic([bad]).some((f) => f.message.includes("paid in"))).toBe(true);
  });

  test("skips the cash check when no totals are printed", () => {
    const cashOnly = statement({
      portfolio: null,
      holdings: [],
      cash: [
        { currency: "CAD", opening: 195.59, closing: 155.62, totalIn: null, totalOut: null, paidIn: null, paidOut: null },
      ],
    });
    expect(checkArithmetic([cashOnly])).toEqual([]);
  });
});

describe("checkContinuity", () => {
  test("passes when one month closes where the next opens", () => {
    const june = statement();
    const july = statement({
      source: {
        file: "ACCT0001CAD_2026-07_BROKERAGE.pdf",
        accountNo: "ACCT0001CAD",
        period: "2026-07",
        template: "BROKERAGE",
      },
      cash: [{ currency: "CAD", opening: 122.95, closing: 122.95, totalIn: 0, totalOut: 0, paidIn: null, paidOut: null }],
    });
    expect(checkContinuity([june, july])).toEqual([]);
  });

  test("flags a broken opening balance", () => {
    const june = statement();
    const july = statement({
      source: {
        file: "ACCT0001CAD_2026-07_BROKERAGE.pdf",
        accountNo: "ACCT0001CAD",
        period: "2026-07",
        template: "BROKERAGE",
      },
      cash: [{ currency: "CAD", opening: 500, closing: 500, totalIn: 0, totalOut: 0, paidIn: null, paidOut: null }],
    });
    const findings = checkContinuity([june, july]);
    expect(findings).toHaveLength(1);
    expect(findings[0]?.check).toBe("cash-continuity");
    expect(findings[0]?.delta).toBeCloseTo(122.95 - 500, 2);
  });

  test("does not compare across different accounts", () => {
    const a = statement();
    const b = statement({
      source: {
        file: "ACCT0002CAD_2026-07_BROKERAGE.pdf",
        accountNo: "ACCT0002CAD",
        period: "2026-07",
        template: "BROKERAGE",
      },
      cash: [{ currency: "CAD", opening: 9999, closing: 9999, totalIn: 0, totalOut: 0, paidIn: null, paidOut: null }],
    });
    expect(checkContinuity([a, b])).toEqual([]);
  });
});

describe("checkCoverage", () => {
  test("passes a contiguous run of months", () => {
    const periods = ["2026-04", "2026-05", "2026-06"];
    const run = periods.map((period) =>
      statement({
        source: {
          file: `ACCT0001CAD_${period}_BROKERAGE.pdf`,
          accountNo: "ACCT0001CAD",
          period,
          template: "BROKERAGE",
        },
      }),
    );
    expect(checkCoverage(run)).toEqual([]);
  });

  test("flags a missing month, including across a year boundary", () => {
    const periods = ["2025-11", "2026-01"];
    const run = periods.map((period) =>
      statement({
        source: {
          file: `ACCT0001CAD_${period}_BROKERAGE.pdf`,
          accountNo: "ACCT0001CAD",
          period,
          template: "BROKERAGE",
        },
      }),
    );
    const findings = checkCoverage(run);
    expect(findings).toHaveLength(1);
    expect(findings[0]?.period).toBe("2025-12");
  });
});

describe("checkGroundTruth", () => {
  test("reports the delta against an observed app figure", () => {
    const findings = checkGroundTruth(
      [statement()],
      [{ observed: "2026-06-30", period: "2026-06", accountValue: 20000, netDeposits: null }],
      // An empty set means "count every account", per checkGroundTruth's guard.
      new Set<string>(),
    );
    expect(findings).toHaveLength(1);
    expect(findings[0]?.check).toBe("ground-truth");
    expect(findings[0]?.actual).toBeCloseTo(20498.54, 2);
    expect(findings[0]?.delta).toBeCloseTo(498.54, 2);
  });

  test("counts only the accounts it is told to count", () => {
    const findings = checkGroundTruth(
      [statement()],
      [{ observed: "2026-06-30", period: "2026-06", accountValue: 20000, netDeposits: null }],
      new Set(["SOME-OTHER-ACCOUNT"]),
    );
    expect(findings[0]?.actual).toBe(0);
  });
});
```

- [ ] **Step 3: Run the tests and verify they fail**

Run: `cd personal/investments/app && bun test src/validate/checks.test.ts`
Expected: FAIL, `Cannot find module './checks'`.

- [ ] **Step 4: Implement `checks.ts`**

```ts
import { maskAccountNo } from "../store/mask";
import type { CashSummary, Statement } from "../types";
import { type Finding, within } from "./report";

/**
 * Findings are written to a committed file, so they carry the masked short id.
 * Putting `source.accountNo` here would leak a real account number into
 * `data/reconciliation.json`.
 */
function finding(
  check: Finding["check"],
  s: Statement,
  message: string,
  expected: number | null,
  actual: number | null,
): Finding {
  return {
    check,
    severity: "error",
    accountShortId: maskAccountNo(s.source.accountNo).shortId,
    period: s.source.period,
    message,
    expected,
    actual,
    delta: expected !== null && actual !== null ? expected - actual : null,
    sourceFile: s.source.file,
  };
}

function checkCashBlock(s: Statement, cash: CashSummary, out: Finding[]): void {
  if (cash.totalIn === null || cash.totalOut === null) return;

  const derived = cash.opening + cash.totalIn - cash.totalOut;
  if (!within(derived, cash.closing)) {
    out.push(
      finding(
        "statement-arithmetic",
        s,
        `${cash.currency} cash does not reconcile: opening + paid in - paid out != closing`,
        derived,
        cash.closing,
      ),
    );
  }

  if (cash.paidIn) {
    const sum = Object.values(cash.paidIn).reduce((a, v) => a + v, 0);
    if (!within(sum, cash.totalIn)) {
      out.push(
        finding(
          "statement-arithmetic",
          s,
          `${cash.currency} paid in breakdown does not sum to the printed total`,
          cash.totalIn,
          sum,
        ),
      );
    }
  }
  if (cash.paidOut) {
    const sum = Object.values(cash.paidOut).reduce((a, v) => a + v, 0);
    if (!within(sum, cash.totalOut)) {
      out.push(
        finding(
          "statement-arithmetic",
          s,
          `${cash.currency} paid out breakdown does not sum to the printed total`,
          cash.totalOut,
          sum,
        ),
      );
    }
  }
}

export function checkArithmetic(statements: readonly Statement[]): Finding[] {
  const out: Finding[] = [];

  for (const s of statements) {
    for (const cash of s.cash) checkCashBlock(s, cash, out);

    const p = s.portfolio;
    if (!p) continue;

    for (const cls of p.classes) {
      const sum = s.holdings
        .filter((h) => h.assetClass === cls.name)
        .reduce((a, h) => a + h.marketValue, 0);
      if (!within(sum, cls.marketValue)) {
        out.push(
          finding(
            "statement-arithmetic",
            s,
            `holdings do not sum to the asset class total for ${cls.name}`,
            cls.marketValue,
            sum,
          ),
        );
      }
    }

    const classSum = p.classes.reduce((a, c) => a + c.marketValue, 0) + p.cashMarketValue;
    if (!within(classSum, p.totalMarketValue)) {
      out.push(
        finding(
          "statement-arithmetic",
          s,
          "asset classes plus cash do not equal the portfolio total",
          p.totalMarketValue,
          classSum,
        ),
      );
    }
  }
  return out;
}

function byAccount(statements: readonly Statement[]): Map<string, Statement[]> {
  const map = new Map<string, Statement[]>();
  for (const s of statements) {
    const list = map.get(s.source.accountNo) ?? [];
    list.push(s);
    map.set(s.source.accountNo, list);
  }
  for (const list of map.values()) {
    list.sort((a, b) => a.source.period.localeCompare(b.source.period));
  }
  return map;
}

export function checkContinuity(statements: readonly Statement[]): Finding[] {
  const out: Finding[] = [];

  for (const list of byAccount(statements).values()) {
    for (let i = 1; i < list.length; i += 1) {
      const prev = list[i - 1];
      const curr = list[i];
      if (!prev || !curr) continue;

      for (const cash of curr.cash) {
        const prior = prev.cash.find((c) => c.currency === cash.currency);
        if (!prior) continue;
        if (!within(prior.closing, cash.opening)) {
          out.push(
            finding(
              "cash-continuity",
              curr,
              `${cash.currency} opening balance does not match ${prev.source.period} closing`,
              prior.closing,
              cash.opening,
            ),
          );
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

  for (const list of byAccount(statements).values()) {
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
        message: "no statement for this month",
        expected: null,
        actual: null,
        delta: null,
        sourceFile: "",
      });
    }
  }
  return out;
}

export function checkCrossDocument(statements: readonly Statement[]): Finding[] {
  const out: Finding[] = [];
  const perf = statements.filter((s) => s.source.template === "PERFORMANCE");

  for (const p of perf) {
    const twin = statements.find(
      (s) =>
        s.source.template === "BROKERAGE" &&
        s.source.accountNo === p.source.accountNo &&
        s.source.period === p.source.period,
    );
    if (!twin?.portfolio || !p.portfolio) continue;

    if (!within(twin.portfolio.totalMarketValue, p.portfolio.totalMarketValue)) {
      out.push(
        finding(
          "cross-document",
          p,
          "performance and brokerage statements disagree on the portfolio total",
          twin.portfolio.totalMarketValue,
          p.portfolio.totalMarketValue,
        ),
      );
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

    const total = statements
      .filter((s) => s.source.period === obs.period && s.source.template !== "PERFORMANCE")
      .filter((s) => countedAccounts.size === 0 || countedAccounts.has(s.source.accountNo))
      .reduce((a, s) => a + (s.portfolio?.totalMarketValue ?? 0), 0);

    out.push({
      check: "ground-truth",
      severity: "warning",
      accountShortId: "*",
      period: obs.period,
      message: `account value on ${obs.observed} versus the app`,
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
    ...checkGroundTruth(statements, observations, countedAccounts),
  ];
}
```

- [ ] **Step 5: Run the tests and verify they pass**

Run: `cd personal/investments/app && bun test src/validate/checks.test.ts`
Expected: PASS, 12 tests.

- [ ] **Step 6: Write `truth.ts` and `corrections.ts`**

`personal/investments/app/src/truth.ts`:

```ts
import type { Observation } from "./validate/checks";

/**
 * Figures read off the Wealthsimple app on a given date. These are the external
 * anchor every derived total is measured against. Add a row whenever you check.
 */
export const OBSERVATIONS: readonly Observation[] = [
  { observed: "2026-06-30", period: "2026-06", accountValue: 242019.61, netDeposits: 217514.0 },
];
```

`personal/investments/app/src/corrections.ts`:

```ts
export interface Correction {
  /** Account short id the correction applies to. */
  shortId: string;
  period: string;
  /** Why this override exists. Required — an unexplained correction is a bug. */
  reason: string;
  /** Date the correction was reviewed. */
  reviewed: string;
}

/**
 * Explicit overrides for genuine Wealthsimple data errors. Empty until the
 * reconciliation report finds one. Never adjust a figure inside a parser.
 */
export const CORRECTIONS: readonly Correction[] = [];
```

- [ ] **Step 7: Run the full check and commit**

Run: `cd personal/investments/app && bun run check`
Expected: clean, 67 tests pass.

```bash
git add personal/investments/app
git commit -m "feat(investments): add the five reconciliation checks"
```

---

### Task 10: Build CLI and full-corpus integration

**Files:**
- Create: `personal/investments/app/src/store/datastore.ts`
- Create: `personal/investments/app/src/build.ts`
- Test: `personal/investments/app/src/build.integration.test.ts`

**Interfaces:**
- Consumes: everything from Tasks 1 through 9.
- Produces: `data/datastore.json`, `data/reconciliation.json`, and a console summary.

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
 * Replaces every account number with its masked id and redacts configured names
 * from activity descriptions. This is the only place a raw account number is
 * allowed to be read, and nothing it returns contains one.
 */
export function buildDatastore(
  statements: readonly Statement[],
  accounts: readonly AccountRecord[],
  names: readonly string[],
  generated: string,
): Datastore {
  const masked = statements.map((s) => ({
    ...s,
    source: {
      ...s.source,
      accountNo: maskAccountNo(s.source.accountNo).maskedId,
      file: s.source.file.replace(/^[A-Z0-9]+_/, `${maskAccountNo(s.source.accountNo).shortId}_`),
    },
    activity: s.activity.map((row) => ({ ...row, description: redactText(row.description, names) })),
  }));

  return {
    meta: {
      generated,
      statementCount: masked.length,
      accountCount: accounts.length,
    },
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
import { extractText } from "./ingest/extract";
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

/** Reads the `redactions` list out of the gitignored config. Absent means none. */
async function loadRedactions(): Promise<string[]> {
  const file = Bun.file(join(import.meta.dir, "..", "redactions.json"));
  if (!(await file.exists())) return [];
  const parsed: unknown = await file.json();
  if (typeof parsed !== "object" || parsed === null) return [];
  const names = (parsed as { redactions?: unknown }).redactions;
  return Array.isArray(names) ? names.filter((v): v is string => typeof v === "string") : [];
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
    const text = await extractText(join(sourceDir, file), cacheDir);
    statements.push(parseStatement(text, source));
  }

  if (skipped.length > 0) {
    throw new Error(
      `${skipped.length} file(s) did not match the expected naming convention:\n  ${skipped.join("\n  ")}`,
    );
  }
  return statements;
}

if (import.meta.main) {
  const generated = new Date().toISOString();
  const statements = await ingestAll(SOURCE, CACHE);
  const accounts = buildRegistry(statements);
  const names = await loadRedactions();

  const counted = new Set(
    accounts.filter((a) => a.inTotals).map((a) => a.maskedId),
  );
  const byMasked = new Map(statements.map((s) => [s.source.accountNo, maskAccountNo(s.source.accountNo).maskedId]));
  const countedRaw = new Set(
    [...byMasked.entries()].filter(([, m]) => counted.has(m)).map(([raw]) => raw),
  );

  const findings = runChecks(statements, OBSERVATIONS, countedRaw);
  const report: ReconciliationReport = {
    generated,
    statementCount: statements.length,
    findings,
  };

  await Bun.write(
    join(DATA, "datastore.json"),
    JSON.stringify(buildDatastore(statements, accounts, names, generated), null, 2),
  );
  await Bun.write(join(DATA, "reconciliation.json"), JSON.stringify(report, null, 2));

  const errors = findings.filter((f) => f.severity === "error");
  console.log(`${statements.length} statements, ${accounts.length} accounts`);
  console.log(`${errors.length} error(s), ${findings.length - errors.length} warning(s)`);
  for (const f of findings.filter((x) => x.check === "ground-truth")) {
    console.log(`  ${f.period} ${f.message}: expected ${f.expected}, got ${f.actual?.toFixed(2)}, delta ${f.delta?.toFixed(2)}`);
  }
  for (const f of errors.slice(0, 20)) {
    console.log(`  [${f.check}] ${f.accountShortId} ${f.period}: ${f.message} (delta ${f.delta?.toFixed(2)})`);
  }
}
```

- [ ] **Step 3: Write the integration test**

`personal/investments/app/src/build.integration.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { ingestAll } from "./build";
import { buildRegistry } from "./store/registry";
import { checkArithmetic, checkContinuity, checkGroundTruth } from "./validate/checks";
import { maskAccountNo } from "./store/mask";

const SOURCE = process.env.STATEMENTS_DIR ?? join(homedir(), "Downloads", "monthly_pdf_statements");
const CACHE = join(import.meta.dir, "..", ".cache");
const available = existsSync(SOURCE);

// Skipped on a machine without the source PDFs. Never commit the PDFs to make
// this run in CI — they carry the owner's address and account numbers.
describe.if(available)("full corpus", () => {
  test("parses every statement in the corpus", async () => {
    const statements = await ingestAll(SOURCE, CACHE);
    expect(statements.length).toBe(220);
  });

  test("every statement passes its own arithmetic", async () => {
    const statements = await ingestAll(SOURCE, CACHE);
    const findings = checkArithmetic(statements);
    if (findings.length > 0) {
      console.log(findings.slice(0, 10));
    }
    expect(findings).toEqual([]);
  });

  test("cash balances are continuous month to month", async () => {
    const statements = await ingestAll(SOURCE, CACHE);
    expect(checkContinuity(statements)).toEqual([]);
  });

  test("finds the expected accounts and kinds", async () => {
    const statements = await ingestAll(SOURCE, CACHE);
    const accounts = buildRegistry(statements);
    expect(accounts).toHaveLength(14);
    const kinds = accounts.map((a) => a.kind).sort();
    expect(kinds.filter((k) => k === "Chequing")).toHaveLength(3);
    expect(kinds).toContain("RESP");
    expect(kinds).toContain("SpousalRRSP");
    expect(kinds).toContain("Crypto");
  });

  test("June 2026 account value lands within 0.5% of the observed app figure", async () => {
    const statements = await ingestAll(SOURCE, CACHE);
    const accounts = buildRegistry(statements);
    const counted = new Set(accounts.filter((a) => a.inTotals).map((a) => a.maskedId));
    const raw = new Set(
      statements
        .map((s) => s.source.accountNo)
        .filter((no) => counted.has(maskAccountNo(no).maskedId)),
    );

    const [finding] = checkGroundTruth(
      statements,
      [{ observed: "2026-06-30", period: "2026-06", accountValue: 242019.61, netDeposits: null }],
      raw,
    );
    if (!finding?.actual) throw new Error("expected a ground-truth finding");

    // Documented in the spec: the residual is 0.12% and unexplained as of
    // 2026-08-04. This tightens to exact once open question 1 is closed.
    expect(Math.abs(finding.actual - 242019.61) / 242019.61).toBeLessThan(0.005);
  });
});
```

- [ ] **Step 4: Run the build for real**

Run: `cd personal/investments/app && bun run build`
Expected: `220 statements, 14 accounts`, the ground-truth line printing a delta near 279.94, and an error count. Read every error. Each one is either a parser bug (fix the parser) or a genuine statement error (add a `Correction` with a reason).

- [ ] **Step 5: Verify the datastore leaks nothing**

```bash
cd personal/investments
grep -cE '\b(WK|HQ|WZ)[A-Z0-9]{7,}\b' data/datastore.json || echo "no account numbers"
grep -cE '\b[0-9]{3}[ -][0-9]{3}[ -][0-9]{3}\b' data/datastore.json || echo "no SIN pattern"
grep -cE '\b[A-Z][0-9][A-Z] ?[0-9][A-Z][0-9]\b' data/datastore.json || echo "no postal code"
cd app && bun -e 'const c=await Bun.file("redactions.json").json();
  const t=(await Bun.file("../data/datastore.json").text()).toLowerCase();
  const hits=c.redactions.filter(n=>t.includes(n.toLowerCase()));
  console.log(hits.length ? "LEAK: "+hits.join(", ") : "no names");'
```

Expected: all four print the "no ..." message. If any prints a count or a leak, stop and fix the masking before committing. The name check reads the list from the gitignored config so no real name is ever written into a tracked file.

- [ ] **Step 6: Run the full check**

Run: `cd personal/investments/app && bun run check`
Expected: clean, 72 tests pass (67 unit plus 5 integration).

- [ ] **Step 7: Commit**

```bash
git add personal/investments/app personal/investments/data
git commit -m "feat(investments): build the masked datastore and reconciliation report"
```

- [ ] **Step 8: Write the log entry**

Create `personal/investments/log/2026-08-04.md` — or append to it if it exists — recording: the statement count, the account count, the ground-truth delta, every reconciliation error found and how it was resolved, and whether the $279.94 residual was explained. Follow the vault's frontmatter standard.

```bash
git add personal/investments/log
git commit -m "docs(investments): log the first PDF ingest run"
```

---

## Definition of done

- `bun run check` passes clean in `personal/investments/app`.
- `bun run build` ingests all 220 PDFs with zero `error`-severity findings, or with every remaining one covered by a dated, justified `Correction`.
- June 2026 account value reconciles within 0.5% of $242,019.61.
- `data/datastore.json` contains no account number, no owner name, no address.
- The reconciliation report is committed and readable.
- The $279.94 residual is either explained in the log or recorded as an open question with what was ruled out.

## Deferred to later phases

- **Phase 2:** the React app, three grouping lenses, per-wrapper views, charts, motion, and deleting `scripts/`.
- **Phase 3:** the projection engine port, fitted returns from the `PERFORMANCE` money-weighted rates, goal tracking, room runway.
- Net-deposits reconciliation against $217,514.00 needs a definition of net deposits across account boundaries, which belongs with the analytics layer in phase 2. Phase 1 records the observation; it does not compute the figure.
