// Mask real account codes, redact personal names, and detect account kinds.
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

const CODE_RE = /-([A-Za-z0-9]+)\.csv$/;
const STMT_RE = /-\d{4}-\d{2}-\d{2}-monthly-statement.*$/;

const KIND_RULES: ReadonlyArray<readonly [string, string]> = [
  ["credit-card", "CreditCard"],
  ["managed (tfsa)", "ManagedTFSA"],
  ["direct indexing", "DirectIndexing"],
  ["family-resp", "RESP"],
  ["resp", "RESP"],
  ["rrsp", "RRSP"],
  ["home", "FHSA"],
  ["fhsa", "FHSA"],
  ["tfsa", "TFSA"],
  ["non-registered", "NonRegistered"],
  ["chequing", "Chequing"],
  ["savings", "Savings"],
  ["us dollars", "USD"],
  ["us_dollars", "USD"],
  ["crypto", "Crypto"],
];

export interface Redactions {
  readonly names: string[];
  readonly accountLabelPeople: Record<string, string>;
}

function sha256Hex(value: string): string {
  return createHash("sha256").update(value, "utf-8").digest("hex");
}

export function maskAccountCode(realCode: string): string {
  return `acct_${sha256Hex(realCode).slice(0, 8)}`;
}

export function shortAccountId(realCode: string): string {
  return sha256Hex(realCode).slice(0, 4);
}

export function accountCodeFromFilename(name: string): string {
  if (name.includes("credit-card")) return "card";
  const match = CODE_RE.exec(name);
  if (!match?.[1]) throw new Error(`No account code found in filename: ${name}`);
  return match[1];
}

export function accountNameFromFilename(name: string): string {
  if (name.includes("credit-card")) return "Card";
  const stem = name
    .replace(STMT_RE, "")
    .replace(/^[^\w(]+/, "")
    .trim();
  return stem || "Account";
}

export function detectKind(filename: string): string {
  const lowered = filename.toLowerCase();
  for (const [needle, kind] of KIND_RULES) {
    if (lowered.includes(needle)) return kind;
  }
  if (lowered.startsWith("pe-")) return "PE";
  return "Other";
}

export function loadRedactions(path: string): Redactions {
  const data = JSON.parse(readFileSync(path, "utf-8")) as {
    names?: string[];
    account_label_people?: Record<string, string>;
  };
  return { names: data.names ?? [], accountLabelPeople: data.account_label_people ?? {} };
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function redact(text: string, red: Redactions): string {
  let result = text;
  const ordered = [...red.names].sort((a, b) => b.length - a.length);
  for (const name of ordered) {
    result = result.replace(new RegExp(escapeRegExp(name), "gi"), "[redacted]");
  }
  return result;
}
