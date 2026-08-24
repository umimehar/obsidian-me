import { describe, expect, test } from "bun:test";
import { Theme } from "@radix-ui/themes";
import { cleanup, render, screen, within } from "@testing-library/react";
import type { RoomLine } from "../../analytics/rooms";
import { RoomBar } from "./RoomBar";

/**
 * Hand-built lines, unlike the real-corpus tests in `RegisteredView.test.tsx`.
 * The corpus has exactly one assessed line and no over-limit line at all, so
 * the rules that must hold for shapes the corpus does not currently contain
 * (a negative assessed remaining above all) can only be pinned here.
 */
function line(overrides: Partial<RoomLine>): RoomLine {
  return {
    group: "TFSA",
    year: 2026,
    used: 7000,
    limit: 7000,
    assessed: false,
    remaining: null,
    spousalUsed: null,
    lifetimeContributions: null,
    lifetimeGrant: null,
    ...overrides,
  };
}

function renderBar(roomLine: RoomLine, source: "stated" | "derived" | null = "stated") {
  render(
    <Theme>
      <RoomBar line={roomLine} contributionsSource={source} />
    </Theme>,
  );
  const card = document.querySelector("[data-room-line]");
  if (card === null) throw new Error("expected a room line card to render");
  return within(card as HTMLElement);
}

/**
 * Every fill bar inside the rendered card. Counted through `data-share-bar`
 * rather than `role="progressbar"`, which is the whole point: the bar carries
 * no role any more, so a count keyed on the role would read zero whether the
 * bar is absent or present and could never fail again.
 */
function fillBars(): HTMLElement[] {
  const card = document.querySelector("[data-room-line]");
  if (card === null) throw new Error("expected a room line card to render");
  return [...card.querySelectorAll("[data-share-bar]")].filter(
    (node): node is HTMLElement => node instanceof HTMLElement,
  );
}

/** The one fill's width, as a number of percent. */
function fillPercent(): number {
  const bars = fillBars();
  const bar = bars[0];
  if (bars.length !== 1 || bar === undefined) {
    throw new Error(`expected exactly one fill bar, found ${bars.length}`);
  }
  const fill = bar.querySelector("[data-share-bar-fill]");
  if (!(fill instanceof HTMLElement)) throw new Error("expected a fill inside the room bar");
  return Number.parseFloat(fill.style.width);
}

describe("RoomBar", () => {
  test("a null-remaining line says carry-forward is not visible", () => {
    const bar = renderBar(line({}));
    expect(bar.getByText(/carry-forward not visible/i)).toBeDefined();
  });

  test("the generic annual maximum is the line's own limit, not a constant", () => {
    // Two different limits, because one would pass against a hardcoded figure.
    expect(renderBar(line({ limit: 7000 })).getByText(/\$7,000\.00 annual maximum/)).toBeDefined();
    cleanup();
    expect(renderBar(line({ limit: 8000 })).getByText(/\$8,000\.00 annual maximum/)).toBeDefined();
  });

  test("an assessed line names its own limit in the remaining sentence", () => {
    const bar = renderBar(line({ assessed: true, used: 33000, limit: 70752, remaining: 37752 }));
    expect(bar.getByText(/\$37,752\.00 remaining of \$70,752\.00\./)).toBeDefined();
  });

  test("a null-remaining line renders no bar fill percentage, even at used equal to limit", () => {
    renderBar(line({ used: 7000, limit: 7000 }));
    const card = document.querySelector("[data-room-line]");
    if (card === null) throw new Error("expected a room line card to render");
    expect(fillBars().length).toBe(0);
    expect(within(card as HTMLElement).queryByText(/%/)).toBeNull();
  });

  test("a null-remaining line never states a remaining figure of its own", () => {
    const bar = renderBar(line({ used: 7000, limit: 7000 }));
    expect(bar.queryByText(/\bremaining\b/i)).toBeNull();
    expect(bar.queryByText("$0.00")).toBeNull();
  });

  test("an over-full non-assessed line still says carry-forward is not visible, with no negative", () => {
    // The real 2025 TFSA shape: $21,000 used against a $7,000 annual maximum.
    const bar = renderBar(line({ year: 2025, used: 21000, limit: 7000 }));
    expect(bar.getByText(/carry-forward not visible/i)).toBeDefined();
    expect(bar.queryByText(/-\$/)).toBeNull();
    expect(bar.queryByText(/over/i)).toBeNull();
  });

  test("an assessed line shows the real remaining figure, labelled as assessed", () => {
    const bar = renderBar(
      line({ group: "RRSP", used: 33000, limit: 70752, assessed: true, remaining: 37752 }),
    );
    expect(bar.getByText(/notice of assessment/i)).toBeDefined();
    expect(bar.getByText(/\$37,752\.00 remaining/)).toBeDefined();
    expect(bar.queryByText(/carry-forward not visible/i)).toBeNull();
  });

  test("an assessed line does render a bar fill, because its remaining is real", () => {
    renderBar(line({ group: "RRSP", used: 33000, limit: 70752, assessed: true, remaining: 37752 }));
    expect(fillBars().length).toBe(1);
  });

  test("the fill announces nothing, so there is no percentage to round", () => {
    // Radix's Progress derived aria-valuetext from the value and rounded it to
    // whole percent, announcing "47%" for 46.641%. No percentage is printed
    // anywhere on this card, so a reader had no way to catch the drift. The
    // money beside the bar is the figure; the bar is decoration.
    renderBar(line({ group: "RRSP", used: 33000, limit: 70752, assessed: true, remaining: 37752 }));
    const bars = fillBars();
    const bar = bars[0];
    if (bar === undefined) throw new Error("expected the assessed line to render a fill");
    expect(bar.getAttribute("aria-hidden")).toBe("true");
    expect(bar.getAttribute("role")).toBeNull();
    for (const attribute of ["aria-valuetext", "aria-valuenow", "aria-valuemax", "aria-valuemin"]) {
      expect(bar.getAttribute(attribute)).toBeNull();
    }
    expect(bar.textContent ?? "").toBe("");
  });

  test("nothing on an assessed card announces a percentage on any attribute", () => {
    // The sweep that survives the bar coming back wearing a role, or the
    // figure reappearing on a title or a label somewhere else on the card.
    renderBar(line({ group: "RRSP", used: 33000, limit: 70752, assessed: true, remaining: 37752 }));
    const card = document.querySelector("[data-room-line]");
    if (card === null) throw new Error("expected a room line card to render");
    const nodes = [card, ...card.querySelectorAll("*")];
    expect(nodes.length).toBeGreaterThan(10);
    for (const node of nodes) {
      for (const attribute of ["aria-valuetext", "aria-label", "title"]) {
        expect(node.getAttribute(attribute) ?? "").not.toMatch(/\d+(\.\d+)?%/);
      }
    }
  });

  test("the fill is the true share of the assessed limit, not its inverse", () => {
    // 33,000 of 70,752 is 46.641% used. 53.359% is what an inverted fill would
    // draw. The width is now the only place this magnitude is observable, so
    // it is the place that pins it.
    renderBar(line({ group: "RRSP", used: 33000, limit: 70752, assessed: true, remaining: 37752 }));
    expect(fillPercent()).toBeCloseTo(46.642, 2);
  });

  test("the fill keeps the full share rather than the whole percent once announced", () => {
    renderBar(line({ group: "RRSP", used: 15000, limit: 60191, assessed: true, remaining: 45191 }));
    // 24.921%, the real 2025 figure that was announced as "25%".
    expect(fillPercent()).toBeCloseTo(24.921, 2);
    expect(fillPercent()).not.toBe(25);
  });

  test("an over-limit fill is clamped rather than drawn past its own end", () => {
    // The excess is stated in words by the remaining line. A bar running past
    // the track says nothing that sentence does not, and cannot be drawn.
    renderBar(line({ group: "RRSP", used: 72000, limit: 70752, assessed: true, remaining: -1248 }));
    expect(fillPercent()).toBe(100);
  });

  test("a zero limit draws no fill rather than dividing by zero", () => {
    renderBar(line({ group: "RRSP", used: 5000, limit: 0, assessed: true, remaining: -5000 }));
    expect(fillPercent()).toBe(0);
  });

  test("an assessed line over its limit renders the excess, never a negative remaining", () => {
    const bar = renderBar(
      line({ group: "RRSP", used: 72000, limit: 70752, assessed: true, remaining: -1248 }),
    );
    expect(bar.getByText(/\$1,248\.00 over the assessed limit of \$70,752\.00/)).toBeDefined();
    expect(bar.queryByText(/-\$/)).toBeNull();
    expect(bar.queryByText(/\$-/)).toBeNull();
  });

  test("a spousal slice is described as already counted, not as an extra amount", () => {
    const bar = renderBar(
      line({
        group: "RRSP",
        used: 33000,
        limit: 70752,
        assessed: true,
        remaining: 37752,
        spousalUsed: 13600,
      }),
    );
    expect(bar.getByText(/\$13,600\.00.*spousal/i)).toBeDefined();
    expect(bar.getByText(/counts against your own room/i)).toBeDefined();
  });

  test("a derived contribution figure carries its derived marker", () => {
    const bar = renderBar(line({ group: "RESP", used: 3000, limit: null }), "derived");
    expect(bar.getByText(/derived/i)).toBeDefined();
  });

  test("a stated contribution figure carries no derived marker", () => {
    const bar = renderBar(line({}), "stated");
    expect(bar.queryByText(/derived/i)).toBeNull();
  });

  test("a null limit renders no annual limit at all, not a zero or a placeholder", () => {
    const bar = renderBar(line({ group: "RESP", used: 3000, limit: null }), "derived");
    expect(bar.getByText(/no annual contribution limit/i)).toBeDefined();
    expect(bar.queryByText(/annual maximum/i)).toBeNull();
    expect(bar.queryByText("$0.00")).toBeNull();
    expect(fillBars().length).toBe(0);
  });

  test("a lifetime position renders as a real remaining, because it is one", () => {
    const bar = renderBar(
      line({
        group: "FHSA",
        used: 8000,
        limit: 8000,
        lifetimeContributions: { contributed: 24000, cap: 40000, remaining: 16000 },
      }),
    );
    expect(bar.getByText(/\$24,000\.00 of \$40,000\.00/)).toBeDefined();
    expect(bar.getByText(/\$16,000\.00 remaining/)).toBeDefined();
    // The annual line is still uncertain even though the lifetime one is not.
    expect(bar.getByText(/carry-forward not visible/i)).toBeDefined();
  });

  test("the CESG line reports received, the maximising contribution and the lifetime cap", () => {
    const bar = renderBar(
      line({
        group: "RESP",
        used: 3000,
        limit: null,
        lifetimeContributions: { contributed: 3000, cap: 50000, remaining: 47000 },
        lifetimeGrant: {
          received: 550,
          cap: 7200,
          remaining: 6650,
          maximizingContribution: 2500,
        },
      }),
      "derived",
    );
    const grant = bar.getByText(/CESG/i).closest("[data-cesg-line]");
    if (grant === null) throw new Error("expected a CESG line to render");
    const cesg = within(grant as HTMLElement);
    expect(cesg.getByText(/\$550\.00/)).toBeDefined();
    expect(cesg.getByText(/\$7,200\.00/)).toBeDefined();
    expect(cesg.getByText(/\$2,500\.00/)).toBeDefined();
  });

  test("the grant-maximising contribution is not presented as a cap", () => {
    renderBar(
      line({
        group: "RESP",
        used: 3000,
        limit: null,
        lifetimeGrant: {
          received: 550,
          cap: 7200,
          remaining: 6650,
          maximizingContribution: 2500,
        },
      }),
      "derived",
    );
    expect(screen.getByText(/\$2,500\.00 a year attracts the maximum basic grant/)).toBeDefined();
  });
});
