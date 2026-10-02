import rawDatastore from "@data/datastore.json";
import type { Datastore } from "./store/datastore";
import { buildSeries } from "./analytics/series";
import { classifyForeignProperty } from "./analytics/foreignProperty";

const datastore = rawDatastore as Datastore;
const series = buildSeries(datastore.statements, datastore.accounts);
const corp91b8 = series.find(a => a.label.includes("91b8") || a.label === "Corporate");
console.log("series kinds:", series.filter(a=>a.kind==="Corporate").map(a=>({id:a.maskedId,label:a.label})));

const corpIds = new Set(series.filter(a=>a.kind==="Corporate").map(a=>a.maskedId));

const brokerage = datastore.statements.filter(s => s.source.template === "BROKERAGE" && corpIds.has(s.source.accountNo) && s.source.period.startsWith("2026"));
const byAcctPeriod = new Map<string, typeof brokerage[0][]>();
for (const s of brokerage) {
  const key = s.source.accountNo;
  const arr = byAcctPeriod.get(key) ?? [];
  arr.push(s);
  byAcctPeriod.set(key, arr);
}
for (const [acct, stmts] of byAcctPeriod) {
  console.log("account", acct, "statement count", stmts.length);
  for (const s of stmts.sort((a,b)=>a.source.period.localeCompare(b.source.period))) {
    let usdCost = 0;
    const lines: string[] = [];
    for (const h of s.holdings) {
      if (h.bookCost === 0) continue;
      const cls = classifyForeignProperty(h);
      lines.push(`${h.symbol || h.name} price=${h.priceCurrency} marketPrice=${h.marketPrice} bookCost=${h.bookCost} bookCostConverted=${h.bookCostConverted} class=${cls}`);
      if (h.priceCurrency === "USD") usdCost += h.bookCost;
    }
    console.log(" period", s.source.period, "version", s.source.version, "fxRate", s.fxRate, "usdCostRaw", usdCost.toFixed(2));
    for (const l of lines) console.log("   ", l);
  }
}

import { foreignPropertySummary } from "./analytics/foreignProperty";
import { CORPORATE_KINDS } from "./analytics/accountScopes";
const summary = foreignPropertySummary(datastore.statements, series, 2026, CORPORATE_KINDS);
console.log("foreignPropertySummary corporate 2026:", summary);

import { dedupeToLatestVersion } from "./statementVersion";
const deduped = dedupeToLatestVersion(datastore.statements);
const corpDeduped = deduped.filter(s => s.source.template === "BROKERAGE" && corpIds.has(s.source.accountNo) && s.source.period.startsWith("2026"));
console.log("corpDeduped count:", corpDeduped.length);
for (const s of corpDeduped.sort((a,b)=>a.source.period.localeCompare(b.source.period))) {
  let foreign = 0;
  for (const h of s.holdings) {
    if (h.bookCost === 0) continue;
    if (classifyForeignProperty(h) === "foreign") {
      const cad = h.priceCurrency === "CAD" ? h.bookCost : h.bookCost * (s.fxRate ?? 1);
      foreign += cad;
    }
  }
  console.log(s.source.accountNo, s.source.period, "foreign(manual)=", foreign.toFixed(2));
}
