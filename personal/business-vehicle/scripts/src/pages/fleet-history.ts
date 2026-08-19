import { leaseProgress } from "../coverage";
import { escapeHtml, money, plainDate } from "../format";
import { kv, layout, section, table } from "../layout";
import type { Vehicle, VehicleData } from "../types";

function statusLabel(v: Vehicle): string {
  if (v.status === "current") return "Current";
  if (v.status === "returned") return "Returned";
  return "On order";
}

export function fleetHistoryPage(data: VehicleData): string {
  const rows = data.fleet.map((v) => {
    const term =
      v.lease?.termMonths && v.lease.termMonths > 0
        ? leaseProgress(
            {
              startDate: v.lease.dateOfLease ?? v.identity.inServiceDate,
              termMonths: v.lease.termMonths,
              kmPerYear: v.lease.kmPerYear ?? null,
            },
            data.meta.asOf,
          )
        : null;
    return [
      `<strong>${v.identity.year} ${escapeHtml(v.identity.make)} ${escapeHtml(v.identity.model)}</strong><br /><span class="card-meta">${escapeHtml(v.identity.vin)}</span>`,
      statusLabel(v),
      plainDate(v.identity.inServiceDate),
      term ? `${v.lease?.termMonths} months to ${plainDate(term.maturityDate)}` : "—",
      money(v.lease?.monthlyPaymentTotal ?? null),
      escapeHtml(String(v.service.length)),
    ];
  });

  const current = data.fleet.find((v) => v.status === "current");

  const body = `${section("Every leased vehicle", "One row per vehicle, current and returned.")}
${table(["Vehicle", "Status", "In service", "Term", "Monthly", "Service visits"], rows, [4, 5])}

      <hr class="hr mt-rule" />
${section("Current vehicle in detail")}
${
  current
    ? kv([
        [
          "Year, make, model",
          `${current.identity.year} ${escapeHtml(current.identity.make)} ${escapeHtml(current.identity.model)}`,
        ],
        ["Variant", escapeHtml(current.identity.variant ?? "—")],
        ["VIN", escapeHtml(current.identity.vin)],
        ["Colour", escapeHtml(current.identity.colourName ?? "—")],
        ["Condition at purchase", escapeHtml(current.identity.condition ?? "—")],
        ["In service", plainDate(current.identity.inServiceDate)],
        ["Garaged", "200 Burnhamthorpe Rd E Unit 1004, Mississauga, underground parking"],
        ["Winter tyres", "Fitted each season, earning a 3% insurance discount"],
      ])
    : '      <p class="section-note">No current vehicle.</p>'
}

      <hr class="hr mt-rule" />
${section("Before this one")}
      <p>No documents exist in this vault for any lease before the 2026 GLC 43. The schema already holds their shape: adding an earlier vehicle is a new entry in <code>fleet</code> with its own lease, insurance and service records, and this page picks it up with no other change.</p>`;

  return layout({
    page: "fleet-history",
    title: "Fleet history",
    kicker: "Every vehicle, current and returned",
    standfirst: `${data.fleet.length} vehicle${data.fleet.length === 1 ? "" : "s"} on record`,
    asOf: data.meta.asOf,
    body,
  });
}
