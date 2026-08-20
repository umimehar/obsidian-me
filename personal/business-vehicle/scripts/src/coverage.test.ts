import { describe, expect, test } from "bun:test";
import {
  leasePayoff,
  leaseProgress,
  nextServiceDue,
  observedAnnualKm,
  planDrawdown,
  windowStatus,
} from "./coverage";

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

  test("treats the odometer limit as reached at exactly the limit, matching the date boundary", () => {
    // Both limits are inclusive of the last usable value and exclusive beyond it. At exactly
    // the expiry km the window is spent, the same way it is spent the day after the expiry date.
    const at = windowStatus({ expiryDate: "2030-01-01", expiryKm: 90000 }, "2026-08-19", 90000);
    expect(at.active).toBe(false);
    expect(at.kmRemaining).toBe(0);
    const just = windowStatus({ expiryDate: "2030-01-01", expiryKm: 90000 }, "2026-08-19", 89999);
    expect(just.active).toBe(true);
  });

  test("is active on the expiry date itself and spent the day after", () => {
    const on = windowStatus({ expiryDate: "2028-09-30", expiryKm: null }, "2028-09-30", 100);
    expect(on.active).toBe(true);
    const after = windowStatus({ expiryDate: "2028-09-30", expiryKm: null }, "2028-10-01", 100);
    expect(after.active).toBe(false);
  });

  test("uses the pace it was given to decide which limit bites first", () => {
    // 30,000 km left with 12 months to run. At 18,000 km a year the date arrives first.
    const slow = windowStatus(
      { expiryDate: "2027-08-19", expiryKm: 50000 },
      "2026-08-19",
      20000,
      18000,
    );
    expect(slow.expiresBy).toBe("date");
    // Same window at 40,000 km a year and the odometer arrives first.
    const fast = windowStatus(
      { expiryDate: "2027-08-19", expiryKm: 50000 },
      "2026-08-19",
      20000,
      40000,
    );
    expect(fast.expiresBy).toBe("kilometres");
  });

  test("handles a window with no odometer limit", () => {
    const s = windowStatus({ expiryDate: "2030-01-01", expiryKm: null }, "2026-08-19", 500000);
    expect(s.active).toBe(true);
    expect(s.kmRemaining).toBe(null);
  });
});

describe("leasePayoff", () => {
  const lease = { monthlyPaymentBeforeTax: 1548.68, residualValue: 58580, interestRate: 0.0449 };

  test("is the remaining payments plus the residual, both discounted at the lease rate", () => {
    // 26 payments left. Discounting matters: undiscounted the same stream is $98,846.
    const payoff = leasePayoff(lease, 26);
    expect(Math.round(payoff ?? 0)).toBe(91460);
  });

  test("equals the residual alone when no payments remain", () => {
    expect(leasePayoff(lease, 0)).toBe(58580);
  });

  test("rises as more payments remain", () => {
    expect(leasePayoff(lease, 30) ?? 0).toBeGreaterThan(leasePayoff(lease, 26) ?? 0);
  });

  test("returns null rather than a wrong number when a term is missing", () => {
    expect(leasePayoff({ ...lease, residualValue: null }, 26)).toBe(null);
    expect(leasePayoff({ ...lease, monthlyPaymentBeforeTax: null }, 26)).toBe(null);
  });

  test("handles a zero interest lease without dividing by zero", () => {
    const free = leasePayoff({ ...lease, interestRate: 0 }, 26);
    expect(free).toBeCloseTo(58580 + 26 * 1548.68, 2);
  });
});

describe("observedAnnualKm", () => {
  test("annualises the odometer against time in service", () => {
    // 14,035 km over the 323 days from 2025-09-30 to 2026-08-19.
    const pace = observedAnnualKm("2025-09-30", "2026-08-19", 14035);
    expect(pace).not.toBe(null);
    expect(Math.round(pace ?? 0)).toBe(15871);
  });

  test("returns null without an odometer, so a caller must fall back deliberately", () => {
    expect(observedAnnualKm("2025-09-30", "2026-08-19", null)).toBe(null);
  });

  test("returns null on the day of delivery rather than dividing by zero", () => {
    expect(observedAnnualKm("2025-09-30", "2025-09-30", 90)).toBe(null);
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
