import { describe, expect, test } from "bun:test";
import { existsSync, readdirSync } from "node:fs";
import { readdir } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { countedAccountNumbers, dedupeToLatestVersion, ingestAll, ingestRaw } from "./build";
import { isAcknowledged } from "./corrections";
import { GOLDENS } from "./goldens";
import { mergeIntoArchive, toArchived } from "./store/archive";
import { buildRegistry } from "./store/registry";
import {
  checkArithmetic,
  checkBalanceChain,
  checkContinuity,
  checkCoverage,
  checkCrossDocument,
  checkGroundTruth,
  checkKindConsistency,
  checkStyleConsistency,
  checkSupersession,
} from "./validate/checks";

const SOURCE = process.env.STATEMENTS_DIR ?? join(homedir(), "Downloads", "monthly_pdf_statements");
const CACHE = join(import.meta.dir, "..", ".cache");

/**
 * These tests need every PDF since the corpus began, not just a folder: an
 * import leaves only the new month in it. The first period's statements are
 * the marker. Never commit the PDFs to make this run in CI -- they carry the
 * owner's address and account numbers.
 */
const FULL_CORPUS =
  existsSync(SOURCE) &&
  readdirSync(SOURCE).some((f) => f.includes(`_${GOLDENS.corpus.firstPeriod}`));

describe.if(FULL_CORPUS)("full corpus", () => {
  test("parses every statement, deduplicating the fresh-download twins", async () => {
    // The source folder holds one file per statement plus any fresh
    // Wealthsimple download that is byte-identical to a conventionally named
    // one; those twins deduplicate away, so the parsed count is the
    // statement count and the difference is the twins.
    expect((await ingestAll(SOURCE, CACHE)).length).toBe(GOLDENS.corpus.statementCount);
    const files = (await readdir(SOURCE)).filter((f) => f.endsWith(".pdf"));
    expect(files.length).toBe(GOLDENS.corpus.sourceFileCount);
  });

  test("every statement passes its own arithmetic, with no unexplained mismatch", async () => {
    // checkArithmetic legitimately reports warning-severity findings for known
    // statement quirks (fx-rate rounding, a rebate netted against fees, a
    // same-day reversed entry) -- an empty findings list would contradict its
    // own design. The real invariant is zero errors: an unexplained mismatch.
    const findings = checkArithmetic(await ingestAll(SOURCE, CACHE));
    const errors = findings.filter((f) => f.severity === "error");
    if (errors.length > 0) console.log(errors.slice(0, 10));
    expect(errors).toEqual([]);
  });

  test("cash balances are continuous within each series", async () => {
    expect(checkContinuity(await ingestAll(SOURCE, CACHE))).toEqual([]);
  });

  test("no account changes kind across its history", async () => {
    // Wording drifts; kind must not.
    expect(checkKindConsistency(await ingestAll(SOURCE, CACHE))).toEqual([]);
  });

  test("the one real management-style change in the corpus is caught and acknowledged", async () => {
    // Account 9710 genuinely moved from self-directed to Wealthsimple
    // Managed -- a real product change, not a parser bug. Proves the check
    // can fire, and that it is the one acknowledged, expected case.
    const findings = checkStyleConsistency(await ingestAll(SOURCE, CACHE));
    expect(findings).toHaveLength(1);
    expect(findings[0]?.accountShortId).toBe("9710");
    expect(isAcknowledged("style-drift", "9710", findings[0]?.period ?? "")).toBe(true);
  });

  test("every date group's running balance chains to the printed figure", async () => {
    // Rows sharing a date print that date's closing balance, not a per-row
    // running balance -- chaining group to group by date is what makes this
    // hold across the whole corpus rather than breaking on any date with
    // more than one transaction.
    expect(checkBalanceChain(await ingestAll(SOURCE, CACHE))).toEqual([]);
  });

  test("finds the expected accounts, kinds and styles", async () => {
    const accounts = buildRegistry(await ingestAll(SOURCE, CACHE));
    expect(accounts).toHaveLength(14);
    expect(accounts.filter((a) => a.kind === "Chequing")).toHaveLength(3);
    for (const kind of [
      "TFSA",
      "FHSA",
      "RRSP",
      "SpousalRRSP",
      "RESP",
      "NonRegistered",
      "Crypto",
      "Corporate",
    ]) {
      expect(accounts.some((a) => a.kind === kind)).toBe(true);
    }
    expect(accounts.some((a) => a.style === "managed")).toBe(true);
  });

  test("the June 2026 app reading decomposes into the spousal asset and WSE401, to the cent", async () => {
    // The app reading counted a WIDER scope than this project's total: it
    // included the spousal RRSP, whose asset belongs to the spouse and which
    // is excluded here from 2026-08-31. So the delta is large and fully
    // explained rather than small, and the residual is what proves it.
    const statements = await ingestAll(SOURCE, CACHE);
    const accounts = buildRegistry(statements);
    const [finding] = checkGroundTruth(
      statements,
      [{ observed: "2026-06-30", period: "2026-06", accountValue: 242019.61, netDeposits: null }],
      countedAccountNumbers(statements, accounts),
    );
    if (!finding?.actual) throw new Error("expected a ground-truth finding");

    const spousal = statements
      .filter((s) => s.source.period === "2026-06" && /Spousal/i.test(s.accountType))
      .reduce((sum, s) => sum + (s.portfolio?.totalMarketValue ?? 0), 0);
    const WSE401_PENDING = 279.94;
    expect(spousal).toBeGreaterThan(0);
    // Zero to the cent. A residual this exact is what makes both halves of
    // the explanation testable rather than merely plausible.
    expect(finding.actual + spousal + WSE401_PENDING).toBeCloseTo(242019.61, 2);
    expect(finding.message).toMatch(/pending valuation/i);
  });

  test("no coverage gap, cross-document disagreement, or superseded version goes unexplained", async () => {
    // M10: these zeroes were previously established by hand, not by the
    // suite -- pin them so a regression is caught automatically.
    const statements = await ingestAll(SOURCE, CACHE);
    expect(checkCoverage(statements)).toEqual([]);

    const crossDocument = checkCrossDocument(statements).filter(
      (f) => !isAcknowledged(f.check, f.accountShortId, f.period),
    );
    expect(crossDocument).toEqual([]);

    // The corpus carries no duplicate (accountNo, period, template) group
    // today, so checkSupersession never fires against the raw, undeduped list.
    expect(checkSupersession((await ingestRaw(SOURCE, CACHE)).statements)).toEqual([]);
  });

  test("every class-level market value reconciles exactly or within the disclosed fx budget", async () => {
    const statements = await ingestAll(SOURCE, CACHE);
    const classPairs = statements.reduce((a, s) => a + (s.portfolio?.classes.length ?? 0), 0);
    const findings = checkArithmetic(statements).filter((f) =>
      /market value (differs|does not reconcile)/.test(f.message),
    );
    const errors = findings.filter((f) => f.severity === "error");
    expect(errors).toEqual([]);
    expect(classPairs).toBeGreaterThan(0);
    expect(findings.length).toBeLessThan(classPairs);
  });

  test("the byte-identical duplicate skip reaches the report as a Finding, not just a console.warn", async () => {
    // The source folder's known duplicate (see the first test above) used to
    // be a console.warn only, invisible to reconciliation.json.
    const { findings } = await ingestRaw(SOURCE, CACHE);
    const ingestFindings = findings.filter((f) => f.check === "ingest");
    expect(ingestFindings.length).toBeGreaterThan(0);
    expect(ingestFindings.every((f) => f.severity === "warning" || f.severity === "error")).toBe(
      true,
    );
    expect(ingestFindings.some((f) => f.message.includes("byte-identical"))).toBe(true);
  });

  test("every ingested statement's template is document-derived, never filename-derived", async () => {
    // Guards the fix this task exists for: a fresh Wealthsimple download
    // carries no template segment in its filename at all, and every
    // statement -- not just that one -- must still classify correctly.
    const statements = await ingestAll(SOURCE, CACHE);
    for (const s of statements) {
      expect(["BROKERAGE", "CASH", "PERFORMANCE"]).toContain(s.source.template);
    }
  });
});

/**
 * The property the whole archive exists for: importing ONE month's PDFs over
 * the committed archive has to produce the same statements as parsing every
 * PDF that has ever existed. Run against the real source folder and the real
 * committed datastore, because a fixture proving this proves nothing -- the
 * failure mode is a mismatch between two real code paths over real data.
 */
describe.if(FULL_CORPUS)("the incremental import reproduces the full build", () => {
  test("one month's PDFs plus the archive equal the whole corpus, statement for statement", async () => {
    const everything = dedupeToLatestVersion(
      (await ingestRaw(SOURCE, CACHE)).statements.map((s) => toArchived(s, [])),
    );

    // The archive stands in for every month whose PDF is no longer on disk.
    const latest = GOLDENS.corpus.latestPeriod;
    const archive = everything.filter((s) => s.source.period !== latest);
    const thisMonth = everything.filter((s) => s.source.period === latest);
    expect(archive.length).toBeGreaterThan(0);
    expect(thisMonth.length).toBeGreaterThan(0);

    const incremental = dedupeToLatestVersion(mergeIntoArchive(archive, thisMonth));
    const sort = (
      list: readonly { source: { accountNo: string; period: string; template: string } }[],
    ) =>
      [...list].sort((a, b) =>
        `${a.source.accountNo}|${a.source.period}|${a.source.template}`.localeCompare(
          `${b.source.accountNo}|${b.source.period}|${b.source.template}`,
        ),
      );
    expect(sort(incremental)).toEqual(sort(everything));
  });

  test("the registry it derives is identical too, so no account splits in two", async () => {
    // The registry masks account numbers, and an archived statement's number
    // is ALREADY masked. Without `maskAccountNo` being idempotent this is
    // where every carried account would appear a second time.
    const everything = dedupeToLatestVersion(
      (await ingestRaw(SOURCE, CACHE)).statements.map((s) => toArchived(s, [])),
    );
    const latest = GOLDENS.corpus.latestPeriod;
    const incremental = dedupeToLatestVersion(
      mergeIntoArchive(
        everything.filter((s) => s.source.period !== latest),
        everything.filter((s) => s.source.period === latest),
      ),
    );
    expect(buildRegistry(incremental)).toEqual(buildRegistry(everything));
    expect(buildRegistry(everything)).toHaveLength(GOLDENS.corpus.accountCount);
  });
});
