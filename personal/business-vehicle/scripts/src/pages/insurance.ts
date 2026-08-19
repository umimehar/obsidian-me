import { escapeHtml, money, percent, plainDate, wholeMoney } from "../format";
import { callout, kv, layout, section, table } from "../layout";
import type { Endorsement, Policy, VehicleData } from "../types";

function delta(prior: number, renewal: number): string {
  const diff = renewal - prior;
  if (diff === 0) return '<span class="num">0</span>';
  const cls = diff > 0 ? "neg" : "pos";
  const sign = diff > 0 ? "+" : "-";
  return `<span class="num ${cls}">${sign}${wholeMoney(Math.abs(diff)).slice(1)}</span>`;
}

function endorsementRows(policy: Policy): readonly (readonly string[])[] {
  return policy.endorsements.map((e: Endorsement) => [
    `<strong>${escapeHtml(e.code)}</strong> ${escapeHtml(e.name)}${
      e.note ? `<br /><span class="card-meta">${escapeHtml(e.note)}</span>` : ""
    }`,
    e.limit === null ? "—" : wholeMoney(e.limit),
    e.premium === null ? "—" : e.premium === 0 ? "Included" : wholeMoney(e.premium),
  ]);
}

export function insurancePage(data: VehicleData): string {
  const shopping = data.insuranceShopping;
  const policies = data.fleet[0]?.insurance ?? [];
  const renewal = policies.find((p) => p.status === "renewal offered");
  const prior = policies.find((p) => p.status === "expiring");
  if (!renewal || !prior) throw new Error("insurance page needs both a prior and a renewal policy");

  const change = (renewal.totalPremium - prior.totalPremium) / prior.totalPremium;

  const comparison = table(
    ["Line", "Prior term", "Renewal", "Change"],
    shopping.yearOverYear.map((row) => [
      row.line === "Total" ? `<strong>${escapeHtml(row.line)}</strong>` : escapeHtml(row.line),
      wholeMoney(row.prior),
      wholeMoney(row.renewal),
      delta(row.prior, row.renewal),
    ]),
    [1, 2, 3],
  );

  const why = shopping.whyItRose
    .map(
      (w) => `        <div class="card">
          <p class="card-title">${escapeHtml(w.driver)}</p>
          <p class="card-meta">${delta(0, w.delta)} on the year</p>
          <p>${escapeHtml(w.detail)}</p>
        </div>`,
    )
    .join("\n");

  const optional = renewal.optionalAccidentBenefits ?? [];
  const optionalTable = table(
    ["Benefit", "Limit", "Premium"],
    optional.map((o) => [
      escapeHtml(o.benefit) +
        (o.basis ? ` <span class="card-meta">(${escapeHtml(o.basis)})</span>` : ""),
      escapeHtml(o.limit),
      wholeMoney(o.premium),
    ]),
    [2],
  );

  const brokers = shopping.brokers
    .map(
      (b) => `        <div class="card">
          <p class="card-title">${escapeHtml(b.name)}${
            b.marketNeutral ? "" : ' <span class="badge">not a neutral market</span>'
          }</p>
          <p class="card-meta">${escapeHtml([b.contact, b.location].filter(Boolean).join(" · "))}</p>
          <p>${escapeHtml(b.email)}${b.phone ? `<br />${escapeHtml(b.phone)}` : ""}</p>
          <p><strong>${escapeHtml(b.status)}</strong></p>
          <p>Next: ${escapeHtml(b.nextStep)}</p>
          ${b.note ? `<p class="card-meta">${escapeHtml(b.note)}</p>` : ""}
        </div>`,
    )
    .join("\n");

  const quotes = shopping.quotes.length
    ? table(
        ["Broker", "Carrier", "Received", "Annual premium", "New vehicle replacement"],
        shopping.quotes.map((q) => [
          escapeHtml(q.broker),
          escapeHtml(q.carrier),
          plainDate(q.receivedOn),
          money(q.annualPremium),
          escapeHtml(q.newVehicleReplacement ?? "—"),
        ]),
        [3],
      )
    : `      <p class="section-note">No quote has come back yet. Four brokers were contacted on 19 August 2026.</p>`;

  const questions = data.openQuestions
    .map(
      (q) => `        <div class="card">
          <p class="card-title">${q.status === "answered" ? "Answered" : "Open"}</p>
          <p class="card-meta">Asked of ${escapeHtml(q.askedOf)}</p>
          <p>${escapeHtml(q.question)}</p>
          ${q.answer ? `<p><strong>${escapeHtml(q.answer)}</strong></p>` : ""}
        </div>`,
    )
    .join("\n");

  const musts = shopping.coverageToMatch.musts
    .map((m) => `          <li>${escapeHtml(m)}</li>`)
    .join("\n");

  const body = `${section("The number to beat", shopping.benchmark.note)}
${kv([
  ["Renewal premium", `<span class="num">${money(renewal.totalPremium)}</span> a year`],
  [
    "Monthly debit",
    `<span class="num">${money(renewal.paymentAmount)}</span> from ${plainDate("2026-10-01")}`,
  ],
  [
    "Year over year",
    `<span class="num neg">${percent(change)}</span> — ${wholeMoney(renewal.totalPremium - prior.totalPremium)} more`,
  ],
  ["Insurer", `${escapeHtml(renewal.insurer)}, underwritten by ${escapeHtml(renewal.underwriter)}`],
  ["Policy", escapeHtml(renewal.policyNumberMasked)],
  ["Rated as", `${escapeHtml(renewal.billingCategory)} use`],
])}

${callout(`<strong>${escapeHtml(shopping.coverageToMatch.note)}</strong>`)}

      <hr class="hr mt-rule" />
${section("Line by line", "Both terms, tax excluded.")}
${comparison}

      <hr class="hr mt-rule" />
${section("Why it rose")}
      <div class="card-grid">
${why}
      </div>

      <hr class="hr mt-rule" />
${section("The $253 of newly itemised accident benefits", "Priced separately for the first time on this renewal, under OPCF 47R.")}
${optionalTable}
      <p class="section-note">Still declined: ${escapeHtml((renewal.notIncluded ?? []).join("; "))}.</p>

      <hr class="hr mt-rule" />
${section("Endorsements on the renewal")}
${table(["Endorsement", "Limit", "Premium"], endorsementRows(renewal), [1, 2])}

      <hr class="hr mt-rule" />
${section("What a replacement quote has to carry", "Anything missing from this list is a downgrade, whatever the premium says.")}
      <ul>
${musts}
      </ul>

      <hr class="hr mt-rule" />
${section("Brokers", "All four contacted 19 August 2026.")}
      <div class="card-grid">
${brokers}
      </div>

      <hr class="hr mt-rule" />
${section("Quotes received")}
${quotes}

      <hr class="hr mt-rule" />
${section("Open questions")}
      <div class="card-grid">
${questions}
      </div>`;

  return layout({
    page: "insurance",
    title: "Insurance",
    kicker: "Coverage, renewal and the shopping decision",
    standfirst: `Renewal ${money(renewal.totalPremium)}, ${percent(change)} on the year`,
    asOf: data.meta.asOf,
    body,
    footnote: shopping.rules.map(escapeHtml).join(" "),
  });
}
