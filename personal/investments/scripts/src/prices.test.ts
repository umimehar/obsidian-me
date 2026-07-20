import { describe, expect, it } from "bun:test";
import {
  type PriceSources,
  fetchPrices,
  httpSources,
  resolveCrypto,
  resolveEquity,
} from "./prices";

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
      [
        { symbol: "AAPL", kind: "NonRegistered" },
        { symbol: "BTC", kind: "Crypto" },
      ],
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
      [
        { symbol: "AAPL", kind: "NonRegistered" },
        { symbol: "AAPL", kind: "TFSA" },
      ],
      sources({
        equity: async (s) => {
          calls += 1;
          return { symbol: s, price: 1, currency: "USD" };
        },
      }),
      null,
    );
    expect(calls).toBe(1);
  });
});

describe("httpSources", () => {
  it("exposes equity, crypto, and fx fetchers", () => {
    expect(typeof httpSources.equity).toBe("function");
    expect(typeof httpSources.crypto).toBe("function");
    expect(typeof httpSources.fxUsdCad).toBe("function");
  });
});

function symbolFromUrl(url: string): string {
  const match = /\/chart\/([^?]+)\?/.exec(url);
  return decodeURIComponent(match?.[1] ?? "");
}

function chartJson(price: number, currency: string): unknown {
  return { chart: { result: [{ meta: { regularMarketPrice: price, currency } }] } };
}

function fakeGetJson(hits: Record<string, { price: number; currency: string }>) {
  return async (url: string): Promise<unknown | null> => {
    const symbol = symbolFromUrl(url);
    const hit = hits[symbol];
    return hit ? chartJson(hit.price, hit.currency) : null;
  };
}

describe("resolveEquity", () => {
  it("returns the first candidate that yields a price", async () => {
    const getJson = fakeGetJson({ AAPL: { price: 210, currency: "USD" } });
    const quote = await resolveEquity("AAPL", getJson);
    expect(quote).toEqual({ symbol: "AAPL", price: 210, currency: "USD" });
  });

  it("falls through to .TO when bare and dash candidates miss", async () => {
    const getJson = fakeGetJson({ "XEQT.TO": { price: 33.5, currency: "CAD" } });
    const quote = await resolveEquity("XEQT", getJson);
    expect(quote).toEqual({ symbol: "XEQT", price: 33.5, currency: "CAD" });
  });

  it("returns null when every candidate misses", async () => {
    const getJson = fakeGetJson({});
    const quote = await resolveEquity("NOPE", getJson);
    expect(quote).toBeNull();
  });

  it("converts a class-share dot to a dash", async () => {
    const getJson = fakeGetJson({ "BRK-B": { price: 450, currency: "USD" } });
    const quote = await resolveEquity("BRK.B", getJson);
    expect(quote).toEqual({ symbol: "BRK.B", price: 450, currency: "USD" });
  });

  it("never throws when getJson throws", async () => {
    const getJson = async (): Promise<unknown | null> => {
      throw new Error("network down");
    };
    const quote = await resolveEquity("AAPL", getJson);
    expect(quote).toBeNull();
  });
});

describe("resolveCrypto", () => {
  it("tries -CAD then -USD and returns the first hit", async () => {
    const getJson = fakeGetJson({ "BTC-USD": { price: 60000, currency: "USD" } });
    const quote = await resolveCrypto("BTC", getJson);
    expect(quote).toEqual({ symbol: "BTC", price: 60000, currency: "USD" });
  });

  it("prefers -CAD when both resolve", async () => {
    const getJson = fakeGetJson({
      "ETH-CAD": { price: 4200, currency: "CAD" },
      "ETH-USD": { price: 3000, currency: "USD" },
    });
    const quote = await resolveCrypto("ETH", getJson);
    expect(quote).toEqual({ symbol: "ETH", price: 4200, currency: "CAD" });
  });

  it("returns null when getJson returns null for every candidate", async () => {
    const getJson = fakeGetJson({});
    const quote = await resolveCrypto("ZZZ", getJson);
    expect(quote).toBeNull();
  });
});
