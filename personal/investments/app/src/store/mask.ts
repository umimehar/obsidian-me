import { createHash } from "node:crypto";

export type AccountKind =
  | "TFSA"
  | "FHSA"
  | "RRSP"
  | "SpousalRRSP"
  | "RESP"
  | "NonRegistered"
  | "Crypto"
  | "Chequing";

/** Managed versus self-directed. This is the app's Portfolios/Trading split. */
export type ManagementStyle = "managed" | "self-directed";

export interface MaskedId {
  maskedId: string;
  shortId: string;
}

/** Deterministic and one-way. The account number never reaches the datastore. */
export function maskAccountNo(accountNo: string): MaskedId {
  const digest = createHash("sha256").update(accountNo).digest("hex");
  return { maskedId: `acct_${digest.slice(0, 8)}`, shortId: digest.slice(0, 4) };
}

export function redactText(text: string, names: readonly string[]): string {
  let out = text;
  for (const name of names) {
    if (!name) continue;
    out = out.replace(new RegExp(name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi"), "[redacted]");
  }
  return out;
}

/**
 * Order is load-bearing. Spousal must precede RRSP, and both "Tax-Free Savings"
 * and "First Home Savings" must precede anything matching "Cash", because
 * "Tax-Free Savings Managed Cash Account" is a TFSA and "First Home Savings SDI
 * Cash Account" is an FHSA. "Tax-Free Savings Account" carries no TFSA token at
 * all, which is why the long-form names are listed first.
 */
const KIND_RULES: readonly (readonly [RegExp, AccountKind])[] = [
  [/Spousal RRSP/i, "SpousalRRSP"],
  [/Tax-Free Savings/i, "TFSA"],
  [/First Home Savings/i, "FHSA"],
  [/\bTFSA\b/i, "TFSA"],
  [/\bFHSA\b/i, "FHSA"],
  [/\bRESP\b/i, "RESP"],
  [/\bRRSP\b/i, "RRSP"],
  [/Non-Registered/i, "NonRegistered"],
  [/\bCrypto\b/i, "Crypto"],
  [/\bChequing\b/i, "Chequing"],
];

export function classifyAccountType(accountType: string): {
  kind: AccountKind;
  style: ManagementStyle;
} {
  const style: ManagementStyle = /\bManaged\b/i.test(accountType) ? "managed" : "self-directed";
  for (const [pattern, kind] of KIND_RULES) {
    if (pattern.test(accountType)) return { kind, style };
  }
  throw new Error(`unrecognised account type: ${JSON.stringify(accountType)}`);
}
