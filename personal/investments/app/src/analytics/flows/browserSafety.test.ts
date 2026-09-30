import { describe, expect, test } from "bun:test";

/**
 * `graph.ts`, `summary.ts`, `period.ts` and `breakdown.ts` are imported by
 * the UI, which runs in the browser. They may import only `flows/types.ts`,
 * `flows/assetClass.ts`, each other, and type-only imports -- never
 * `classify.ts`, `build.ts` or `store/registry.ts` (which loads `mask.ts`,
 * which imports `node:crypto`). A source-text check catches a bad import
 * before it ever reaches `bun run build:ui`.
 */
const FORBIDDEN =
  /from\s+["'][^"']*\b(classify|registry|build|ingest)\b[^"']*["']|from\s+["']node:/;
const FILES = ["graph.ts", "summary.ts", "period.ts", "breakdown.ts"];

describe("browser-safe flow modules", () => {
  for (const file of FILES) {
    test(`${file} imports nothing that reaches node:crypto or the datastore build`, async () => {
      const source = await Bun.file(new URL(file, import.meta.url)).text();
      const badLines = source.split("\n").filter((raw) => {
        const line = raw.trimStart();
        // A type-only import never reaches the runtime bundle.
        if (!line.startsWith("import") || line.startsWith("import type")) return false;
        return FORBIDDEN.test(line);
      });
      expect(badLines).toEqual([]);
    });
  }
});
