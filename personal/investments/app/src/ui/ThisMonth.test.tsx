import { afterEach, describe, expect, test } from "bun:test";
import { Theme } from "@radix-ui/themes";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { monthReview, reviewPeriods } from "../analytics/monthReview";
import { ThisMonth } from "./ThisMonth";
import { loadAnalytics, loadCheckpoints } from "./data";
import { formatSignedCurrency } from "./format";

afterEach(() => {
  cleanup();
});

function renderThisMonth() {
  render(
    <Theme>
      <ThisMonth analytics={loadAnalytics()} checkpoints={loadCheckpoints()} />
    </Theme>,
  );
}

/** Awaited inside act: Radix positions the listbox after an async measurement, same as the account filter's own menu. */
async function openMonthPicker() {
  await act(async () => {
    fireEvent.click(screen.getByRole("combobox", { name: "Month" }));
  });
}

async function pickMonth(label: string) {
  await act(async () => {
    fireEvent.click(screen.getByRole("option", { name: label }));
  });
}

describe("ThisMonth", () => {
  test("the default route's headline change equals end minus start of the model", () => {
    renderThisMonth();
    const analytics = loadAnalytics();
    const [latest] = reviewPeriods(analytics);
    if (latest === undefined) throw new Error("expected a reviewable period");
    const review = monthReview(analytics, latest);
    const change = review.start === null ? review.end : review.end - review.start;
    expect(screen.getByRole("heading", { level: 2 }).textContent).toContain(
      formatSignedCurrency(change),
    );
  });

  test("the movers table has one row per model move", () => {
    renderThisMonth();
    const analytics = loadAnalytics();
    const [latest] = reviewPeriods(analytics);
    if (latest === undefined) throw new Error("expected a reviewable period");
    const review = monthReview(analytics, latest);
    expect(document.querySelectorAll("[data-mover-row]").length).toBe(review.moves.length);
  });

  test("the checkpoint line appears for 2026-08 and not for 2026-07", async () => {
    renderThisMonth();
    await openMonthPicker();
    await pickMonth("August 2026");
    expect(document.querySelector("[data-checkpoint-line]")).not.toBeNull();

    await openMonthPicker();
    await pickMonth("July 2026");
    expect(document.querySelector("[data-checkpoint-line]")).toBeNull();
  });

  test("picking a different month in the select updates the headline", async () => {
    renderThisMonth();
    const analytics = loadAnalytics();
    const julyReview = monthReview(analytics, "2026-07");
    const julyChange =
      julyReview.start === null ? julyReview.end : julyReview.end - julyReview.start;

    await openMonthPicker();
    await pickMonth("July 2026");

    expect(screen.getByRole("heading", { level: 2 }).textContent).toContain(
      formatSignedCurrency(julyChange),
    );
  });
});
