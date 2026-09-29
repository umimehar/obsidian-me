---
title: "Money flow implementation plan"
tags: [personal/investments, decision]
created: 2026-09-29
updated: 2026-09-29
status: active
type: decision
personal: investments
---

# Money flow implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. In this vault each task group is one ticket run by `/obsidian-loop`: a Sonnet subagent implements, an Opus subagent reviews.

**Goal:** A Flow tab after This month: a four column Sankey of where money came from, where it landed, which accounts it reached and where it sits now, with summary tiles, a monthly stacked bar chart, a flows table and a row level drill down.

**Architecture:** Browser safe analytics under `app/src/analytics/flows/` classify every statement row, pair transfers between the owner's accounts, and check each cash block's balance identity. `bun run analytics` writes the result to `data/flows.json`. In the browser, `graph.ts` builds nodes and links for the chosen period, group by and accounts, and a hand rolled layout in `ui/charts/sankeyLayout.ts` draws them.

**Tech Stack:** Bun, TypeScript strict, React 19, Radix Themes, SVG on `d3-scale`, `bun test` with happy-dom. No new dependency.

**Spec:** `personal/investments/docs/superpowers/specs/2026-09-29-money-flow-design.md`. Read it before any task; it carries the data findings every rule below rests on.

## Global Constraints

- Every rendered figure comes from exactly one call to `formatCurrency`, `formatShare` or `formatRate` (`app/src/ui/format.ts`); the visible text, `aria-label`, tooltip and live announcement share that call.
- Gains jade, losses red, tone set by the caller that knows the figure, never read back from text.
- Corpus figures in tests come from `data/goldens.json`, computed in `src/tools/goldens.ts` by calling the production function; never copied from `analytics.json`, never computed in a test with the function under test.
- Mutation proof for each key test: commit, mutate, see red, `git checkout -- <file>`, `git diff --quiet`. Never `git stash`.
- Reversal rows net as credit minus debit. Statement versions collapse through `dedupeToLatestVersion`. PERFORMANCE statements are skipped. A missing statement is shown as missing, never $0. A new account starts from $0.
- Never import `src/build.ts` or `src/ingest/*` from code the browser reaches. Run `bun run build:ui` after touching an import the dashboard can reach.
- Gates for every ticket: `bun run check` (0 fail, no act warnings), `bun run build:ui`, and `bun run contrast` for any ticket that renders.
- Functions at most 100 lines including comments; comments short.
- Page prose is sentence case, with no hyphen used as punctuation or in compound words.
- Never commit account numbers, names or statement descriptions; use registry labels and masked ids. `flows.json` carries no `description` field.
- Imports follow the codebase's existing relative style (`../activity`). Named exports only.
- No AI attribution in commits.

## Review Focus

1. A chequing month with both BROKERAGE and CASH statements must count once. Pinned in Task 2 with a fixture and on the corpus in Task 5.
2. A period whose last month lacks a statement for a selected account must name that account, never read as $0 cash. Pinned in Task 5 (`missingAccounts`).
3. An account filter that excludes one leg of a pair must turn that pair into Moved to or from another account, never new money. Pinned in Task 5.
4. A `BUY` row with an empty description (71 in the corpus) must land under Unnamed holding, never vanish from the holding view. Pinned in Task 2 and Task 5.
5. An unknown activity code in a future import must fail the analytics build naming the file and code, never be dropped. Pinned in Task 2.

---

## Ticket A (TCK-0009): USD cash deposits count as money paid in

### Task 1: Convert USD deposits and withdrawals in the month series

**Files:**
- Modify: `app/src/analytics/series.ts:73-88` (`baseMonthFields`)
- Modify: `app/src/ui/charts/BenchmarkChart.tsx` (remove the note that USD deposits are not counted)
- Test: `app/src/analytics/series.test.ts`
- Regenerate: `data/analytics.json`, `data/goldens.json`

**Interfaces:**
- Consumes: `convertAmountToCad(amount, currency, statement)` from `app/src/analytics/activity.ts`.
- Produces: `MonthPoint.deposits` and `.withdrawals` in CAD summed over every cash block. `cashBalance` stays the CAD block only, unchanged.

- [ ] **Step 1: Write the failing test**

```ts
test("a USD cash deposit counts as paid in, converted at its own statement's rate", () => {
  const s = statementFixture({
    period: "2025-11",
    fxRate: 1.3979,
    cash: [
      cashBlock("CAD", { deposits: 0, withdrawals: 0 }),
      cashBlock("USD", { deposits: 1431.66, withdrawals: 10 }),
    ],
  });
  const [point] = buildMonths([s]);
  expect(point?.deposits).toBeCloseTo(1431.66 * 1.3979, 6);
  expect(point?.withdrawals).toBeCloseTo(10 * 1.3979, 6);
});
```

Use the fixture helpers already in `series.test.ts`; if `cashBlock` does not exist there, add it beside the existing statement builder so both blocks carry `paidIn` and `paidOut` with every other field 0.

- [ ] **Step 2: Run it and see it fail**

Run: `cd app && bun test src/analytics/series.test.ts`
Expected: FAIL, deposits 0 against about 2001.32.

- [ ] **Step 3: Implement**

```ts
function cashFlowsInCad(s: Statement): { deposits: number; withdrawals: number } {
  let deposits = 0;
  let withdrawals = 0;
  for (const c of s.cash) {
    deposits += convertAmountToCad(c.paidIn?.deposits ?? 0, c.currency, s);
    withdrawals += convertAmountToCad(c.paidOut?.withdrawals ?? 0, c.currency, s);
  }
  return { deposits, withdrawals };
}
```

`baseMonthFields` spreads `...cashFlowsInCad(s)` in place of its two CAD only lines. `convertAmountToCad` throws for a USD figure with no rate, so a nonzero USD deposit on a rateless statement fails loudly; a zero one converts to zero only if the rate exists, so guard: skip the call when the amount is 0.

- [ ] **Step 4: Pass, then corpus**

Run: `bun test src/analytics/series.test.ts` then `bun run analytics && bun run goldens && bun run check`.
Read the `data/goldens.json` diff. Expected movement: 2c62 2025-11 deposits up about $2,001.32, 2025-12 up about $4.54; the 2025 year change's net deposits up by the same; the benchmark difference moves (the TCK-0008 reviewer estimated about −$3,625 to about −$5,925). Record the actual figures in the ticket worklog.

- [ ] **Step 5: Remove the stale benchmark note, run gates, commit**

Delete the sentence in `BenchmarkChart.tsx` (and its test assertion) saying USD deposits are not yet counted. `bun run check`, `bun run build:ui`, `bun run contrast`.

```bash
git add app/src data/analytics.json data/goldens.json
git commit -m "fix(investments): count USD cash deposits as money paid in"
```

- [ ] **Step 6: Mutation proof**

Change `deposits += convertAmountToCad(...)` to `deposits += c.currency === "CAD" ? (c.paidIn?.deposits ?? 0) : 0`; the Step 1 test and at least one goldens backed test must go red. `git checkout -- app/src/analytics/series.ts && git diff --quiet`.

---

## Ticket B (TCK-0010): flow rows, classification and transfer pairing

### Task 2: Types, statement selection and row classification

**Files:**
- Create: `app/src/analytics/flows/types.ts`, `app/src/analytics/flows/select.ts`, `app/src/analytics/flows/classify.ts`, `app/src/analytics/flows/assetClass.ts`
- Modify: `app/src/analytics/activity.ts` (export `isFeeRefund`), `app/src/store/registry.ts` (add `isPayrollDeposit`)
- Test: `app/src/analytics/flows/select.test.ts`, `classify.test.ts`, `assetClass.test.ts`

**Interfaces:**
- Produces (types.ts, exact):

```ts
import type { AccountKind } from "../../store/mask";
import type { Purpose } from "../../store/registry";
import type { Currency } from "../../types";

export type SourceCategory = "payroll" | "outsideBank" | "interacIn" | "business";

export type FlowCategory =
  | SourceCategory
  | "grant"
  | "income"
  | "saleProceeds"
  | "buy"
  | "fee"
  | "withholding"
  | "leftWealthsimple"
  | "fxConversion"
  | "inKind";

export interface FlowRow {
  /** `${shortId}:${period}:${template initial}:${row index}`, stable across builds. */
  id: string;
  accountId: string;
  period: string;
  date: string;
  /** The statement code, or `CASH_*` resolved from a CASH row's description. */
  code: string;
  /** For a movement credit, the outside source it is if it proves unpaired. */
  category: FlowCategory;
  /** A leg that may pair with another account's opposite leg. */
  movement: boolean;
  /** Signed from the account's side: positive into it. */
  amountCad: number;
  currency: Currency;
  amount: number;
  fxRate: number | null;
  /** Ticker read off BUY, SELL and DIV descriptions; "" otherwise or when absent. */
  symbol: string;
  pairId: string | null;
  lagDays: number | null;
}

export interface CashBlock {
  accountId: string;
  period: string;
  currency: Currency;
  opening: number;
  closing: number;
  fxRate: number | null;
  rowsNet: number;
  /** closing − opening − rowsNet, in the block's own currency. */
  residual: number;
}

export interface FlowAccount {
  accountId: string;
  shortId: string;
  label: string;
  kind: AccountKind;
  purpose: Purpose;
  inTotals: boolean;
  firstPeriod: string;
  lastPeriod: string;
}

export interface FlowsData {
  generated: string;
  accounts: FlowAccount[];
  rows: FlowRow[];
  blocks: CashBlock[];
}
```

- Produces (functions):
  - `selectFlowStatements(statements: readonly Statement[]): Statement[]`
  - `classifyStatement(s: Statement, account: AccountRecord): FlowRow[]`
  - `resolveCashCode(description: string): string`
  - `assetClassOf(symbol: string): AssetClass` with `type AssetClass = "equity" | "fixedIncome" | "cashEquivalent" | "crypto" | "privateMarkets"`, plus `ASSET_CLASS_LABELS: Record<AssetClass, string>`
  - `isPayrollDeposit(shortId: string, code: string): boolean` in `registry.ts`

- [ ] **Step 1: Failing tests for selection**

```ts
test("a chequing month with BROKERAGE and CASH keeps only BROKERAGE", () => {
  const b = statementFixture({ accountNo: "acct_cheq", period: "2026-05", template: "BROKERAGE" });
  const c = statementFixture({ accountNo: "acct_cheq", period: "2026-05", template: "CASH" });
  expect(selectFlowStatements([b, c])).toEqual([b]);
});

test("a CASH statement with no BROKERAGE twin is kept", () => {
  const c = statementFixture({ accountNo: "acct_cheq", period: "2026-07", template: "CASH" });
  expect(selectFlowStatements([c])).toEqual([c]);
});

test("PERFORMANCE is skipped and an amended version replaces its original", () => {
  const v0 = statementFixture({ period: "2026-04", template: "BROKERAGE", version: 0 });
  const v1 = statementFixture({ period: "2026-04", template: "BROKERAGE", version: 1 });
  const p = statementFixture({ period: "2026-04", template: "PERFORMANCE" });
  expect(selectFlowStatements([v0, v1, p])).toEqual([v1]);
});
```

`statementFixture` comes from the shared test support the other analytics tests use (`src/ui/testSupport` or the helpers in `activity.test.ts`); reuse it rather than writing a new builder.

- [ ] **Step 2: Implement select.ts**

```ts
import { dedupeToLatestVersion } from "../../statementVersion";
import type { Statement } from "../../types";

const key = (s: Statement) => `${s.source.accountNo}|${s.source.period}`;

/** One statement per account and month: BROKERAGE where it exists, CASH only where it does not. */
export function selectFlowStatements(statements: readonly Statement[]): Statement[] {
  const latest = dedupeToLatestVersion(statements).filter(
    (s) => s.source.template !== "PERFORMANCE",
  );
  const brokerage = new Set(latest.filter((s) => s.source.template === "BROKERAGE").map(key));
  return latest.filter((s) => s.source.template === "BROKERAGE" || !brokerage.has(key(s)));
}
```

- [ ] **Step 3: Failing tests for classification**

One test per rule, each on a one row fixture statement:

| Row | Account kind | Expected |
|---|---|---|
| `CONT` credit 500 | TFSA | `movement: true`, `category: "outsideBank"` |
| `CONT` credit 5000 | Corporate | `category: "business"` |
| `EFT` credit | Corporate | `category: "business"` |
| `AFT_IN` credit | Chequing | `category: "payroll"` |
| `DEP` credit, shortId `2b74` | Chequing | `category: "payroll"` (override) |
| `DEP` credit, other shortId | Chequing | `category: "outsideBank"` |
| `E_TRFIN` credit | Chequing | `category: "interacIn"` |
| `TRFOUT` debit 700 | Chequing | `movement: true`, `category: "leftWealthsimple"`, `amountCad: -700` |
| `SPEND` debit | Chequing | `movement: false`, `category: "leftWealthsimple"` |
| CASH `""`, "Direct deposit from X" credit | Chequing | `code: "CASH_PAYROLL"`, `category: "payroll"` |
| CASH `""`, "Interac e-Transfer® Received from [redacted]" | Chequing | `code: "CASH_INTERAC_IN"`, `category: "interacIn"` |
| CASH `""`, "Interac e-Transfer® Out" debit | Chequing | `code: "CASH_INTERAC_OUT"`, `movement: true` |
| CASH `""`, "Transfer out to Non-registered" debit | Chequing | `code: "CASH_TRANSFER"`, `movement: true` |
| CASH `""`, "Interest earned" | Chequing | `code: "CASH_INTEREST"`, `category: "income"` |
| CASH `""`, "Cash back - Prepaid card" | Chequing | `code: "CASH_REWARD"`, `category: "income"` |
| `DIV` credit 81.80 and `DIV` debit 40.90 | RRSP | two rows, `amountCad` 81.80 and −40.90, both `income` |
| USD `DIV` credit 10, statement `fxRate` 1.4 | NonRegistered | `amountCad: 14`, `amount: 10`, `fxRate: 1.4` |
| `REIMB` "ETF Rebate" credit | TFSA | `category: "fee"`, positive `amountCad` |
| `REIMB` other description | TFSA | `category: "income"` |
| `BUY` "VFV - Vanguard S&P 500 Index ETF: Bought 2 shares" | TFSA | `category: "buy"`, `symbol: "VFV"` |
| `BUY` description "" | TFSA | `category: "buy"`, `symbol: ""` |
| `TRFIN` "BABA - Alibaba…: Transfer of 2.0000 shares into the account", 0/0 | TFSA | `category: "inKind"`, `movement: false`, `amountCad: 0` |
| `LOAN` 0/0 | TFSA | no row |
| `LOAN` credit 5 | TFSA | throws, message names file and `LOAN` |
| code `NEWCODE` | TFSA | throws, message names file and `NEWCODE` |
| `DEP` debit, USD, statement `fxRate: null` | NonRegistered | throws (rate missing) |

Assert on `id` for one row: `"d77c:2026-05:B:0"`.

- [ ] **Step 4: Implement classify.ts**

```ts
import { convertToCad, isFeeRefund } from "../activity";
import type { AccountKind } from "../../store/mask";
import { type AccountRecord, isPayrollDeposit } from "../../store/registry";
import type { ActivityRow, Statement } from "../../types";
import type { FlowCategory, FlowRow, SourceCategory } from "./types";

const MOVEMENT_CODES = new Set([
  "CONT", "DEP", "TRFIN", "TRFINTF", "EFT", "E_TRFIN", "AFT_IN",
  "TRFOUT", "TRFOUTTF", "WD", "P2P_OUT",
  "CASH_PAYROLL", "CASH_INTERAC_IN", "CASH_INTERAC_OUT", "CASH_TRANSFER",
]);
const ZERO_CODES = new Set(["LOAN", "RECALL", "STKDIV", "STKDIS", "STKREORG", "ROC"]);
const INCOME_CODES = new Set(["DIV", "INT", "FPLINT", "CASHBACK", "REFER", "GIVEAWAY", "CASH_INTEREST", "CASH_REWARD"]);
const FIXED: Readonly<Record<string, FlowCategory>> = {
  BUY: "buy", SELL: "saleProceeds", FEE: "fee", NRT: "withholding",
  GRANT: "grant", FXCONVERSION: "fxConversion", SPEND: "leftWealthsimple",
};
const IN_KIND = /Transfer of [\d.]+ shares (into|out of) the account/;
const SYMBOL = /^([A-Z0-9.]+) - /;

/** A CASH template row's code, read off its description. The description itself never leaves the build. */
export function resolveCashCode(description: string): string {
  if (/^Direct deposit from/.test(description)) return "CASH_PAYROLL";
  if (/Interac e-Transfer® Received/.test(description)) return "CASH_INTERAC_IN";
  if (/Interac e-Transfer® Out/.test(description)) return "CASH_INTERAC_OUT";
  if (/^Interest earned/.test(description)) return "CASH_INTEREST";
  if (/^(Cash back|Referral bonus|Giveaway received)/.test(description)) return "CASH_REWARD";
  return "CASH_TRANSFER";
}

function outsideSource(kind: AccountKind, shortId: string, code: string): SourceCategory {
  if (kind === "Corporate") return "business";
  if (code === "AFT_IN" || code === "CASH_PAYROLL" || isPayrollDeposit(shortId, code)) return "payroll";
  if (code === "E_TRFIN" || code === "CASH_INTERAC_IN") return "interacIn";
  return "outsideBank";
}

function categoryOf(row: ActivityRow, code: string, signed: number, account: AccountRecord): FlowCategory {
  if (MOVEMENT_CODES.has(code)) {
    return signed > 0 ? outsideSource(account.kind, account.shortId, code) : "leftWealthsimple";
  }
  if (INCOME_CODES.has(code)) return "income";
  if (code === "REIMB") return isFeeRefund(row) ? "fee" : "income";
  const fixed = FIXED[code];
  if (fixed !== undefined) return fixed;
  throw new Error(`activity code ${code} has no flow category`);
}

/** Every cash moving row of one statement as a `FlowRow`, in CAD at the statement's own rate. */
export function classifyStatement(s: Statement, account: AccountRecord): FlowRow[] {
  const rows: FlowRow[] = [];
  s.activity.forEach((row, index) => {
    const signed = row.credit - row.debit;
    const code = row.code === "" ? resolveCashCode(row.description) : row.code;
    const inKind = (code === "TRFIN" || code === "TRFOUT") && IN_KIND.test(row.description);
    if (ZERO_CODES.has(code)) {
      if (signed !== 0) throw new Error(`${s.source.file}: ${code} row carries cash (${signed})`);
      return;
    }
    if (signed === 0 && !inKind) return;
    let category: FlowCategory;
    try {
      category = inKind ? "inKind" : categoryOf(row, code, signed, account);
    } catch (error) {
      throw new Error(`${s.source.file}: ${error instanceof Error ? error.message : String(error)}`);
    }
    rows.push({
      id: `${account.shortId}:${s.source.period}:${s.source.template[0]}:${index}`,
      accountId: account.maskedId,
      period: s.source.period,
      date: row.date,
      code,
      category,
      movement: !inKind && MOVEMENT_CODES.has(code),
      amountCad: signed === 0 ? 0 : convertToCad(signed, row, s),
      currency: row.currency,
      amount: signed,
      fxRate: row.currency === "USD" ? s.fxRate : null,
      symbol: /^(BUY|SELL|DIV)$/.test(code) ? (SYMBOL.exec(row.description)?.[1] ?? "") : "",
      pairId: null,
      lagDays: null,
    });
  });
  return rows;
}
```



In `activity.ts` change `function isFeeRefund` to `export function isFeeRefund`. In `registry.ts` add:

```ts
/**
 * Deposits the owner confirmed are payroll, keyed by shortId and code
 * (2026-09-29). 2b74's biweekly `DEP` rows are the payroll that later
 * arrives as `AFT_IN`; nothing on the row itself says so.
 */
const PAYROLL_CODES: Readonly<Record<string, readonly string[]>> = { "2b74": ["DEP"] };

export function isPayrollDeposit(shortId: string, code: string): boolean {
  return PAYROLL_CODES[shortId]?.includes(code) ?? false;
}
```

- [ ] **Step 5: assetClass.ts with its test**

```ts
export type AssetClass = "equity" | "fixedIncome" | "cashEquivalent" | "crypto" | "privateMarkets";

export const ASSET_CLASS_LABELS: Readonly<Record<AssetClass, string>> = {
  equity: "Equities",
  fixedIncome: "Fixed income",
  cashEquivalent: "Cash equivalents",
  crypto: "Crypto",
  privateMarkets: "Private markets",
};

/** Owner reviewed. A symbol not listed is equity, and the Flow tab names it. */
const CLASSES: Readonly<Record<string, AssetClass>> = {
  PSA: "cashEquivalent",
  CASH: "cashEquivalent",
  HISA: "cashEquivalent",
  ZMMK: "cashEquivalent",
  CBIL: "cashEquivalent",
  HSAV: "cashEquivalent",
  BTC: "crypto",
  ETH: "crypto",
  WSE401: "privateMarkets",
};

export function assetClassOf(symbol: string): AssetClass {
  return CLASSES[symbol] ?? "equity";
}

export function isListedSymbol(symbol: string): boolean {
  return Object.hasOwn(CLASSES, symbol);
}
```

Before committing, list every distinct `BUY` symbol in the datastore held by d6d9 and e2d6 (`bun -e` over `data/datastore.json`) and add each to `privateMarkets` or `crypto` accordingly; list bond ETFs among the rest (names containing "Bond" or "Aggregate") and add them as `fixedIncome`. Test: `assetClassOf("PSA")` is `cashEquivalent`, `assetClassOf("VFV")` is `equity`, `assetClassOf("")` is `equity`, `assetClassOf("constructor")` is `equity` (prototype key).

- [ ] **Step 6: Run, gates, commit**

`bun test src/analytics/flows && bun run check && bun run build:ui`

```bash
git add app/src/analytics/flows app/src/analytics/activity.ts app/src/store/registry.ts
git commit -m "feat(investments): classify statement rows into money flows"
```

### Task 3: Pair transfers between the owner's accounts

**Files:**
- Create: `app/src/analytics/flows/match.ts`
- Test: `app/src/analytics/flows/match.test.ts`

**Interfaces:**
- Consumes: `FlowRow` (Task 2).
- Produces: `matchTransfers(rows: readonly FlowRow[], maxLagDays?: number): FlowRow[]` returning the same rows in the same order, paired legs carrying `pairId = "<out id>><in id>"` and `lagDays`.

- [ ] **Step 1: Failing tests**

```ts
const leg = (id: string, accountId: string, date: string, amount: number, currency: "CAD" | "USD" = "CAD"): FlowRow => ({
  id, accountId, period: date.slice(0, 7), date, code: amount > 0 ? "CONT" : "TRFOUT",
  category: amount > 0 ? "outsideBank" : "leftWealthsimple", movement: true,
  amountCad: amount, currency, amount, fxRate: null, symbol: "", pairId: null, lagDays: null,
});

test("same date, same amount, opposite sign, different accounts pair with lag 0", () => {
  const [out, inn] = matchTransfers([leg("o", "cheq", "2026-07-14", -800), leg("i", "rrsp", "2026-07-14", 800)]);
  expect(out?.pairId).toBe("o>i");
  expect(inn?.pairId).toBe("o>i");
  expect(inn?.lagDays).toBe(0);
});

test("a two day lag pairs in the second pass and records the lag", () => {
  const rows = matchTransfers([leg("o", "a", "2026-01-14", -500), leg("i", "b", "2026-01-16", 500)]);
  expect(rows[1]?.lagDays).toBe(2);
});

test("an exact date match wins over a closer id with a lag", () => {
  const rows = matchTransfers([
    leg("o", "a", "2026-01-14", -500),
    leg("i1", "b", "2026-01-15", 500),
    leg("i2", "c", "2026-01-14", 500),
  ]);
  expect(rows[0]?.pairId).toBe("o>i2");
  expect(rows[1]?.pairId).toBeNull();
});

test("four days apart never pair", () => {
  const rows = matchTransfers([leg("o", "a", "2026-01-10", -500), leg("i", "b", "2026-01-14", 500)]);
  expect(rows.every((r) => r.pairId === null)).toBe(true);
});

test("the same account never pairs with itself", () => {
  const rows = matchTransfers([leg("o", "a", "2026-01-10", -500), leg("i", "a", "2026-01-10", 500)]);
  expect(rows.every((r) => r.pairId === null)).toBe(true);
});

test("currencies never cross, and a cent apart never pairs", () => {
  const rows = matchTransfers([
    leg("o", "a", "2026-01-10", -500),
    leg("u", "b", "2026-01-10", 500, "USD"),
    leg("c", "c", "2026-01-10", 500.01),
  ]);
  expect(rows.every((r) => r.pairId === null)).toBe(true);
});

test("two identical transfers on one day pair one to one", () => {
  const rows = matchTransfers([
    leg("o1", "cheq", "2026-07-14", -40), leg("o2", "cheq", "2026-07-14", -40),
    leg("i1", "nr", "2026-07-14", 40), leg("i2", "nr", "2026-07-14", 40),
  ]);
  expect(new Set(rows.map((r) => r.pairId)).size).toBe(2);
});

test("non movement rows are never paired", () => {
  const div = { ...leg("d", "b", "2026-01-10", 500), movement: false };
  const rows = matchTransfers([leg("o", "a", "2026-01-10", -500), div]);
  expect(rows.every((r) => r.pairId === null)).toBe(true);
});
```

- [ ] **Step 2: Implement**

```ts
import type { FlowRow } from "./types";

const DAY_MS = 86_400_000;
const cents = (amount: number) => Math.round(Math.abs(amount) * 100);
const dayOf = (date: string) => Date.parse(`${date}T00:00:00Z`) / DAY_MS;

/**
 * Pairs a debit in one account with a credit in another: same currency,
 * same amount to the cent, dates within `maxLagDays`. Exact dates pair
 * first, then each extra day of lag in turn, so the closest partner wins.
 */
export function matchTransfers(rows: readonly FlowRow[], maxLagDays = 3): FlowRow[] {
  const result = rows.map((r) => ({ ...r }));
  const outs = result.filter((r) => r.movement && r.amount < 0);
  const ins = new Map<string, FlowRow[]>();
  for (const r of result) {
    if (!r.movement || r.amount <= 0) continue;
    const key = `${r.currency}|${cents(r.amount)}`;
    ins.set(key, [...(ins.get(key) ?? []), r]);
  }
  for (let lag = 0; lag <= maxLagDays; lag++) {
    for (const out of outs) {
      if (out.pairId !== null) continue;
      const partner = (ins.get(`${out.currency}|${cents(out.amount)}`) ?? []).find(
        (i) => i.pairId === null && i.accountId !== out.accountId &&
          Math.abs(dayOf(i.date) - dayOf(out.date)) === lag,
      );
      if (partner === undefined) continue;
      out.pairId = `${out.id}>${partner.id}`;
      partner.pairId = out.pairId;
      out.lagDays = lag;
      partner.lagDays = lag;
    }
  }
  return result;
}
```

- [ ] **Step 3: Run, commit, mutation proof**

`bun test src/analytics/flows/match.test.ts && bun run check`

```bash
git add app/src/analytics/flows/match.ts app/src/analytics/flows/match.test.ts
git commit -m "feat(investments): pair transfers between the owner's accounts"
```

Mutations, each must redden a test, each restored with `git checkout -- app/src/analytics/flows/match.ts && git diff --quiet`: drop `i.accountId !== out.accountId`; change `=== lag` to `<= maxLagDays`; key without currency.

### Task 4: Cash blocks, the flows build and `flows.json`

**Files:**
- Create: `app/src/analytics/flows/reconcile.ts`, `app/src/analytics/flows/build.ts`
- Modify: `app/src/analytics/build.ts` (write `data/flows.json`), `app/src/ui/data.ts` (`loadFlows`)
- Test: `app/src/analytics/flows/reconcile.test.ts`, `app/src/analytics/flows/build.test.ts`, `app/src/ui/data.test.ts`

**Interfaces:**
- Consumes: Tasks 2 and 3; `Datastore` from `app/src/store/datastore.ts` (type only).
- Produces:
  - `buildCashBlocks(statements: readonly Statement[], rows: readonly FlowRow[]): CashBlock[]`
  - `buildFlows(datastore: Datastore): FlowsData`
  - `loadFlows(): FlowsData` and `parseFlows(raw: unknown): FlowsData` in `ui/data.ts`

- [ ] **Step 1: Failing reconcile tests**

```ts
test("a block whose rows explain the change has residual 0", () => {
  const s = statementFixture({ cash: [cash("CAD", 100, 150)], activity: [row("CONT", 50, 0)] });
  const rows = classifyStatement(s, account("TFSA"));
  expect(buildCashBlocks([s], rows)[0]?.residual).toBeCloseTo(0, 9);
});

test("a gap the rows do not explain is kept as the residual, in the block's currency", () => {
  const s = statementFixture({ fxRate: 1.4, cash: [cash("USD", 0, 10)], activity: [] });
  const [block] = buildCashBlocks([s], []);
  expect(block?.residual).toBeCloseTo(10, 9);
  expect(block?.fxRate).toBe(1.4);
});
```

- [ ] **Step 2: Implement reconcile.ts**

```ts
import type { Statement } from "../../types";
import type { CashBlock, FlowRow } from "./types";

/** One block per account, month and currency: opening + rows = closing, with any gap kept. */
export function buildCashBlocks(statements: readonly Statement[], rows: readonly FlowRow[]): CashBlock[] {
  const net = new Map<string, number>();
  for (const r of rows) {
    const key = `${r.accountId}|${r.period}|${r.currency}`;
    net.set(key, (net.get(key) ?? 0) + r.amount);
  }
  return statements.flatMap((s) =>
    s.cash.map((c) => {
      const rowsNet = net.get(`${s.source.accountNo}|${s.source.period}|${c.currency}`) ?? 0;
      return {
        accountId: s.source.accountNo,
        period: s.source.period,
        currency: c.currency,
        opening: c.opening,
        closing: c.closing,
        fxRate: c.currency === "USD" ? s.fxRate : null,
        rowsNet,
        residual: c.closing - c.opening - rowsNet,
      };
    }),
  );
}
```

- [ ] **Step 3: Implement build.ts and wire it**

```ts
import type { Datastore } from "../../store/datastore";
import { classifyStatement } from "./classify";
import { matchTransfers } from "./match";
import { buildCashBlocks } from "./reconcile";
import { selectFlowStatements } from "./select";
import type { FlowsData } from "./types";

export function buildFlows(datastore: Datastore): FlowsData {
  const accounts = new Map(datastore.accounts.map((a) => [a.maskedId, a]));
  const statements = selectFlowStatements(datastore.statements);
  const classified = statements.flatMap((s) => {
    const account = accounts.get(s.source.accountNo);
    if (account === undefined) throw new Error(`${s.source.file}: account not in the registry`);
    return classifyStatement(s, account);
  });
  const rows = matchTransfers(classified);
  return {
    generated: datastore.meta.generated,
    accounts: datastore.accounts.map((a) => ({
      accountId: a.maskedId, shortId: a.shortId, label: a.label, kind: a.kind,
      purpose: a.purpose, inTotals: a.inTotals, firstPeriod: a.firstPeriod, lastPeriod: a.lastPeriod,
    })),
    rows,
    blocks: buildCashBlocks(statements, rows),
  };
}
```

In `analytics/build.ts`, after `analytics.json` is written: `await Bun.write(join(DATA_DIR, "flows.json"), JSON.stringify(buildFlows(datastore)))` (compact, no indent: it is the larger file) and log the row, pair and residual counts. `ui/data.ts`: `import rawFlows from "@data/flows.json"`, a structural guard like `isAnalyticsOutput` checking `generated`, `accounts`, `rows`, `blocks`, and `loadFlows()`.

- [ ] **Step 4: Corpus tests in build.test.ts**

Read the real datastore (as `goldens.ts` does) and assert, with expected values from `GOLDENS.flows` (Task 5 adds them; until then assert the structural properties only):

```ts
test("every cash block reconciles on the corpus", () => {
  const flows = buildFlows(DATASTORE);
  expect(flows.blocks.filter((b) => Math.abs(b.residual) > 0.005)).toEqual([]);
});

test("no committed flow row carries a description", () => {
  const raw = JSON.stringify(loadFlows());
  expect(raw).not.toContain("description");
  expect(raw).not.toMatch(/e-Transfer|Direct deposit/);
});

test("flows.json is current against the datastore", () => {
  expect(loadFlows()).toEqual(JSON.parse(JSON.stringify(buildFlows(DATASTORE))));
});

test("flows.json stays under 2.5 MB", async () => {
  expect((await Bun.file(join(DATA, "flows.json")).arrayBuffer()).byteLength).toBeLessThan(2_500_000);
});
```

- [ ] **Step 5: Run the build, gates, commit**

`bun run analytics && bun run check && bun run build:ui` (`build:ui` proves `ui/data.ts` pulls in no Node module).

```bash
git add app/src data/flows.json data/analytics.json
git commit -m "feat(investments): build flows.json from the statement archive"
```

- [ ] **Step 6: Mutation proof**

In `select.ts` return `latest` (both templates) and see the Task 2 fixture test and the "flows.json is current" test go red. Restore with `git checkout` and `git diff --quiet`. Task 5 adds the corpus test that catches the same mutation independently.

---

## Ticket C (TCK-0011): the flow graph, summary and goldens

### Task 5: Graph, summary, table series and goldens

**Files:**
- Create: `app/src/analytics/flows/graph.ts`, `app/src/analytics/flows/summary.ts`, `app/src/analytics/flows/period.ts`
- Modify: `app/src/tools/goldens.ts`, `app/src/goldens.ts` (the `Goldens` type)
- Test: `app/src/analytics/flows/graph.test.ts`, `summary.test.ts`, `period.test.ts`, `graph.corpus.test.ts`

**Interfaces:**
- Consumes: `FlowsData`, `assetClassOf`, `ASSET_CLASS_LABELS`.
- Produces (exact):

```ts
// period.ts
export interface FlowPeriod { from: string; to: string } // inclusive "YYYY-MM"
export function inPeriod(period: string, p: FlowPeriod): boolean;
export function allTime(data: FlowsData): FlowPeriod;
export function latestMonth(data: FlowsData): FlowPeriod;
export function yearPeriod(year: number): FlowPeriod;
export function missingAccounts(data: FlowsData, p: FlowPeriod, accounts: ReadonlySet<string>): FlowAccount[];

// graph.ts
export type GroupBy = "accountType" | "account" | "purpose" | "assetClass" | "holding";
export type Column = 0 | 1 | 2 | 3;
export interface FlowNode { id: string; column: Column; label: string; value: number }
export interface FlowLink { source: string; target: string; value: number; recycled: boolean; rowIds: string[] }
export interface FlowGraph { nodes: FlowNode[]; links: FlowLink[]; totalIn: number }
export function buildFlowGraph(data: FlowsData, p: FlowPeriod, groupBy: GroupBy, accounts: ReadonlySet<string>): FlowGraph;
export function depositsByDestination(data: FlowsData, p: FlowPeriod, groupBy: GroupBy, accounts: ReadonlySet<string>): DestinationBucket[];
export interface DestinationBucket { bucket: string; values: Record<string, number> } // bucket "YYYY-MM" or "YYYY"

// summary.ts
export interface FlowSummary {
  paidIn: number;
  paidInBySource: Record<SourceCategory, number>;
  contributionsByKind: Partial<Record<AccountKind, number>>;
  grants: number;
  income: number;
  invested: number;
  cashEquivalentNet: number;
  cashChange: number;
  leftInCash: number;
  costs: number;
  left: number;
  investedRate: number | null;
  unpairedLegs: number;
  laggedPairs: number;
  residual: number;
  unlistedSymbols: string[];
}
export function flowSummary(data: FlowsData, p: FlowPeriod, accounts: ReadonlySet<string>): FlowSummary;
```

**The link rules** (`graph.ts`). Every row in a selected account and inside the period produces links by these rules, in order. `own(row)` is `land:chequing` for a chequing account and `grp:<key>` otherwise, with `<key>` from the group by (`accountType` → kind, `account` → accountId, `purpose` → purpose; `assetClass` and `holding` use kind here).

1. `inKind` rows: no link (the table lists them).
2. A paired leg whose partner is also selected and whose partner maps to the same node as its own: no link.
3. A paired pair from a chequing account to a non chequing account, both selected: one link `land:chequing → grp:<key>` from the debit leg only; the credit leg emits nothing.
4. Any other paired leg (partner unselected, or not the chequing to account shape): a debit links `own → now:moved`; a credit links `src:moved → land:chequing` if own is chequing, else `src:moved → land:direct` and `land:direct → own`.
5. An unpaired movement credit: `src:<category> → land:chequing` for chequing, else `src:<category> → land:direct` plus `land:direct → own`.
6. `grant`: `src:grant → land:direct` plus `land:direct → own`.
7. `income`: `src:income → own`, recycled. `saleProceeds`: `src:saleProceeds → own`, recycled.
8. An unpaired movement debit, or `leftWealthsimple` from `SPEND`: `own → now:left`.
9. `buy`: `own → now:cashEquivalent` when `assetClassOf(symbol)` is `cashEquivalent`; otherwise `own → now:invested`, or with group by `assetClass` `own → now:class:<class>`, with group by `holding` `own → now:holding:<symbol or "">`.
10. `fee` and `withholding`: `own → now:costs` (refunds are positive rows and net against it).
11. `fxConversion`: `own → now:fx` with the row's value (both legs sum to the conversion difference at the month's rate).

Then per selected account, the sum over the period's blocks of `(closing − opening) × rate` links `own → now:cash`, and the sum of `residual × rate` links `own → now:unreconciled`. A USD block with a null rate throws naming account and period.

Links aggregate by `(source, target)`, summing signed value (a link's value is the money moving along it, so a debit row contributes `−amountCad`), collecting `rowIds`. A link that nets negative flips to its mirror: `now:X` becomes `src:X` with source and target swapped (so a fall in cash reads Drawn from cash, a net refund reads Fee refunds). Links under a cent in absolute value are dropped. Node value is the larger of in and out. `totalIn` is the sum of links leaving column 0 nodes.

Column of a node: `src:*` 0, `land:*` 1, `grp:*` 2, `now:*` 3.

Labels:

| id | label |
|---|---|
| `src:payroll` | Payroll deposited |
| `src:outsideBank` | Outside bank |
| `src:interacIn` | Interac received |
| `src:business` | Business |
| `src:grant` | Government grant (CESG) |
| `src:income` | Portfolio income |
| `src:saleProceeds` | Sale proceeds |
| `src:moved` | Moved from another account |
| `src:cash` | Drawn from cash |
| `src:costs` | Fee refunds |
| `src:fx` / `now:fx` | Currency conversion |
| `src:unreconciled` / `now:unreconciled` | Unreconciled |
| `land:chequing` | Chequing |
| `land:direct` | Straight into an account |
| `now:invested` | Invested |
| `now:cashEquivalent` | Cash equivalents |
| `now:cash` | Cash |
| `now:costs` | Fees and withholding |
| `now:left` | Left Wealthsimple |
| `now:moved` | Moved to another account |
| `now:class:<c>` | `ASSET_CLASS_LABELS[c]` |
| `now:holding:<s>` | the symbol, or Unnamed holding for "" |
| `grp:<kind>` | TFSA, RRSP, Spousal RRSP (spouse's asset), FHSA, RESP, Non registered, Corporate, Crypto |
| `grp:<accountId>` | the registry label |
| `grp:<purpose>` | Retirement, House, Education, Business, Growth, Spending, Unassigned |

Nodes sort within a column by value, largest first, except column 3 keeps the order Invested (or its split), Cash equivalents, Cash, Fees and withholding, Left Wealthsimple, Moved to another account, Currency conversion, Unreconciled.

`buildFlowGraph` ends with the balance assertion: the sum of links out of column 0 must equal the sum of links into column 3 within one cent, and every column 1 and 2 node's in must equal its out within one cent; otherwise it throws naming the node and the gap. Split the function so none exceeds 100 lines: `rowLinks(row, ctx): LinkPart[]`, `cashLinks(...)`, `aggregate(parts)`, `flipNegative(link)`, `buildNodes(links)`, `assertBalanced(graph)`.

`depositsByDestination` buckets the links into column 2 (from `land:*` and `src:moved` excluded) by month, or by year when the period spans more than 24 months, keyed by the column 2 node's label. It reuses `rowLinks` so the chart and the Sankey cannot disagree.

**Summary rules** (`summary.ts`): `paidIn` is the sum of unpaired movement credits (`paidInBySource` by category); `contributionsByKind` sums `CONT` credits on TFSA, RRSP, SpousalRRSP, FHSA and RESP plus `DEP` credits on RESP, paired or not; `grants`, `income` from their categories; `invested` is buys less sale proceeds of symbols that are not cash equivalents, as positive money in; `cashEquivalentNet` the same for cash equivalents; `cashChange` and `residual` from the blocks as in the graph; `leftInCash = cashChange + cashEquivalentNet`; `costs` is fees plus withholding as a positive figure; `left` the unpaired movement debits plus `SPEND`; `investedRate = invested / (paidIn + grants + income)` when that denominator is positive, else null; `unpairedLegs` counts unpaired movement rows; `laggedPairs` counts pairs with `lagDays > 0`; `unlistedSymbols` the sorted distinct bought symbols `isListedSymbol` does not know, excluding "".

`missingAccounts` returns every selected account whose `firstPeriod <= p.to` and `lastPeriod >= p.to` (still open) with no block at `p.to`, plus every selected account whose `lastPeriod < p.to` while some other account reports at `p.to` (late).

- [ ] **Step 1: Failing fixture tests, graph.test.ts**

Build small `FlowsData` fixtures by hand (a chequing account, a TFSA, an RRSP, a corporate). One test each:

1. Payroll 3,101.50 into chequing, 800 chequing to RRSP paired, rest stays: links `src:payroll → land:chequing` 3101.50, `land:chequing → grp:RRSP` 800, `grp:RRSP → now:cash` 800, `land:chequing → now:cash` 2301.50; balanced.
2. Account filter without chequing: the RRSP's paired credit becomes `src:moved → land:direct → grp:RRSP`, never `src:outsideBank`.
3. TFSA to TFSA paired under `accountType`: no link; under `account`: `grp:A → now:moved` and `src:moved → land:direct → grp:B`.
4. Cash falling 100 over the period with a 100 buy: `src:cash → grp:TFSA` 100 and `grp:TFSA → now:invested` 100.
5. Buy of PSA 500: `grp:TFSA → now:cashEquivalent` 500.
6. Group by holding with a `BUY` of symbol "": node `now:holding:` labelled Unnamed holding.
7. A residual of 5 in a block: `grp:X → now:unreconciled` 5.
8. USD block with `fxRate: null` and a nonzero change: throws naming the account and period.
9. A dividend of 81.80 and its reversal of 40.90: `src:income → grp:RRSP` 40.90, marked recycled.
10. Corporate `CONT` 5,000 unpaired: `src:business → land:direct` and `land:direct → grp:Corporate`.
11. Balance assertion: hand a corrupted aggregate to `assertBalanced` and expect a throw naming the node.

summary.test.ts: one test per rule above, including `investedRate` null when nothing came in, and cash equivalents excluded from `invested`. period.test.ts: `inPeriod` bounds, `yearPeriod(2025)` is `2025-01..2025-12`, `missingAccounts` names a late account and ignores a closed one.

- [ ] **Step 2: Implement until green**

Run: `bun test src/analytics/flows`

- [ ] **Step 3: Goldens**

Extend `Goldens` with:

```ts
flows: {
  rowCount: number;
  pairCount: number;
  laggedPairs: number;
  unpairedLegs: number;
  headline: Record<"2025" | "2026" | "all", {
    paidIn: number;
    paidInBySource: Record<SourceCategory, number>;
    invested: number;
    leftInCash: number;
    income: number;
    costs: number;
    left: number;
    investedRate: number | null;
    totalIn: number;
  }>;
};
```

computed in `tools/goldens.ts` by calling `buildFlows(DATASTORE)`, then `flowSummary` and `buildFlowGraph` over every account for `yearPeriod(2025)`, `yearPeriod(2026)` and `allTime`. Run `bun run goldens` and read the diff: expect `paidInBySource.payroll` near 24,742 for 2025 and 46,465 for 2026, business 55,000 for 2026, and all time paid in near 253,610 (the spec's scratch figures; differences get explained in the worklog, not tuned away).

- [ ] **Step 4: Corpus tests, graph.corpus.test.ts**

```ts
test("every month, every year and all time balances on the corpus", () => {
  const data = loadFlows();
  const all = new Set(data.accounts.map((a) => a.accountId));
  const months = [...new Set(data.blocks.map((b) => b.period))];
  const periods = [
    ...months.map((m) => ({ from: m, to: m })),
    ...[2023, 2024, 2025, 2026].map(yearPeriod),
    allTime(data),
  ];
  for (const p of periods) for (const g of GROUP_BYS) expect(() => buildFlowGraph(data, p, g, all)).not.toThrow();
});

test("the headline flows match the goldens", () => {
  const data = loadFlows();
  const all = new Set(data.accounts.map((a) => a.accountId));
  const s = flowSummary(data, yearPeriod(2026), all);
  expect(s.paidIn).toBeCloseTo(GOLDENS.flows.headline["2026"].paidIn, 2);
  expect(s.paidInBySource.payroll).toBeCloseTo(GOLDENS.flows.headline["2026"].paidInBySource.payroll, 2);
});

test("chequing inflows count once: 2b74 2026-05 payroll in equals the statement's own deposits", () => {
  // The BROKERAGE paidIn.deposits for 2b74 2026-05 is the independent figure, read from the datastore.
});
```

Write the last test's body: read the 2b74 BROKERAGE statement for 2026-05 from the datastore, take `cash[CAD].paidIn.deposits`, and compare with the sum of that account and month's positive movement rows. This is the independent check that the duplicate CASH statement was dropped.

- [ ] **Step 5: Gates, commit, mutation proofs**

`bun run check && bun run build:ui`

```bash
git add app/src data/goldens.json
git commit -m "feat(investments): flow graph, summary and goldens for 2025, 2026 and all time"
```

Mutations, each reddening at least one test, each restored and verified with `git diff --quiet`: rule 3 emitting from both legs (double counts chequing transfers); dropping the `× rate` on USD cash change; treating a paired credit as outside money; skipping `flipNegative`; counting cash equivalents in `invested`.

---

## Ticket D (TCK-0012): the Sankey chart

### Task 6: Layout

**Files:**
- Create: `app/src/ui/charts/sankeyLayout.ts`
- Test: `app/src/ui/charts/sankeyLayout.test.ts`

**Interfaces:**
- Consumes: `FlowGraph`, `FlowNode`, `FlowLink`, `Column` (Task 5).
- Produces:

```ts
export interface SankeyBox { width: number; height: number; nodeWidth: number; nodeGap: number; labelLeft: number; labelRight: number }
export interface PlacedNode extends FlowNode { x0: number; x1: number; y0: number; y1: number; labelY: number }
export interface PlacedLink extends FlowLink { key: string; path: string; width: number }
export interface SankeyLayout { nodes: PlacedNode[]; links: PlacedLink[]; height: number }
export function layoutSankey(graph: FlowGraph, box: SankeyBox): SankeyLayout;
export function sankeyHeight(graph: FlowGraph): number; // max(420, 44 × largest column's node count)
export const linkKey = (l: { source: string; target: string }) => `${l.source}->${l.target}`;
```

Rules: columns evenly spaced between `labelLeft` and `width − labelRight`; one scale for every column, `k = min over columns of (height − nodeGap × (n − 1)) / Σ node values`; nodes stacked top down in the graph's order, height `max(2, value × k)`; outgoing links of a node sorted by their target's `y0`, incoming by their source's `y0`, each taking `value × k` of the node's edge; path `M x1,sy C mx,sy mx,ty x0,ty` drawn as a stroke of `width`. Labels: `labelY` starts at the node's centre, then a downward pass pushes each label to at least 28 units below the previous one in the column, and an upward pass pulls the column back inside `height`, so no two labels overlap.

- [ ] **Step 1: Failing tests**: two nodes and one link place the link's width at `value × k`; a node's outgoing widths sum to its height; three columns share one `k`; labels in a column of twelve tiny nodes are all at least 28 apart and inside the box; a link spanning column 0 to 2 starts at column 0's `x1` and ends at column 2's `x0`; an empty graph yields no nodes and no throw.
- [ ] **Step 2: Implement, pass, commit** (`feat(investments): sankey layout`). Mutation: drop the upward label pass, see the in box test fail.

### Task 7: The Sankey component

**Files:**
- Create: `app/src/ui/charts/Sankey.tsx`
- Test: `app/src/ui/charts/Sankey.test.tsx`

**Interfaces:**
- Consumes: `layoutSankey`, `linkKey`, `formatCurrency`, `formatShare`, `ChartTooltip` / `tooltipAnnouncement` / `readoutSuffix` from `Tooltip.tsx` (read `CashflowChart.tsx` for how a chart uses them).
- Produces: `export function Sankey(props: { graph: FlowGraph; selected: string | null; onSelect: (key: string | null) => void }): JSX.Element`

Rendering: an `<svg viewBox="0 0 1152 H" role="group" aria-label="Money flow" aria-describedby=<summary id>>`. Nodes as rects in `var(--gray-a8)`; each node's label `<text>` in `var(--gray-12)` reads `<label> · <formatCurrency(value)> · <formatShare(value / totalIn)>`, built by one helper `nodeText(node, totalIn)` used for the text and nothing else, since nodes are not focusable. Links as `<path data-flow-link=<key>>` strokes: recycled links `var(--gray-a5)`, links into `now:costs`, `now:left` and `now:unreconciled` `var(--red-a6)`, others `var(--jade-a6)`; hovered or selected link at the `a9` step with the other links dimmed to 0.35 opacity. Each link has `tabIndex={0}`, `role="button"`, `aria-pressed={selected === key}` and `aria-label` from one helper `linkText(link, labels, totalIn)` returning `Payroll deposited to Chequing, $3,101.50, 12.3% of money in`; that same string feeds the hover readout through `ChartTooltip`. Enter and Space pin (`onSelect(key)`), Escape clears. The accessible summary is a visually hidden `<p id>` listing the five largest links' `linkText`, joined with "; ".

- [ ] **Step 1: Failing tests**: the label of every node renders from `formatCurrency` and `formatShare` (assert the exact strings for a fixture); the link's `aria-label` equals the tooltip text on hover (`expectNoCoarseForm` over both); Enter on a focused link calls `onSelect` with its key; Escape calls `onSelect(null)`; the summary lists five flows largest first; a cost link carries the red stroke variable; no `act` warnings.
- [ ] **Step 2: Implement, pass, commit** (`feat(investments): sankey chart`). Mutations: format the aria label with `formatWholeDollars`; see red. Restore.

---

## Ticket E (TCK-0013): the Flow tab

### Task 8: Period in the hash

**Files:**
- Modify: `app/src/ui/useHashTab.ts`, `app/src/ui/useHashTab.test.ts`

Add `"flow"` to `TabId` and to `TABS` after `"month"`. Add `flowPeriod: FlowPeriod | "all"` to `HashState`, decoded only when the tab is `flow`: `YYYY` → the year, `YYYY-MM` → that month, `YYYY-MM..YYYY-MM` → the range if `from <= to`, anything else → `"all"`. Encoding is the inverse: a whole calendar year encodes as `YYYY`, a single month as `YYYY-MM`. On `#flow/2025`, `scope` stays `"all"` so the global year filter is not implied. Tests: each shape round trips; `#flow/2026-09..2026-01` decodes to `"all"`; `#flow/2025-13` decodes to `"all"`; `#growth/2024` is unchanged.

Commit: `feat(investments): flow period in the hash`.

### Task 9: Flow tab

**Files:**
- Create: `app/src/ui/Flow.tsx`, `app/src/ui/FlowControls.tsx`, `app/src/ui/FlowTiles.tsx`, `app/src/ui/FlowTable.tsx`, `app/src/ui/FlowRows.tsx`, `app/src/ui/charts/DestinationChart.tsx`
- Modify: `app/src/ui/App.tsx` (render Flow for the `flow` tab; hide `YearFilter` on it), `app/src/ui/Tabs.tsx` if tab labels live there (label "Flow")
- Test: `Flow.test.tsx`, `FlowControls.test.tsx`, `FlowTiles.test.tsx`, `FlowTable.test.tsx`, `FlowRows.test.tsx`, `charts/DestinationChart.test.tsx`

**Interfaces:**
- Consumes: everything from Tasks 5 to 8, `AccountFilter`, `loadFlows`, `analytics.series` (for the filter's account list, which on this tab includes chequing and the spousal RRSP).
- Produces: `export function Flow(props: { flows: FlowsData; series: readonly AccountSeries[]; period: FlowPeriod | "all"; onPeriodChange: (p: FlowPeriod | "all") => void })`.

Layout, top to bottom at 72rem: controls row (period select with This month, Month, Year, Custom range, All time; the dependent month, year or from and to selects; group by select; `AccountFilter` whose default is every account); the missing accounts callout when `missingAccounts` is non empty ("No statement yet for 2026-09: TFSA (managed)"); tiles; the Sankey; beneath it the drill down for the selected band; the destination chart; the flows table; a note block. On `(max-width: 40rem)` (a `matchMedia` hook, default wide in tests) the Sankey is replaced by two ranked lists, Came from (column 0 nodes) and Where it is now (column 3 nodes), each row `label`, `formatCurrency(value)`, `formatShare(value / totalIn)` with a hidden `ShareBar`.

Tiles, each one `formatCurrency` call: Paid in from outside (with a line beneath listing contributions by account type), Invested, Left in cash, Income earned, Costs, and Invested rate from `formatShare(investedRate)` or "Not enough money in" when null. Tone: none of these is a gain or loss; they render neutral. Beneath the tiles one sentence: "Payroll deposited here is only the part that reached Wealthsimple. Total income and spending are not in these statements."

Drill down (`FlowRows`): for the selected link, its `rowIds` looked up in a `Map` built once per `flows`; columns date, account label, code, amount (`formatCurrency(amountCad)`), and for USD rows `US${formatCurrency(amount)} at {rate}` where the rate prints with its statement's four decimals via `rate.toFixed(4)` (a rate, not a money figure). Paired rows add the partner account's label. A link with no rows (cash change, unreconciled) shows "Change in cash balances over the period, from each statement's opening and closing cash."

Flows table: `graph.links` by value, columns From, To, Amount, Share of money in; clicking a row selects that link. `DestinationChart`: stacked bars from `depositsByDestination`, one Radix step 9 colour per series (jade, blue, amber, violet, cyan, crimson, grass, orange in that order), `role="img"` with a readout via `ChartTooltip` and `useChartCursor` exactly as `CashflowChart.tsx` does, so `bun run contrast` hovers it.

The note block lists, each only when non zero: n transfer legs not paired, n pairs matched a day or more apart, in kind transfers with no cash value, symbols counted as equities because the asset class table does not list them (`unlistedSymbols`), and "FX conversion spread is not stated in the statements; costs include only stated fees and withholding."

- [ ] **Step 1: Failing tests**, one per behaviour: each tile's text equals the golden figure through `formatCurrency` (2026, every account); choosing Year 2025 in the control updates the hash to `#flow/2025`; unticking chequing in the filter turns the payroll band off and adds Moved from another account; selecting a band lists its rows and none of them has a description; the narrow layout renders two lists and no `svg[role="group"]`; the missing callout names an account whose statement is absent at the period's end (fixture); `expectNoCoarseForm` over every tile, both paths (text and `aria-label`) mutated independently; `App.a11y.test.tsx` still passes with every soft badge `highContrast`.
- [ ] **Step 2: Implement until green**, each component under 100 line functions.
- [ ] **Step 3: Contrast**: `bun run contrast` sweeps the new tab from `TABS`. Add a step to `src/tools/contrast/run.ts` that, on the flow tab, scrolls the Sankey into view, hovers the largest `[data-flow-link]`, measures the readout, and fails the run if no `[data-flow-link]` was hovered. Run it: AA pass on all nine tabs.
- [ ] **Step 4: Gates, commit**

`bun run check && bun run build:ui && bun run contrast`

```bash
git add app/src
git commit -m "feat(investments): Flow tab with sankey, tiles, destinations and drill down"
```

- [ ] **Step 5: Mutation proofs**: make the tile read `summary.paidIn + summary.grants` and see the golden tile test go red; point the drill down at the link's source rows only and see the row test go red. Restore each with `git checkout`, confirm `git diff --quiet`.

---

## Ticket F (TCK-0014): design pass

### Task 10: Impeccable critique and polish of the Flow tab

**Files:** `app/src/ui/Flow*.tsx`, `app/src/ui/charts/Sankey.tsx`, `app/src/ui/charts/DestinationChart.tsx`, `app/src/ui/app.css`

- [ ] Run `/impeccable critique` against the running Flow tab (`bun run dev`, both themes, 72rem and 390px widths), then `/impeccable polish` on what it finds. Constraints: Radix Themes, jade accent, slate gray, no new font, no gradient, sentence case, figures only from the three formatters.
- [ ] Screenshot both themes at both widths into the ticket worklog folder (not committed if they show amounts the owner has not seen; they are local to the vault and masked by construction since labels are registry labels).
- [ ] Gates: `bun run check`, `bun run build:ui`, `bun run contrast`. Commit `style(investments): flow tab design pass`.

---

## After the tickets

Update `personal/investments/README.md` (nine tabs, the Flow tab paragraph, `flows.json` in the rebuild line), `personal/investments/CLAUDE.md` (a Flow section: chequing duplicates, the pairing rule, the payroll override, the balance identity, the no description rule), the day's log and `hot.md`; run `/obsidian-save`; email the owner the summary with the `notify` skill, with the headline flows for 2025, 2026 and all time read from `data/goldens.json`.
