/** Reads the datastore from data/. Fails loudly naming the file, so a bad edit is easy to find. */

import { readdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type {
  Catalog,
  Decision,
  Entity,
  Filing,
  GlossaryTerm,
  Meta,
  OpenItem,
  TaxData,
  TimelineEvent,
  YearRecord,
} from "./types";

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
export const DATA_DIR = join(ROOT, "data");

export async function readJson<T>(name: string): Promise<T> {
  const path = join(DATA_DIR, name);
  try {
    return JSON.parse(await Bun.file(path).text()) as T;
  } catch (err) {
    throw new Error(`Could not read ${path}: ${(err as Error).message}`);
  }
}

async function readYears(): Promise<YearRecord[]> {
  const files = (await readdir(join(DATA_DIR, "years"))).filter((f) => /^\d{4}\.json$/.test(f));
  const years = await Promise.all(files.map((f) => readJson<YearRecord>(join("years", f))));
  return years.sort((a, b) => a.year - b.year);
}

export async function loadData(): Promise<TaxData> {
  const [meta, timeline, decisions, filings, years, openItems, entities, glossary, catalog] =
    await Promise.all([
      readJson<Meta>("meta.json"),
      readJson<TimelineEvent[]>("timeline.json"),
      readJson<Decision[]>("decisions.json"),
      readJson<Filing[]>("filings.json"),
      readYears(),
      readJson<OpenItem[]>("open-items.json"),
      readJson<Entity[]>("entities.json"),
      readJson<GlossaryTerm[]>("glossary.json"),
      readJson<Catalog>("documents.json"),
    ]);
  return { meta, timeline, decisions, filings, years, openItems, entities, glossary, catalog };
}
