import { createHash } from "node:crypto";
import { readdir } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { isAcknowledged } from "./corrections";
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
import type { Finding, ReconciliationReport } from "./validate/report";

const SOURCE = process.env.STATEMENTS_DIR ?? join(homedir(), "Downloads", "monthly_pdf_statements");
const CACHE = join(import.meta.dir, "..", ".cache");
const DATA = join(import.meta.dir, "..", "..", "data");

async function loadRedactions(): Promise<string[]> {
  const file = Bun.file(join(import.meta.dir, "..", "redactions.json"));
  if (!(await file.exists())) return [];
  const parsed = (await file.json()) as { redactions?: unknown };
  return Array.isArray(parsed.redactions)
    ? parsed.redactions.filter((v): v is string => typeof v === "string")
    : [];
}

/**
 * The document's own template always wins over whatever the filename claims,
 * even when the filename does state one -- classifying by filename is the
 * exact failure mode ($8,000 of hidden RRSP contributions) this rebuild
 * exists to remove. A disagreement is reported, never resolved silently.
 */
export function resolveTemplate(parsed: ParsedFilename, docTemplate: Template): Template {
  if (parsed.templateStated && parsed.template !== docTemplate) {
    console.warn(
      `template mismatch on ${parsed.file}: filename says ${parsed.template}, document says ${docTemplate}; using the document`,
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
): Promise<Statement | null> {
  const filePath = join(sourceDir, parsed.file);
  const bytes = await Bun.file(filePath).arrayBuffer();
  const hash = createHash("sha256").update(new Uint8Array(bytes)).digest("hex");
  const original = seenHashes.get(hash);
  if (original) {
    console.warn(
      `skipping duplicate: ${parsed.file} is byte-identical to already-ingested ${original}`,
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
    template: resolveTemplate(parsed, docTemplate),
  };
  return parseStatement(xml, source);
}

export async function ingestAll(sourceDir: string, cacheDir: string): Promise<Statement[]> {
  const files = (await readdir(sourceDir)).filter((f) => f.endsWith(".pdf")).sort();
  const statements: Statement[] = [];
  const skipped: string[] = [];
  const seenHashes = new Map<string, string>();

  for (const file of files) {
    const parsed = parseSourceFilename(file);
    if (!parsed) {
      skipped.push(file);
      continue;
    }
    const statement = await ingestFile(parsed, sourceDir, cacheDir, seenHashes);
    if (statement) statements.push(statement);
  }

  if (skipped.length > 0) {
    throw new Error(
      `${skipped.length} file(s) did not match a known naming convention:\n  ${skipped.join("\n  ")}`,
    );
  }
  return statements;
}

/**
 * `Finding.sourceFile` carries the account code straight from the statement's
 * own filename -- `checks.ts` builds it from the raw, pre-mask statement, the
 * same way `accountShortId` would if `buildDatastore` hadn't already masked
 * it there. This is the only other place a raw account number reaches a
 * committed file, so the report gets the identical filename-prefix masking
 * `buildDatastore` applies to `source.file`.
 */
export function maskFindingSourceFile(finding: Finding): Finding {
  if (finding.sourceFile === "") return finding;
  return {
    ...finding,
    sourceFile: finding.sourceFile.replace(/^[A-Z0-9]+_/, `${finding.accountShortId}_`),
  };
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
  const statements = await ingestAll(SOURCE, CACHE);
  const accounts = buildRegistry(statements);
  const names = await loadRedactions();

  const findings = runChecks(statements, OBSERVATIONS, countedAccountNumbers(statements, accounts));
  const report: ReconciliationReport = {
    generated,
    statementCount: statements.length,
    findings: findings.map(maskFindingSourceFile),
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
