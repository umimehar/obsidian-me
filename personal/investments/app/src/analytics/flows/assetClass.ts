export type AssetClass = "equity" | "fixedIncome" | "cashEquivalent" | "crypto" | "privateMarkets";

export const ASSET_CLASS_LABELS: Readonly<Record<AssetClass, string>> = {
  equity: "Equities",
  fixedIncome: "Fixed income",
  cashEquivalent: "Cash equivalents",
  crypto: "Crypto",
  privateMarkets: "Private markets",
};

/**
 * Owner reviewed (2026-09-29). A symbol not listed is equity, and the Flow
 * tab names it so a new holding surfaces rather than hides.
 *
 * Cash equivalents seed PSA (the corpus's own money market fund, held in
 * 2318 and d77c) plus the savings ETFs the owner may buy later. Private
 * markets is every symbol d6d9 (Private Market Fund) actually buys besides
 * PSA: WSE300P, WSE401 and WSE401P. Crypto is BTC and ETH, the only two
 * symbols e2d6 buys -- its BUY descriptions read "Purchase of ... BTC/ETH",
 * not the "SYMBOL - name" form the primary ticker regex parses, so
 * `classify.ts`'s fallback pattern reads the ticker straight out of that
 * wording and this table still does the classifying. Fixed income is every
 * ETF in the corpus
 * whose holding name contains "Bond" or "Aggregate": the six BMO bond ETFs
 * (ZAG, ZFL, ZCS, ZCB, ZHY, ZUAG.F).
 */
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
  WSE401P: "privateMarkets",
  WSE300P: "privateMarkets",
  ZAG: "fixedIncome",
  ZFL: "fixedIncome",
  ZCS: "fixedIncome",
  ZCB: "fixedIncome",
  ZHY: "fixedIncome",
  "ZUAG.F": "fixedIncome",
};

export function assetClassOf(symbol: string): AssetClass {
  if (!Object.hasOwn(CLASSES, symbol)) return "equity";
  return CLASSES[symbol] ?? "equity";
}

export function isListedSymbol(symbol: string): boolean {
  return Object.hasOwn(CLASSES, symbol);
}
