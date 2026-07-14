// CLI: build the masked datastore, analytics, and the Ledger page.
import { existsSync, mkdirSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { computeAnalytics } from "./analytics";
import { buildDatastore } from "./datastore";
import { loadRedactions } from "./mask";
import { discoverCsvs, parseCsv } from "./parse";
import { renderPages } from "./render";

const SCRIPTS_DIR = dirname(import.meta.dir);
const ENDEAVOR_ROOT = dirname(SCRIPTS_DIR);
const REDACTIONS_PATH = join(SCRIPTS_DIR, "redactions.json");
const DEFAULT_SOURCE = join(homedir(), "Downloads", "monthly-statements-2022-01-to-2026-07");

function reconcile(source: string, txnCount: number): [number, boolean] {
  let parsed = 0;
  for (const path of discoverCsvs(source)) parsed += parseCsv(path).length;
  return [parsed, parsed === txnCount];
}

export function main(sourceDir?: string): number {
  const source = sourceDir ?? DEFAULT_SOURCE;
  if (!existsSync(source) || !statSync(source).isDirectory()) {
    console.error(`Source directory not found: ${source}`);
    return 1;
  }
  if (!existsSync(REDACTIONS_PATH)) {
    console.error(
      "Missing redactions.json. Copy redactions.example.json to redactions.json " +
        "and fill in the real names to scrub.",
    );
    return 1;
  }
  const redactions = loadRedactions(REDACTIONS_PATH);
  const store = buildDatastore(source, redactions);
  const analytics = computeAnalytics(store);
  const dataDir = join(ENDEAVOR_ROOT, "data");
  const notesDir = join(ENDEAVOR_ROOT, "notes");
  mkdirSync(dataDir, { recursive: true });
  mkdirSync(notesDir, { recursive: true });
  writeFileSync(join(dataDir, "datastore.json"), JSON.stringify(store, null, 2));
  writeFileSync(join(dataDir, "analytics.json"), JSON.stringify(analytics, null, 2));
  for (const [name, html] of Object.entries(renderPages(store, analytics))) {
    writeFileSync(join(notesDir, name), html);
  }
  const [parsed, ok] = reconcile(source, store.meta.txn_count);
  console.log(
    `Built ${store.meta.txn_count} transactions across ${store.accounts.length} accounts ` +
      `from ${store.meta.file_count} files.`,
  );
  console.log(
    `Reconciliation: parsed ${parsed} rows, stored ${store.meta.txn_count} ` +
      `(${ok ? "OK" : "MISMATCH"}).`,
  );
  const warnings = store.meta.warnings.unmapped_types;
  if (Object.keys(warnings).length > 0) {
    console.error(`Warning: unmapped transaction codes: ${JSON.stringify(warnings)}`);
  }
  return ok ? 0 : 2;
}

if (import.meta.main) {
  process.exit(main());
}
