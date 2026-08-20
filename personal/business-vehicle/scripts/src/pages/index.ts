import { leaseProgress } from "../coverage";
import { findingsHtml } from "../findings";
import { escapeHtml, money, plainDate, wholeMoney } from "../format";
import { callout, layout, section, table } from "../layout";
import type { VehicleData } from "../types";

function hero(label: string, value: string, note: string, lead = false): string {
  return `        <div class="hero-cell${lead ? " lead" : ""}">
          <p class="hero-cell-label">${escapeHtml(label)}</p>
          <p class="hero-cell-value num">${value}</p>
          <p class="hero-cell-note">${escapeHtml(note)}</p>
        </div>`;
}

export function indexPage(data: VehicleData): string {
  const vehicle = data.fleet[0];
  if (!vehicle) throw new Error("index page needs a vehicle");
  const renewal = vehicle.insurance.find((p) => p.status === "renewal offered");
  const lease = vehicle.lease;
  const latestService = [...vehicle.service].sort((a, b) => b.date.localeCompare(a.date))[0];

  const insuranceMonthly = renewal?.paymentAmount ?? null;
  const leaseMonthly = lease?.monthlyPaymentTotal ?? null;
  const totalMonthly =
    insuranceMonthly === null || leaseMonthly === null ? null : insuranceMonthly + leaseMonthly;

  const progress =
    lease?.termMonths && lease.termMonths > 0
      ? leaseProgress(
          {
            startDate: lease.dateOfLease ?? vehicle.identity.inServiceDate,
            termMonths: lease.termMonths,
            kmPerYear: lease.kmPerYear ?? null,
          },
          data.meta.asOf,
        )
      : null;

  const actions = [...data.nextActions].sort((a, b) => a.priority - b.priority);
  const actionRows = actions.map((a) => [
    `<strong>${escapeHtml(a.action)}</strong><br /><span class="card-meta">${escapeHtml(a.why)}</span>`,
    escapeHtml(a.owner),
    a.due ? plainDate(a.due) : "—",
  ]);

  const dates = [
    ["2026-09-01", "Last debit of the expiring insurance term, $700.84"],
    ["2026-09-30", "Last day to bind a replacement policy without a gap"],
    ["2026-10-01", "Insurance renewal takes effect, first debit of $804.75"],
    progress ? [progress.maturityDate, "Lease matures"] : null,
    [
      "2028-09-29",
      "Manufacturer warranty expires on the dealer invoice's date. The pricing worksheet implies 29 September 2029, see the findings above",
    ],
  ]
    .filter((d): d is string[] => d !== null)
    .sort((a, b) => (a[0] ?? "").localeCompare(b[0] ?? ""));

  const body = `      <div class="hero-row">
${hero(
  "Cost per month",
  totalMonthly === null ? "—" : money(totalMonthly),
  totalMonthly === null
    ? "Lease payment not yet extracted"
    : "Lease plus insurance, at the renewal rate",
  true,
)}
${hero("Insurance", insuranceMonthly === null ? "—" : money(insuranceMonthly), `${wholeMoney(renewal?.totalPremium ?? null)} a year from 1 October`)}
${hero("Lease", leaseMonthly === null ? "—" : money(leaseMonthly), progress ? `${progress.monthsRemaining} months to run` : "Term not yet extracted")}
${hero("Odometer", latestService?.odometerOut ? `${latestService.odometerOut.toLocaleString("en-CA")} km` : "—", latestService ? `Read ${plainDate(latestService.date)}` : "No reading")}
      </div>

${callout(
  "<strong>Do not cancel Desjardins until a replacement policy is bound in writing.</strong> The renewal takes effect on 1 October 2026 and four brokers were contacted on 19 August. Nothing has come back yet.",
)}

      <hr class="hr mt-rule" />
${section("What the documents disagree about", "Every one of these came out of reading the contracts against each other.")}
      <div class="card-grid">
${findingsHtml(data.findings)}
      </div>

      <hr class="hr mt-rule" />
${section("What needs doing", "Highest priority first.")}
${table(["Action", "Owner", "Due"], actionRows)}

      <hr class="hr mt-rule" />
${section("Dates ahead")}
${table(
  ["Date", "What happens"],
  dates.map(([d, what]) => [plainDate(d ?? null), escapeHtml(what ?? "")]),
)}

      <hr class="hr mt-rule" />
${section("The six pages behind this one")}
      <div class="card-grid">
        <div class="card">
          <p class="card-title"><a href="lease.html">Lease</a></p>
          <p>Term, payments, residual, buyout, what the lessor requires of the insurance, and the wear and tear waiver that incomplete maintenance would void.</p>
        </div>
        <div class="card">
          <p class="card-title"><a href="insurance.html">Insurance</a></p>
          <p>Both terms line by line, why the premium rose ${wholeMoney(1247)}, the endorsements a replacement quote has to carry, the four brokers, and the open questions.</p>
        </div>
        <div class="card">
          <p class="card-title"><a href="service.html">Service</a></p>
          <p>Every visit, what the prepaid plan has covered, what the dealer flagged and did not fix, and when the next service falls due.</p>
        </div>
        <div class="card">
          <p class="card-title"><a href="compliance.html">Compliance</a></p>
          <p>Business against personal use, the mileage position, and the tax questions for the accountant.</p>
        </div>
        <div class="card">
          <p class="card-title"><a href="deal.html">Was it a good deal</a></p>
          <p>The lease measured against what comparable cars actually sell for, what to do at maturity, and what to negotiate differently next time.</p>
        </div>
        <div class="card">
          <p class="card-title"><a href="fleet-history.html">Fleet history</a></p>
          <p>Every leased vehicle, current and returned.</p>
        </div>
      </div>`;

  return layout({
    page: "index",
    title: "Business vehicle",
    kicker: `${vehicle.identity.year} ${vehicle.identity.make} ${vehicle.identity.model}`,
    standfirst: escapeHtml(vehicle.identity.vin),
    asOf: data.meta.asOf,
    body,
    footnote: escapeHtml(data.meta.maskingPolicy),
  });
}
