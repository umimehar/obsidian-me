import { mkdir, readdir } from "node:fs/promises";
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

export interface Config {
  redactions: string[];
  addressWords: string[];
  /** Account-number vendor prefixes (e.g. the letters before the digits) -- owner-specific, so this lives in the gitignored config, not hardcoded here. */
  vendorPrefixes: string[];
  fixtures: FixtureSpec[];
}

async function loadConfig(): Promise<Config> {
  const path = join(import.meta.dir, "..", "..", "redactions.json");
  const file = Bun.file(path);
  if (!(await file.exists())) {
    throw new Error(`missing ${path} — copy redactions.example.json and fill it in`);
  }
  const parsed = (await file.json()) as Partial<Config>;
  if (!parsed.redactions || !parsed.fixtures || !parsed.vendorPrefixes) {
    throw new Error("redactions.json needs { redactions, addressWords, vendorPrefixes, fixtures }");
  }
  return {
    redactions: parsed.redactions,
    addressWords: parsed.addressWords ?? [],
    vendorPrefixes: parsed.vendorPrefixes,
    fixtures: parsed.fixtures,
  };
}

/**
 * Splits a configured phrase into tokens on whitespace, PLUS the hyphenated
 * halves of each word: a civic/unit address like "1200-300" can print as one
 * hyphenated bbox word or as two separate ones ("1200" then "300"),
 * depending on how the source PDF wrapped it. Both forms are kept -- the
 * whole hyphenated word AND its halves -- since either one alone misses the
 * other layout.
 */
export function phraseTokens(phrase: string): string[] {
  const tokens = new Set<string>();
  for (const word of phrase.split(/\s+/)) {
    if (word.length > 1) tokens.add(word);
    for (const half of word.split(/-+/)) {
      if (half.length > 1) tokens.add(half);
    }
  }
  return [...tokens];
}

// Postal code split across two bbox words, e.g. "M5V" then "2J4" as separate
// <word> elements. Tested per word so the redaction fires regardless of whether
// pdftotext happened to keep the code whole or broke it at the internal space.
const POSTAL_FIRST_HALF = /^[A-Za-z]\d[A-Za-z]$/;
const POSTAL_SECOND_HALF = /^\d[A-Za-z]\d$/;

/** Word-level scrub. bbox XML emits one <word> per token, so whole-name search fails. */
export function scrub(xml: string, accountNo: string, alias: string, cfg: Config): string {
  const tokens = new Set<string>();
  for (const phrase of [...cfg.redactions, ...cfg.addressWords]) {
    // Single-character tokens are excluded: a bare "A" or "L" also matches a
    // single-letter ticker symbol or a table's column header, so admitting them
    // would over-redact real statement data rather than close a real gap.
    for (const t of phraseTokens(phrase)) tokens.add(t.toLowerCase());
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

/**
 * A configured name or address word, matched the same way `scrub` itself
 * matches: against one bbox `<word>`'s content, punctuation-stripped and
 * exact, not a raw substring search over the whole document. A short
 * numeric token split from a civic/unit address (e.g. "300" out of
 * "1200-300") is a plausible substring of an unrelated dollar amount or
 * date anywhere on the page; only an exact per-word match means the same
 * thing `scrub` would have redacted.
 */
function assertNoConfiguredTokens(content: string, label: string, cfg: Config): void {
  const tokens = new Set<string>();
  for (const phrase of [...cfg.redactions, ...cfg.addressWords]) {
    for (const t of phraseTokens(phrase)) tokens.add(t.toLowerCase());
  }

  for (const word of content.matchAll(/<word[^>]*>([^<]*)<\/word>/g)) {
    const raw = word[1] ?? "";
    const bare = raw.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "").toLowerCase();
    if (tokens.has(bare)) {
      throw new Error(
        `stale fixture: "${raw}" still present in ${label} -- run \`bun run fixtures\` to regenerate`,
      );
    }
  }
}

/**
 * Checked against every configured account number, not just the one this
 * particular fixture is keyed on: a body row can legitimately name a
 * sibling account (a transfer, a beneficiary designation), and the orphan
 * sweep at the bottom of this file calls `assertClean` with no single
 * account number in hand at all -- only the full configured set catches
 * that case.
 */
function assertNoAccountNumber(
  content: string,
  label: string,
  accountNos: readonly string[],
): void {
  for (const accountNo of accountNos) {
    if (content.includes(accountNo)) {
      throw new Error(
        `stale fixture: account number in ${label} -- run \`bun run fixtures\` to regenerate`,
      );
    }
  }
}

function assertNoBareNumbers(content: string, label: string): void {
  for (const bare of content.matchAll(/<word[^>]*>(\d{6,})<\/word>/g)) {
    if (bare[1] !== "00000000") {
      throw new Error(
        `stale fixture: bare number ${bare[1]} in ${label} -- run \`bun run fixtures\` to regenerate`,
      );
    }
  }
}

function assertNoPostalCodes(content: string, label: string): void {
  for (const word of content.matchAll(/<word[^>]*>([^<]*)<\/word>/g)) {
    const w = word[1] ?? "";
    if (/^[A-Z]\d[A-Z]\s?\d[A-Z]\d$/i.test(w)) {
      throw new Error(
        `stale fixture: postal code "${w}" in ${label} -- run \`bun run fixtures\` to regenerate`,
      );
    }
    if ((POSTAL_FIRST_HALF.test(w) && w !== "X0X") || (POSTAL_SECOND_HALF.test(w) && w !== "0X0")) {
      throw new Error(
        `stale fixture: postal code half "${w}" in ${label} -- run \`bun run fixtures\` to regenerate`,
      );
    }
  }
}

/**
 * Any account number of the owner's own vendor-prefix shape, not just the
 * ones named in `cfg.fixtures` -- a body row could legitimately name a
 * sibling account never chosen as a fixture. The prefixes themselves are
 * owner-specific and come from the gitignored config, never hardcoded here.
 */
function assertNoVendorCode(content: string, label: string, cfg: Config): void {
  const pattern = new RegExp(`(${cfg.vendorPrefixes.join("|")})[A-Z0-9]{7,}`, "i");
  const vendorCode = pattern.exec(content);
  if (vendorCode) {
    throw new Error(
      `stale fixture: vendor account code "${vendorCode[0]}" in ${label} -- run \`bun run fixtures\` to regenerate`,
    );
  }
}

/**
 * Fails loudly, naming the fixture and the fix, rather than letting a token
 * that was added to the redaction list *after* a fixture was generated sit
 * unnoticed in a committed file. Runs against every write below, and again at
 * the end against every `.xml` actually on disk -- not just the ones this
 * run happened to touch -- so a fixture orphaned from `cfg.fixtures` (its
 * spec removed or renamed) still gets checked instead of going quietly
 * stale forever.
 */
export function assertClean(
  content: string,
  label: string,
  cfg: Config,
  accountNos: readonly string[],
): void {
  assertNoConfiguredTokens(content, label, cfg);
  assertNoAccountNumber(content, label, accountNos);
  assertNoBareNumbers(content, label);
  assertNoPostalCodes(content, label);
  assertNoVendorCode(content, label, cfg);
}

if (import.meta.main) {
  const cfg = await loadConfig();
  await mkdir(OUT, { recursive: true });

  // Every account number named across every fixture spec, not just the one a
  // given fixture is keyed on -- checked against every write, and again in the
  // orphan sweep below, which has no single account number of its own to hand.
  const allAccountNos = cfg.fixtures.map((f) => f.file.split("_")[0] ?? "");

  for (const { file, alias, as } of cfg.fixtures) {
    const xml = await extractXml(join(SOURCE, file), CACHE);
    const accountNo = file.split("_")[0] ?? "";
    const scrubbed = scrub(xml, accountNo, alias, cfg);

    assertClean(scrubbed, as, cfg, allAccountNos);

    await Bun.write(join(OUT, `${as}.xml`), scrubbed);
    console.log(`wrote ${as}.xml`);
  }

  // Every fixture actually on disk, not just the specs above -- catches one
  // whose spec was removed or renamed out of redactions.json but whose file
  // is still committed.
  for (const entry of await readdir(OUT)) {
    if (!entry.endsWith(".xml")) continue;
    const content = await Bun.file(join(OUT, entry)).text();
    assertClean(content, entry, cfg, allAccountNos);
  }
  console.log(`verified ${cfg.fixtures.length} fixture(s) against the current redaction list`);
}
