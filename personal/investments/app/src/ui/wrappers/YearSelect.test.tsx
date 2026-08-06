import { describe, expect, test } from "bun:test";
import { Theme } from "@radix-ui/themes";
import { fireEvent, render, screen } from "@testing-library/react";
import { YearSelect } from "./YearSelect";

function renderSelect(onYearChange: (year: number) => void = () => {}) {
  render(
    <Theme>
      <YearSelect years={[2023, 2024, 2025, 2026]} year={2026} onYearChange={onYearChange} />
    </Theme>,
  );
}

describe("YearSelect", () => {
  test("offers every year it is given, newest last", () => {
    renderSelect();
    for (const year of ["2023", "2024", "2025", "2026"]) {
      expect(screen.getByRole("radio", { name: year })).toBeDefined();
    }
  });

  test("reports the picked year back as a number", () => {
    const picked: number[] = [];
    renderSelect((year) => picked.push(year));
    fireEvent.click(screen.getByRole("radio", { name: "2024" }));
    expect(picked).toEqual([2024]);
  });

  test("is labelled, so the control is reachable without sighted context", () => {
    renderSelect();
    expect(screen.getByRole("radiogroup", { name: /tax year/i })).toBeDefined();
  });
});
