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
  test("offers every year it is given, in the order it is given, newest last", () => {
    renderSelect();
    // By accessible name and DOM position, so a reversed list fails rather
    // than passing on mere presence. Radix prints each label twice, the second
    // copy aria-hidden, which is why textContent is not what is compared.
    const radios = screen.getAllByRole("radio");
    const positions = ["2023", "2024", "2025", "2026"].map((year) =>
      radios.indexOf(screen.getByRole("radio", { name: year })),
    );
    expect(positions).toEqual([0, 1, 2, 3]);
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
