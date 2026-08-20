import { findingsHtml } from "../findings";
import { escapeHtml, plainDate } from "../format";
import { callout, kv, layout, section, table } from "../layout";
import type { VehicleData } from "../types";

export function compliancePage(data: VehicleData): string {
  const c = data.compliance;
  const vehicle = data.fleet[0];
  if (!vehicle) throw new Error("compliance page needs a vehicle");

  const treatment = table(
    ["Topic", "Where it stands", "Status"],
    c.taxTreatment.map((t) => [
      `<strong>${escapeHtml(t.topic)}</strong>`,
      escapeHtml(t.detail),
      escapeHtml(t.status),
    ]),
  );

  const body = `${section("Who owns what")}
${kv([
  [
    "Registered owner",
    `${escapeHtml(c.corporateOwner)} and ${escapeHtml(data.parties.driver.name ?? "")}`,
  ],
  [
    "Named insured",
    `${escapeHtml(data.parties.driver.name ?? "")} and ${escapeHtml(c.corporateOwner)}`,
  ],
  ["Rated as", `${escapeHtml(c.useSplit.declared)} use`],
  [
    "Business kilometres declared",
    c.useSplit.businessKmOnPolicy === null
      ? "None. The field is blank on both certificates."
      : String(c.useSplit.businessKmOnPolicy),
  ],
  [
    "Annual kilometres declared",
    `<span class="num">${c.useSplit.annualKmOnPolicy.toLocaleString("en-CA")}</span>`,
  ],
  [
    "Business use percentage",
    c.useSplit.businessUsePercent === null
      ? "Not established"
      : `${c.useSplit.businessUsePercent}%`,
  ],
  ["Mileage log kept", c.mileageLog.kept ? "Yes" : "No"],
])}

${callout(`<strong>${escapeHtml(c.useSplit.risk)}</strong>`)}

      <hr class="hr mt-rule" />
${section("Where this bites", "The declared use conflict, everywhere it shows up.")}
      <div class="card-grid">
${findingsHtml(data.findings, { only: "high" })}
      </div>

      <hr class="hr mt-rule" />
${section("Mileage")}
      <p>${escapeHtml(c.mileageLog.note)}</p>

      <hr class="hr mt-rule" />
${section("Tax treatment", "Questions for the accountant, with the numbers already assembled.")}
${treatment}

      <hr class="hr mt-rule" />
${section("Dates that matter")}
${table(
  ["Date", "What happens"],
  [
    [
      plainDate(vehicle.identity.inServiceDate),
      "Vehicle in service. Every warranty and protection window counts from here.",
    ],
    [plainDate("2026-09-01"), "Last debit of the expiring insurance term, $700.84."],
    [plainDate("2026-09-30"), "Last day to bind a replacement policy without a gap."],
    [plainDate("2026-10-01"), "Renewal takes effect. First debit of $804.75."],
    [
      plainDate("2028-09-29"),
      "Manufacturer warranty expires on the dealer invoice date. The pricing worksheet implies a year later, see the overview.",
    ],
  ],
)}`;

  return layout({
    page: "compliance",
    title: "Compliance",
    kicker: "Corporate use, mileage and tax",
    standfirst: "Business use percentage still unsettled",
    asOf: data.meta.asOf,
    body,
    footnote: escapeHtml(c.note),
  });
}
