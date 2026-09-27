import { afterEach, describe, expect, test } from "bun:test";
import { Theme } from "@radix-ui/themes";
import { cleanup, render, screen, within } from "@testing-library/react";
import type { CardStatement } from "../ingest/card";
import { Cards } from "./Cards";
import { loadCards } from "./data";
import { formatCurrency, formatRate } from "./format";

function statement(overrides: Partial<CardStatement> = {}): CardStatement {
  return {
    file: "card_2377_2026-07.pdf",
    cardId: "card_2377",
    period: "2026-07",
    periodStart: "2026-06-25",
    periodEnd: "2026-07-24",
    statementDate: "2026-07-25",
    paymentDueDate: "2026-08-18",
    statementBalance: 0,
    creditLimit: 15000,
    previousBalance: 59.75,
    newBalance: 0,
    minimumPayment: 0,
    purchases: 651.27,
    payments: 711.02,
    otherCredits: 0,
    fees: 0,
    interest: 0,
    cashAdvances: 0,
    purchaseRate: 0.2099,
    cashAdvanceRate: 0.2299,
    activity: [],
    ...overrides,
  };
}

afterEach(cleanup);

function renderCards(statements: readonly CardStatement[]) {
  render(
    <Theme>
      <Cards statements={statements} scope="all" />
    </Theme>,
  );
}

describe("Cards, against the real committed cards.json", () => {
  test("renders every imported statement", () => {
    const real = loadCards();
    renderCards(real);
    expect(document.querySelectorAll("[data-card-statement]")).toHaveLength(real.length);
  });

  test("states in the open that a card balance is not part of the portfolio", () => {
    // The one sentence that keeps a reader from adding this tab's figures to
    // the headline total above it. A card balance is money owed.
    renderCards(loadCards());
    const caveat = document.querySelector("[data-cards-caveat]")?.textContent ?? "";
    expect(caveat).toMatch(/money owed, not money held/i);
    expect(caveat).toMatch(/counted in the portfolio total/i);
    expect(caveat).toMatch(/none of the investment charts apply/i);
  });
});

describe("Cards figures", () => {
  test("prints every summary figure at full precision", () => {
    const card = statement();
    renderCards([card]);
    const summary = within(document.querySelector("[data-card-summary]") as HTMLElement);
    for (const figure of [card.previousBalance, card.purchases, card.payments]) {
      expect(summary.getAllByText(formatCurrency(figure)).length).toBeGreaterThan(0);
    }
  });

  test("utilisation is stated at one decimal, never rounded to a whole percent", () => {
    // $4,999.50 of $15,000 is 33.33%. A whole-percent reading says 33%, the
    // same defect class the room bars shipped twice.
    renderCards([statement({ newBalance: 4999.5 })]);
    const terms = document.querySelector("[data-card-terms]")?.textContent ?? "";
    expect(terms).toContain(formatRate((4999.5 / 15000) * 100));
    expect(terms).toContain("33.33%");
    expect(terms).not.toContain("Used33%");
  });

  test("the two interest rates are both shown and are not the same figure", () => {
    const card = statement();
    renderCards([card]);
    const terms = document.querySelector("[data-card-terms]")?.textContent ?? "";
    expect(terms).toContain(formatRate(card.purchaseRate * 100));
    expect(terms).toContain(formatRate(card.cashAdvanceRate * 100));
  });

  test("a paid-off card says so; a balance owed states the figure it owes", () => {
    renderCards([statement()]);
    expect(screen.getByText(/paid in full/i)).toBeDefined();

    cleanup();
    renderCards([statement({ newBalance: 1234.56 })]);
    // Never the gain colour: a debt is not a gain, whatever its size.
    const badge = screen.getByText(`${formatCurrency(1234.56)} owed`);
    expect(badge.getAttribute("data-accent-color")).toBe("amber");
  });

  test("the accessible name carries the same figures the card prints", () => {
    const card = statement({ newBalance: 1234.56 });
    renderCards([card]);
    const label = document.querySelector("[data-card-statement]")?.getAttribute("aria-label") ?? "";
    expect(label).toContain(formatCurrency(card.newBalance));
    expect(label).toContain(formatCurrency(card.creditLimit));
    expect(label).toContain(card.paymentDueDate);
  });

  test("a card with no activity says so rather than rendering an empty table", () => {
    renderCards([statement({ activity: [] })]);
    expect(screen.getByText(/no activity on this statement/i)).toBeDefined();
    expect(document.querySelector("[data-card-activity]")).toBeNull();
  });

  test("activity rows print their own signs, a charge positive and a payment negative", () => {
    renderCards([
      statement({
        activity: [
          {
            transactionDate: "2026-06-23",
            postedDate: "2026-06-25",
            type: "Purchase",
            description: "SHOPPERS DRUG MART #07",
            amount: 200,
          },
          {
            transactionDate: "2026-06-25",
            postedDate: "2026-06-25",
            type: "Payment",
            description: "From chequing account",
            amount: -200,
          },
        ],
      }),
    ]);
    const table = within(document.querySelector("[data-card-activity]") as HTMLElement);
    expect(table.getByText(formatCurrency(200))).toBeDefined();
    expect(table.getByText(formatCurrency(-200))).toBeDefined();
  });

  test("nothing imported is an empty state, not a zero balance", () => {
    // A rendered $0.00 here would read as a card that owes nothing, which is
    // a claim about a card that has not been imported at all.
    renderCards([]);
    expect(screen.getByText(/no credit card statements imported yet/i)).toBeDefined();
    expect(screen.queryByText("$0.00")).toBeNull();
  });

  test("the latest statement is shown first", () => {
    renderCards([statement({ period: "2026-06" }), statement({ period: "2026-07" })]);
    const cards = [...document.querySelectorAll("[data-card-statement]")];
    expect(cards).toHaveLength(2);
    expect(cards[0]?.textContent).toContain("2026-07-25");
  });
});
