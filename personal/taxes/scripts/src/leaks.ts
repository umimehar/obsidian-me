/** Scans everything under personal/taxes that git would commit for SINs, card and account numbers.
    Exits non-zero naming each file and match. Part of `bun run check`. */

import { readdir } from "node:fs/promises";
import { join, relative } from "node:path";
import { ROOT } from "./load";

const ALLOWED = new Set(["795920958"]);
const SKIP_DIRS = new Set(["node_modules", ".git"]);
const TEXT = /\.(md|csv|json|html|py|ts|txt|xml)$/i;

/** True when the digits pass the Luhn checksum that every payment card number satisfies. */
export function luhn(digits: string): boolean {
  let sum = 0;
  for (let i = 0; i < digits.length; i++) {
    let n = Number(digits[digits.length - 1 - i]);
    if (i % 2 === 1) n = n > 4 ? n * 2 - 9 : n * 2;
    sum += n;
  }
  return sum % 10 === 0;
}

function cardInside(run: string): string | null {
  for (const width of [16, 15]) {
    for (let s = 0; s + width <= run.length; s++) {
      const cand = run.slice(s, s + width);
      if ("3456".includes(cand[0] ?? "") && luhn(cand)) return cand;
    }
  }
  return null;
}

/** Every identifier-shaped value in the text that is not allowed to be stored. */
export function findLeaks(text: string, known: readonly string[] = []): string[] {
  const out: string[] = [];
  const digitsOnly = text.replace(/[ .-]/g, "");
  for (const k of known)
    if (digitsOnly.includes(k)) out.push(`a known identifier ending ${k.slice(-3)}`);
  for (const m of text.matchAll(/(?<![\d.a-f])\d{13,}(?![a-f])/g)) {
    const card = cardInside(m[0]);
    if (card) out.push(`card number ending ${card.slice(-4)}`);
  }
  // A SIN never starts with 0 or 8; requiring one separator throughout skips coordinates.
  for (const m of text.matchAll(/(?<![\d.])[1-79]\d{2}([ .-])\d{3}\1\d{3}(?![\d.])/g)) {
    if (!ALLOWED.has(m[0].replace(/\D/g, ""))) out.push(`SIN-shaped ${m[0]}`);
  }
  for (const m of text.matchAll(/(?<!\d)0?\d{7,8}-\d{3}(?!\d)/g))
    out.push(`account number ${m[0]}`);
  for (const m of text.matchAll(/(?<!\d)\d{6}[*X]{4,8}\d{4}(?!\d)/g))
    out.push(`card with prefix ${m[0]}`);
  return out;
}

async function files(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const nested = await Promise.all(
    entries
      .filter((e) => !SKIP_DIRS.has(e.name))
      .map((e) =>
        e.isDirectory() ? files(join(dir, e.name)) : Promise.resolve([join(dir, e.name)]),
      ),
  );
  return nested.flat();
}

/** Text of an .xlsx: the shared strings and sheet XML, which is where cell text lives. */
async function xlsxText(path: string): Promise<string> {
  const proc = Bun.spawn(["unzip", "-p", path, "xl/sharedStrings.xml", "xl/worksheets/*.xml"], {
    stdout: "pipe",
    stderr: "ignore",
  });
  return new Response(proc.stdout).text();
}

/** Real SINs and account numbers, one per line, in a gitignored file on this device only. */
async function knownIdentifiers(root: string): Promise<string[]> {
  const file = Bun.file(join(root, "scripts", ".known-identifiers"));
  if (!(await file.exists())) return [];
  return (await file.text())
    .split("\n")
    .map((l) => l.replace(/\D/g, ""))
    .filter((l) => l.length >= 7);
}

export async function scan(root: string): Promise<string[]> {
  const problems: string[] = [];
  const known = await knownIdentifiers(root);
  for (const path of await files(root)) {
    const rel = relative(root, path);
    if (rel === "scripts/.known-identifiers" || rel.endsWith(".test.ts")) continue;
    const text = TEXT.test(path)
      ? await Bun.file(path).text()
      : /\.xlsx$/i.test(path)
        ? await xlsxText(path)
        : "";
    for (const leak of new Set(findLeaks(text, known))) problems.push(`${rel}: ${leak}`);
  }
  return problems;
}

if (import.meta.main) {
  const problems = await scan(ROOT);
  if (problems.length > 0) {
    console.error(`${problems.length} possible identifier leak(s):\n  ${problems.join("\n  ")}`);
    process.exit(1);
  }
  console.log("no SINs, card or account numbers found");
}
