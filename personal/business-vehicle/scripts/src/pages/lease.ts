import { leaseProgress } from "../coverage";
import { escapeHtml, money, percent, plainDate, wholeMoney } from "../format";
import { callout, kv, layout, section, table } from "../layout";
import type { VehicleData } from "../types";

export function leasePage(data: VehicleData): string {
  const vehicle = data.fleet[0];
  if (!vehicle) throw new Error("lease page needs a vehicle");
  const lease = vehicle.lease;

  if (!lease?.termMonths) {
    return layout({
      page: "lease",
      title: "Lease",
      kicker: "Term, payments and end of lease",
      standfirst: "Awaiting extraction",
      asOf: data.meta.asOf,
      body: `${section("Not yet recorded")}
      <p>The lease terms are not in <code>data/vehicle.json</code> yet. The signed agreements are under <code>docs/lease/</code>.</p>`,
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

  const monthly = lease.monthlyPaymentTotal ?? null;
  const paidToDate = monthly === null ? null : monthly * progress.monthsElapsed;
  const odometer =
    [...vehicle.service].sort((a, b) => b.date.localeCompare(a.date))[0]?.odometerOut ?? null;
  const kmHeadroom =
    odometer === null || progress.kmAllowanceToDate === null
      ? null
      : progress.kmAllowanceToDate - odometer;

  const req = lease.insuranceRequirements;
  const gap = lease.gapProtection;
  const eol = lease.endOfLease;
  const early = lease.earlyTermination;
  const priced = (lease.pricing?.lineItems ?? []).filter((i) => (i.price ?? 0) > 0);
  const wearWaiver = vehicle.protection.find((p) => p.kind === "wear-and-tear");

  const body = `${section("Where the lease stands")}
${kv([
  ["Agreement", escapeHtml(lease.agreementNumber ?? "—")],
  ["Lessee", escapeHtml(data.parties.corporation.legalName ?? "—")],
  ["Co-lessee", escapeHtml(data.parties.driver.name ?? "—")],
  [
    "Lessor",
    `${escapeHtml(lease.lessorAtSigning ?? "")}, assigned to ${escapeHtml(lease.assignedTo ?? "")}`,
  ],
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
    `<span class="num">${money(monthly)}</span> including tax, due on the ${lease.paymentDueDay ?? "—"}th`,
  ],
  [
    "Paid to date",
    paidToDate === null
      ? "—"
      : `<span class="num">${money(paidToDate)}</span> across ${progress.monthsElapsed} payments`,
  ],
  ["Interest rate", `${percent(lease.interestRate ?? null, 2).replace("+", "")} a year`],
  [
    "Residual",
    `<span class="num">${wholeMoney(lease.residualValue ?? null)}</span> at maturity, ${percent(lease.residualPercent ?? null, 0).replace("+", "")} of the list price`,
  ],
  [
    "Purchase option",
    `<span class="num">${wholeMoney(lease.purchaseOptionPrice ?? null)}</span> as is, no transfer or documentation fee`,
  ],
  [
    "Total cost of the transaction",
    `<span class="num">${wholeMoney(lease.totalCostOfLeaseTransaction ?? null)}</span> in total, of which ${wholeMoney(lease.implicitFinanceCharge ?? null)} is finance charge`,
  ],
])}

      <hr class="hr mt-rule" />
${section("Kilometres", "The allowance accrues monthly. Being under it today is not the same as finishing under it.")}
${kv([
  [
    "Allowance",
    `<span class="num">${lease.kmPerYear?.toLocaleString("en-CA") ?? "—"}</span> a year, <span class="num">${lease.maximumAllowableKm?.toLocaleString("en-CA") ?? "—"}</span> over the term`,
  ],
  [
    "Earned so far",
    `<span class="num">${progress.kmAllowanceToDate?.toLocaleString("en-CA") ?? "—"}</span> km`,
  ],
  [
    "Actually driven",
    odometer === null ? "—" : `<span class="num">${odometer.toLocaleString("en-CA")}</span> km`,
  ],
  [
    "Headroom",
    kmHeadroom === null
      ? "—"
      : `<span class="num ${kmHeadroom >= 0 ? "pos" : "neg"}">${kmHeadroom.toLocaleString("en-CA")}</span> km`,
  ],
  [
    "Charge if over",
    `${money(lease.excessKmRate ?? null)} per kilometre, never waived and never credited back if unused`,
  ],
])}

${
  wearWaiver
    ? callout(
        `<strong>${escapeHtml(wearWaiver.name)} waives excess wear and tear up to ${money(wearWaiver.waiverLimit ?? null)}, and incomplete maintenance to manufacturer specification voids it.</strong> Keeping every service on the prepaid plan is what protects that waiver.`,
      )
    : ""
}

      <hr class="hr mt-rule" />
${section("What the lessor requires of the insurance", "Section 12. This is the box any replacement policy has to fit.")}
${table(
  ["Requirement", "Value"],
  [
    [
      "Minimum third party liability",
      `${wholeMoney(req?.minimumLiability ?? null)} combined single occurrence limit`,
    ],
    ["Maximum deductible", escapeHtml(req?.maximumDeductibleRule ?? "—")],
    ["Which works out to", `<strong>${money(req?.maximumDeductibleComputed ?? null)}</strong>`],
    [
      "MBFS named as",
      `${escapeHtml(req?.additionalNamedInsuredAndLossPayee ?? "")}, and additional named insured for liability`,
    ],
    ["Notice of change", escapeHtml(req?.noticeOfChange ?? "—")],
    ["If cover lapses", escapeHtml(req?.onLapse ?? "—")],
  ],
)}
      <p class="section-note">${escapeHtml(req?.maximumDeductibleNote ?? "")}</p>

      <hr class="hr mt-rule" />
${section("Gap protection is already in the lease", "Which changes what a replacement quote has to do.")}
      <p>${escapeHtml(gap?.detail ?? "")}</p>
      <p><strong>The condition.</strong> ${escapeHtml(gap?.conditions ?? "")}</p>
      <p class="section-note">Excluded: ${escapeHtml(gap?.excludes ?? "")}</p>

      <hr class="hr mt-rule" />
${section("Returning the car", `Maturity is ${plainDate(eol?.maturityDate ?? progress.maturityDate)}.`)}
      <p>Beyond anything unpaid, the charges on return are the cost of repairing excess wear and tear whether or not MBFS actually repairs it, excess kilometres, termination fees and taxes, and ${money(250)} if the maintenance booklets are missing.</p>
      <p><strong>Excess wear and tear counts</strong> ${escapeHtml((eol?.excessWearAndTearIncludes ?? []).join("; "))}.</p>
      <p><strong>Overholding.</strong> ${escapeHtml(eol?.overholding ?? "")}</p>

      <hr class="hr mt-rule" />
${section("Ending it early")}
      <p>The early termination charge is ${escapeHtml(early?.charge ?? "")}. ${escapeHtml(early?.waiver ?? "")}</p>
      <p class="section-note">${escapeHtml(early?.alsoOwed ?? "")}</p>

      <hr class="hr mt-rule" />
${section("What was paid at delivery", `${money(lease.dueAtSigning ?? null)} due at signing, ${money(lease.dueOnDelivery ?? null)} after the ${money(lease.customerDepositApplied ?? null)} deposit.`)}
${table(
  ["Item", "Amount"],
  (lease.dueAtSigningBreakdown ?? []).map((b) => [escapeHtml(b.item), money(b.amount)]),
  [1],
)}

      <hr class="hr mt-rule" />
${section("How the price was built", `List ${wholeMoney(lease.pricing?.totalList ?? null)}, less a ${wholeMoney(Math.abs(lease.pricing?.adjustment ?? 0))} adjustment.`)}
${table(
  ["Line", "Price"],
  [
    ["<strong>Base vehicle</strong>", wholeMoney(lease.pricing?.basePrice ?? null)],
    ...priced.map((i) => [
      escapeHtml(i.description) +
        (i.code ? ` <span class="chip-id">${escapeHtml(i.code)}</span>` : ""),
      wholeMoney(i.price),
    ]),
  ],
  [1],
)}

      <hr class="hr mt-rule" />
${section("Fees and restrictions")}
${table(
  ["Item", "Value"],
  [
    ["Transfer to a third party", money(lease.fees?.leaseTransferToThirdParty ?? null)],
    ["Late charge", escapeHtml(lease.fees?.lateCharge ?? "—")],
    ["Dishonoured payment", money(lease.fees?.nsf ?? null)],
    ["Traffic ticket handling", money(lease.fees?.trafficTicketHandling ?? null)],
    ["Governing law", escapeHtml(lease.governingLaw ?? "—")],
  ],
)}
      <p class="section-note">${escapeHtml((lease.restrictions ?? []).join(". "))}.</p>`;

  return layout({
    page: "lease",
    title: "Lease",
    kicker: "Term, payments and end of lease",
    standfirst: `${progress.monthsRemaining} months to run`,
    asOf: data.meta.asOf,
    body,
    footnote:
      "Page 7 carries a signed corporate declaration that the vehicle will be used primarily for business or commercial purposes, and the preauthorized payment authorisation is ticked business purposes. That declaration also gives up the protection of Ontario consumer protection and cost of credit disclosure legislation for this lease.",
  });
}
