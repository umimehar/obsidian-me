import { existsSync } from "node:fs";
import { readdir } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { type CardStatement, isCardStatement, parseCardStatement } from "../ingest/card";
import { extractXml } from "../ingest/extract";
import { parseGeometry } from "../ingest/geometry";
import { parseSourceFilename } from "../ingest/source";
import { redactText } from "../store/mask";

const SOURCE =
  process.env.CARD_STATEMENTS_DIR ?? join(homedir(), "Downloads", "monthly_card_statements");
const CACHE = join(import.meta.dir, "..", "..", ".cache");
const DATA = join(import.meta.dir, "..", "..", "..", "data");
const REDACTIONS_PATH = join(import.meta.dir, "..", "..", "redactions.json");

export interface CardsDatastore {
  meta: { generated: string; statementCount: number; cardCount: number };
  statements: CardStatement[];
}

export interface CardFinding {
  cardId: string;
  period: string;
  message: string;
  expected: number;
  actual: number;
  delta: number;
}

/**
 * A credit card is a liability, not an investment account, so it gets its own
 * datastore, its own build and its own view.
 *
 * Folding a card into the investment pipeline would be wrong in both
 * directions: a balance owed has no market value, no book cost and no
 * contribution room, so every analytic in `analytics/` would either skip it
 * or, worse, add a debt to a total built from money held. The two share the
 * geometry and money parsers and nothing else.
 */

/** The one check a card statement can be held to from its own face. */
export function checkCardArithmetic(statement: CardStatement): CardFinding | null {
  const derived =
    statement.previousBalance +
    statement.purchases +
    statement.fees +
    statement.interest +
    statement.cashAdvances -
    statement.payments -
    statement.otherCredits;
  const delta = derived - statement.newBalance;
  // A cent of tolerance, the same rounding slack the investment pipeline
  // allows: the statement prints every figure already rounded to the cent.
  if (Math.abs(delta) <= 0.01) return null;
  return {
    cardId: statement.cardId,
    period: statement.period,
    message:
      "previous balance plus charges less payments does not equal the new balance the statement prints",
    expected: statement.newBalance,
    actual: derived,
    delta,
  };
}

/**
 * A freshly parsed statement replaces its archived twin; anything the source
 * folder no longer holds a PDF for is carried through. The same archive rule
 * the investment build follows, and for the same reason: one month's PDFs
 * must be enough to import that month.
 */
export function mergeCards(
  archived: readonly CardStatement[],
  parsed: readonly CardStatement[],
): CardStatement[] {
  const merged = new Map<string, CardStatement>();
  for (const s of archived) merged.set(`${s.cardId}|${s.period}`, s);
  for (const s of parsed) merged.set(`${s.cardId}|${s.period}`, s);
  return [...merged.values()].sort((a, b) =>
    `${a.cardId}|${a.period}`.localeCompare(`${b.cardId}|${b.period}`),
  );
}

/**
 * Parses every credit card statement in `sourceDir`, skipping any PDF that is
 * not one. The folder is shared with nothing, but the check is on the
 * DOCUMENT rather than the folder: a card statement dropped into the
 * investment folder by mistake must not be parsed as a brokerage statement,
 * and this is the same predicate that stops it there.
 */
export async function ingestCards(
  sourceDir: string,
  cacheDir: string,
  names: readonly string[],
): Promise<CardStatement[]> {
  const files = (await readdir(sourceDir)).filter((f) => f.endsWith(".pdf")).sort();
  const statements: CardStatement[] = [];
  for (const file of files) {
    const pages = parseGeometry(await extractXml(join(sourceDir, file), cacheDir));
    if (!isCardStatement(pages)) continue;
    const parsed = parseCardStatement(pages, file);
    statements.push({
      // The filename is an account number, so it never reaches the datastore
      // raw -- the same rule the investment pipeline follows. The masked card
      // id plus the period is enough to identify the document.
      ...parsed,
      file: `${parsed.cardId}_${parsed.period}.pdf`,
      activity: parsed.activity.map((row) => ({
        ...row,
        description: redactText(row.description, names),
      })),
    });
  }
  return statements;
}

async function loadArchive(path: string): Promise<CardStatement[]> {
  const file = Bun.file(path);
  if (!(await file.exists())) return [];
  const raw = (await file.json()) as Partial<CardsDatastore>;
  return Array.isArray(raw.statements) ? raw.statements : [];
}

if (import.meta.main) {
  const generated = new Date().toISOString();
  const redactions = Bun.file(REDACTIONS_PATH);
  const names = (await redactions.exists())
    ? (((await redactions.json()) as { redactions?: string[] }).redactions ?? [])
    : [];

  // A missing source folder is an empty import, not a failure: the archive
  // already holds every month, so a device with no PDFs still rebuilds
  // cards.json unchanged.
  const sourceExists = existsSync(SOURCE);
  const parsed = sourceExists ? await ingestCards(SOURCE, CACHE, names) : [];
  const archived = await loadArchive(join(DATA, "cards.json"));
  const statements = mergeCards(archived, parsed);

  const findings = statements.map(checkCardArithmetic).filter((f): f is CardFinding => f !== null);
  const store: CardsDatastore = {
    meta: {
      generated,
      statementCount: statements.length,
      cardCount: new Set(statements.map((s) => s.cardId)).size,
    },
    statements,
  };
  await Bun.write(join(DATA, "cards.json"), `${JSON.stringify(store, null, 2)}\n`);
  console.log(
    `${statements.length} card statements, ${store.meta.cardCount} card(s) ` +
      `(${parsed.length} parsed from PDFs, ${statements.length - parsed.length} carried)`,
  );
  for (const f of findings) {
    console.log(
      `  [card-arithmetic] ${f.cardId} ${f.period}: ${f.message} (delta ${f.delta.toFixed(2)})`,
    );
  }
  // The filename parser is shared, so an investment statement sitting in the
  // card folder is worth naming rather than silently skipping.
  if (sourceExists) {
    const all = (await readdir(SOURCE)).filter((f) => f.endsWith(".pdf"));
    const skipped = all.length - parsed.length;
    if (skipped > 0) {
      console.log(
        `  ${skipped} PDF(s) in ${SOURCE} are not credit card statements and were skipped`,
      );
    }
    for (const file of all) {
      if (!parseSourceFilename(file)) console.log(`  unrecognised filename: ${file}`);
    }
  }
}
