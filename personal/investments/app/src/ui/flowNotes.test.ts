import { describe, expect, test } from "bun:test";
import type { FlowSummary } from "../analytics/flows/summary";
import { buildFlowNotes } from "./flowNotes";

function summary(overrides: Partial<FlowSummary> = {}): FlowSummary {
  return {
    paidIn: 0,
    paidInBySource: { payroll: 0, outsideBank: 0, interacIn: 0, business: 0 },
    contributionsByKind: {},
    grants: 0,
    income: 0,
    invested: 0,
    cashEquivalentNet: 0,
    cashChange: 0,
    leftInCash: 0,
    costs: 0,
    left: 0,
    investedRate: null,
    unpairedLegs: 0,
    laggedPairs: 0,
    residual: 0,
    unlistedSymbols: [],
    ...overrides,
  };
}

describe("buildFlowNotes", () => {
  test("an unremarkable period has no notes at all", () => {
    expect(buildFlowNotes(summary(), 0)).toEqual([]);
  });

  test("unpaired legs, singular and plural", () => {
    expect(buildFlowNotes(summary({ unpairedLegs: 1 }), 0)).toEqual(["1 transfer leg not paired."]);
    expect(buildFlowNotes(summary({ unpairedLegs: 3 }), 0)).toEqual([
      "3 transfer legs not paired.",
    ]);
  });

  test("lagged pairs, singular and plural", () => {
    expect(buildFlowNotes(summary({ laggedPairs: 1 }), 0)).toEqual([
      "1 pair matched a day or more apart.",
    ]);
    expect(buildFlowNotes(summary({ laggedPairs: 2 }), 0)).toEqual([
      "2 pairs matched a day or more apart.",
    ]);
  });

  test("in kind transfers, singular and plural", () => {
    expect(buildFlowNotes(summary(), 1)).toEqual([
      "1 in kind transfer has no cash value on the statement.",
    ]);
    expect(buildFlowNotes(summary(), 4)).toEqual([
      "4 in kind transfers have no cash value on the statement.",
    ]);
  });

  test("unlisted symbols are named", () => {
    expect(buildFlowNotes(summary({ unlistedSymbols: ["ABCD", "XYZ"] }), 0)).toEqual([
      "Counted as equities, not listed in the asset class table: ABCD, XYZ.",
    ]);
  });

  test("the FX caveat shows only when the period carries a stated cost", () => {
    expect(buildFlowNotes(summary({ costs: 0 }), 0)).toEqual([]);
    expect(buildFlowNotes(summary({ costs: 12.34 }), 0)).toEqual([
      "FX conversion spread is not stated in the statements; costs include only stated fees and withholding.",
    ]);
  });

  test("every line appears together, in a fixed order", () => {
    const notes = buildFlowNotes(
      summary({ unpairedLegs: 2, laggedPairs: 1, unlistedSymbols: ["ABCD"], costs: 5 }),
      3,
    );
    expect(notes).toEqual([
      "2 transfer legs not paired.",
      "1 pair matched a day or more apart.",
      "3 in kind transfers have no cash value on the statement.",
      "Counted as equities, not listed in the asset class table: ABCD.",
      "FX conversion spread is not stated in the statements; costs include only stated fees and withholding.",
    ]);
  });
});
