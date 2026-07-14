import { expect, test } from "bun:test";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildDatastore } from "./datastore";
import type { Redactions } from "./mask";

const RED: Redactions = { names: ["Test Person Name"], accountLabelPeople: {} };

function sourceDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "invds-"));
  writeFileSync(
    join(dir, "Managed (TFSA)-2026-06-01-monthly-statement-transactions-XX0TEST001CAD.csv"),
    '"date","transaction","description","amount","balance","currency"\n' +
      '"2026-06-03","BUY","L - Loblaw: Bought 1.0000 shares at $61.49 per share","-61.49","932.23","CAD"\n' +
      '"2026-06-05","CONT","Contribution","500.0","1432.23","CAD"\n' +
      '"2026-06-05","E_TRFIN","Received from Test Person Name","660.0","2092.23","CAD"\n',
  );
  return dir;
}

test("build datastore shape and account metadata", () => {
  const store = buildDatastore(sourceDir(), RED);
  expect(store.meta.file_count).toBe(1);
  expect(store.meta.txn_count).toBe(store.transactions.length);
  const acct = store.accounts[0];
  expect(acct?.name).toBe("Managed (TFSA)");
  expect(acct?.kind).toBe("ManagedTFSA");
  expect(acct?.short_id).toHaveLength(4);
});

test("no real account code and names redacted", () => {
  const blob = JSON.stringify(buildDatastore(sourceDir(), RED));
  expect(blob).not.toContain("XX0TEST001CAD");
  expect(blob).not.toContain("Test Person Name");
});

test("identical rows are all kept (no dedup)", () => {
  const dir = mkdtempSync(join(tmpdir(), "inv-nodedup-"));
  writeFileSync(
    join(dir, "A-2026-06-01-transactions-XX0TEST700CAD.csv"),
    '"date","transaction","description","amount","balance","currency"\n' +
      '"2026-06-01","NRT","Non-resident tax","-0.01","2.0","CAD"\n'.repeat(1) +
      '"2026-06-01","NRT","Non-resident tax","-0.01","1.99","CAD"\n' +
      '"2026-06-01","NRT","Non-resident tax","-0.01","1.98","CAD"\n',
  );
  expect(buildDatastore(dir, RED).meta.txn_count).toBe(3);
});
