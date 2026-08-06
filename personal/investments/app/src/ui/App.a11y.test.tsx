import { describe, expect, test } from "bun:test";
import { render, screen } from "@testing-library/react";
import { App } from "./App";

/**
 * The accessible name of an element, following the accname order: an
 * `aria-labelledby` reference first, then a non-blank `aria-label`, then the
 * element's own text. Visible text alone is the wrong answer in both
 * directions: an icon-only button labelled by `aria-label` has a name and no
 * text, and text can be overridden by a label that says something else.
 *
 * A blank `aria-label` falls through to the contents rather than blanking the
 * name, which is what the spec says and what browsers do.
 */
function accessibleName(element: Element): string {
  const labelledBy = element.getAttribute("aria-labelledby");
  if (labelledBy !== null) {
    const referenced = labelledBy
      .split(/\s+/)
      .map((id) => document.getElementById(id)?.textContent ?? "")
      .join(" ")
      .trim();
    if (referenced !== "") return referenced;
  }
  const label = element.getAttribute("aria-label")?.trim() ?? "";
  if (label !== "") return label;
  return (element.textContent ?? "").trim();
}

function byId(id: string): Element {
  const node = document.getElementById(id);
  if (node === null) throw new Error(`expected #${id} in the fixture`);
  return node;
}

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
      expect(accessibleName(control)).not.toBe("");
    }
  });

  test("the name check reads labels, not just visible text", () => {
    // Pins accessibleName itself. Asserting textContent would call an
    // icon-only button with an aria-label unnamed, and a control labelled
    // aria-label="" named, which is the wrong answer in both directions.
    document.body.innerHTML = `
      <button id="icon" aria-label="Close"></button>
      <button id="overridden" aria-label="Close the dialog">x</button>
      <button id="blank-label" aria-label="">Delete</button>
      <span id="ref">Save changes</span>
      <button id="referenced" aria-labelledby="ref">x</button>
      <button id="plain">Submit</button>
      <button id="unnamed"></button>`;
    const named = (id: string) => accessibleName(byId(id));
    expect(named("icon")).toBe("Close");
    expect(named("overridden")).toBe("Close the dialog");
    // Per accname, a blank aria-label is skipped rather than blanking the name.
    expect(named("blank-label")).toBe("Delete");
    expect(named("referenced")).toBe("Save changes");
    expect(named("plain")).toBe("Submit");
    expect(named("unnamed")).toBe("");
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
