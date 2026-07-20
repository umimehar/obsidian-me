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

export type GetJson = (url: string) => Promise<unknown | null>;

async function getJson(url: string): Promise<unknown | null> {
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(8000),
      headers: { "User-Agent": "Mozilla/5.0" },
    });
    if (!res.ok) return null;
    return JSON.parse(await res.text());
  } catch {
    return null;
  }
}

interface YahooChartResponse {
  chart?: {
    result?: Array<{
      meta?: {
        regularMarketPrice?: number;
        currency?: string;
      };
    }>;
  };
}

async function fetchChartQuote(symbol: string, fetchJson: GetJson): Promise<PriceQuote | null> {
  try {
    const base = "https://query1.finance.yahoo.com/v8/finance/chart";
    const url = `${base}/${encodeURIComponent(symbol)}?interval=1d&range=1d`;
    const json = (await fetchJson(url)) as YahooChartResponse | null;
    const meta = json?.chart?.result?.[0]?.meta;
    const price = meta?.regularMarketPrice;
    const currency = meta?.currency;
    if (typeof price !== "number" || price <= 0 || typeof currency !== "string") return null;
    return { symbol, price, currency };
  } catch {
    return null;
  }
}

export async function resolveEquity(
  symbol: string,
  fetchJson: GetJson,
): Promise<PriceQuote | null> {
  const candidates = [
    symbol,
    symbol.replace(".", "-"),
    `${symbol}.TO`,
    `${symbol}.NE`,
    `${symbol}.V`,
  ];
  for (const candidate of candidates) {
    const quote = await fetchChartQuote(candidate, fetchJson);
    if (quote) return { ...quote, symbol };
  }
  return null;
}

export async function resolveCrypto(
  symbol: string,
  fetchJson: GetJson,
): Promise<PriceQuote | null> {
  const candidates = [`${symbol}-CAD`, `${symbol}-USD`];
  for (const candidate of candidates) {
    const quote = await fetchChartQuote(candidate, fetchJson);
    if (quote) return { ...quote, symbol };
  }
  return null;
}

export const httpSources: PriceSources = {
  equity(symbol) {
    return resolveEquity(symbol, getJson);
  },
  crypto(symbol) {
    return resolveCrypto(symbol, getJson);
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
