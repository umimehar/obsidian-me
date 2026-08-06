import { createHash } from "node:crypto";

export type AccountKind =
  | "TFSA"
  | "FHSA"
  | "RRSP"
  | "SpousalRRSP"
  | "RESP"
  | "NonRegistered"
  | "Crypto"
  | "Chequing"
  | "Corporate";

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

/**
 * Longest name first, regardless of caller order: matching "Jane" before
 * "Jane Doe" would consume the short match and leave "Doe" exposed in the
 * output. Sorting here makes the guarantee a property of the function, not
 * of how the caller happens to order its name list.
 *
 * A single alternation regex, replaced in one pass, rather than one
 * `.replace()` call per name: a multi-pass loop re-scans the *output* of
 * every earlier replacement, so a configured name that happened to be a
 * substring of the literal placeholder "[redacted]" would re-match inside
 * text this same call had just written, corrupting it. One pass never reads
 * back its own output.
 */
export function redactText(text: string, names: readonly string[]): string {
  const byDescendingLength = [...names].filter(Boolean).sort((a, b) => b.length - a.length);
  if (byDescendingLength.length === 0) return text;

  const alternation = byDescendingLength
    .map((name) => name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join("|");
  return text.replace(new RegExp(alternation, "gi"), "[redacted]");
}

/**
 * The one live ordering dependency today is Spousal RRSP before plain RRSP:
 * "Managed Spousal RRSP Account" would otherwise match the RRSP rule first.
 * The long-form "Tax-Free Savings" / "First Home Savings" rules are listed
 * ahead of the bare TFSA/FHSA token rules as a forward-looking guard, since a
 * future generic "Cash" rule could otherwise shadow them — no such rule
 * exists today, so that guard isn't yet load-bearing.
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
