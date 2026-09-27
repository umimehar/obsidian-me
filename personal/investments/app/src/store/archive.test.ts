import { describe, expect, test } from "bun:test";
import type { Statement } from "../types";
import { archivedStatements, mergeIntoArchive, toArchived } from "./archive";
import { maskAccountNo } from "./mask";

function statement(
  accountNo: string,
  period: string,
  version = 0,
  template: Statement["source"]["template"] = "BROKERAGE",
): Statement {
  return {
    source: {
      file: `${accountNo}_${period}_${template}.pdf`,
      accountNo,
      period,
      version,
      template,
    },
    accountType: "Managed TFSA Account",
    periodStart: `${period}-01`,
    periodEnd: `${period}-28`,
    portfolio: {
      cashMarketValue: 0,
      cashBookCost: 0,
      classes: [],
      totalMarketValue: 0,
      totalBookCost: 0,
    },
    cash: [],
    holdings: [],
    activity: [],
    contributions: { yearToDate: 0, first60Days: null, restOfYear: null },
    dividendsYearToDate: null,
    fxRate: null,
    returns: null,
    balances: null,
  };
}

describe("toArchived", () => {
  test("masks the account number and the filename, and redacts activity descriptions", () => {
    const raw = statement("ACCT0001CAD", "2026-07");
    raw.activity = [
      {
        date: "2026-07-02",
        postedDate: null,
        code: "CONT",
        description: "Contribution from Jane Doe",
        debit: 0,
        credit: 500,
        balance: 500,
        currency: "CAD",
      },
    ];
    const archived = toArchived(raw, ["Jane Doe"]);
    const { maskedId, shortId } = maskAccountNo("ACCT0001CAD");
    expect(archived.source.accountNo).toBe(maskedId);
    expect(archived.source.file).toBe(`${shortId}_2026-07_BROKERAGE.pdf`);
    expect(archived.activity[0]?.description).toBe("Contribution from [redacted]");
    expect(archived.source.file).not.toContain("ACCT0001CAD");
  });

  test("is idempotent, so re-archiving an archived statement changes nothing", () => {
    // The merge holds archived and freshly parsed statements side by side, so
    // a second pass over an already-archived one has to be a no-op or every
    // carried month would drift under a second masked id.
    const once = toArchived(statement("ACCT0001CAD", "2026-07"), []);
    expect(toArchived(once, [])).toEqual(once);
  });
});

describe("mergeIntoArchive", () => {
  const archived = [
    toArchived(statement("ACCT0001CAD", "2026-05"), []),
    toArchived(statement("ACCT0001CAD", "2026-06"), []),
  ];

  test("carries every archived statement the source folder no longer holds a PDF for", () => {
    const parsed = [toArchived(statement("ACCT0001CAD", "2026-07"), [])];
    const merged = mergeIntoArchive(archived, parsed);
    expect(merged.map((s) => s.source.period)).toEqual(["2026-05", "2026-06", "2026-07"]);
  });

  test("a freshly parsed statement replaces its archived twin rather than duplicating it", () => {
    const base = statement("ACCT0001CAD", "2026-06");
    base.accountType = "Managed RRSP Account";
    const reparsed = toArchived(base, []);
    const merged = mergeIntoArchive(archived, [reparsed]);
    expect(merged).toHaveLength(2);
    // The document outranks the archive: the archive is a cache of parsing,
    // never a record that survives a re-import of the same month.
    expect(merged.find((s) => s.source.period === "2026-06")?.accountType).toBe(
      "Managed RRSP Account",
    );
  });

  test("an amended version lands beside the original, not on top of it", () => {
    // `dedupeToLatestVersion` is what picks between them, and `checkSupersession`
    // is what reports the drop. Overwriting here would leave both with nothing
    // to compare.
    const amended = toArchived(statement("ACCT0001CAD", "2026-06", 1), []);
    const merged = mergeIntoArchive(archived, [amended]);
    expect(merged.filter((s) => s.source.period === "2026-06")).toHaveLength(2);
    expect(
      merged.filter((s) => s.source.period === "2026-06").map((s) => s.source.version),
    ).toEqual([0, 1]);
  });

  test("the same inputs in any order write the same file", () => {
    const parsed = [
      toArchived(statement("ACCT0002CAD", "2026-07"), []),
      toArchived(statement("ACCT0001CAD", "2026-07"), []),
    ];
    const forward = mergeIntoArchive(archived, parsed);
    const reversed = mergeIntoArchive([...archived].reverse(), [...parsed].reverse());
    expect(forward).toEqual(reversed);
  });

  test("an empty archive is just the parsed statements, so a first run needs no special case", () => {
    const parsed = [toArchived(statement("ACCT0001CAD", "2026-07"), [])];
    expect(mergeIntoArchive([], parsed)).toEqual(parsed);
  });
});

describe("archivedStatements", () => {
  test("a missing or empty datastore is an empty archive, not an error", () => {
    expect(archivedStatements(undefined)).toEqual([]);
    expect(archivedStatements(null)).toEqual([]);
    expect(archivedStatements({})).toEqual([]);
  });

  test("reads the statements a real datastore carries", () => {
    const statements = [toArchived(statement("ACCT0001CAD", "2026-07"), [])];
    expect(archivedStatements({ statements })).toEqual(statements);
  });

  test("refuses an UNMASKED statement rather than merging a raw account number", () => {
    // The archive is committed to the vault. A raw account number reaching it
    // is the leak this whole pipeline is built to prevent, so it stops the
    // build instead of being masked on the way past.
    expect(() => archivedStatements({ statements: [statement("ACCT0001CAD", "2026-07")] })).toThrow(
      /unmasked or malformed/,
    );
  });

  test("refuses a malformed datastore rather than silently rebuilding from whatever PDFs exist", () => {
    // Falling back to an empty archive here would delete every month whose
    // PDF is no longer on disk -- exactly the loss the archive prevents.
    expect(() => archivedStatements("not an object")).toThrow(/not an object/);
    expect(() => archivedStatements({ statements: "nope" })).toThrow(/statements array/);
  });
});
