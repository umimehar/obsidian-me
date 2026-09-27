import { describe, expect, test } from "bun:test";
import { Theme } from "@radix-ui/themes";
import { render, screen, within } from "@testing-library/react";
import type { RoomLine } from "../../analytics/rooms";
import { formatCurrency } from "../format";
import { ContributionHistory } from "./ContributionHistory";

function line(over: Partial<RoomLine> = {}): RoomLine {
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
    ...over,
  };
}

function row(group: string) {
  const node = document.querySelector(`[data-history-row="${group}"]`);
  if (node === null) throw new Error(`expected a ${group} history row to render`);
  return within(node as HTMLElement);
}

describe("ContributionHistory", () => {
  test("one row per wrapper present in any year, one column per year", () => {
    render(
      <Theme>
        <ContributionHistory
          rooms={{
            "2025": [line({ group: "TFSA", year: 2025, used: 6500 })],
            "2026": [
              line({ group: "TFSA", year: 2026, used: 7000 }),
              line({ group: "RRSP", year: 2026, used: 33000 }),
            ],
          }}
        />
      </Theme>,
    );
    expect(document.querySelectorAll("[data-history-row]").length).toBe(2);
    expect(row("TFSA")).toBeDefined();
    expect(row("RRSP")).toBeDefined();
    expect(screen.getByRole("columnheader", { name: "2025" })).toBeDefined();
    expect(screen.getByRole("columnheader", { name: "2026" })).toBeDefined();
  });

  test("a wrapper's cell for a year it has a line in prints the contributed figure", () => {
    render(
      <Theme>
        <ContributionHistory
          rooms={{
            "2026": [line({ group: "TFSA", year: 2026, used: 7000 })],
          }}
        />
      </Theme>,
    );
    expect(row("TFSA").getByText(formatCurrency(7000))).toBeDefined();
  });

  test("a wrapper missing a line for a year the corpus otherwise covers says so, rather than $0.00", () => {
    render(
      <Theme>
        <ContributionHistory
          rooms={{
            "2025": [line({ group: "TFSA", year: 2025, used: 6500 })],
            "2026": [line({ group: "RRSP", year: 2026, used: 33000 })],
          }}
        />
      </Theme>,
    );
    // TFSA has no 2026 line, RRSP has no 2025 line.
    expect(row("TFSA").getByText("no statement")).toBeDefined();
    expect(row("RRSP").getByText("no statement")).toBeDefined();
    expect(screen.queryByText(formatCurrency(0))).toBeNull();
  });
});
