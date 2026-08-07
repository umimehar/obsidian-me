import { afterEach, describe, expect, test } from "bun:test";
import { fireEvent, render, screen } from "@testing-library/react";
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

function expectNoSkippedLevel() {
  const levels = headingLevels();
  expect(levels.length).toBeGreaterThan(0);
  let previous = levels[0] ?? 0;
  for (const level of levels) {
    expect(level - previous).toBeLessThanOrEqual(1);
    previous = level;
  }
}

/**
 * Radix's TabsTrigger renders its label twice -- once visible, once hidden
 * at bold weight, so the visible width never shifts on select -- which
 * doubles the accessible name. Matching a prefix sidesteps that
 * implementation detail. Activation is on pointerdown, not click, so the
 * mousedown event is what a real pointer press sends.
 */
function clickTab(name: string) {
  fireEvent.mouseDown(screen.getByRole("tab", { name: new RegExp(`^${name}\\b`) }), { button: 0 });
}

afterEach(() => {
  window.location.hash = "";
});

describe("App accessibility", () => {
  test("has exactly one h1, and it names the page", () => {
    render(<App />);
    const h1s = document.querySelectorAll("h1");
    expect(h1s.length).toBe(1);
    expect(h1s[0]?.textContent).toBe("Investments");
  });

  test("never skips a heading level on the way down, on any tab", () => {
    // A Radix Tabs.Content that is not selected renders no children at all
    // (see Tabs.tsx), so headingLevels() only ever sees the active panel.
    // Checking every tab is the only way to cover all six.
    render(<App />);
    expectNoSkippedLevel();

    for (const label of ["Growth", "Wrappers", "Tax", "Projections", "Reconciliation"]) {
      clickTab(label);
      expectNoSkippedLevel();
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
      ...screen.getAllByRole("tab"),
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

  test("every progressbar left in the tree is named", () => {
    // The control sweep above covers buttons, radios and summaries only, which
    // is how a set of unnamed bars once went unnoticed. A bar is either
    // decorative and hidden, or exposed and named. Never exposed and anonymous.
    // Room bars live on the wrappers tab, which is not the default panel.
    render(<App />);
    clickTab("Wrappers");
    const bars = [...document.querySelectorAll('[role="progressbar"]')];
    expect(bars.length).toBeGreaterThan(0);
    const exposed = bars.filter((bar) => bar.getAttribute("aria-hidden") !== "true");
    expect(exposed.length).toBeGreaterThan(0);
    for (const bar of exposed) {
      expect(accessibleName(bar)).not.toBe("");
    }
  });

  test("every graphic is named, since a chart has no text a reader can fall back to", () => {
    // The same sweep, for the role that replaced the Overview's bars. An
    // unnamed role="img" announces as "image" and says nothing at all.
    // The portfolio chart is above the tabs and the group sparklines are on
    // the default overview tab, so no tab switch is needed here.
    render(<App />);
    const graphics = [...document.querySelectorAll('[role="img"]')];
    // One portfolio chart plus one per group card in the default lens.
    expect(graphics.length).toBeGreaterThan(5);
    for (const graphic of graphics) {
      expect(accessibleName(graphic)).not.toBe("");
    }
  });

  test("both segmented controls say what they group by", () => {
    // The lens toggle is on the default overview tab; the tax year control
    // moved to the wrappers and tax tabs.
    render(<App />);
    expect(screen.getByRole("radiogroup", { name: "Group accounts by" })).toBeDefined();

    clickTab("Wrappers");
    expect(screen.getByRole("radiogroup", { name: "Tax year" })).toBeDefined();
  });

  test("the theme toggle is a real button that says which way it switches", () => {
    render(<App />);
    expect(screen.getByRole("button", { name: /switch to (dark|light)/i })).toBeDefined();
  });

  test("every soft badge is high contrast, on every tab that draws one", () => {
    // Measured in Chrome, not here: at Radix's default soft weight the amber
    // badge resolved to 4.25:1 and the jade badge to 4.28:1 against their own
    // backgrounds in the light theme, both under the 4.5:1 AA floor for 12px
    // text. `highContrast` moves the label to the accent's step 12.
    //
    // happy-dom resolves no stylesheet, so the ratio itself is not computable
    // here and this asserts the class that carries it instead. It is a proxy,
    // and it fails if the prop is dropped, which is the regression.
    render(<App />);
    const sweep = () => {
      const badges = [...document.querySelectorAll(".rt-Badge.rt-variant-soft")];
      for (const badge of badges) {
        expect(badge.className).toContain("rt-high-contrast");
      }
      return badges.length;
    };
    let seen = sweep();
    for (const label of ["Growth", "Wrappers", "Reconciliation"]) {
      clickTab(label);
      seen += sweep();
    }
    expect(seen).toBeGreaterThan(0);
  });

  test("the finding groups are native disclosures, so they are keyboard reachable", () => {
    render(<App />);
    clickTab("Reconciliation");
    const groups = document.querySelectorAll("details[data-finding-group]");
    expect(groups.length).toBeGreaterThan(0);
    for (const group of groups) {
      expect(group.querySelector("summary")).not.toBeNull();
    }
  });
});
