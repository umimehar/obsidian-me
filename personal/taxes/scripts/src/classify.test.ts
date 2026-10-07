import { describe, expect, test } from "bun:test";
import { markDuplicates } from "./catalog";
import { classify, isIgnored } from "./classify";
import type { DocCategory } from "./types";

describe("classify", () => {
  test.each<[string, DocCategory]>([
    ["2024/Corporate/(20241231) T2.pdf", "t2"],
    ["2025/Personal/T4s/Lazer_2025_T4.pdf", "slip"],
    ["2025/Personal/T5s/T5_2025_interest_57.38.pdf", "slip"],
    ["2025/Personal/accountant docs/T-183 2025 - Umar Farooq Aslam.pdf", "t1"],
    ["2025/Corporate/accountant files/1. T-183 '25 - Sign & Return.pdf", "t2"],
    ["2026/Corporate/Credit Card/April 28, 2026.pdf", "card-statement"],
    ["2025/Corporate/Credit Card/Statements/Jan.pdf", "card-statement"],
    ["2025/Corporate/Debit Account/Statements/Jan.pdf", "bank-statement"],
    ["2025/Corporate/Credit Card/Invoices by Month/01-jan/uber.pdf", "receipt"],
    ["2025/Corporate/HST Filing/15248132 Canada Inc. HST.pdf", "hst-return"],
    ["2025/Corporate/[Pending]Director_Resolution_Dec31_2025.docx", "resolution"],
    ["2026/Corporate/Credit Card/receipts/04-April/mercedes-service.jpg", "receipt"],
    ["_claude_workspace/INDEX.md", "workspace"],
    ["Business Transactions.xlsx", "workbook"],
    ["2025/Corporate/notes.txt", "other"],
  ])("%s is %s", (path, category) => {
    expect(classify(path).category).toBe(category);
  });

  test("reads scope, year and month from the folder layout", () => {
    const c = classify("2026/Corporate/Credit Card/receipts/03-Mar/x.jpg");
    expect(c).toEqual({
      category: "receipt",
      scope: "corporate",
      year: 2026,
      month: "2026-03",
      bundle: null,
    });
    expect(classify("2025/Personal/Maham T4.pdf").scope).toBe("personal");
    expect(classify("CLAUDE.md").year).toBeNull();
  });

  test("tags files inside the Saira package", () => {
    const c = classify(
      "2026/Corporate/HST Filing 2025-26 - for Saira/04b Receipts - 2026/01-Jan/a.jpg",
    );
    expect(c.bundle).toBe("HST 2025-26 package for Saira");
  });
});

describe("isIgnored", () => {
  test.each([
    [".DS_Store", true],
    ["2025/Corporate/.~lock.2025_Income_Statement.xlsx#", true],
    ["_claude_workspace/2026/Corporate/.ruff_cache/0.16.8/123", true],
    ["2025/Corporate/Lazer - T4A.pdf", false],
  ])("%s → %s", (path, ignored) => {
    expect(isIgnored(path)).toBe(ignored);
  });
});

describe("markDuplicates", () => {
  const rec = (path: string, sha256: string, bundle: string | null) => ({
    path,
    bytes: 1,
    modified: "2026-01-01",
    sha256,
    category: "receipt" as const,
    scope: "corporate" as const,
    year: 2026,
    month: null,
    bundle,
  });

  test("the copy inside a package points at the original, never the reverse", () => {
    const out = markDuplicates([
      rec("z/package/a.pdf", "h1", "pkg"),
      rec("a/original.pdf", "h1", null),
    ]);
    expect(out[0]?.duplicate_of).toBe("a/original.pdf");
    expect(out[1]?.duplicate_of).toBeNull();
  });

  test("distinct files are never duplicates", () => {
    const out = markDuplicates([rec("a", "h1", null), rec("b", "h2", null)]);
    expect(out.every((r) => r.duplicate_of === null)).toBe(true);
  });
});
