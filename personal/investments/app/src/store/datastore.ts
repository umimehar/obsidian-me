import type { Statement } from "../types";
import { maskAccountNo, redactText } from "./mask";
import type { AccountRecord } from "./registry";

export interface Datastore {
  meta: { generated: string; statementCount: number; accountCount: number };
  accounts: AccountRecord[];
  statements: Statement[];
}

/**
 * The only place a raw account number is read on the way out. Nothing this
 * returns contains one, including inside `source.file`.
 */
export function buildDatastore(
  statements: readonly Statement[],
  accounts: readonly AccountRecord[],
  names: readonly string[],
  generated: string,
): Datastore {
  const masked = statements.map((s) => {
    const { maskedId, shortId } = maskAccountNo(s.source.accountNo);
    return {
      ...s,
      source: {
        ...s.source,
        accountNo: maskedId,
        file: s.source.file.replace(/^[A-Z0-9]+_/, `${shortId}_`),
      },
      activity: s.activity.map((r) => ({ ...r, description: redactText(r.description, names) })),
    };
  });

  return {
    meta: { generated, statementCount: masked.length, accountCount: accounts.length },
    accounts: [...accounts],
    statements: masked,
  };
}
