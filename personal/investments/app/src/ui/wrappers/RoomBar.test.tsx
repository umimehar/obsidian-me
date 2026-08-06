import { describe, expect, test } from "bun:test";
import { Theme } from "@radix-ui/themes";
import { render, screen, within } from "@testing-library/react";
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

describe("RoomBar", () => {
  test("a null-remaining line says carry-forward is not visible", () => {
    const bar = renderBar(line({}));
    expect(bar.getByText(/carry-forward not visible/i)).toBeDefined();
  });

  test("a null-remaining line renders no bar fill percentage, even at used equal to limit", () => {
    renderBar(line({ used: 7000, limit: 7000 }));
    const card = document.querySelector("[data-room-line]");
    if (card === null) throw new Error("expected a room line card to render");
    expect(card.querySelectorAll('[role="progressbar"]').length).toBe(0);
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
    const card = document.querySelector("[data-room-line]");
    if (card === null) throw new Error("expected a room line card to render");
    expect(card.querySelectorAll('[role="progressbar"]').length).toBe(1);
  });

  test("an assessed line over its limit renders the excess, never a negative remaining", () => {
    const bar = renderBar(
      line({ group: "RRSP", used: 72000, limit: 70752, assessed: true, remaining: -1248 }),
    );
    expect(bar.getByText(/\$1,248\.00 over the assessed limit/)).toBeDefined();
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
    const card = document.querySelector("[data-room-line]");
    if (card === null) throw new Error("expected a room line card to render");
    expect(card.querySelectorAll('[role="progressbar"]').length).toBe(0);
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
