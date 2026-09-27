import type { Statement } from "../types";
import type { Datastore } from "./datastore";
import { maskAccountNo, redactText } from "./mask";

/**
 * The committed `data/datastore.json` doubles as the statement archive.
 *
 * The build used to require every PDF it had ever seen, because it rebuilt
 * the whole datastore from the source folder on every run. That folder lives
 * outside the vault and is not backed up, so losing it lost three years of
 * history, and keeping 235 PDFs on disk forever to import one new month is a
 * cost with nothing behind it. The masked statements in `datastore.json` are
 * already the complete parsed form of every statement -- portfolio, cash,
 * holdings, activity, contributions and all -- so they ARE the archive, and
 * a month can be imported from its own PDFs alone.
 *
 * The archive holds MASKED statements. That is not a limitation to work
 * around: it is the reason the archive can live in the vault at all, and
 * `maskAccountNo` is idempotent precisely so the rest of the pipeline can
 * treat an archived statement and a freshly parsed one the same way.
 */

/** The identity of a statement: one document, one version of it. */
function versionKey(statement: Statement): string {
  const { accountNo, period, template, version } = statement.source;
  return `${maskAccountNo(accountNo).maskedId}|${period}|${template}|${version}`;
}

/**
 * Masks and redacts one freshly parsed statement into archive form -- the
 * same shape `buildDatastore` writes, applied BEFORE the merge rather than
 * after it, so archived and new statements are directly comparable.
 */
export function toArchived(statement: Statement, names: readonly string[]): Statement {
  const { maskedId, shortId } = maskAccountNo(statement.source.accountNo);
  return {
    ...statement,
    source: {
      ...statement.source,
      accountNo: maskedId,
      file: statement.source.file.replace(/^[A-Za-z0-9]+_/, `${shortId}_`),
    },
    activity: statement.activity.map((row) => ({
      ...row,
      description: redactText(row.description, names),
    })),
  };
}

/**
 * A freshly parsed statement REPLACES its archived twin; anything the source
 * folder no longer holds a PDF for is carried through untouched.
 *
 * Replacement is keyed on the exact version, so an amended statement arrives
 * as a new entry beside the original rather than overwriting it, and
 * `dedupeToLatestVersion` still gets both to choose between. Ordering is
 * archive-first then new, and the result is sorted, so a rebuild that
 * happens to visit files in a different order writes the same file.
 */
export function mergeIntoArchive(
  archived: readonly Statement[],
  parsed: readonly Statement[],
): Statement[] {
  const merged = new Map<string, Statement>();
  for (const statement of archived) merged.set(versionKey(statement), statement);
  // Second, so a freshly parsed statement wins its key outright. Re-importing
  // a month whose figures have changed at the source is the whole point: the
  // archive is a cache of parsing, never a record that outranks the document.
  for (const statement of parsed) merged.set(versionKey(statement), statement);
  return [...merged.values()].sort((a, b) => versionKey(a).localeCompare(versionKey(b)));
}

/**
 * The archived statements from a committed datastore, or an empty archive
 * when there is none yet.
 *
 * A malformed archive throws rather than falling back to empty: silently
 * treating it as absent would rebuild the datastore from whatever PDFs
 * happen to be on disk and quietly delete every month whose PDF is gone,
 * which is the exact loss this file exists to prevent.
 */
export function archivedStatements(raw: unknown): Statement[] {
  if (raw === null || raw === undefined) return [];
  if (typeof raw !== "object") {
    throw new Error("data/datastore.json is not an object; delete it to rebuild from scratch");
  }
  const { statements } = raw as Partial<Datastore>;
  if (statements === undefined) return [];
  if (!Array.isArray(statements)) {
    throw new Error(
      "data/datastore.json has no statements array; delete it to rebuild from scratch",
    );
  }
  for (const statement of statements) {
    const accountNo: unknown = (statement as Statement | undefined)?.source?.accountNo;
    if (typeof accountNo !== "string" || !accountNo.startsWith("acct_")) {
      throw new Error(
        "data/datastore.json holds an unmasked or malformed statement; refusing to merge it",
      );
    }
  }
  return statements as Statement[];
}
