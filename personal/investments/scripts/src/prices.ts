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
    const text = await getText(
      `https://stooq.com/q/l/?s=${symbol.toLowerCase()}.us&f=sd2t2ohlcv&e=csv`,
    );
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
