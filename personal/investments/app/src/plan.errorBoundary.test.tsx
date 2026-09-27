import { describe, expect, spyOn, test } from "bun:test";
import { Theme } from "@radix-ui/themes";
import { render, screen } from "@testing-library/react";
import { parsePlan } from "./plan";
import { ErrorBoundary } from "./ui/states/ErrorBoundary";

/** A stale plan.json missing a field a real one always carries: the case this test exists to catch. */
const STALE_PLAN = { birthYear: 1997, retirementAge: 60, withdrawalRate: 0.04, goals: [] };

function ThrowsOnBadPlan() {
  parsePlan(STALE_PLAN);
  return null;
}

describe("a stale plan.json", () => {
  test("renders the ErrorBoundary's message naming the missing field, rather than crashing or defaulting", () => {
    const spy = spyOn(console, "error").mockImplementation(() => {});
    try {
      render(
        <Theme>
          <ErrorBoundary>
            <ThrowsOnBadPlan />
          </ErrorBoundary>
        </Theme>,
      );
    } finally {
      spy.mockRestore();
    }
    expect(screen.getByRole("alert")).toBeDefined();
    expect(screen.getByText(/plan\.json: inflation must be a number/)).toBeDefined();
  });
});
