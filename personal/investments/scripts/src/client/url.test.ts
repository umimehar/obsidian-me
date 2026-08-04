import { describe, expect, test } from "bun:test";
import type { FilterAccount, FilterState } from "./filter";
import { ALL_TIME } from "./filter";
import { decodeScope, encodeScope } from "./url";

const ACCOUNTS: FilterAccount[] = [
  { id: "acct_aaaa1111", kind: "TFSA", name: "TFSA", short_id: "aaaa", currency: "CAD" },
  { id: "acct_bbbb2222", kind: "RRSP", name: "RRSP", short_id: "bbbb", currency: "CAD" },
  { id: "acct_cccc3333", kind: "FHSA", name: "FHSA", short_id: "cccc", currency: "CAD" },
];

function state(overrides: Partial<FilterState> = {}): FilterState {
  return { accts: null, time: ALL_TIME, ...overrides };
}

describe("encodeScope", () => {
  test("the default view produces a bare URL", () => {
    expect(encodeScope({ state: state(), period: null }, ACCOUNTS)).toBe("");
  });

  test("accounts are written as readable short_ids, not the masked hashes", () => {
    const s = state({ accts: ["acct_aaaa1111", "acct_cccc3333"] });
    expect(encodeScope({ state: s, period: null }, ACCOUNTS)).toBe("?accts=aaaa,cccc");
  });

  test("selecting every account is omitted, since it is the default", () => {
    const s = state({ accts: ACCOUNTS.map((a) => a.id) });
    expect(encodeScope({ state: s, period: null }, ACCOUNTS)).toBe("");
  });

  test("a preset is written, and all time is not", () => {
    const ytd = state({ time: { mode: "preset", preset: "ytd", from: "", to: "" } });
    expect(encodeScope({ state: ytd, period: null }, ACCOUNTS)).toBe("?t=ytd");
    expect(encodeScope({ state: state(), period: null }, ACCOUNTS)).toBe("");
  });

  test("a custom range is written as from/to and suppresses the preset", () => {
    const s = state({ time: { mode: "custom", preset: "all", from: "2024-02", to: "2025-06" } });
    expect(encodeScope({ state: s, period: null }, ACCOUNTS)).toBe("?from=2024-02&to=2025-06");
  });

  test("the drill-down period rides along with the rest of the scope", () => {
    const s = state({ accts: ["acct_bbbb2222"] });
    expect(encodeScope({ state: s, period: "2025-04" }, ACCOUNTS)).toBe(
      "?accts=bbbb&period=2025-04",
    );
  });
});

describe("decodeScope", () => {
  test("an empty query is the default scope", () => {
    expect(decodeScope("", ACCOUNTS)).toEqual({ state: state(), period: null });
  });

  test("round-trips a fully populated scope", () => {
    const s = state({
      accts: ["acct_aaaa1111", "acct_bbbb2222"],
      time: { mode: "custom", preset: "all", from: "2024-02", to: "2025-06" },
    });
    const scope = { state: s, period: "2024" };
    expect(decodeScope(encodeScope(scope, ACCOUNTS), ACCOUNTS)).toEqual(scope);
  });

  test("unknown short_ids are dropped and the rest still apply", () => {
    expect(decodeScope("?accts=aaaa,zzzz", ACCOUNTS).state.accts).toEqual(["acct_aaaa1111"]);
  });

  test("an all-unknown account list widens to every account rather than none", () => {
    expect(decodeScope("?accts=zzzz", ACCOUNTS).state.accts).toBeNull();
  });

  test("listing every account decodes to null, matching the filter's own default", () => {
    expect(decodeScope("?accts=aaaa,bbbb,cccc", ACCOUNTS).state.accts).toBeNull();
  });

  test("an unknown preset falls back to all time", () => {
    expect(decodeScope("?t=decade", ACCOUNTS).state.time).toEqual(ALL_TIME);
  });

  test("a half-specified or malformed range falls back rather than throwing", () => {
    expect(decodeScope("?from=2024-02", ACCOUNTS).state.time).toEqual(ALL_TIME);
    expect(decodeScope("?from=nope&to=2025-06", ACCOUNTS).state.time).toEqual(ALL_TIME);
  });

  test("an inverted range is rejected", () => {
    expect(decodeScope("?from=2025-06&to=2024-02", ACCOUNTS).state.time).toEqual(ALL_TIME);
  });

  test("a valid range wins over a preset when both are present", () => {
    const time = decodeScope("?t=ytd&from=2024-02&to=2025-06", ACCOUNTS).state.time;
    expect(time).toEqual({ mode: "custom", preset: "all", from: "2024-02", to: "2025-06" });
  });

  test("both period grains are accepted and anything else is dropped", () => {
    expect(decodeScope("?period=2025-04", ACCOUNTS).period).toBe("2025-04");
    expect(decodeScope("?period=2025", ACCOUNTS).period).toBe("2025");
    expect(decodeScope("?period=lastyear", ACCOUNTS).period).toBeNull();
    expect(decodeScope("?period=2025-04-01", ACCOUNTS).period).toBeNull();
  });
});
