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
