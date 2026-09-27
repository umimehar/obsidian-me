import { describe, expect, test } from "bun:test";
import { Theme } from "@radix-ui/themes";
import { render } from "@testing-library/react";
import { GOLDENS } from "../goldens";
import { SummaryStrip } from "./SummaryStrip";
import { formatCurrency, formatGainWithShare } from "./format";

const FIGURES = {
  marketValue: GOLDENS.portfolio.total,
  bookCost: GOLDENS.portfolio.bookCost,
  gain: GOLDENS.portfolio.gain,
};

describe("SummaryStrip", () => {
  test("renders the total, the period and the gain against book cost in one line", () => {
    render(
      <Theme>
        <SummaryStrip total={GOLDENS.portfolio.total} period="2026-08" figures={FIGURES} />
      </Theme>,
    );
    const strip = document.querySelector("[data-summary-strip]");
    expect(strip).not.toBeNull();
    const text = strip?.textContent ?? "";
    expect(text).toContain(`Portfolio ${formatCurrency(GOLDENS.portfolio.total)}`);
    expect(text).toContain("as of 2026-08");
    expect(text).toContain(
      `${formatGainWithShare(GOLDENS.portfolio.gain, GOLDENS.portfolio.bookCost)} against book cost`,
    );
  });

  test("says no period when there is none, rather than printing a stray word", () => {
    render(
      <Theme>
        <SummaryStrip total={GOLDENS.portfolio.total} period={null} figures={FIGURES} />
      </Theme>,
    );
    const text = document.querySelector("[data-summary-strip]")?.textContent ?? "";
    expect(text).not.toContain("as of");
  });

  test("prints the total alone when there is no gain to compare against", () => {
    render(
      <Theme>
        <SummaryStrip total={GOLDENS.portfolio.total} period="2026-08" figures={null} />
      </Theme>,
    );
    const text = document.querySelector("[data-summary-strip]")?.textContent ?? "";
    expect(text).toContain(formatCurrency(GOLDENS.portfolio.total));
    expect(text).not.toContain("against book cost");
  });
});
