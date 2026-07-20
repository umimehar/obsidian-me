---
title: Investments Page Redesign Implementation Plan
tags: [personal/investments, spike]
created: 2026-07-20
updated: 2026-07-20
status: active
type: spike
personal: investments
---

# Investments Page Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the investments Ledger page as a three-pillar dashboard (Contributions & Room, Growth, Tax this year) driven by a smart filter, with live market prices, a real calendar range picker, and a real charting library with working tooltips.

**Architecture:** Extend the existing bun pipeline (`parse → classify → mask → datastore → analytics → render`) with a `prices` fetch stage and `growth`/`tax` analytics blocks, then rebuild the client as a bundled TypeScript app that inlines Chart.js and flatpickr into the single self-contained `notes/index.html`.

**Tech Stack:** Bun, TypeScript (strict), Biome, `bun test`, Chart.js, flatpickr. No CDN — everything vendored and bundled offline.

## Global Constraints

- Work from `personal/investments/scripts/` for all `bun` commands.
- TypeScript strict; zero `tsc` errors; zero Biome warnings; `bun run check` must pass (`biome check src && tsc --noEmit && bun test`).
- Line length 100; named exports only; no `any`; no non-null assertions.
- Never store or print real account numbers; accounts stay `kind` + `name` + `short_id`.
- The page must remain a single self-contained offline HTML file. No CDN references.
- Market value is a **current snapshot** labeled "as of <date>". No historical price reconstruction.
- Tax figures are a **rough estimate, not for filing** — the disclaimer must render on the page.
- Prices never hard-fail the build: on network/unknown-symbol failure, fall back to cost basis and reuse the `data/prices.json` cache.

---

## File Structure

- Create `scripts/src/prices.ts` — price/FX fetch stage + disk cache + cost fallback.
- Create `scripts/src/prices.test.ts` — mocked-fetch unit tests.
- Modify `scripts/src/analytics.ts` — add `growth` and `tax` blocks to `Ledger`; include USD accounts.
- Modify `scripts/src/analytics.test.ts` — cover growth/tax math.
- Modify `scripts/src/build.ts` — run `prices` stage, pass prices into analytics, write `data/prices.json`.
- Create `scripts/src/client/main.ts` — client entry (state, filter, sections). Imports Chart.js + flatpickr.
- Create `scripts/src/client/filter.ts` — scope-summary + popover + flatpickr range + grouped account picker.
- Create `scripts/src/client/charts.ts` — Chart.js chart builders.
- Create `scripts/src/client/sections.ts` — the four section renderers.
- Modify `scripts/src/render.ts` — bundle the client with `Bun.build`, inline lib CSS, emit the three-pillar shell.
- Modify `scripts/src/render.test.ts` — assert new shell markers, drop old ones.
- Delete `scripts/src/ledger.js` — replaced by `client/`.
- Delete `notes/{contributions,growth,cash-flow,holdings,income}.html` — dead orphans.
- Modify `README.md` — document the prices stage and the new libraries.

Types that cross task boundaries (defined in Task 2/3, consumed later):

```ts
// analytics.ts — appended to interface Ledger
export interface GrowthRow {
  account_id: string;
  cost: number;          // CAD adjusted cost base of held positions
  market: number;        // CAD market value (qty*price*fx); === cost when unpriced
  gain: number;          // market - cost
  gainPct: number;       // gain / cost, 0 when cost === 0
}
export interface Growth {
  as_of: string | null;  // prices.asOf; null when no prices at all
  coverage: number;      // priced cost / total cost, 0..1
  accounts: GrowthRow[];
  total: { cost: number; market: number; gain: number; gainPct: number };
}
export interface TaxYear {
  year: string;
  room: Array<{ group: string; used: number; limit: number; remaining: number; over: boolean }>;
  rrsp_deduction_available: number;
  income: { interest: number; eligible_dividends: number; foreign_income: number };
  realized_gains: number;         // taxable accounts, current year
}
export interface Tax {
  current_year: string;
  years: TaxYear[];
}
// Ledger gains: growth: Growth; tax: Tax;
```

```ts
// prices.ts
export interface PriceQuote { symbol: string; price: number; currency: string; }
export interface PriceSnapshot {
  as_of: string;                       // ISO timestamp of fetch
  fx_usd_cad: number;                  // USD -> CAD multiplier
  quotes: Record<string, PriceQuote>;  // keyed by symbol
}
export interface PriceSources {
  equity(symbol: string): Promise<PriceQuote | null>;
  crypto(symbol: string): Promise<PriceQuote | null>;
  fxUsdCad(): Promise<number | null>;
}
export function loadCachedPrices(path: string): PriceSnapshot | null;
export function fetchPrices(
  symbols: Array<{ symbol: string; kind: string }>,
  sources: PriceSources,
  cache: PriceSnapshot | null,
): Promise<PriceSnapshot>;
```

---

## Task 1: Price fetch stage (`prices.ts`)

**Files:**
- Create: `scripts/src/prices.ts`
- Test: `scripts/src/prices.test.ts`

**Interfaces:**
- Produces: `PriceQuote`, `PriceSnapshot`, `PriceSources`, `loadCachedPrices(path)`, `fetchPrices(symbols, sources, cache)` (signatures above).
- Consumes: nothing.

- [ ] **Step 1: Write the failing test**

```ts
// scripts/src/prices.test.ts
import { describe, expect, it } from "bun:test";
import { fetchPrices, type PriceSources } from "./prices";

function sources(over: Partial<PriceSources> = {}): PriceSources {
  return {
    equity: async (s) => ({ symbol: s, price: 100, currency: "USD" }),
    crypto: async (s) => ({ symbol: s, price: 50000, currency: "CAD" }),
    fxUsdCad: async () => 1.4,
    ...over,
  };
}

describe("fetchPrices", () => {
  it("fetches equity and crypto quotes and the fx rate", async () => {
    const snap = await fetchPrices(
      [{ symbol: "AAPL", kind: "NonRegistered" }, { symbol: "BTC", kind: "Crypto" }],
      sources(),
      null,
    );
    expect(snap.fx_usd_cad).toBe(1.4);
    expect(snap.quotes.AAPL?.price).toBe(100);
    expect(snap.quotes.BTC?.price).toBe(50000);
  });

  it("falls back to cache for a symbol whose fetch returns null", async () => {
    const cache = {
      as_of: "2026-07-01T00:00:00Z",
      fx_usd_cad: 1.35,
      quotes: { AAPL: { symbol: "AAPL", price: 90, currency: "USD" } },
    };
    const snap = await fetchPrices(
      [{ symbol: "AAPL", kind: "NonRegistered" }],
      sources({ equity: async () => null }),
      cache,
    );
    expect(snap.quotes.AAPL?.price).toBe(90);
  });

  it("falls back to cache fx when the fx fetch fails", async () => {
    const cache = { as_of: "x", fx_usd_cad: 1.31, quotes: {} };
    const snap = await fetchPrices([], sources({ fxUsdCad: async () => null }), cache);
    expect(snap.fx_usd_cad).toBe(1.31);
  });

  it("defaults fx to 1 when there is neither a fetch nor a cache", async () => {
    const snap = await fetchPrices([], sources({ fxUsdCad: async () => null }), null);
    expect(snap.fx_usd_cad).toBe(1);
  });

  it("deduplicates symbols so each is fetched once", async () => {
    let calls = 0;
    await fetchPrices(
      [{ symbol: "AAPL", kind: "NonRegistered" }, { symbol: "AAPL", kind: "TFSA" }],
      sources({ equity: async (s) => { calls += 1; return { symbol: s, price: 1, currency: "USD" }; } }),
      null,
    );
    expect(calls).toBe(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd scripts && bun test src/prices.test.ts`
Expected: FAIL — cannot find module `./prices`.

- [ ] **Step 3: Write minimal implementation**

```ts
// scripts/src/prices.ts
// Fetch current market prices for held symbols + a USD->CAD rate. Never hard-fails:
// unknown symbols and network errors fall back to the disk cache, then to cost.
import { existsSync, readFileSync } from "node:fs";

export interface PriceQuote {
  symbol: string;
  price: number;
  currency: string;
}
export interface PriceSnapshot {
  as_of: string;
  fx_usd_cad: number;
  quotes: Record<string, PriceQuote>;
}
export interface PriceSources {
  equity(symbol: string): Promise<PriceQuote | null>;
  crypto(symbol: string): Promise<PriceQuote | null>;
  fxUsdCad(): Promise<number | null>;
}

export function loadCachedPrices(path: string): PriceSnapshot | null {
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf-8")) as PriceSnapshot;
  } catch {
    return null;
  }
}

const CRYPTO_KINDS = new Set(["Crypto"]);

export async function fetchPrices(
  symbols: Array<{ symbol: string; kind: string }>,
  sources: PriceSources,
  cache: PriceSnapshot | null,
): Promise<PriceSnapshot> {
  const seen = new Map<string, string>();
  for (const s of symbols) if (!seen.has(s.symbol)) seen.set(s.symbol, s.kind);

  const quotes: Record<string, PriceQuote> = {};
  for (const [symbol, kind] of seen) {
    const fetcher = CRYPTO_KINDS.has(kind) ? sources.crypto : sources.equity;
    let quote: PriceQuote | null = null;
    try {
      quote = await fetcher(symbol);
    } catch {
      quote = null;
    }
    quote ??= cache?.quotes[symbol] ?? null;
    if (quote) quotes[symbol] = quote;
  }

  let fx: number | null = null;
  try {
    fx = await sources.fxUsdCad();
  } catch {
    fx = null;
  }
  fx ??= cache?.fx_usd_cad ?? 1;

  return { as_of: new Date().toISOString(), fx_usd_cad: fx, quotes };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd scripts && bun test src/prices.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Add the real HTTP sources (no key) and cache writer, plus a smoke test**

Append to `scripts/src/prices.ts`:

```ts
async function getText(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

// Stooq CSV: "Symbol,Date,Time,Open,High,Low,Close,Volume"; Close is field 6.
export const httpSources: PriceSources = {
  async equity(symbol) {
    const text = await getText(`https://stooq.com/q/l/?s=${symbol.toLowerCase()}.us&f=sd2t2ohlcv&e=csv`);
    if (!text) return null;
    const line = text.trim().split("\n")[1] ?? text.trim().split("\n")[0];
    const close = Number.parseFloat((line ?? "").split(",")[6] ?? "");
    return Number.isFinite(close) && close > 0 ? { symbol, price: close, currency: "USD" } : null;
  },
  async crypto(symbol) {
    const text = await getText(
      `https://stooq.com/q/l/?s=${symbol.toLowerCase()}.v&f=sd2t2ohlcv&e=csv`,
    );
    if (!text) return null;
    const close = Number.parseFloat((text.trim().split("\n")[1] ?? "").split(",")[6] ?? "");
    return Number.isFinite(close) && close > 0 ? { symbol, price: close, currency: "USD" } : null;
  },
  async fxUsdCad() {
    const text = await getText("https://api.frankfurter.app/latest?from=USD&to=CAD");
    if (!text) return null;
    try {
      const rate = (JSON.parse(text) as { rates?: { CAD?: number } }).rates?.CAD;
      return typeof rate === "number" && rate > 0 ? rate : null;
    } catch {
      return null;
    }
  },
};
```

Add to `scripts/src/prices.test.ts`:

```ts
import { httpSources } from "./prices";
describe("httpSources", () => {
  it("exposes equity, crypto, and fx fetchers", () => {
    expect(typeof httpSources.equity).toBe("function");
    expect(typeof httpSources.crypto).toBe("function");
    expect(typeof httpSources.fxUsdCad).toBe("function");
  });
});
```

- [ ] **Step 6: Run tests + typecheck**

Run: `cd scripts && bun test src/prices.test.ts && bunx tsc --noEmit`
Expected: PASS; no type errors.

- [ ] **Step 7: Commit**

```bash
git add scripts/src/prices.ts scripts/src/prices.test.ts
git commit -m "feat(investments): add price/fx fetch stage with cache fallback"
```

---

## Task 2: Growth analytics block

**Files:**
- Modify: `scripts/src/analytics.ts`
- Test: `scripts/src/analytics.test.ts`

**Interfaces:**
- Consumes: `PriceSnapshot` from Task 1; existing `holdingsAcb`, `Ledger.holdings`.
- Produces: `Growth`, `GrowthRow`, and `buildGrowth(holdings, accounts, prices): Growth` (exported).

- [ ] **Step 1: Write the failing test**

```ts
// add to scripts/src/analytics.test.ts
import { buildGrowth } from "./analytics";

describe("buildGrowth", () => {
  const accounts = [
    { id: "a1", kind: "TFSA", name: "TFSA", short_id: "aaaa", currency: "CAD" },
    { id: "a2", kind: "NonRegistered", name: "US", short_id: "bbbb", currency: "USD" },
  ];
  const holdings = [
    { account_id: "a1", symbol: "XEQT", qty: 10, acb: 300 },
    { account_id: "a2", symbol: "AAPL", qty: 2, acb: 200 },
  ];
  const prices = {
    as_of: "2026-07-20T00:00:00Z",
    fx_usd_cad: 1.4,
    quotes: {
      XEQT: { symbol: "XEQT", price: 35, currency: "CAD" },
      AAPL: { symbol: "AAPL", price: 150, currency: "USD" },
    },
  };

  it("computes CAD market value converting USD via fx", () => {
    const g = buildGrowth(holdings, accounts, prices);
    // XEQT: 10*35 = 350 (CAD). AAPL: 2*150*1.4 = 420 (CAD).
    expect(g.total.market).toBe(770);
    expect(g.total.cost).toBe(500);
    expect(g.total.gain).toBe(270);
  });

  it("falls back to cost when a symbol is unpriced and lowers coverage", () => {
    const g = buildGrowth(holdings, { ...prices, quotes: { XEQT: prices.quotes.XEQT } }, undefined as never);
    // fallback path below uses accounts arg; call with correct order instead:
    const g2 = buildGrowth(holdings, accounts, { ...prices, quotes: { XEQT: prices.quotes.XEQT } });
    expect(g2.total.market).toBe(350 + 200); // AAPL falls back to its 200 cost
    expect(g2.coverage).toBeCloseTo(300 / 500, 5);
  });

  it("reports gainPct of 0 when cost is 0", () => {
    const g = buildGrowth([{ account_id: "a1", symbol: "X", qty: 1, acb: 0 }], accounts, {
      as_of: "x", fx_usd_cad: 1, quotes: { X: { symbol: "X", price: 5, currency: "CAD" } },
    });
    expect(g.total.gainPct).toBe(0);
  });
});
```

Delete the stray first `buildGrowth(...)` call in the second test before running (it is illustrative only — keep `g2`).

- [ ] **Step 2: Run test to verify it fails**

Run: `cd scripts && bun test src/analytics.test.ts`
Expected: FAIL — `buildGrowth` is not exported.

- [ ] **Step 3: Implement `buildGrowth`**

Add to `scripts/src/analytics.ts` (after `holdingsAcb`):

```ts
export interface GrowthRow {
  account_id: string;
  cost: number;
  market: number;
  gain: number;
  gainPct: number;
}
export interface Growth {
  as_of: string | null;
  coverage: number;
  accounts: GrowthRow[];
  total: { cost: number; market: number; gain: number; gainPct: number };
}

import type { PriceSnapshot } from "./prices";

export function buildGrowth(
  holdings: Ledger["holdings"],
  accounts: Ledger["accounts"],
  prices: PriceSnapshot,
): Growth {
  const currency = new Map(accounts.map((a) => [a.id, a.currency]));
  const byAcct = new Map<string, { cost: number; market: number }>();
  let pricedCost = 0;
  let totalCost = 0;
  for (const h of holdings) {
    const quote = prices.quotes[h.symbol];
    const acctCcy = currency.get(h.account_id) ?? "CAD";
    let market = h.acb; // fallback to cost
    if (quote) {
      const raw = h.qty * quote.price;
      const ccy = quote.currency || acctCcy;
      market = round2(ccy === "USD" ? raw * prices.fx_usd_cad : raw);
      pricedCost += h.acb;
    }
    totalCost += h.acb;
    const cur = byAcct.get(h.account_id) ?? { cost: 0, market: 0 };
    cur.cost += h.acb;
    cur.market += market;
    byAcct.set(h.account_id, cur);
  }
  const rows: GrowthRow[] = [...byAcct.entries()].map(([account_id, v]) => ({
    account_id,
    cost: round2(v.cost),
    market: round2(v.market),
    gain: round2(v.market - v.cost),
    gainPct: v.cost > 0 ? round2((v.market - v.cost) / v.cost) : 0,
  }));
  const cost = round2(rows.reduce((s, r) => s + r.cost, 0));
  const market = round2(rows.reduce((s, r) => s + r.market, 0));
  return {
    as_of: holdings.length ? prices.as_of : null,
    coverage: totalCost > 0 ? pricedCost / totalCost : 0,
    accounts: rows,
    total: { cost, market, gain: round2(market - cost), gainPct: cost > 0 ? round2((market - cost) / cost) : 0 },
  };
}
```

Move the `import type { PriceSnapshot }` line to the top of the file with the other imports (Biome will flag a mid-file import).

- [ ] **Step 4: Run test to verify it passes**

Run: `cd scripts && bun test src/analytics.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add scripts/src/analytics.ts scripts/src/analytics.test.ts
git commit -m "feat(investments): compute market value and unrealized growth"
```

---

## Task 3: Tax analytics block

**Files:**
- Modify: `scripts/src/analytics.ts`
- Test: `scripts/src/analytics.test.ts`

**Interfaces:**
- Consumes: `store.transactions`, `CONTRIBUTION_LIMITS`, account kinds.
- Produces: `Tax`, `TaxYear`, `buildTax(store, currentYear): Tax` (exported). Income buckets: `interest` (INT + stock-lending), `eligible_dividends` (CAD DIV/STKDIV), `foreign_income` (USD DIV/STKDIV). `realized_gains` from SELL proceeds minus average ACB in taxable accounts.

- [ ] **Step 1: Write the failing test**

```ts
// add to scripts/src/analytics.test.ts
import { buildTax } from "./analytics";
import type { Datastore, Txn } from "./datastore";

function txn(p: Partial<Txn>): Txn {
  return {
    account_id: "t1", date: "2026-03-01", post_date: null, type: "DIV", raw_type: "",
    symbol: null, quantity: null, unit_price: null, fx_rate: null, amount: 0,
    balance: null, currency: "CAD", description_redacted: "", ...p,
  };
}
function store(txns: Txn[], kind = "NonRegistered"): Datastore {
  return {
    meta: { generated_at: "", schema_version: 1, file_count: 0, txn_count: txns.length,
      source_range: { start: null, end: null }, warnings: { unmapped_types: {} } },
    accounts: [{ masked_id: "t1", kind, name: kind, short_id: "t1t1", currency: "CAD",
      first_activity: "", last_activity: "", txn_count: txns.length }],
    transactions: txns,
  };
}

describe("buildTax", () => {
  it("buckets CAD dividends as eligible and USD dividends as foreign", () => {
    const t = buildTax(store([
      txn({ type: "DIV", amount: 100, currency: "CAD" }),
      txn({ type: "DIV", amount: 50, currency: "USD" }),
      txn({ type: "INT", amount: 20, currency: "CAD", description_redacted: "Interest earned" }),
    ]), "2026");
    const y = t.years.find((x) => x.year === "2026");
    expect(y?.income.eligible_dividends).toBe(100);
    expect(y?.income.foreign_income).toBe(50);
    expect(y?.income.interest).toBe(20);
  });

  it("computes realized gains from sells against average cost", () => {
    const t = buildTax(store([
      txn({ type: "BUY", symbol: "X", quantity: 10, amount: -100, date: "2026-01-01" }),
      txn({ type: "SELL", symbol: "X", quantity: 5, amount: 80, date: "2026-02-01" }),
    ]), "2026");
    // avg cost 10/share; sold 5 -> cost 50; proceeds 80 -> gain 30.
    expect(t.years.find((x) => x.year === "2026")?.realized_gains).toBe(30);
  });

  it("excludes registered accounts from taxable income and gains", () => {
    const t = buildTax(store([txn({ type: "DIV", amount: 100, currency: "CAD" })], "TFSA"), "2026");
    expect(t.years.find((x) => x.year === "2026")?.income.eligible_dividends).toBe(0);
  });

  it("flags over-contribution when room used exceeds the limit", () => {
    const t = buildTax(store([txn({ type: "CONTRIB", amount: 9000, date: "2026-05-01" })], "TFSA"), "2026");
    const room = t.years.find((x) => x.year === "2026")?.room.find((r) => r.group === "TFSA");
    expect(room?.over).toBe(true);
    expect(room?.remaining).toBe(7000 - 9000);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd scripts && bun test src/analytics.test.ts`
Expected: FAIL — `buildTax` not exported.

- [ ] **Step 3: Implement `buildTax`**

Add to `scripts/src/analytics.ts`:

```ts
export interface TaxYear {
  year: string;
  room: Array<{ group: string; used: number; limit: number; remaining: number; over: boolean }>;
  rrsp_deduction_available: number;
  income: { interest: number; eligible_dividends: number; foreign_income: number };
  realized_gains: number;
}
export interface Tax {
  current_year: string;
  years: TaxYear[];
}

const TAXABLE_KINDS = new Set(["NonRegistered", "DirectIndexing", "Crypto", "PE", "Other"]);
const REG_GROUP: Record<string, string> = {
  TFSA: "TFSA", ManagedTFSA: "TFSA", FHSA: "FHSA", RRSP: "RRSP", RESP: "RESP",
};

function realizedGainByYear(store: Datastore, taxable: Set<string>): Map<string, number> {
  const out = new Map<string, number>();
  const pos = new Map<string, Position>();
  const txns = store.transactions
    .filter((t) => t.symbol && t.quantity !== null && taxable.has(t.account_id))
    .sort((a, b) => a.date.localeCompare(b.date));
  for (const t of txns) {
    const key = `${t.account_id}|${t.symbol}`;
    let p = pos.get(key);
    if (!p) { p = { qty: 0, cost: 0 }; pos.set(key, p); }
    if (t.type === "BUY" || t.type === "STKDIV") {
      p.qty += t.quantity ?? 0;
      if (t.amount < 0) p.cost += -t.amount;
    } else if (t.type === "SELL" && p.qty > 0) {
      const q = Math.min(t.quantity ?? 0, p.qty);
      const costOut = (p.cost / p.qty) * q;
      const gain = t.amount - costOut; // proceeds are positive on a sell
      out.set(t.date.slice(0, 4), (out.get(t.date.slice(0, 4)) ?? 0) + gain);
      p.cost -= costOut;
      p.qty -= t.quantity ?? 0;
    }
  }
  return out;
}

export function buildTax(store: Datastore, currentYear: string): Tax {
  const kinds = kindsOf(store);
  const taxable = new Set(
    store.accounts.filter((a) => TAXABLE_KINDS.has(a.kind)).map((a) => a.masked_id),
  );
  const years = new Set<string>([currentYear]);
  for (const t of store.transactions) years.add(t.date.slice(0, 4));

  const gainsByYear = realizedGainByYear(store, taxable);

  const built: TaxYear[] = [...years].filter((y) => y).sort().map((year) => {
    const income = { interest: 0, eligible_dividends: 0, foreign_income: 0 };
    const roomUsed: Record<string, number> = { TFSA: 0, FHSA: 0, RRSP: 0, RESP: 0 };
    for (const t of store.transactions) {
      if (t.date.slice(0, 4) !== year) continue;
      const group = REG_GROUP[kinds.get(t.account_id) ?? ""];
      if (group && t.type === "CONTRIB") roomUsed[group] = (roomUsed[group] ?? 0) + t.amount;
      if (!taxable.has(t.account_id)) continue;
      if (t.type === "INT" && t.amount > 0) income.interest += t.amount;
      if ((t.type === "DIV" || t.type === "STKDIV") && t.amount > 0) {
        if (t.currency === "USD") income.foreign_income += t.amount;
        else income.eligible_dividends += t.amount;
      }
    }
    const room = (["TFSA", "FHSA", "RRSP", "RESP"] as const).map((group) => {
      const limit = CONTRIBUTION_LIMITS[group]?.[year] ?? 0;
      const used = round2(roomUsed[group] ?? 0);
      return { group, used, limit, remaining: round2(limit - used), over: used > limit && limit > 0 };
    });
    const rrsp = room.find((r) => r.group === "RRSP");
    return {
      year,
      room,
      rrsp_deduction_available: Math.max(rrsp?.remaining ?? 0, 0),
      income: {
        interest: round2(income.interest),
        eligible_dividends: round2(income.eligible_dividends),
        foreign_income: round2(income.foreign_income),
      },
      realized_gains: round2(gainsByYear.get(year) ?? 0),
    };
  });
  return { current_year: currentYear, years: built };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd scripts && bun test src/analytics.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add scripts/src/analytics.ts scripts/src/analytics.test.ts
git commit -m "feat(investments): compute contribution room, taxable income, realized gains"
```

---

## Task 4: Wire prices + growth + tax through the pipeline

**Files:**
- Modify: `scripts/src/analytics.ts` (extend `Ledger`, `buildLedger`, `computeAnalytics`)
- Modify: `scripts/src/build.ts`
- Test: `scripts/src/analytics.test.ts`

**Interfaces:**
- `computeAnalytics(store, prices)` gains a second arg. `Ledger` gains `growth: Growth` and `tax: Tax`. `buildLedger` includes USD accounts.

- [ ] **Step 1: Include USD accounts + non-CAD holdings in the ledger**

In `buildLedger`, change the flow loop guard so USD transactions still produce accounts and flows. Replace `if (txn.currency !== "CAD") continue;` with no skip, and make the cash/acb maps currency-aware is out of scope — instead keep CAD-only cash/acb but stop dropping the account. Minimal change: delete the `continue` and guard the acb/holdings currency filters that already exist. Verify the USD non-registered account (`short_id` `2c62`) now appears in `ledger.accounts`.

- [ ] **Step 2: Extend `computeAnalytics` and `Ledger`**

```ts
// analytics.ts
export interface Ledger {
  // ...existing fields...
  growth: Growth;
  tax: Tax;
}

export function computeAnalytics(store: Datastore, prices: PriceSnapshot): Analytics {
  const ledger = buildLedger(store);
  const currentYear = (store.meta.source_range.end ?? new Date().toISOString()).slice(0, 4);
  ledger.growth = buildGrowth(ledger.holdings, ledger.accounts, prices);
  ledger.tax = buildTax(store, currentYear);
  return { ledger };
}
```

- [ ] **Step 3: Update the analytics test call sites**

Any existing `computeAnalytics(store)` call in `analytics.test.ts` must pass an empty snapshot: `computeAnalytics(store, { as_of: "x", fx_usd_cad: 1, quotes: {} })`. Add an assertion that `ledger.growth` and `ledger.tax` are present.

- [ ] **Step 4: Run the analytics tests**

Run: `cd scripts && bun test src/analytics.test.ts`
Expected: PASS.

- [ ] **Step 5: Run the prices stage in `build.ts`**

In `build.ts`, after `const store = buildDatastore(...)`:

```ts
import { fetchPrices, httpSources, loadCachedPrices, type PriceSnapshot } from "./prices";
// ...
const pricesPath = join(ENDEAVOR_ROOT, "data", "prices.json");
const symbols = [...new Set(computeSymbols(store))]; // held symbols + kinds
const snapshot: PriceSnapshot = await fetchPrices(
  heldSymbols(store), httpSources, loadCachedPrices(pricesPath),
);
const analytics = computeAnalytics(store, snapshot);
```

Add a small `heldSymbols(store)` helper in `build.ts` that reuses `computeAnalytics`'s holdings, or import `buildLedger` to read `holdings`. Simplest: `const held = computeAnalytics(store, { as_of: "", fx_usd_cad: 1, quotes: {} }).ledger.holdings;` then map to `{ symbol, kind }` via account kinds, fetch, then recompute analytics with the real snapshot. Write `data/prices.json` with `writeFileSync(pricesPath, JSON.stringify(snapshot, null, 2))`. Make `main` `async` and `await` it; update `if (import.meta.main) process.exit(await main());`.

- [ ] **Step 6: Build end to end**

Run: `cd scripts && bun run build`
Expected: prints the transaction/reconciliation summary; `data/prices.json` written; no crash even if offline (falls back to cache/cost).

- [ ] **Step 7: Commit**

```bash
git add scripts/src/analytics.ts scripts/src/build.ts scripts/src/analytics.test.ts data/prices.json
git commit -m "feat(investments): wire prices, growth, and tax through the build"
```

---

## Task 5: Client bundling + libraries

**Files:**
- Modify: `scripts/package.json` (add deps)
- Create: `scripts/src/client/main.ts` (stub for now)
- Modify: `scripts/src/render.ts` (bundle with `Bun.build`, inline flatpickr CSS)
- Delete: `scripts/src/ledger.js`

**Interfaces:**
- `render.ts` produces a single inlined `<script>` from bundling `client/main.ts` and one inlined `<style>` for flatpickr.

- [ ] **Step 1: Add dependencies (look up current stable versions first)**

Run: `cd scripts && bun add chart.js flatpickr`
Expected: both added to `package.json` dependencies.

- [ ] **Step 2: Create a client stub**

```ts
// scripts/src/client/main.ts
const root = document.getElementById("ledger-data");
if (root) {
  // parsed below in later tasks
  void root;
}
```

- [ ] **Step 3: Replace the ledger.js read with a bundle step in `render.ts`**

Replace `const LEDGER_JS = readFileSync(...)` with an async bundler:

```ts
async function bundleClient(): Promise<string> {
  const built = await Bun.build({
    entrypoints: [new URL("./client/main.ts", import.meta.url).pathname],
    minify: true,
    target: "browser",
  });
  const out = built.outputs[0];
  if (!out) throw new Error("client bundle produced no output");
  return await out.text();
}
```

Make `renderPages`/`renderIndex` async, `await bundleClient()`, and inline the result in the existing `<script>${...}</script>` slot. Inline flatpickr CSS by reading `node_modules/flatpickr/dist/flatpickr.min.css` and emitting it inside a `<style>` in `<head>`. Update `build.ts` to `await renderPages(...)`.

- [ ] **Step 4: Delete the old client**

```bash
git rm scripts/src/ledger.js
```

- [ ] **Step 5: Build + verify the page still renders a shell**

Run: `cd scripts && bun run build && grep -c "flatpickr" ../notes/index.html`
Expected: build succeeds; grep count >= 1 (flatpickr CSS inlined). No CDN URLs: `grep -c "https://cdn" ../notes/index.html` returns 0.

- [ ] **Step 6: Commit**

```bash
git add scripts/package.json scripts/bun.lock scripts/src/client/main.ts scripts/src/render.ts
git commit -m "build(investments): bundle client with Chart.js and flatpickr, drop hand-rolled ledger.js"
```

---

## Task 6: Filter component (scope summary + popover + range picker)

**Files:**
- Create: `scripts/src/client/filter.ts`
- Modify: `scripts/src/client/main.ts`
- Modify: `scripts/src/render.ts` (emit the filter shell markup)

**Interfaces:**
- Produces: `createFilter(ledger, onChange): { resolveMonths(): number[]; selected(): string[]; scopeLabel(): string }`. Accounts grouped Registered / Taxable / Cash. Presets YTD/1Y/3Y/All; custom range via flatpickr (`mode: "range"`), min/max from `ledger.months`. The three input groups stay mutually exclusive.

- [ ] **Step 1: Emit the filter shell in `render.ts`**

A single header bar with a `<button id="scope-summary">` showing the active scope, and a hidden `<div id="scope-popover">` containing: grouped account checkboxes (built client-side from `ledger.accounts`), preset chips, and an `<input id="range-picker">` that flatpickr attaches to.

- [ ] **Step 2: Implement `filter.ts`**

Port `resolveMonths`/`selected`/`grainOf`/`pkey` from the old `ledger.js` (they are correct) into typed functions. Add: group accounts by `Registered` (`TFSA|ManagedTFSA|FHSA|RRSP|RESP`), `Taxable` (`NonRegistered|DirectIndexing|Crypto|PE|Other`), `Cash` (`Chequing|Savings|CreditCard`). Attach flatpickr to `#range-picker` with `mode: "range"`, `minDate: months[0] + "-01"`, `maxDate: last month end; onChange sets a custom month window and calls `onChange()`. Toggling a preset or account clears the custom range. `scopeLabel()` returns e.g. `"All accounts · Last 12 months"` or `"3 accounts · 2025-01 – 2026-06"`.

- [ ] **Step 3: Wire the popover open/close + summary in `main.ts`**

Clicking `#scope-summary` toggles `#scope-popover`; clicking outside closes it; on any change, update `#scope-summary` text via `scopeLabel()` and re-render sections (sections land in Task 8, so for now just log the resolved months/accounts).

- [ ] **Step 4: Build + browser check**

Run: `cd scripts && bun run build`
Then drive with Playwright: open `notes/index.html`, click `#scope-summary`, pick a range in the calendar, assert `#scope-summary` text updates. (Detailed browser steps in Task 10.)

- [ ] **Step 5: Commit**

```bash
git add scripts/src/client/filter.ts scripts/src/client/main.ts scripts/src/render.ts
git commit -m "feat(investments): progressive filter with grouped accounts and calendar range"
```

---

## Task 7: Charts with Chart.js

**Files:**
- Create: `scripts/src/client/charts.ts`
- Modify: `scripts/src/client/main.ts`

**Interfaces:**
- Produces: `contributionsChart(canvas, data)`, `growthBars(canvas, rows)`, `cashflowChart(canvas, data)`. Each creates a `Chart` with `options.plugins.tooltip` enabled and returns the instance so callers can `.destroy()` before re-render. Colors read from CSS variables via `getComputedStyle`.

- [ ] **Step 1: Implement chart builders**

Each section renders into a `<canvas>`. Use Chart.js `line` for contributions/capital trend (two datasets: capital-at-cost, contributions), `bar` for growth-by-account and cashflow (inflow/outflow). Set `responsive: true`, `maintainAspectRatio: false`, `interaction: { mode: "index", intersect: false }` so tooltips track the cursor. Format money in tooltip callbacks with the shared `money()` helper (move `money`/`compact`/`monLabel` into `client/format.ts`, imported by charts and sections).

- [ ] **Step 2: Re-render safely**

Store chart instances on a module map keyed by canvas id; on each filter change call `existing?.destroy()` before creating a new chart to avoid Chart.js "canvas already in use" errors.

- [ ] **Step 3: Build + browser check**

Run: `cd scripts && bun run build`
Playwright: hover the contributions chart, assert the Chart.js tooltip element (`.chartjs-tooltip` or `canvas` tooltip via `chart.tooltip`) shows and its value text is non-empty. (Task 10 has the exact assertion.)

- [ ] **Step 4: Commit**

```bash
git add scripts/src/client/charts.ts scripts/src/client/format.ts scripts/src/client/main.ts
git commit -m "feat(investments): render charts with Chart.js and working tooltips"
```

---

## Task 8: Three-pillar sections

**Files:**
- Create: `scripts/src/client/sections.ts`
- Modify: `scripts/src/render.ts` (section shells + canvases + tables + tax-rate input)
- Modify: `scripts/src/client/main.ts` (compose filter + charts + sections)

**Interfaces:**
- Produces: `renderSections(ledger, scope)` where `scope = { ris: number[]; accts: string[] }`. Sections: `Contributions & Room`, `Growth`, `Tax this year`, `Detail`.

- [ ] **Step 1: Contributions & Room section**

Headline cells: total contributed (sum `contrib` over range/accounts), this-year room used across registered groups. Room bars from `ledger.tax.years[current]` with over-contribution warning styling when `over`. Contributions-over-time line chart (Task 7).

- [ ] **Step 2: Growth section**

Market value vs cost, unrealized gain + %, labeled `"as of " + ledger.growth.as_of`. Growth-by-account bars. A coverage note when `ledger.growth.coverage < 1` ("N% of cost priced; the rest shown at cost"). Capital/contribution trend line chart.

- [ ] **Step 3: Tax section**

Cards: interest, eligible dividends, foreign income, realized gains (from `ledger.tax.years[current]`). An editable marginal-rate `<input type="number" id="tax-rate">` (default 0.48 Quebec top-ish) that recomputes an estimated tax added: `interest*rate + eligible_dividends*1.38*rate*0.85 (approx credit) + foreign_income*rate + realized_gains*0.5*rate - rrsp_deduction_available*rate`. Render a bold `estimate, not for filing` disclaimer. Recompute on input without a full page rebuild.

- [ ] **Step 4: Detail section (collapsible)**

Port the accounts table and holdings table from the old client into `sections.ts`, adding a market-value column to holdings from `ledger.growth`. Wrap in a `<details>` element.

- [ ] **Step 5: Compose in `main.ts`**

On load and on every filter change: compute `scope`, call `renderSections`, then (re)draw charts. Guard the empty-range case with a "No data in range" message.

- [ ] **Step 6: Build + browser smoke**

Run: `cd scripts && bun run build`
Open the page; confirm all four sections render and update when the filter changes.

- [ ] **Step 7: Commit**

```bash
git add scripts/src/client/sections.ts scripts/src/render.ts scripts/src/client/main.ts
git commit -m "feat(investments): three-pillar sections (contributions, growth, tax, detail)"
```

---

## Task 9: Remove orphan pages + refresh render tests + README

**Files:**
- Delete: `notes/{contributions,growth,cash-flow,holdings,income}.html`
- Modify: `scripts/src/render.test.ts`
- Modify: `README.md`

- [ ] **Step 1: Delete the orphan pages**

```bash
git rm notes/contributions.html notes/growth.html notes/cash-flow.html notes/holdings.html notes/income.html
```

- [ ] **Step 2: Update `render.test.ts`**

Replace assertions that reference removed markup (old `filterbar`, `waterfall`, `hero-cell`) with the new shell markers: presence of `#scope-summary`, `#range-picker`, the three section headings ("Contributions & Room", "Growth", "Tax this year"), the tax disclaimer text, and that no CDN URL appears. `renderPages` is now async — `await` it in the test.

- [ ] **Step 3: Run render tests**

Run: `cd scripts && bun test src/render.test.ts`
Expected: PASS.

- [ ] **Step 4: Update README**

Document: the new `prices` stage and `data/prices.json`; that the page bundles Chart.js + flatpickr offline; the three-pillar layout; the tax figures are an estimate. Remove any mention of the deleted pages.

- [ ] **Step 5: Commit**

```bash
git add notes README.md scripts/src/render.test.ts
git commit -m "chore(investments): remove orphan pages, refresh render tests and README"
```

---

## Task 10: Full verification

**Files:** none (verification only)

- [ ] **Step 1: Full check**

Run: `cd scripts && bun run check`
Expected: Biome clean, `tsc` clean, all tests pass.

- [ ] **Step 2: Rebuild the page**

Run: `cd scripts && bun run build`
Expected: success; `notes/index.html` regenerated; `data/prices.json` present.

- [ ] **Step 3: Drive the page in a browser (Playwright)**

- Navigate to `file://` `notes/index.html`.
- Assert the three section headings render.
- Click `#scope-summary`; assert `#scope-popover` becomes visible.
- Pick a start and end date in the flatpickr calendar; assert `#scope-summary` text changes and at least one chart redraws.
- Hover over the contributions chart; assert a Chart.js tooltip appears with non-empty value text and that it sits near the cursor x (tooltip caret x within ~30px of the mouse x). This is the regression check for the original bug.
- Change `#tax-rate`; assert the estimated-tax figure updates.
- Assert `grep -c "https://cdn" notes/index.html` is 0 (offline/self-contained).

- [ ] **Step 4: Sensitive-data guard**

Run: `git diff --cached` before the final commit and confirm no unmasked account numbers, names from `redactions.json`, or secrets appear in `data/prices.json` or the HTML.

- [ ] **Step 5: Final commit (if any verification fixes were needed)**

```bash
git add -A
git commit -m "test(investments): verify redesigned page end to end"
```

---

## Self-Review notes

- **Spec coverage:** prices stage (T1), growth incl. USD/FX + coverage (T2, T4), tax room + income split + realized gains + estimate (T3, T8), three-pillar page (T8), progressive filter + flatpickr (T6), Chart.js tooltips (T7), orphan cleanup (T9), offline bundling (T5), verification incl. tooltip regression (T10). All spec sections map to a task.
- **Estimate framing:** the marginal-rate math in T8-Step 3 is intentionally approximate; the disclaimer requirement is enforced in T8 and asserted in T9.
- **Async propagation:** `main()` (T4), `renderPages`/`renderIndex` (T5), and `render.test.ts` (T9) all move to async together — do not split them across separate commits or the build breaks mid-way.
