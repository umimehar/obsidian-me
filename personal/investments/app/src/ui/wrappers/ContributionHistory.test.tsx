import { describe, expect, test } from "bun:test";
import { Theme } from "@radix-ui/themes";
import { render, screen, within } from "@testing-library/react";
import type { RoomLine } from "../../analytics/rooms";
import type { AccountSeries } from "../../analytics/types";
import { loadAnalytics } from "../data";
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

function account(over: Partial<AccountSeries> = {}): AccountSeries {
  return {
    maskedId: "acct_0001",
    shortId: "0001",
    label: "TFSA 0001",
    kind: "TFSA",
    style: "self-directed",
    purpose: "unassigned",
    inTotals: true,
    months: [{ period: "2026-01" } as AccountSeries["months"][number]],
    contributionsByYear: {},
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
          series={[
            account({
              maskedId: "acct_tfsa",
              kind: "TFSA",
              months: [{ period: "2025-01" } as never],
            }),
            account({
              maskedId: "acct_rrsp",
              kind: "RRSP",
              months: [{ period: "2026-01" } as never],
            }),
          ]}
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
          series={[account({ maskedId: "acct_tfsa", kind: "TFSA" })]}
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
          series={[
            account({
              maskedId: "acct_tfsa",
              kind: "TFSA",
              months: [{ period: "2025-01" } as never],
            }),
            account({
              maskedId: "acct_rrsp",
              kind: "RRSP",
              months: [{ period: "2026-01" } as never],
            }),
          ]}
        />
      </Theme>,
    );
    // TFSA has no 2026 line, RRSP has no 2025 line.
    expect(row("TFSA").getByText("no statement")).toBeDefined();
    expect(row("RRSP").getByText("no statement")).toBeDefined();
    expect(screen.queryByText(formatCurrency(0))).toBeNull();
  });

  test("a year before a wrapper's own first account says so, even though buildRoomLines stated a zero for it", () => {
    render(
      <Theme>
        <ContributionHistory
          rooms={{
            // A RoomLine for 2024, a year this account did not exist -- the
            // shape buildRoomLines actually produces (a $0 sum over zero
            // accounts that year), which the view must still read as "no
            // statement" rather than the zero on its face.
            "2024": [line({ group: "TFSA", year: 2024, used: 0 })],
            "2026": [line({ group: "TFSA", year: 2026, used: 7000 })],
          }}
          series={[
            account({
              maskedId: "acct_tfsa",
              kind: "TFSA",
              months: [{ period: "2026-01" } as never],
            }),
          ]}
        />
      </Theme>,
    );
    expect(row("TFSA").getByText("no statement")).toBeDefined();
    expect(row("TFSA").queryByText(formatCurrency(0))).toBeNull();
  });

  test("real corpus: RESP reads no statement before 2026 and RRSP before 2025", () => {
    const analytics = loadAnalytics();
    render(
      <Theme>
        <ContributionHistory rooms={analytics.rooms} series={analytics.series} />
      </Theme>,
    );
    const respCell = row("RESP").getByText("no statement", {
      selector: '[data-history-cell="2024"]',
    });
    expect(respCell).toBeDefined();
    const rrspCell = row("RRSP").getByText("no statement", {
      selector: '[data-history-cell="2024"]',
    });
    expect(rrspCell).toBeDefined();
    // 2026 is real data for both, so the fix cannot simply hide every year.
    expect(
      row("RESP").queryByText("no statement", { selector: '[data-history-cell="2026"]' }),
    ).toBeNull();
  });
});
