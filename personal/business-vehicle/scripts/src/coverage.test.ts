import { describe, expect, test } from "bun:test";
import { leaseProgress, nextServiceDue, planDrawdown, windowStatus } from "./coverage";

describe("leaseProgress", () => {
  const lease = { startDate: "2025-09-30", termMonths: 39, kmPerYear: 18000 };

  test("reports months elapsed and remaining against the term", () => {
    const p = leaseProgress(lease, "2026-08-19");
    expect(p.monthsElapsed).toBe(10);
    expect(p.monthsRemaining).toBe(29);
  });

  test("never reports negative remaining once the term is over", () => {
    const p = leaseProgress(lease, "2029-12-31");
    expect(p.monthsRemaining).toBe(0);
    expect(p.monthsElapsed).toBe(39);
  });

  test("computes the km allowance consumed to date", () => {
    const p = leaseProgress(lease, "2026-09-30");
    expect(p.kmAllowanceToDate).toBe(18000);
  });

  test("reports the maturity date implied by the term", () => {
    expect(leaseProgress(lease, "2026-08-19").maturityDate).toBe("2028-12-30");
  });
});

describe("planDrawdown", () => {
  const plan = { numberOfServices: 3, termMonths: 45, termKm: 90000 };

  test("counts services used and left", () => {
    const d = planDrawdown(plan, [{ date: "2026-08-12", odometer: 14035, coveredByPlan: true }]);
    expect(d.servicesUsed).toBe(1);
    expect(d.servicesRemaining).toBe(2);
  });

  test("ignores services the plan did not pay for", () => {
    const d = planDrawdown(plan, [
      { date: "2026-08-12", odometer: 14035, coveredByPlan: true },
      { date: "2026-08-13", odometer: 14100, coveredByPlan: false },
    ]);
    expect(d.servicesUsed).toBe(1);
    expect(d.servicesRemaining).toBe(2);
  });

  test("never reports more services left than the plan sold", () => {
    const d = planDrawdown(plan, []);
    expect(d.servicesRemaining).toBe(3);
  });

  test("clamps at zero when more services were taken than sold", () => {
    const used = Array.from({ length: 5 }, (_, i) => ({
      date: `2026-0${i + 1}-01`,
      odometer: 1000 * i,
      coveredByPlan: true,
    }));
    expect(planDrawdown(plan, used).servicesRemaining).toBe(0);
  });
});

describe("windowStatus", () => {
  test("is active while both the date and the odometer are inside the window", () => {
    const s = windowStatus({ expiryDate: "2028-12-30", expiryKm: 90000 }, "2026-08-19", 14035);
    expect(s.active).toBe(true);
    expect(s.kmRemaining).toBe(75965);
    expect(s.expiresBy).toBe("date");
  });

  test("expires on whichever limit is reached first", () => {
    const s = windowStatus({ expiryDate: "2028-12-30", expiryKm: 90000 }, "2026-08-19", 89000);
    expect(s.active).toBe(true);
    expect(s.expiresBy).toBe("kilometres");
  });

  test("is inactive once the date has passed", () => {
    expect(
      windowStatus({ expiryDate: "2026-01-01", expiryKm: 90000 }, "2026-08-19", 100).active,
    ).toBe(false);
  });

  test("is inactive once the odometer is past the limit", () => {
    expect(
      windowStatus({ expiryDate: "2030-01-01", expiryKm: 90000 }, "2026-08-19", 90001).active,
    ).toBe(false);
  });

  test("handles a window with no odometer limit", () => {
    const s = windowStatus({ expiryDate: "2030-01-01", expiryKm: null }, "2026-08-19", 500000);
    expect(s.active).toBe(true);
    expect(s.kmRemaining).toBe(null);
  });
});

describe("nextServiceDue", () => {
  test("projects the next service one interval past the last one", () => {
    const due = nextServiceDue(
      { intervalKm: 20000, intervalMonths: 12 },
      {
        date: "2026-08-12",
        odometer: 14035,
        coveredByPlan: true,
      },
    );
    expect(due).not.toBe(null);
    expect(due?.odometer).toBe(34035);
    expect(due?.date).toBe("2027-08-12");
  });

  test("returns null when there is no service history to project from", () => {
    expect(nextServiceDue({ intervalKm: 20000, intervalMonths: 12 }, undefined)).toBe(null);
  });
});
