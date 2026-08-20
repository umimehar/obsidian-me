import { leasePayoff, leaseProgress } from "../coverage";
import { escapeHtml, money, percent, plainDate, wholeMoney } from "../format";
import { callout, kv, layout, section, table } from "../layout";
import type { VehicleData } from "../types";

export function dealPage(data: VehicleData): string {
  const vehicle = data.fleet[0];
  const m = data.marketAssessment;
  const lease = vehicle?.lease;
  if (!vehicle || !lease?.termMonths) throw new Error("deal page needs a vehicle and a lease");

  const progress = leaseProgress(
    {
      startDate: lease.dateOfLease ?? vehicle.identity.inServiceDate,
      termMonths: lease.termMonths,
      kmPerYear: lease.kmPerYear ?? null,
    },
    data.meta.asOf,
  );
  const payoff = leasePayoff(lease, progress.monthsRemaining);
  const p = lease.pricing;
  const discount = p?.adjustment && p?.totalList ? Math.abs(p.adjustment) / p.totalList : null;
  const softTotal = m.weaknesses.find((w) => w.cost !== null)?.cost ?? null;

  const cards = (
    items: readonly { point: string; detail: string; cost?: number | null }[],
  ): string =>
    items
      .map(
        (i) => `        <div class="card">
          <p class="card-title">${escapeHtml(i.point)}</p>
          ${i.cost ? `<p class="card-meta">${money(i.cost)}</p>` : ""}
          <p>${escapeHtml(i.detail)}</p>
        </div>`,
      )
      .join("\n");

  const newest = m.comparables.filter((c) => c.year >= vehicle.identity.year);
  const older = m.comparables.filter((c) => c.year < vehicle.identity.year);

  const body = `${section("The verdict")}
      <p class="callout-lead">${escapeHtml(m.summary)}</p>
${kv([
  ["Verdict", `<strong>${escapeHtml(m.verdict)}</strong>`],
  ["Left on the table", escapeHtml(m.estimatedLeft)],
  [
    "Discount taken",
    discount === null
      ? "—"
      : `${percent(discount).replace("+", "")} off ${wholeMoney(p?.totalList ?? null)}`,
  ],
  ["Soft products and fees", softTotal === null ? "—" : money(softTotal)],
  [
    "Total cost of the lease",
    `<span class="num">${wholeMoney(lease.totalCostOfLeaseTransaction ?? null)}</span>, ${money((lease.totalCostOfLeaseTransaction ?? 0) / lease.termMonths)} a month`,
  ],
])}

      <hr class="hr mt-rule" />
${section("What was good")}
      <div class="card-grid">
${cards(m.strengths)}
      </div>

      <hr class="hr mt-rule" />
${section("What was not")}
      <div class="card-grid">
${cards(m.weaknesses)}
      </div>

      <hr class="hr mt-rule" />
${section("Where you stand today", `${progress.monthsElapsed} months in, ${progress.monthsRemaining} to run.`)}
${table(
  ["", "Amount"],
  [
    [
      "Estimated payoff, remaining payments plus residual discounted at the lease rate",
      money(payoff),
    ],
    ["Comparable 2026 asking retail", `about ${wholeMoney(83000)}`],
    ["Likely trade value", `about ${wholeMoney(73000)}`],
  ],
  [1],
)}
      <p class="section-note">Being underwater at this point is normal and is not your exposure, unless you exit early.</p>

${callout(`<strong>${escapeHtml(m.earlyExit.recommendation)}</strong> ${escapeHtml(m.earlyExit.why)}`)}

      <hr class="hr mt-rule" />
${section("At maturity", plainDate(lease.endOfLease?.maturityDate ?? progress.maturityDate))}
${table(
  ["", "Amount"],
  [
    ["<strong>Guaranteed buyout</strong>", wholeMoney(m.maturity.buyout)],
    ["What three year old examples ask retail today", wholeMoney(m.maturity.projectedRetail)],
    ["Likely wholesale at that age", wholeMoney(m.maturity.projectedWholesale)],
  ],
  [1],
)}

${callout(`<strong>${escapeHtml(m.maturity.recommendation)}</strong> ${escapeHtml(m.maturity.why)}`)}

      <hr class="hr mt-rule" />
${section("What the market shows", m.comparablesNote)}
${table(
  ["Vehicle", "Odometer", "Asking", "Where"],
  [...newest, ...older].map((c) => [
    `${c.year} ${escapeHtml(c.description)}`,
    `${c.odometerKm.toLocaleString("en-CA")} km`,
    wholeMoney(c.askingPrice),
    escapeHtml(c.location),
  ]),
  [1, 2],
)}

      <hr class="hr mt-rule" />
${section("Next time")}
      <ol>
${m.nextTime.map((n) => `        <li>${escapeHtml(n)}</li>`).join("\n")}
      </ol>

      <hr class="hr mt-rule" />
${section("What this rests on", "So the verdict can be re-judged rather than taken on faith.")}
      <ul>
${m.limits.map((l) => `        <li>${escapeHtml(l)}</li>`).join("\n")}
      </ul>
      <p class="section-note">Sources: ${m.sources
        .map((s) => `<a href="${escapeHtml(s.url)}">${escapeHtml(s.title)}</a>`)
        .join(", ")}. Checked ${plainDate(m.asOf)}.</p>`;

  return layout({
    page: "deal",
    title: "Was it a good deal",
    kicker: "The lease against the market",
    standfirst: m.verdict,
    asOf: m.asOf,
    body,
    footnote:
      "A generous residual is worth having as protection, not as a purchase. It means the lessor priced the car's future above what the market will pay, and at maturity that is their loss to take rather than yours to buy.",
  });
}
