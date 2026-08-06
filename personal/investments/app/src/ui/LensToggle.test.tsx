import { describe, expect, mock, test } from "bun:test";
import { Theme } from "@radix-ui/themes";
import { fireEvent, render, screen } from "@testing-library/react";
import type { Lens } from "../analytics/rollup";
import { LensToggle } from "./LensToggle";

function renderToggle(lens: Lens, onLensChange: (lens: Lens) => void) {
  return render(
    <Theme>
      <LensToggle lens={lens} onLensChange={onLensChange} />
    </Theme>,
  );
}

describe("LensToggle", () => {
  test("renders one option per lens, labelled for grouping", () => {
    renderToggle("registration", () => {});
    expect(screen.getByRole("radio", { name: /registration/i })).toBeDefined();
    expect(screen.getByRole("radio", { name: /account/i })).toBeDefined();
    expect(screen.getByRole("radio", { name: /purpose/i })).toBeDefined();
  });

  test("marks the current lens as checked", () => {
    renderToggle("purpose", () => {});
    expect(screen.getByRole("radio", { name: /purpose/i }).getAttribute("aria-checked")).toBe(
      "true",
    );
    expect(screen.getByRole("radio", { name: /registration/i }).getAttribute("aria-checked")).toBe(
      "false",
    );
  });

  test.each([
    ["account", /account/i],
    ["purpose", /purpose/i],
    ["registration", /registration/i],
  ] as const)("clicking %s calls onLensChange with %s", (expectedLens, namePattern) => {
    const onLensChange = mock((_lens: Lens) => {});
    // Start on a lens that is never the one under test, so the click is a real change.
    const startingLens: Lens = expectedLens === "account" ? "purpose" : "account";
    renderToggle(startingLens, onLensChange);

    fireEvent.click(screen.getByRole("radio", { name: namePattern }));

    expect(onLensChange).toHaveBeenCalledWith(expectedLens);
  });
});
