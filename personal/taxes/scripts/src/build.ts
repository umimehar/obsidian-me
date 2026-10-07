/** Renders every page in notes/ from data/. Year pages come from data/years/*.json, so a new year is a new file. */

import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { ROOT, loadData } from "./load";
import { documentsPage } from "./pages/documents";
import { filingsPage } from "./pages/filings";
import { glossaryPage } from "./pages/glossary";
import { indexPage } from "./pages/index";
import { peoplePage } from "./pages/people";
import { rulesPage } from "./pages/rules";
import { timelinePage } from "./pages/timeline";
import { todoPage } from "./pages/todo";
import { yearPage } from "./pages/year";
import { trackingMarkdown } from "./tracking";
import type { TaxData } from "./types";
import { validate } from "./validate";

export function renderAll(d: TaxData): Map<string, string> {
  const pages = new Map<string, string>([
    ["index.html", indexPage(d)],
    ["todo.html", todoPage(d)],
    ["timeline.html", timelinePage(d)],
    ["filings.html", filingsPage(d)],
    ["rules.html", rulesPage(d)],
    ["people.html", peoplePage(d)],
    ["documents.html", documentsPage(d)],
    ["glossary.html", glossaryPage(d)],
  ]);
  for (const y of d.years) pages.set(`year-${y.year}.html`, yearPage(d, y));
  return pages;
}

export async function build(): Promise<string[]> {
  const data = await loadData();
  const problems = validate(data);
  if (problems.length > 0) {
    throw new Error(`data/ has ${problems.length} problem(s):\n  ${problems.join("\n  ")}`);
  }
  const outDir = join(ROOT, "notes");
  await mkdir(outDir, { recursive: true });
  const pages = renderAll(data);
  for (const [file, html] of pages) await writeFile(join(outDir, file), html, "utf8");
  await writeFile(join(ROOT, "tracking.md"), trackingMarkdown(data), "utf8");
  return [...pages.keys(), "../tracking.md"];
}

if (import.meta.main) {
  const written = await build();
  console.log(`rendered ${written.length} pages: ${written.join(", ")}`);
}
