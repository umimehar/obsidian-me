import { createHash } from "node:crypto";
import { readdir } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { acknowledgementFor, isAcknowledged } from "./corrections";
import { extractXml } from "./ingest/extract";
import { parseGeometry } from "./ingest/geometry";
import { parseStatement } from "./ingest/parse";
import { detectTemplate, parseSourceFilename } from "./ingest/source";
import type { ParsedFilename, SourceRef, Template } from "./ingest/source";
import { buildDatastore } from "./store/datastore";
import { maskAccountNo } from "./store/mask";
import { buildRegistry } from "./store/registry";
import { OBSERVATIONS } from "./truth";
import type { Statement } from "./types";
import { runChecks } from "./validate/checks";
import type { Finding, ReconciliationReport, ReportedFinding } from "./validate/report";

const SOURCE = process.env.STATEMENTS_DIR ?? join(homedir(), "Downloads", "monthly_pdf_statements");
const CACHE = join(import.meta.dir, "..", ".cache");
const DATA = join(import.meta.dir, "..", "..", "data");
const REDACTIONS_PATH = join(import.meta.dir, "..", "redactions.json");

/**
 * Throws rather than failing open: `redactions.json` is gitignored and
 * per-device, so a missing file on a fresh clone must stop the build, not
 * silently write raw activity descriptions into the committed datastore.
 */
export async function loadRedactions(path: string): Promise<string[]> {
  const file = Bun.file(path);
  if (!(await file.exists())) {
    throw new Error(`missing ${path} -- copy redactions.example.json and fill it in`);
  }
  const parsed = (await file.json()) as { redactions?: unknown };
  return Array.isArray(parsed.redactions)
    ? parsed.redactions.filter((v): v is string => typeof v === "string")
    : [];
}

/** Builds an ingest-time anomaly finding straight from a filename, before any Statement exists to key it on. */
function ingestFinding(
  severity: Finding["severity"],
  parsed: Pick<ParsedFilename, "accountNo" | "period" | "file">,
  message: string,
): Finding {
  return {
    check: "ingest",
    severity,
    accountShortId: maskAccountNo(parsed.accountNo).shortId,
    period: parsed.period,
    message,
    expected: null,
    actual: null,
    delta: null,
    sourceFile: parsed.file,
  };
}

/**
 * The document's own template always wins over whatever the filename claims,
 * even when the filename does state one -- classifying by filename is the
 * exact failure mode ($8,000 of hidden RRSP contributions) this rebuild
 * exists to remove. A disagreement is reported, never resolved silently, and
 * -- unlike a console.warn -- reaches reconciliation.json under the same
 * severity contract as every other finding.
 */
export function resolveTemplate(
  parsed: ParsedFilename,
  docTemplate: Template,
  findings: Finding[],
): Template {
  if (parsed.templateStated && parsed.template !== docTemplate) {
    findings.push(
      ingestFinding(
        "warning",
        parsed,
        `template mismatch: filename says ${parsed.template}, document says ${docTemplate}; using the document`,
      ),
    );
  }
  return docTemplate;
}

/**
 * Ingests one already-name-parsed file: hashes its content for dedup,
 * extracts and geometry-parses it once, then derives the template from the
 * document. Returns null for a file already ingested under another name --
 * the fresh single-file download and the bulk export both land in the same
 * source folder and can name the same statement two different ways.
 */
async function ingestFile(
  parsed: ParsedFilename,
  sourceDir: string,
  cacheDir: string,
  seenHashes: Map<string, string>,
  findings: Finding[],
): Promise<Statement | null> {
  const filePath = join(sourceDir, parsed.file);
  const bytes = await Bun.file(filePath).arrayBuffer();
  const hash = createHash("sha256").update(new Uint8Array(bytes)).digest("hex");
  const original = seenHashes.get(hash);
  if (original) {
    findings.push(
      ingestFinding("warning", parsed, `skipped: byte-identical to already-ingested ${original}`),
    );
    return null;
  }
  seenHashes.set(hash, parsed.file);

  const xml = await extractXml(filePath, cacheDir);
  const docTemplate = detectTemplate(parseGeometry(xml));
  if (!docTemplate) {
    throw new Error(
      `could not determine the template for ${parsed.file} from its document content`,
    );
  }

  const source: SourceRef = {
    file: parsed.file,
    accountNo: parsed.accountNo,
    period: parsed.period,
    version: parsed.version,
    template: resolveTemplate(parsed, docTemplate, findings),
  };
  return parseStatement(xml, source);
}

export interface IngestResult {
  /** Every version of every statement, including superseded ones -- the raw material `checkSupersession` needs to report what it dropped. */
  statements: Statement[];
  /** Anomalies discovered during ingestion itself: a filename/document template mismatch, a byte-identical duplicate skip. */
  findings: Finding[];
}

/**
 * Nothing downstream should read `statements` here directly; call `ingestAll`
 * or `dedupeToLatestVersion` on it first. `findings` is never deduped -- an
 * ingest anomaly on a superseded version is still a real anomaly.
 */
export async function ingestRaw(sourceDir: string, cacheDir: string): Promise<IngestResult> {
  const files = (await readdir(sourceDir)).filter((f) => f.endsWith(".pdf")).sort();
  const statements: Statement[] = [];
  const findings: Finding[] = [];
  const skipped: string[] = [];
  const seenHashes = new Map<string, string>();

  for (const file of files) {
    const parsed = parseSourceFilename(file);
    if (!parsed) {
      skipped.push(file);
      continue;
    }
    const statement = await ingestFile(parsed, sourceDir, cacheDir, seenHashes, findings);
    if (statement) statements.push(statement);
  }

  if (skipped.length > 0) {
    throw new Error(
      `${skipped.length} file(s) did not match a known naming convention:\n  ${skipped.join("\n  ")}`,
    );
  }
  return { statements, findings };
}

/**
 * Keeps only the highest `source.version` per (accountNo, period, template)
 * group, in first-seen order. Nothing downstream of `ingestAll` -- the
 * registry, the datastore, or any check besides `checkSupersession` itself --
 * should ever see two versions of the same statement: an amended statement
 * beside its original would otherwise double-count a whole account into
 * ground truth, and `checkCrossDocument` would pick whichever twin happened
 * to sort first rather than the one that actually supersedes the rest.
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

export async function ingestAll(sourceDir: string, cacheDir: string): Promise<Statement[]> {
  return dedupeToLatestVersion((await ingestRaw(sourceDir, cacheDir)).statements);
}

/**
 * Any raw-account-code-prefixed filename token embedded in free text (a
 * Finding's `message`, not just its dedicated `sourceFile` field). Matches a
 * whole `.pdf`-suffixed token and masks its leading account code with that
 * code's own hash -- not the enclosing finding's `accountShortId`, since a
 * message can legitimately quote a *different* statement's filename (the
 * `ingest` check's duplicate-skip message names the file it was found
 * identical to, not necessarily itself).
 */
function maskFilenamesInText(text: string): string {
  return text.replace(/\S*\.pdf\b/g, (filename) => {
    const m = /^([A-Z0-9]+)_(.*)$/.exec(filename);
    if (!m) return filename;
    const [, accountNo, rest] = m;
    if (!accountNo || rest === undefined) return filename;
    return `${maskAccountNo(accountNo).shortId}_${rest}`;
  });
}

/**
 * Every free-text field on a Finding that could carry a raw filename, not
 * just `sourceFile` -- `checks.ts` builds `sourceFile` from the raw,
 * pre-mask statement, the same way `accountShortId` would if
 * `buildDatastore` hadn't already masked it there, but a `message` can quote
 * a filename too (the `ingest` check's duplicate-skip message names the file
 * it matched). Listed once here, rather than masked field by field, so a
 * finding shape added later inherits the protection by construction instead
 * of by remembering to wire it in.
 */
const FINDING_TEXT_FIELDS = ["message", "sourceFile"] as const;

/**
 * Masks every raw filename embedded in a Finding's text fields. Each match
 * is masked using ITS OWN embedded account code, not the enclosing finding's
 * `accountShortId` -- a message can legitimately quote a *different*
 * statement's filename, and this stays correct either way.
 */
export function maskFinding(finding: Finding): Finding {
  const masked = { ...finding };
  for (const field of FINDING_TEXT_FIELDS) {
    masked[field] = maskFilenamesInText(masked[field]);
  }
  return masked;
}

/**
 * Attaches the acknowledgement state to a finding, so `reconciliation.json`
 * carries it and the dashboard never has to import `corrections.ts` and
 * repeat the match. No figure is touched: an acknowledged finding keeps its
 * expected, actual and delta exactly as the check computed them, because an
 * acknowledgement explains a discrepancy rather than cancelling it.
 */
export function annotateFinding(finding: Finding): ReportedFinding {
  const ack = acknowledgementFor(finding.check, finding.accountShortId, finding.period);
  return { ...finding, acknowledged: ack !== undefined, reason: ack?.reason ?? null };
}

/** Raw account numbers for accounts that count toward investment totals. */
export function countedAccountNumbers(
  statements: readonly Statement[],
  accounts: readonly { maskedId: string; inTotals: boolean }[],
): Set<string> {
  const counted = new Set(accounts.filter((a) => a.inTotals).map((a) => a.maskedId));
  return new Set(
    statements
      .map((s) => s.source.accountNo)
      .filter((no) => counted.has(maskAccountNo(no).maskedId)),
  );
}

if (import.meta.main) {
  const generated = new Date().toISOString();
  const raw = await ingestRaw(SOURCE, CACHE);
  const allVersions = raw.statements;
  const statements = dedupeToLatestVersion(allVersions);
  const accounts = buildRegistry(statements);
  const names = await loadRedactions(REDACTIONS_PATH);

  const findings = [
    ...runChecks(
      statements,
      allVersions,
      OBSERVATIONS,
      countedAccountNumbers(statements, accounts),
    ),
    ...raw.findings,
  ];
  const report: ReconciliationReport = {
    generated,
    statementCount: statements.length,
    findings: findings.map(maskFinding).map(annotateFinding),
  };

  await Bun.write(
    join(DATA, "datastore.json"),
    JSON.stringify(buildDatastore(statements, accounts, names, generated), null, 2),
  );
  await Bun.write(join(DATA, "reconciliation.json"), JSON.stringify(report, null, 2));

  // Acknowledgement applies to every severity, not just errors: the WSE401
  // pending-valuation entry acknowledges a ground-truth finding, which
  // checkGroundTruth emits as a warning. Filtering acknowledgement to errors
  // alone would make that entry -- and the whole mechanism for warnings -- dead.
  const unacknowledged = findings.filter(
    (f) => !isAcknowledged(f.check, f.accountShortId, f.period),
  );
  const errors = unacknowledged.filter((f) => f.severity === "error");
  const acknowledged = findings.length - unacknowledged.length;
  console.log(`${statements.length} statements, ${accounts.length} accounts`);
  console.log(
    `${errors.length} unacknowledged error(s), ` +
      `${unacknowledged.length - errors.length} warning(s), ${acknowledged} acknowledged`,
  );
  for (const f of findings.filter((x) => x.check === "ground-truth")) {
    console.log(
      `  ${f.period} ${f.message}\n    expected ${f.expected}, got ${f.actual?.toFixed(2)}, delta ${f.delta?.toFixed(2)}`,
    );
  }
  for (const f of errors.slice(0, 20)) {
    console.log(
      `  [${f.check}] ${f.accountShortId} ${f.period}: ${f.message} (delta ${f.delta?.toFixed(2)})`,
    );
  }
  for (const a of accounts) {
    console.log(
      `  ${a.shortId} ${a.kind}/${a.style} ${a.firstPeriod}..${a.lastPeriod} n=${a.statementCount}`,
    );
  }
}
