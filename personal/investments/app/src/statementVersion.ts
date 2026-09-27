import type { Statement } from "./types";

/**
 * Keeps only the highest `source.version` per (accountNo, period, template)
 * group, in first-seen order. Nothing downstream of `ingestAll` -- the
 * registry, the datastore, or any check besides `checkSupersession` itself --
 * should ever see two versions of the same statement: an amended statement
 * beside its original would otherwise double-count a whole account into
 * ground truth, and `checkCrossDocument` would pick whichever twin happened
 * to sort first rather than the one that actually supersedes the rest.
 *
 * Kept dependency-free (no ingest, no Node built-ins) so `analytics/activity.ts`
 * and `analytics/statedFees.ts` can import it too: both reach the browser
 * bundle through `ui/data.ts`, and `build.ts` itself pulls in `node:crypto`
 * and the rest of the ingest pipeline, which a browser bundle cannot load.
 */
export function dedupeToLatestVersion(statements: readonly Statement[]): Statement[] {
  const latestByGroup = new Map<string, Statement>();
  for (const s of statements) {
    const key = `${s.source.accountNo}|${s.source.period}|${s.source.template}`;
    const current = latestByGroup.get(key);
    if (!current || s.source.version > current.source.version) latestByGroup.set(key, s);
  }
  return [...latestByGroup.values()];
}
