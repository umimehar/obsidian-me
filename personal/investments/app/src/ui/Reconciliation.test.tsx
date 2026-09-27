import { describe, expect, test } from "bun:test";
import { Theme } from "@radix-ui/themes";
import { render, screen, within } from "@testing-library/react";
import { GOLDENS } from "../goldens";
import type { ReconciliationReport, ReportedFinding } from "../validate/report";
import { Reconciliation } from "./Reconciliation";
import { loadReconciliation } from "./data";

function renderReal() {
  render(
    <Theme>
      <Reconciliation report={loadReconciliation()} scope="all" />
    </Theme>,
  );
}

function region(name: string) {
  const node = document.querySelector(`[data-recon-${name}]`);
  if (node === null) throw new Error(`expected the reconciliation ${name} region to render`);
  return within(node as HTMLElement);
}

function group(check: string) {
  const node = document.querySelector(`[data-finding-group="${check}"]`);
  if (node === null) throw new Error(`expected a ${check} group to render`);
  return node as HTMLElement;
}

function emptyReport(): ReconciliationReport {
  return { generated: "2026-08-06T00:00:00.000Z", statementCount: 0, findings: [] };
}

function reportWith(...findings: ReportedFinding[]): ReconciliationReport {
  return { ...emptyReport(), statementCount: 220, findings };
}

function makeFinding(overrides: Partial<ReportedFinding> = {}): ReportedFinding {
  return {
    check: "statement-arithmetic",
    severity: "warning",
    accountShortId: "55ce",
    period: "2026-06",
    message: "differs by 0.02",
    expected: 100,
    actual: 100.02,
    delta: 0.02,
    sourceFile: "55ce_2026-06_BROKERAGE.pdf",
    acknowledged: false,
    reason: null,
    ...overrides,
  };
}

/** The real ground-truth line's figures, with no corrections.ts entry behind them yet. */
function unacknowledgedGroundTruth(): ReportedFinding {
  return {
    check: "ground-truth",
    severity: "warning",
    accountShortId: "*",
    period: "2026-07",
    message: "account value on 2026-07-31 versus the app",
    expected: 242019.61,
    actual: 241739.67,
    delta: -279.94,
    sourceFile: "",
    acknowledged: false,
    reason: null,
  };
}

describe("Reconciliation, the ground-truth headline", () => {
  test("prints the computed figure, the app's figure and the difference between them", () => {
    renderReal();
    const truth = region("ground-truth");
    expect(truth.getByText("$227,433.46")).toBeDefined();
    expect(truth.getByText("$242,019.61")).toBeDefined();
    expect(truth.getByText("-$14,586.15")).toBeDefined();
  });

  test("labels which figure is which, rather than printing the raw field names", () => {
    renderReal();
    const truth = region("ground-truth");
    expect(truth.getByText("This system computes")).toBeDefined();
    expect(truth.getByText("The app showed")).toBeDefined();
    expect(truth.getByText("Difference")).toBeDefined();
    expect(truth.queryByText("Expected")).toBeNull();
    expect(truth.queryByText("Actual")).toBeNull();
  });

  test("says what was compared and when it was observed", () => {
    renderReal();
    expect(region("ground-truth").getByText(/account value on 2026-06-30/)).toBeDefined();
  });

  test("gives the reason, naming the holding whose valuation is not final", () => {
    renderReal();
    const reason = region("reason");
    // Both halves of the explanation, not just the one that was there first.
    expect(reason.getByText(/spousal RRSP/i)).toBeDefined();
    expect(reason.getByText(/WSE401/)).toBeDefined();
  });

  test("says the explanation is untested rather than presenting it as settled", () => {
    renderReal();
    expect(region("ground-truth").getByText(/not been tested/i)).toBeDefined();
  });

  test("an unacknowledged difference says no reason is on record, not that one is", () => {
    // The owner adds an observation to truth.ts before writing the matching
    // corrections.ts entry. A card that still said "the reason above is on
    // record" would turn no explanation at all into an unproven explanation,
    // which is the exact inversion this whole view exists to prevent.
    render(
      <Theme>
        <Reconciliation report={reportWith(unacknowledgedGroundTruth())} scope="all" />
      </Theme>,
    );
    const truth = region("ground-truth");
    expect(truth.getByText("-$279.94")).toBeDefined();
    expect(truth.getByText(/no reason is on record/i)).toBeDefined();
    expect(truth.queryByText(/reason above is on record/i)).toBeNull();
    expect(truth.queryByText(/not been tested/i)).toBeNull();
    expect(document.querySelector("[data-recon-reason]")).toBeNull();
  });

  test("says so plainly when the report carries no ground-truth observation", () => {
    render(
      <Theme>
        <Reconciliation report={emptyReport()} scope="all" />
      </Theme>,
    );
    expect(screen.getByText(/no figure from the app/i)).toBeDefined();
    expect(document.querySelector("[data-recon-ground-truth]")).toBeNull();
  });
});

describe("Reconciliation, the findings", () => {
  test("renders every finding, hiding none of them", () => {
    renderReal();
    // All but one in the groups, plus the ground-truth line promoted into the
    // headline card. Promoted, not dropped: the card is the fuller rendering
    // of it, and the arithmetic here is what proves nothing else went missing.
    const promoted = 1;
    expect(document.querySelectorAll("[data-finding-row]").length).toBe(
      GOLDENS.reconciliation.findingCount - promoted,
    );
    expect(document.querySelector("[data-recon-ground-truth]")).not.toBeNull();
  });

  test("the promoted ground-truth line does not also render as a group row", () => {
    renderReal();
    // Rendered twice it read "This system computes ..." in the card and
    // "Stated $242,019.61" in the row: two descriptions of one fact that
    // disagree about which figure came from where. $242,019.61 is a number the
    // owner read off the app, and no statement ever stated it.
    expect(document.querySelector('[data-finding-group="ground-truth"]')).toBeNull();
    expect(screen.getAllByText("$242,019.61").length).toBe(1);
    expect(screen.getAllByText("-$14,586.15").length).toBe(1);
    // A phrase unique to the acknowledgement's reason. "WSE401" alone now
    // appears twice on the page, because the finding's own message names the
    // holding too -- matching on it would fail this test for the wrong reason.
    expect(screen.getAllByText(/residual of \$0\.00/).length).toBe(1);
  });

  test("a ground-truth line that is not the promoted one keeps the card's labels", () => {
    // An older observation still belongs in the groups, but never under
    // "Stated": the field holds what the app showed, not what a statement said.
    const older = { ...unacknowledgedGroundTruth(), period: "2026-05" };
    const newer = unacknowledgedGroundTruth();
    render(
      <Theme>
        <Reconciliation report={reportWith(newer, older)} scope="all" />
      </Theme>,
    );
    const row = within(group("ground-truth"));
    expect(row.getByText("The app showed")).toBeDefined();
    expect(row.getByText("This system computes")).toBeDefined();
    expect(row.queryByText("Stated")).toBeNull();
    expect(row.queryByText("Computed")).toBeNull();
  });

  test("counts the corpus it checked and what it found", () => {
    renderReal();
    const report = loadReconciliation();
    const errors = report.findings.filter((f) => f.severity === "error").length;
    const summary = region("summary");
    expect(
      summary.getByText(new RegExp(`${GOLDENS.corpus.statementCount} statements`)),
    ).toBeDefined();
    expect(
      summary.getByText(new RegExp(`${GOLDENS.reconciliation.findingCount} findings`)),
    ).toBeDefined();
    expect(summary.getByText(new RegExp(`${errors} errors`))).toBeDefined();
    expect(
      summary.getByText(new RegExp(`${GOLDENS.reconciliation.findingCount - errors} warnings`)),
    ).toBeDefined();
    expect(
      summary.getByText(new RegExp(`${GOLDENS.reconciliation.acknowledgedCount} acknowledged`)),
    ).toBeDefined();
  });

  test("each group's own summary counts its errors and its acknowledgements", () => {
    renderReal();
    const heading = group("cross-document").querySelector("summary");
    if (heading === null) throw new Error("expected the cross-document group to have a summary");
    expect(heading.textContent).toBe("Across documents 1 finding, 1 error, 1 acknowledged");

    const arithmetic = group("statement-arithmetic").querySelector("summary");
    const n = GOLDENS.reconciliation.statementArithmeticCount;
    expect(arithmetic?.textContent).toBe(`Statement arithmetic ${n} findings, ${n} warnings`);
  });

  test("puts all three error groups ahead of the large warning group", () => {
    renderReal();
    const order = [...document.querySelectorAll("[data-finding-group]")].map((node) =>
      node.getAttribute("data-finding-group"),
    );
    expect(order.slice(0, 3).sort()).toEqual(["cross-document", "return-direction", "style-drift"]);
    expect(order.indexOf("statement-arithmetic")).toBeGreaterThan(2);
  });

  test("shows an acknowledged finding with its reason instead of dropping it", () => {
    renderReal();
    const node = group("style-drift").querySelector("[data-finding-row]");
    if (node === null) throw new Error("expected the style-drift finding to render");
    const row = within(node as HTMLElement);
    expect(row.getByText("Acknowledged")).toBeDefined();
    expect(row.getByText(/self-directed to a Wealthsimple Managed portfolio/)).toBeDefined();
  });

  test("a finding with no figures prints none, never a zero", () => {
    renderReal();
    // style-drift carries null expected, actual and delta.
    expect(within(group("style-drift")).queryByText("$0.00")).toBeNull();
  });

  test("prints the real figures on the cross-document error", () => {
    renderReal();
    const cross = within(group("cross-document"));
    expect(cross.getByText("$12,000.00")).toBeDefined();
    expect(cross.getByText("$11,984.22")).toBeDefined();
    expect(cross.getByText("-$15.78")).toBeDefined();
  });

  test("names the masked account and period each finding belongs to", () => {
    renderReal();
    const cross = within(group("cross-document"));
    expect(cross.getByText("d6d9 2025-11")).toBeDefined();
    expect(cross.getByText("d6d9_2025-11_PERFORMANCE.pdf")).toBeDefined();
  });

  test("the rounding warnings sit in one collapsed group that states its own size", () => {
    renderReal();
    const n = GOLDENS.reconciliation.statementArithmeticCount;
    const arithmetic = group("statement-arithmetic");
    expect(arithmetic.querySelectorAll("[data-finding-row]").length).toBe(n);
    expect((arithmetic as HTMLDetailsElement).open).toBe(false);
    expect(within(arithmetic).getByText(new RegExp(`${n} findings`))).toBeDefined();
  });

  test("a group carrying an error is open, so an error is never behind a click", () => {
    renderReal();
    expect((group("cross-document") as HTMLDetailsElement).open).toBe(true);
    expect((group("style-drift") as HTMLDetailsElement).open).toBe(true);
  });

  test("an error opens a group that is far too large to open on size alone", () => {
    // The corpus's two error groups hold one finding each, so they open on the
    // size rule whether the severity rule exists or not. Thirteen findings is
    // past the collapse threshold: only the severity rule can open this.
    const findings = [
      makeFinding({ check: "balance-chain", severity: "error", period: "2026-01" }),
      ...Array.from({ length: 12 }, (_, i) =>
        makeFinding({ check: "balance-chain", period: `2025-${String(i + 1).padStart(2, "0")}` }),
      ),
    ];
    render(
      <Theme>
        <Reconciliation report={reportWith(...findings)} scope="all" />
      </Theme>,
    );
    const chain = group("balance-chain") as HTMLDetailsElement;
    expect(chain.querySelectorAll("[data-finding-row]").length).toBe(13);
    expect(chain.open).toBe(true);
  });

  test("a large warning-only group of the same size stays collapsed", () => {
    // The other half of the rule. Without it the test above would pass against
    // a view that simply opens everything.
    const findings = Array.from({ length: 13 }, (_, i) =>
      makeFinding({ check: "balance-chain", period: `2025-${String(i + 1).padStart(2, "0")}` }),
    );
    render(
      <Theme>
        <Reconciliation report={reportWith(...findings)} scope="all" />
      </Theme>,
    );
    expect((group("balance-chain") as HTMLDetailsElement).open).toBe(false);
  });

  test("a report with no findings says the corpus reconciles, not nothing at all", () => {
    render(
      <Theme>
        <Reconciliation report={emptyReport()} scope="all" />
      </Theme>,
    );
    expect(screen.getByText(/no check reported anything/i)).toBeDefined();
    expect(document.querySelectorAll("[data-finding-row]").length).toBe(0);
  });
});
