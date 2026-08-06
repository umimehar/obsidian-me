import { describe, expect, test } from "bun:test";
import { render, screen } from "@testing-library/react";
import { App } from "./App";

function headingLevels(): number[] {
  return [...document.querySelectorAll("h1, h2, h3, h4, h5, h6")].map((node) =>
    Number(node.tagName.slice(1)),
  );
}

describe("App accessibility", () => {
  test("has exactly one h1, and it names the page", () => {
    render(<App />);
    const h1s = document.querySelectorAll("h1");
    expect(h1s.length).toBe(1);
    expect(h1s[0]?.textContent).toBe("Investments");
  });

  test("never skips a heading level on the way down", () => {
    render(<App />);
    const levels = headingLevels();
    expect(levels.length).toBeGreaterThan(5);
    let previous = levels[0] ?? 0;
    for (const level of levels) {
      expect(level - previous).toBeLessThanOrEqual(1);
      previous = level;
    }
  });

  test("the headline figure is not itself a heading", () => {
    render(<App />);
    expect(screen.queryByRole("heading", { name: "$241,739.67" })).toBeNull();
    expect(screen.getByRole("heading", { name: /portfolio total as of 2026-06/i })).toBeDefined();
  });

  test("every interactive control has an accessible name", () => {
    render(<App />);
    const controls = [
      ...screen.getAllByRole("button"),
      ...screen.getAllByRole("radio"),
      ...document.querySelectorAll("summary"),
    ];
    expect(controls.length).toBeGreaterThan(5);
    for (const control of controls) {
      expect((control.textContent ?? "").trim().length).toBeGreaterThan(0);
    }
  });

  test("both segmented controls say what they group by", () => {
    render(<App />);
    expect(screen.getByRole("radiogroup", { name: "Group accounts by" })).toBeDefined();
    expect(screen.getByRole("radiogroup", { name: "Tax year" })).toBeDefined();
  });

  test("the theme toggle is a real button that says which way it switches", () => {
    render(<App />);
    expect(screen.getByRole("button", { name: /switch to (dark|light)/i })).toBeDefined();
  });

  test("the finding groups are native disclosures, so they are keyboard reachable", () => {
    render(<App />);
    const groups = document.querySelectorAll("details[data-finding-group]");
    expect(groups.length).toBeGreaterThan(0);
    for (const group of groups) {
      expect(group.querySelector("summary")).not.toBeNull();
    }
  });
});
