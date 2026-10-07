/** Classifies an evidence file by its path under ~/Documents/Taxes. Pure, so the rules are testable. */

import type { DocCategory, DocScope } from "./types";

export interface Classification {
  readonly category: DocCategory;
  readonly scope: DocScope;
  readonly year: number | null;
  readonly month: string | null;
  readonly bundle: string | null;
}

const IGNORED_SEGMENTS = new Set([
  ".ruff_cache",
  ".impeccable",
  "__pycache__",
  ".claude",
  ".git",
  ".playwright-mcp",
]);
const IGNORED_NAME = /^(\.DS_Store|\.~lock\..*#|~\$.*)$/;

/** True for editor caches, lock files and OS metadata, which carry no tax information. */
export function isIgnored(relPath: string): boolean {
  const parts = relPath.split("/");
  const name = parts[parts.length - 1] ?? "";
  return IGNORED_NAME.test(name) || parts.some((p) => IGNORED_SEGMENTS.has(p));
}

const RULES: readonly (readonly [RegExp, DocCategory])[] = [
  [/^_claude_workspace\/|^CLAUDE\.md$/, "workspace"],
  [/\.zip$/i, "package"],
  [
    /card statements|credit card\/statements|credit card\/[a-z]+ \d{1,2}, \d{4}\.pdf$/i,
    "card-statement",
  ],
  [/bank statements|debit account\/statements/i, "bank-statement"],
  [/\/Personal\/accountant docs\//, "t1"],
  [/(^|[^a-z0-9])T2([^a-z0-9]|$)|T-183/i, "t2"],
  [/hst filing\/|prior hst return|hst\.pdf$/i, "hst-return"],
  [/payroll|\bPD7A\b|\bCPP\b/i, "payroll"],
  [/vehicle lease/i, "vehicle"],
  [/resolution/i, "resolution"],
  [
    /(^|[^a-z0-9])(T4A?|T5|T3|T5008|T1135)([^a-z0-9]|$)|RRSP|FHSA|TFSA|donation|foreign assets/i,
    "slip",
  ],
  [/accountant files|accountant docs|financials from previous accountant/i, "accountant"],
  [/invoices - chequing|debit account\/invoices/i, "invoice"],
  [/receipts|invoices by month|personal cc expenses|director-funded/i, "receipt"],
  [/\.(xlsx|xlsm|csv)$/i, "workbook"],
  [/report|analysis/i, "report"],
];

const MONTH_DIR = /\/(\d{2})-([A-Za-z]+)\//;

export function classify(relPath: string): Classification {
  const category = RULES.find(([re]) => re.test(relPath))?.[1] ?? "other";
  const yearMatch = /^(20\d\d)\//.exec(relPath);
  const year = yearMatch?.[1] ? Number(yearMatch[1]) : null;
  const scope: DocScope = /\/Personal\//.test(relPath)
    ? "personal"
    : /\/Corporate\/|^Business Transactions/.test(relPath)
      ? "corporate"
      : "both";
  const monthMatch = MONTH_DIR.exec(relPath);
  const month = year && monthMatch?.[1] ? `${year}-${monthMatch[1]}` : null;
  const bundle = /HST Filing 2025-26 - for Saira\//.test(relPath)
    ? "HST 2025-26 package for Saira"
    : null;
  return { category, scope, year, month, bundle };
}
