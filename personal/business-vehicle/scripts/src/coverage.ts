/** Lease progress, prepaid plan drawdown, and warranty window arithmetic.
    Every function takes the "as of" date explicitly so a rendered page is reproducible. */

import { monthsBetween } from "./format";

export interface LeaseShape {
  readonly startDate: string;
  readonly termMonths: number;
  readonly kmPerYear: number | null;
}

export interface LeaseProgress {
  readonly monthsElapsed: number;
  readonly monthsRemaining: number;
  readonly kmAllowanceToDate: number | null;
  readonly maturityDate: string;
}

export interface ServiceEvent {
  readonly date: string;
  readonly odometer: number | null;
  readonly coveredByPlan: boolean;
}

export interface PlanShape {
  readonly numberOfServices: number | null;
  readonly termMonths: number | null;
  readonly termKm: number | null;
}

export interface Drawdown {
  readonly servicesUsed: number;
  readonly servicesRemaining: number | null;
}

export interface CoverageWindow {
  readonly expiryDate: string | null;
  readonly expiryKm: number | null;
}

export interface WindowStatus {
  readonly active: boolean;
  readonly kmRemaining: number | null;
  readonly monthsRemaining: number | null;
  readonly expiresBy: "date" | "kilometres" | null;
}

function addMonths(iso: string, months: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  const targetDay = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + months);
  const lastDay = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(targetDay, lastDay));
  return d.toISOString().slice(0, 10);
}

export function leaseProgress(lease: LeaseShape, asOf: string): LeaseProgress {
  const raw = monthsBetween(lease.startDate, asOf);
  const monthsElapsed = Math.min(Math.max(raw, 0), lease.termMonths);
  return {
    monthsElapsed,
    monthsRemaining: lease.termMonths - monthsElapsed,
    kmAllowanceToDate:
      lease.kmPerYear === null ? null : Math.round((lease.kmPerYear * monthsElapsed) / 12),
    maturityDate: addMonths(lease.startDate, lease.termMonths),
  };
}

export function planDrawdown(plan: PlanShape, services: readonly ServiceEvent[]): Drawdown {
  const servicesUsed = services.filter((s) => s.coveredByPlan).length;
  if (plan.numberOfServices === null) return { servicesUsed, servicesRemaining: null };
  return {
    servicesUsed,
    servicesRemaining: Math.max(plan.numberOfServices - servicesUsed, 0),
  };
}

/** @param annualKm the pace to judge which limit bites first. Defaults to the lease's own
    18,000 km a year, which is the only pace this vehicle is contracted to. */
export function windowStatus(
  window: CoverageWindow,
  asOf: string,
  odometer: number | null,
  annualKm = 18000,
): WindowStatus {
  const dateOk = window.expiryDate === null || asOf <= window.expiryDate;
  const kmRemaining =
    window.expiryKm === null || odometer === null ? null : window.expiryKm - odometer;
  const kmOk = kmRemaining === null || kmRemaining > 0;
  const monthsRemaining =
    window.expiryDate === null ? null : Math.max(monthsBetween(asOf, window.expiryDate), 0);

  let expiresBy: "date" | "kilometres" | null = null;
  if (dateOk && kmOk) {
    if (kmRemaining === null || monthsRemaining === null) {
      expiresBy = window.expiryDate === null ? "kilometres" : "date";
    } else {
      // Whichever limit the given pace reaches first: the kilometres left, against the
      // kilometres the remaining months would consume at that pace.
      expiresBy = kmRemaining <= (monthsRemaining / 12) * annualKm ? "kilometres" : "date";
    }
  }

  return { active: dateOk && kmOk, kmRemaining, monthsRemaining, expiresBy };
}

/** What it would cost to end the lease today: the payments still to come plus the residual,
    each discounted back at the lease's own rate. This is the figure to compare against the
    car's market value, and the reason an early exit on a depreciating car is punitive. */
export function leasePayoff(
  lease: {
    monthlyPaymentBeforeTax?: number | null;
    residualValue?: number | null;
    interestRate?: number | null;
  },
  paymentsRemaining: number,
): number | null {
  const pmt = lease.monthlyPaymentBeforeTax;
  const residual = lease.residualValue;
  if (pmt === null || pmt === undefined || residual === null || residual === undefined) {
    return null;
  }
  const monthly = (lease.interestRate ?? 0) / 12;
  if (monthly === 0) return residual + pmt * paymentsRemaining;
  let pv = residual / (1 + monthly) ** paymentsRemaining;
  for (let k = 1; k <= paymentsRemaining; k += 1) {
    pv += pmt / (1 + monthly) ** k;
  }
  return pv;
}

/** The pace the vehicle is actually driven, annualised from time in service. A warranty or
    plan window is reached by real kilometres, not by the ones the lease permits, so this is
    the pace to project with. Null when there is nothing to measure, which leaves the choice
    of fallback to the caller rather than quietly inventing one. */
export function observedAnnualKm(
  inServiceDate: string,
  asOf: string,
  odometer: number | null,
): number | null {
  if (odometer === null) return null;
  const start = new Date(`${inServiceDate}T00:00:00Z`).getTime();
  const end = new Date(`${asOf}T00:00:00Z`).getTime();
  const days = (end - start) / 86_400_000;
  if (days <= 0) return null;
  return (odometer / days) * 365.25;
}

export function nextServiceDue(
  interval: { intervalKm: number | null; intervalMonths: number | null },
  last: ServiceEvent | undefined,
): { date: string | null; odometer: number | null } | null {
  if (!last) return null;
  return {
    date: interval.intervalMonths === null ? null : addMonths(last.date, interval.intervalMonths),
    odometer:
      interval.intervalKm === null || last.odometer === null
        ? null
        : last.odometer + interval.intervalKm,
  };
}
