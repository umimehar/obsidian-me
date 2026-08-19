import { nextServiceDue, planDrawdown, windowStatus } from "../coverage";
import { escapeHtml, money, plainDate } from "../format";
import { callout, kv, layout, section, table } from "../layout";
import type { Protection, ServiceVisit, VehicleData } from "../types";

function tyreRow(visit: ServiceVisit): string {
  const t = visit.inspection?.tireTreadDepthMm;
  if (!t) return "—";
  const worst = Math.min(...Object.values(t));
  const flag = worst <= 4 ? ' <span class="badge">watch</span>' : "";
  return `${Object.entries(t)
    .map(([k, v]) => `${escapeHtml(k.replace(/([A-Z])/g, " $1").toLowerCase())} ${v} mm`)
    .join(", ")}${flag}`;
}

function protectionCard(p: Protection, asOf: string, odometer: number | null): string {
  const status = windowStatus(
    { expiryDate: p.expiryDate ?? null, expiryKm: p.expiryKm ?? null },
    asOf,
    odometer,
  );
  const badge = status.active
    ? `<span class="badge">active</span>`
    : `<span class="badge">expired</span>`;
  const rows: string[] = [];
  if (p.termMonths) rows.push(`${p.termMonths} months`);
  if (p.termKm) rows.push(`${p.termKm.toLocaleString("en-CA")} km`);
  if (p.numberOfServices) rows.push(`${p.numberOfServices} services`);
  return `        <div class="card">
          <p class="card-title">${escapeHtml(p.name)} ${badge}</p>
          <p class="card-meta">${escapeHtml(rows.join(" · ") || "Term not stated")}</p>
          ${p.detail ? `<p>${escapeHtml(p.detail)}</p>` : ""}
          <p>Expires ${plainDate(p.expiryDate ?? null)}${
            p.expiryKm ? ` or at ${p.expiryKm.toLocaleString("en-CA")} km` : ""
          }${
            status.kmRemaining !== null
              ? `, ${status.kmRemaining.toLocaleString("en-CA")} km left`
              : ""
          }.</p>
          ${p.price ? `<p class="card-meta">Paid ${money(p.price)}</p>` : ""}
        </div>`;
}

export function servicePage(data: VehicleData): string {
  const vehicle = data.fleet[0];
  if (!vehicle) throw new Error("service page needs a vehicle");
  const visits = [...vehicle.service].sort((a, b) => b.date.localeCompare(a.date));
  const latest = visits[0];
  const odometer = latest?.odometerOut ?? null;

  const plan = vehicle.protection.find((p) => p.kind === "maintenance");
  const drawdown = plan
    ? planDrawdown(
        {
          numberOfServices: plan.numberOfServices ?? null,
          termMonths: plan.termMonths ?? null,
          termKm: plan.termKm ?? null,
        },
        visits.map((v) => ({
          date: v.date,
          odometer: v.odometerOut,
          coveredByPlan: v.coveredByPlan,
        })),
      )
    : null;

  const due = latest
    ? nextServiceDue(
        { intervalKm: 20000, intervalMonths: 12 },
        { date: latest.date, odometer: latest.odometerOut, coveredByPlan: latest.coveredByPlan },
      )
    : null;

  const historyRows = visits.map((v) => [
    plainDate(v.date),
    escapeHtml(v.invoiceNumber),
    v.odometerOut === null ? "—" : `${v.odometerOut.toLocaleString("en-CA")} km`,
    escapeHtml(v.lines[0]?.description ?? "—"),
    v.coveredByPlan ? "Prepaid plan" : "Paid",
    money(v.customerPaid),
  ]);

  const findings = visits
    .flatMap((v) => v.lines.filter((l) => l.finding).map((l) => ({ v, l })))
    .map(
      ({ v, l }) => `        <div class="card">
          <p class="card-title">${escapeHtml(l.description)}</p>
          <p class="card-meta">${plainDate(v.date)} · ${
            v.odometerOut === null ? "" : `${v.odometerOut.toLocaleString("en-CA")} km · `
          }${escapeHtml(l.outcome ?? "noted")}</p>
          <p>${escapeHtml(l.finding ?? "")}</p>
        </div>`,
    )
    .join("\n");

  const protection = vehicle.protection.length
    ? vehicle.protection.map((p) => protectionCard(p, data.meta.asOf, odometer)).join("\n")
    : '        <p class="section-note">No protection product recorded yet.</p>';

  const body = `${section("Where the car stands", latest ? `Last seen at ${escapeHtml(latest.dealer)} on ${plainDate(latest.date)}.` : undefined)}
${kv([
  [
    "Odometer",
    odometer === null ? "—" : `<span class="num">${odometer.toLocaleString("en-CA")}</span> km`,
  ],
  ["In service", plainDate(vehicle.identity.inServiceDate)],
  [
    "Services used",
    drawdown
      ? `<span class="num">${drawdown.servicesUsed}</span> of ${plan?.numberOfServices ?? "—"} on the prepaid plan`
      : "—",
  ],
  [
    "Next service due",
    due
      ? `${plainDate(due.date)} or ${due.odometer?.toLocaleString("en-CA") ?? "—"} km, whichever comes first`
      : "—",
  ],
  [
    "Paid out of pocket to date",
    `<span class="num">${money(visits.reduce((sum, v) => sum + (v.customerPaid ?? 0), 0))}</span>`,
  ],
])}

${latest?.notes ? callout(`<strong>${escapeHtml(latest.notes)}</strong>`) : ""}

      <hr class="hr mt-rule" />
${section("Service history")}
${table(["Date", "Invoice", "Odometer", "Work", "Paid by", "Cost"], historyRows, [2, 5])}

      <hr class="hr mt-rule" />
${section("Findings worth tracking", "Items the dealer noted but did not repair.")}
      <div class="card-grid">
${findings || '        <p class="section-note">Nothing outstanding.</p>'}
      </div>

      <hr class="hr mt-rule" />
${section("Wear at the last inspection")}
${table(
  ["Measure", "Reading"],
  visits
    .filter((v) => v.inspection)
    .flatMap((v) => [
      ["Tyre tread", tyreRow(v)],
      [
        "Brake pads",
        v.inspection?.brakePadsMm
          ? Object.entries(v.inspection.brakePadsMm)
              .map(([k, val]) => `${escapeHtml(k)} ${val} mm`)
              .join(", ")
          : "—",
      ],
    ]),
)}

      <hr class="hr mt-rule" />
${section("Protection products", "What is still covered, and until when.")}
      <div class="card-grid">
${protection}
      </div>`;

  return layout({
    page: "service",
    title: "Service",
    kicker: "Maintenance, warranty and wear",
    standfirst:
      odometer === null ? "No odometer reading" : `${odometer.toLocaleString("en-CA")} km`,
    asOf: data.meta.asOf,
    body,
    footnote:
      "Every service so far has been covered by the prepaid maintenance plan. The figure that matters at lease end is not what was spent but whether the maintenance record is complete: incomplete maintenance to manufacturer specification voids the First Class Lease Protection wear and tear waiver.",
  });
}
