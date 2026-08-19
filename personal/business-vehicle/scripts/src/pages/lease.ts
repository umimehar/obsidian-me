import { leaseProgress } from "../coverage";
import { escapeHtml, money, plainDate, wholeMoney } from "../format";
import { callout, kv, layout, section, table } from "../layout";
import type { VehicleData } from "../types";

export function leasePage(data: VehicleData): string {
  const vehicle = data.fleet[0];
  if (!vehicle) throw new Error("lease page needs a vehicle");
  const lease = vehicle.lease;

  if (!lease || !lease.termMonths) {
    return layout({
      page: "lease",
      title: "Lease",
      kicker: "Term, payments and end of lease",
      standfirst: "Awaiting extraction",
      asOf: data.meta.asOf,
      body: `${section("Not yet recorded")}
      <p>The lease terms have not been extracted into <code>data/vehicle.json</code> yet. The signed agreements are committed under <code>docs/lease/</code>.</p>`,
    });
  }

  const progress = leaseProgress(
    {
      startDate: lease.dateOfLease ?? vehicle.identity.inServiceDate,
      termMonths: lease.termMonths,
      kmPerYear: lease.kmPerYear ?? null,
    },
    data.meta.asOf,
  );

  const paidToDate =
    lease.monthlyPaymentTotal === null || lease.monthlyPaymentTotal === undefined
      ? null
      : lease.monthlyPaymentTotal * progress.monthsElapsed;

  const protection = vehicle.protection
    .map(
      (p) => `        <div class="card">
          <p class="card-title">${escapeHtml(p.name)}</p>
          <p class="card-meta">${escapeHtml(p.kind.replace(/-/g, " "))}${
            p.price ? ` · ${money(p.price)}` : ""
          }</p>
          ${p.detail ? `<p>${escapeHtml(p.detail)}</p>` : ""}
          ${p.waiverLimit ? `<p>Waiver limit ${money(p.waiverLimit)}.</p>` : ""}
        </div>`,
    )
    .join("\n");

  const wearWaiver = vehicle.protection.find((p) => p.kind === "wear-and-tear");

  const body = `${section("Where the lease stands")}
${kv([
  ["Lessee", escapeHtml(data.parties.corporation.legalName ?? "—")],
  ["Co-lessee", escapeHtml(data.parties.driver.name ?? "—")],
  ["Lessor", escapeHtml(data.parties.lessor.name ?? "—")],
  ["Date of lease", plainDate(lease.dateOfLease ?? null)],
  [
    "Term",
    `<span class="num">${lease.termMonths}</span> months, maturing ${plainDate(progress.maturityDate)}`,
  ],
  [
    "Elapsed",
    `<span class="num">${progress.monthsElapsed}</span> months in, <span class="num">${progress.monthsRemaining}</span> to run`,
  ],
  [
    "Monthly payment",
    lease.monthlyPaymentTotal
      ? `<span class="num">${money(lease.monthlyPaymentTotal)}</span> including tax`
      : money(lease.monthlyPaymentBeforeTax ?? null),
  ],
  [
    "Paid to date",
    paidToDate === null
      ? "—"
      : `<span class="num">${money(paidToDate)}</span> across ${progress.monthsElapsed} payments`,
  ],
  [
    "Kilometre allowance",
    lease.kmPerYear
      ? `<span class="num">${lease.kmPerYear.toLocaleString("en-CA")}</span> per year, ${progress.kmAllowanceToDate?.toLocaleString("en-CA") ?? "—"} earned so far`
      : "—",
  ],
  ["Excess kilometre rate", lease.excessKmRate ? `${money(lease.excessKmRate)} per km` : "—"],
  ["Residual", wholeMoney(lease.residualValue ?? null)],
  ["Purchase option", wholeMoney(lease.purchaseOptionPrice ?? null)],
  ["Due at signing", money(lease.dueAtSigning ?? null)],
  ["Total of payments", wholeMoney(lease.totalOfPayments ?? null)],
])}

${
  wearWaiver
    ? callout(
        `<strong>${escapeHtml(wearWaiver.name)} waives excess wear and tear up to ${money(
          wearWaiver.waiverLimit ?? null,
        )}, and it is void if maintenance to manufacturer specification is incomplete.</strong> Keeping every service on the prepaid plan is what protects that waiver.`,
      )
    : ""
}

      <hr class="hr mt-rule" />
${section("What the lessor requires of the insurance", "From the Agreement to Furnish Insurance signed 30 September 2025.")}
${table(
  ["Requirement", "Value"],
  [
    ["Minimum third party liability", "$1,000,000 per occurrence"],
    ["Maximum deductible", "$2,500, or 5% of the capitalised cost"],
    ["Additional named insured", escapeHtml(data.parties.lessor.name ?? "")],
    ["Notice address", escapeHtml(data.parties.lessor.address ?? "")],
    ["Coverage required at all times", "Bodily injury, property damage, comprehensive, collision"],
  ],
)}
      <p class="section-note">The policy in force carries $2,000,000 liability and $1,000 deductibles, comfortably inside both limits. There is room to raise the deductible to $2,500 if a quote prices it favourably.</p>

      <hr class="hr mt-rule" />
${section("Protection products bought with the lease")}
      <div class="card-grid">
${protection || '        <p class="section-note">None recorded.</p>'}
      </div>`;

  return layout({
    page: "lease",
    title: "Lease",
    kicker: "Term, payments and end of lease",
    standfirst: `${progress.monthsRemaining} months to run`,
    asOf: data.meta.asOf,
    body,
    footnote:
      "The First Class Lease Protection Classic waiver does not apply if the vehicle is a total loss, if the purchase option is exercised, or on voluntary early termination. Excess kilometre charges are never waived.",
  });
}
