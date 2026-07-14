import { expect, test } from "bun:test";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SCHEMA_ACCOUNT, SCHEMA_CARD, detectSchema, discoverCsvs, parseCsv } from "./parse";

const ACCOUNT_CSV =
  '"date","transaction","description","amount","balance","currency"\n' +
  '"2026-06-03","BUY","L - Loblaw Cos. Ltd.: Bought 1.0000 shares at $61.49 per share","-61.49","932.23","CAD"\n' +
  '"2026-06-05","CONT","Contribution","500.0","1432.23","CAD"\n';

function tmpFile(name: string, content: string): string {
  const dir = mkdtempSync(join(tmpdir(), "inv-"));
  const path = join(dir, name);
  writeFileSync(path, content);
  return path;
}

test("detect schema", () => {
  expect(
    detectSchema(["date", "transaction", "description", "amount", "balance", "currency"]),
  ).toBe(SCHEMA_ACCOUNT);
  expect(
    detectSchema(["transaction_date", "post_date", "type", "details", "amount", "currency"]),
  ).toBe(SCHEMA_CARD);
  expect(() => detectSchema(["foo", "bar"])).toThrow("Unrecognized");
});

test("parse account csv", () => {
  const rows = parseCsv(tmpFile("Managed-2026-06-01-transactions-XX0TEST001CAD.csv", ACCOUNT_CSV));
  expect(rows).toHaveLength(2);
  expect(rows[0]?.schema).toBe(SCHEMA_ACCOUNT);
  expect(rows[0]?.fields.transaction).toBe("BUY");
});

test("parse handles multi-line quoted fields", () => {
  const content =
    '"date","transaction","description","amount","balance","currency"\n' +
    '"2026-06-02","DIV","Line one,\nline two with comma, still one field","1.0","2.0","CAD"\n';
  const rows = parseCsv(tmpFile("X-2026-06-01-transactions-XX0TEST900CAD.csv", content));
  expect(rows).toHaveLength(1);
  expect(rows[0]?.fields.description).toContain("line two with comma");
});

test("parse raises on field-count mismatch with filename", () => {
  const content =
    '"date","transaction","description","amount","balance","currency"\n"a","b","c","d"\n';
  expect(() => parseCsv(tmpFile("A-2026-06-01-transactions-XX0TEST700CAD.csv", content))).toThrow(
    /A-2026.*fields/,
  );
});

test("discover csvs sorted, no dotfiles", () => {
  const path = tmpFile("Managed-2026-06-01-transactions-XX0TEST001CAD.csv", ACCOUNT_CSV);
  const dir = join(path, "..");
  writeFileSync(join(dir, ".DS_Store"), "x");
  const found = discoverCsvs(dir);
  expect(found.every((p) => p.endsWith(".csv"))).toBe(true);
});
