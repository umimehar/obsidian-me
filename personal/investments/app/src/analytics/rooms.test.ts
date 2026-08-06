import { describe, expect, test } from "bun:test";
import type { AccountKind, ManagementStyle } from "../store/mask";
import type { ActivityRow, Statement } from "../types";
import { buildRoomLines } from "./rooms";
import type { AccountSeries } from "./types";

function series(overrides: Partial<AccountSeries> = {}): AccountSeries {
  return {
    maskedId: "acct_0001",
    shortId: "0001",
    label: "TFSA 0001",
    kind: "TFSA",
    style: "self-directed" as ManagementStyle,
    purpose: "unassigned",
    inTotals: true,
    months: [],
    contributionsByYear: {},
    ...overrides,
  };
}

function src(
  accountNo: string,
  period: string,
  template: "BROKERAGE" | "PERFORMANCE" = "BROKERAGE",
) {
  return {
    file: `${accountNo}_${period}_${template}.pdf`,
    accountNo,
    period,
    template,
    version: 0,
  };
}

function activityRow(code: string, credit: number): ActivityRow {
  return {
    date: "2026-01-15",
    postedDate: null,
    code,
    description: "",
    debit: 0,
    credit,
    balance: 0,
    currency: "CAD",
  };
}

function statement(over: Partial<Statement> = {}): Statement {
  return {
    source: src("acct_c2e9", "2026-02"),
    accountType: "Self-directed RESP Account",
    periodStart: "2026-02-01",
    periodEnd: "2026-02-28",
    portfolio: null,
    cash: [],
    holdings: [],
    activity: [],
    contributions: null,
    dividendsYearToDate: null,
    fxRate: null,
    returns: null,
    balances: null,
    ...over,
  };
}

describe("buildRoomLines", () => {
  test("assessed room overrides the generic annual maximum for the year it covers", () => {
    const rrsp = series({
      maskedId: "acct_rrsp",
      kind: "RRSP" as AccountKind,
      contributionsByYear: { "2026": 19400 },
    });
    const spousal = series({
      maskedId: "acct_spousal",
      kind: "SpousalRRSP" as AccountKind,
      contributionsByYear: { "2026": 13600 },
    });
    const lines = buildRoomLines([rrsp, spousal], [], 2026);
    const line = lines.find((l) => l.group === "RRSP");
    expect(line?.assessed).toBe(true);
    expect(line?.limit).toBe(70752);
    expect(line?.used).toBe(33000);
    expect(line?.remaining).toBe(37752);
    expect(line?.spousalUsed).toBe(13600);
  });

  test("the assessed figure does not leak into an adjacent year", () => {
    const rrsp = series({
      kind: "RRSP" as AccountKind,
      contributionsByYear: { "2025": 14000, "2026": 19400 },
    });
    const lines2025 = buildRoomLines([rrsp], [], 2025);
    const lines2026 = buildRoomLines([rrsp], [], 2026);

    const line2025 = lines2025.find((l) => l.group === "RRSP");
    const line2026 = lines2026.find((l) => l.group === "RRSP");

    expect(line2025?.assessed).toBe(false);
    expect(line2025?.limit).toBe(32490);
    expect(line2026?.assessed).toBe(true);
    expect(line2026?.limit).toBe(70752);
  });

  test("falls back to the generic annual maximum when no assessed figure exists", () => {
    const tfsa = series({ kind: "TFSA" as AccountKind, contributionsByYear: { "2026": 7000 } });
    const lines = buildRoomLines([tfsa], [], 2026);
    const line = lines.find((l) => l.group === "TFSA");
    expect(line?.assessed).toBe(false);
    expect(line?.limit).toBe(7000);
  });

  test("no OVER flag: remaining is null (not a negative or clamped number) against a generic maximum", () => {
    const tfsa = series({ kind: "TFSA" as AccountKind, contributionsByYear: { "2025": 21000 } });
    const lines = buildRoomLines([tfsa], [], 2025);
    const line = lines.find((l) => l.group === "TFSA");
    expect(line?.limit).toBe(7000);
    expect(line?.used).toBe(21000);
    expect(line?.remaining).toBeNull();
    expect(line).not.toHaveProperty("over");
  });

  test("remaining stays a real number against an assessed limit but goes null for RRSP in a year with no NOA", () => {
    const rrsp = series({
      kind: "RRSP" as AccountKind,
      contributionsByYear: { "2025": 14000, "2026": 33000 },
    });
    const lines2025 = buildRoomLines([rrsp], [], 2025);
    const lines2026 = buildRoomLines([rrsp], [], 2026);
    expect(lines2025.find((l) => l.group === "RRSP")?.remaining).toBeNull();
    expect(lines2026.find((l) => l.group === "RRSP")?.remaining).toBe(70752 - 33000);
  });

  test("FHSA's generic annual limit also carries a null remaining, same as TFSA and un-assessed RRSP", () => {
    const fhsa = series({ kind: "FHSA" as AccountKind, contributionsByYear: { "2026": 8000 } });
    const lines = buildRoomLines([fhsa], [], 2026);
    const line = lines.find((l) => l.group === "FHSA");
    expect(line?.assessed).toBe(false);
    expect(line?.remaining).toBeNull();
  });

  test("RESP grant received is summed from GRANT/CLB activity credits, never assumed from contributions", () => {
    const resp = series({
      maskedId: "acct_c2e9",
      kind: "RESP" as AccountKind,
      contributionsByYear: { "2026": 3000 },
    });
    const statements: Statement[] = [
      statement({
        source: src("acct_c2e9", "2026-02"),
        activity: [activityRow("GRANT", 500)],
      }),
      statement({
        source: src("acct_c2e9", "2026-04"),
        activity: [activityRow("GRANT", 10)],
      }),
      statement({
        source: src("acct_c2e9", "2026-06"),
        activity: [activityRow("CLB", 40)],
      }),
    ];
    const lines = buildRoomLines([resp], statements, 2026);
    const line = lines.find((l) => l.group === "RESP");
    expect(line?.lifetimeGrant?.received).toBe(550);
    expect(line?.lifetimeGrant?.remaining).toBe(7200 - 550);
  });

  test("a PERFORMANCE statement's activity is not double-counted into the grant total", () => {
    const resp = series({ maskedId: "acct_c2e9", kind: "RESP" as AccountKind });
    const statements: Statement[] = [
      statement({
        source: src("acct_c2e9", "2026-02", "BROKERAGE"),
        activity: [activityRow("GRANT", 500)],
      }),
      statement({
        source: src("acct_c2e9", "2026-02", "PERFORMANCE"),
        activity: [activityRow("GRANT", 500)],
      }),
    ];
    const lines = buildRoomLines([resp], statements, 2026);
    const line = lines.find((l) => l.group === "RESP");
    expect(line?.lifetimeGrant?.received).toBe(500);
  });

  test("RESP's lifetime contribution cap and lifetime grant cap are distinct bounds", () => {
    const resp = series({
      maskedId: "acct_c2e9",
      kind: "RESP" as AccountKind,
      contributionsByYear: { "2026": 3000 },
    });
    const statements: Statement[] = [
      statement({ source: src("acct_c2e9", "2026-02"), activity: [activityRow("GRANT", 550)] }),
    ];
    const lines = buildRoomLines([resp], statements, 2026);
    const line = lines.find((l) => l.group === "RESP");
    expect(line?.lifetimeContributions?.cap).toBe(50000);
    expect(line?.lifetimeContributions?.contributed).toBe(3000);
    expect(line?.lifetimeGrant?.cap).toBe(7200);
    expect(line?.lifetimeGrant?.received).toBe(550);
  });

  test("RESP has no annual contribution limit -- the $2,500 CESG figure is not reported as one", () => {
    const resp = series({
      maskedId: "acct_c2e9",
      kind: "RESP" as AccountKind,
      contributionsByYear: { "2026": 3000 },
    });
    const lines = buildRoomLines([resp], [], 2026);
    const line = lines.find((l) => l.group === "RESP");
    expect(line?.used).toBe(3000);
    expect(line?.limit).toBeNull();
    expect(line?.assessed).toBe(false);
    expect(line?.remaining).toBeNull();
    expect(line).not.toHaveProperty("over");
  });

  test("the $2,500 grant-maximizing contribution is reported on the grant line, not as an annual cap", () => {
    const resp = series({ maskedId: "acct_c2e9", kind: "RESP" as AccountKind });
    const statements: Statement[] = [
      statement({ source: src("acct_c2e9", "2026-02"), activity: [activityRow("GRANT", 550)] }),
    ];
    const lines = buildRoomLines([resp], statements, 2026);
    const line = lines.find((l) => l.group === "RESP");
    expect(line?.lifetimeGrant?.maximizingContribution).toBe(2500);
    expect(line?.lifetimeGrant?.received).toBe(550);
    expect(line?.lifetimeGrant?.cap).toBe(7200);
  });

  test("lifetime contribution position accumulates across years, bounded by the reporting year", () => {
    const fhsa = series({
      kind: "FHSA" as AccountKind,
      contributionsByYear: { "2024": 8000, "2025": 8000, "2026": 8000 },
    });
    const lines2025 = buildRoomLines([fhsa], [], 2025);
    const lines2026 = buildRoomLines([fhsa], [], 2026);
    expect(lines2025.find((l) => l.group === "FHSA")?.lifetimeContributions?.contributed).toBe(
      16000,
    );
    expect(lines2026.find((l) => l.group === "FHSA")?.lifetimeContributions?.contributed).toBe(
      24000,
    );
    expect(lines2026.find((l) => l.group === "FHSA")?.lifetimeContributions?.remaining).toBe(16000);
  });

  test("TFSA and RRSP carry no lifetime position; FHSA and RESP carry no spousal slice", () => {
    const tfsa = series({ kind: "TFSA" as AccountKind, contributionsByYear: { "2026": 7000 } });
    const rrsp = series({ kind: "RRSP" as AccountKind, contributionsByYear: { "2026": 10000 } });
    const fhsa = series({ kind: "FHSA" as AccountKind, contributionsByYear: { "2026": 8000 } });
    const resp = series({ kind: "RESP" as AccountKind, contributionsByYear: { "2026": 3000 } });
    const lines = buildRoomLines([tfsa, rrsp, fhsa, resp], [], 2026);

    expect(lines.find((l) => l.group === "TFSA")?.lifetimeContributions).toBeNull();
    expect(lines.find((l) => l.group === "RRSP")?.lifetimeContributions).toBeNull();
    expect(lines.find((l) => l.group === "FHSA")?.spousalUsed).toBeNull();
    expect(lines.find((l) => l.group === "RESP")?.spousalUsed).toBeNull();
    expect(lines.find((l) => l.group === "FHSA")?.lifetimeGrant).toBeNull();
    expect(lines.find((l) => l.group === "TFSA")?.lifetimeGrant).toBeNull();
  });

  test("a group with no accounts in the series is absent, not reported at zero", () => {
    const tfsa = series({ kind: "TFSA" as AccountKind, contributionsByYear: { "2026": 7000 } });
    const lines = buildRoomLines([tfsa], [], 2026);
    expect(lines).toHaveLength(1);
    expect(lines.find((l) => l.group === "RRSP")).toBeUndefined();
  });

  test("throws rather than silently reporting zero for a year outside both limit tables", () => {
    const tfsa = series({ kind: "TFSA" as AccountKind, contributionsByYear: { "2019": 100 } });
    expect(() => buildRoomLines([tfsa], [], 2019)).toThrow();
  });
});
