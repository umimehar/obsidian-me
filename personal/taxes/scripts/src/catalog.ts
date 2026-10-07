/** Walks the evidence folder and writes data/documents.json: one record per file, hashed and classified. */

import { createHash } from "node:crypto";
import { readdir, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { join, relative } from "node:path";
import { classify, isIgnored } from "./classify";
import { DATA_DIR, readJson } from "./load";
import type { Catalog, DocRecord, Meta } from "./types";

/** YYYY-MM-DD in this machine's time zone, so a file saved at 9 pm keeps its own date. */
function localDate(d: Date): string {
  return d.toLocaleDateString("en-CA");
}

async function walk(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map((e) => {
      const full = join(dir, e.name);
      if (e.isDirectory()) return walk(full);
      return Promise.resolve(e.isFile() ? [full] : []);
    }),
  );
  return nested.flat();
}

async function sha256(path: string): Promise<string> {
  return createHash("sha256")
    .update(new Uint8Array(await Bun.file(path).arrayBuffer()))
    .digest("hex");
}

/** Marks every file whose bytes match an earlier path, so package copies read as copies. */
export function markDuplicates(records: readonly Omit<DocRecord, "duplicate_of">[]): DocRecord[] {
  const firstByHash = new Map<string, string>();
  const ordered = [...records].sort(
    (a, b) => Number(a.bundle !== null) - Number(b.bundle !== null) || a.path.localeCompare(b.path),
  );
  for (const r of ordered) if (!firstByHash.has(r.sha256)) firstByHash.set(r.sha256, r.path);
  return records.map((r) => {
    const first = firstByHash.get(r.sha256);
    return { ...r, duplicate_of: first && first !== r.path ? first : null };
  });
}

export async function buildCatalog(root: string): Promise<Catalog> {
  const all = (await walk(root)).map((p) => relative(root, p)).sort();
  const kept = all.filter((p) => !isIgnored(p));
  const records: Omit<DocRecord, "duplicate_of">[] = [];
  for (const path of kept) {
    const full = join(root, path);
    const info = await stat(full);
    records.push({
      path,
      bytes: info.size,
      modified: localDate(info.mtime),
      sha256: await sha256(full),
      ...classify(path),
    });
  }
  return {
    generated: localDate(new Date()),
    root,
    ignored: all.length - kept.length,
    files: markDuplicates(records),
  };
}

if (import.meta.main) {
  const meta = await readJson<Meta>("meta.json");
  const root = meta.evidence_root.replace(/^~/, homedir());
  const catalog = await buildCatalog(root);
  await Bun.write(join(DATA_DIR, "documents.json"), `${JSON.stringify(catalog, null, 1)}\n`);
  console.log(
    `catalogued ${catalog.files.length} files, ignored ${catalog.ignored} cache/lock files`,
  );
}
