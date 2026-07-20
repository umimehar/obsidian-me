import { describe, expect, it } from "bun:test";
import { type PriceSources, fetchPrices, httpSources } from "./prices";

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
