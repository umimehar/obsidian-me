import { mkdir } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { extractXml } from "../ingest/extract";

const SOURCE = process.env.STATEMENTS_DIR ?? join(homedir(), "Downloads", "monthly_pdf_statements");
const CACHE = join(import.meta.dir, "..", "..", ".cache");
const OUT = join(import.meta.dir, "..", "ingest", "__fixtures__");

interface FixtureSpec {
  /** Real statement filename — a real account number, so it lives in the gitignored config. */
  file: string;
  alias: string;
  as: string;
}

interface Config {
  redactions: string[];
  addressWords: string[];
  fixtures: FixtureSpec[];
}

async function loadConfig(): Promise<Config> {
  const path = join(import.meta.dir, "..", "..", "redactions.json");
  const file = Bun.file(path);
  if (!(await file.exists())) {
    throw new Error(`missing ${path} — copy redactions.example.json and fill it in`);
  }
  const parsed = (await file.json()) as Partial<Config>;
  if (!parsed.redactions || !parsed.fixtures) {
    throw new Error("redactions.json needs { redactions, addressWords, fixtures }");
  }
  return {
    redactions: parsed.redactions,
    addressWords: parsed.addressWords ?? [],
    fixtures: parsed.fixtures,
  };
}

// Postal code split across two bbox words, e.g. "M5V" then "2J4" as separate
// <word> elements. Tested per word so the redaction fires regardless of whether
// pdftotext happened to keep the code whole or broke it at the internal space.
const POSTAL_FIRST_HALF = /^[A-Za-z]\d[A-Za-z]$/;
const POSTAL_SECOND_HALF = /^\d[A-Za-z]\d$/;

/** Word-level scrub. bbox XML emits one <word> per token, so whole-name search fails. */
function scrub(xml: string, accountNo: string, alias: string, cfg: Config): string {
  const tokens = new Set<string>();
  for (const phrase of [...cfg.redactions, ...cfg.addressWords]) {
    // Single-character tokens are excluded: a bare "A" or "L" also matches a
    // single-letter ticker symbol or a table's column header, so admitting them
    // would over-redact real statement data rather than close a real gap.
    for (const t of phrase.split(/\s+/)) if (t.length > 1) tokens.add(t.toLowerCase());
  }

  return xml.replace(/(>)([^<]*)(<\/word>)/g, (_m, open: string, text: string, close: string) => {
    let out = text;
    if (out.toLowerCase() === accountNo.toLowerCase()) out = alias;
    // Compare against punctuation stripped from both ends: a name token followed by a
    // comma or period (e.g. an address line's "Springfield,") would otherwise slip past
    // an exact match against the bare token.
    const bare = out.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "").toLowerCase();
    if (tokens.has(bare)) out = "REDACTED";
    if (/^\d{6,}$/.test(out)) out = "00000000"; // bare numeric account numbers
    if (/^[A-Z]\d[A-Z]\s?\d[A-Z]\d$/i.test(out)) out = "X0X0X0"; // whole postal code
    if (POSTAL_FIRST_HALF.test(out)) out = "X0X"; // postal code, first half only
    if (POSTAL_SECOND_HALF.test(out)) out = "0X0"; // postal code, second half only
    return `${open}${out}${close}`;
  });
}

const cfg = await loadConfig();
await mkdir(OUT, { recursive: true });

for (const { file, alias, as } of cfg.fixtures) {
  const xml = await extractXml(join(SOURCE, file), CACHE);
  const accountNo = file.split("_")[0] ?? "";
  const scrubbed = scrub(xml, accountNo, alias, cfg);

  const lower = scrubbed.toLowerCase();
  for (const phrase of [...cfg.redactions, ...cfg.addressWords]) {
    for (const t of phrase.split(/\s+/)) {
      if (t.length > 1 && lower.includes(t.toLowerCase())) {
        throw new Error(`scrub failed: "${t}" still present in ${as}`);
      }
    }
  }
  if (scrubbed.includes(accountNo)) throw new Error(`scrub failed: account number in ${as}`);
  for (const bare of scrubbed.matchAll(/<word[^>]*>(\d{6,})<\/word>/g)) {
    if (bare[1] !== "00000000") {
      throw new Error(`scrub failed: bare number ${bare[1]} in ${as}`);
    }
  }
  for (const word of scrubbed.matchAll(/<word[^>]*>([^<]*)<\/word>/g)) {
    const w = word[1] ?? "";
    if (/^[A-Z]\d[A-Z]\s?\d[A-Z]\d$/i.test(w)) {
      throw new Error(`scrub failed: postal code "${w}" in ${as}`);
    }
    if ((POSTAL_FIRST_HALF.test(w) && w !== "X0X") || (POSTAL_SECOND_HALF.test(w) && w !== "0X0")) {
      throw new Error(`scrub failed: postal code half "${w}" in ${as}`);
    }
  }
  // A sibling account's own filename-derived code, not just the one this fixture
  // is keyed on — a body row could legitimately name another account.
  const vendorCode = /(WK|HQ|WZ)[A-Z0-9]{7,}/i.exec(scrubbed);
  if (vendorCode) throw new Error(`scrub failed: vendor account code "${vendorCode[0]}" in ${as}`);

  await Bun.write(join(OUT, `${as}.xml`), scrubbed);
  console.log(`wrote ${as}.xml`);
}
