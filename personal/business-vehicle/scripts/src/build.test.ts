import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "./build";
import { PAGES } from "./nav";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const written = await build();
const pages = Object.fromEntries(
  written.map((f) => [f, readFileSync(join(ROOT, "notes", f), "utf8")]),
);

const data = JSON.parse(readFileSync(join(ROOT, "data", "vehicle.json"), "utf8"));
const publicIdentifiers: string[] = [
  data.fleet[0].identity.vin,
  data.fleet[0].identity.stockNumber,
  data.parties.corporation.legalName,
  data.parties.dealer.legalName,
  data.parties.dealer.hst,
  data.parties.dealer.customerNumber,
  ...data.fleet[0].service.map((s: { invoiceNumber: string }) => s.invoiceNumber),
  ...data.fleet[0].protection.flatMap((p: Record<string, unknown>) =>
    [p.agreementNumber, p.documentNumber, p.vehicleMarkingNumber].filter(
      (x): x is string => typeof x === "string",
    ),
  ),
]
  .filter(Boolean)
  .flatMap((v: string) => v.match(/\d{7,}/g) ?? [])
  .sort((a: string, b: string) => b.length - a.length);

describe("build", () => {
  test("writes one file per declared page and nothing else", () => {
    expect(written.sort()).toEqual(PAGES.map((p) => p.file).sort());
  });
});

describe("every rendered page", () => {
  for (const page of PAGES) {
    const html = pages[page.file] ?? "";

    test(`${page.file} links every other page from its header`, () => {
      for (const other of PAGES) {
        expect(html).toContain(`href="${other.file}"`);
      }
      expect(html).toContain('aria-current="page"');
    });

    test(`${page.file} loads the shared stylesheet`, () => {
      expect(html).toContain('href="../../_assets/personal.css"');
    });

    test(`${page.file} is a complete document with a title`, () => {
      expect(html.startsWith("<!doctype html>")).toBe(true);
      expect(html).toContain("</html>");
      expect(html).toMatch(/<title>.+<\/title>/);
    });

    test(`${page.file} carries no placeholder or leaked object`, () => {
      expect(html).not.toContain("undefined");
      expect(html).not.toContain("[object Object]");
      expect(html).not.toContain("NaN");
      expect(html).not.toContain("TODO");
    });

    test(`${page.file} exposes no unmasked account or bank number`, () => {
      // Public identifiers legitimately run long: the VIN, the federal corporation number,
      // the dealer's own numbers, service invoice numbers, and protection agreement numbers. They are read from the data
      // file rather than hardcoded, so a new record cannot silently widen the allowance.
      // Anything else with seven or more consecutive digits is an account number that
      // escaped masking.
      // Strip allowlisted identifiers only where they stand as a whole number, so a longer
      // account number that merely CONTAINS an allowlisted run is still caught.
      let stripped = html.replace(/&#\d+;/g, "");
      for (const id of publicIdentifiers) {
        stripped = stripped.replace(new RegExp(`\\b${id}\\b`, "g"), "");
      }
      expect(stripped).not.toMatch(/\b\d{7,}\b/);
      // Card and account numbers are as often written in groups as in one run.
      expect(stripped).not.toMatch(/\b(?:\d{4}[ -]){3}\d{4}\b/);
      expect(stripped).not.toMatch(/\b\d{5}[ -]\d{3}[ -]\d{3}\b/);
    });

    test(`${page.file} right-aligns only columns that hold numbers`, () => {
      // A text cell carrying class="num" is tabular-figure right-aligned prose, which reads
      // as broken. Catch any cell whose content is plainly a sentence.
      const numericCells = [...html.matchAll(/<td class="num">([^<]*)<\/td>/g)].map(
        (m) => m[1] ?? "",
      );
      for (const cell of numericCells) {
        expect(cell.split(" ").length).toBeLessThan(12);
      }
    });
  }
});
