import { describe, expect, test } from "bun:test";
import { Theme } from "@radix-ui/themes";
import { render, screen, within } from "@testing-library/react";
import type { ReconciliationReport, ReportedFinding } from "../validate/report";
import { Reconciliation } from "./Reconciliation";
import { loadReconciliation } from "./data";

function renderReal() {
  render(
    <Theme>
      <Reconciliation report={loadReconciliation()} />
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
    expect(truth.getByText("$241,739.67")).toBeDefined();
    expect(truth.getByText("$242,019.61")).toBeDefined();
    expect(truth.getByText("-$279.94")).toBeDefined();
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
    expect(reason.getByText(/WSE401 carries a pending valuation/)).toBeDefined();
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
        <Reconciliation report={reportWith(unacknowledgedGroundTruth())} />
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
        <Reconciliation report={emptyReport()} />
      </Theme>,
    );
    expect(screen.getByText(/no figure from the app/i)).toBeDefined();
    expect(document.querySelector("[data-recon-ground-truth]")).toBeNull();
  });
});

describe("Reconciliation, the findings", () => {
  test("renders every one of the 88 findings, hiding none of them", () => {
    renderReal();
    expect(document.querySelectorAll("[data-finding-row]").length).toBe(88);
  });

  test("counts the corpus it checked and what it found", () => {
    renderReal();
    const summary = region("summary");
    expect(summary.getByText(/220 statements/)).toBeDefined();
    expect(summary.getByText(/88 findings/)).toBeDefined();
    expect(summary.getByText(/2 errors/)).toBeDefined();
    expect(summary.getByText(/86 warnings/)).toBeDefined();
    expect(summary.getByText(/3 acknowledged/)).toBeDefined();
  });

  test("each group's own summary counts its errors and its acknowledgements", () => {
    renderReal();
    const heading = group("cross-document").querySelector("summary");
    if (heading === null) throw new Error("expected the cross-document group to have a summary");
    expect(heading.textContent).toBe("Across documents 1 finding, 1 error, 1 acknowledged");

    const arithmetic = group("statement-arithmetic").querySelector("summary");
    expect(arithmetic?.textContent).toBe("Statement arithmetic 84 findings, 84 warnings");
  });

  test("puts the error groups ahead of the 84-strong warning group", () => {
    renderReal();
    const order = [...document.querySelectorAll("[data-finding-group]")].map((node) =>
      node.getAttribute("data-finding-group"),
    );
    expect(order.slice(0, 2).sort()).toEqual(["cross-document", "style-drift"]);
    expect(order.indexOf("statement-arithmetic")).toBeGreaterThan(1);
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

  test("the 84 rounding warnings sit in one collapsed group that states its own size", () => {
    renderReal();
    const arithmetic = group("statement-arithmetic");
    expect(arithmetic.querySelectorAll("[data-finding-row]").length).toBe(84);
    expect((arithmetic as HTMLDetailsElement).open).toBe(false);
    expect(within(arithmetic).getByText(/84 findings/)).toBeDefined();
  });

  test("a group carrying an error is open, so an error is never behind a click", () => {
    renderReal();
    expect((group("cross-document") as HTMLDetailsElement).open).toBe(true);
    expect((group("style-drift") as HTMLDetailsElement).open).toBe(true);
  });

  test("a report with no findings says the corpus reconciles, not nothing at all", () => {
    render(
      <Theme>
        <Reconciliation report={emptyReport()} />
      </Theme>,
    );
    expect(screen.getByText(/no check reported anything/i)).toBeDefined();
    expect(document.querySelectorAll("[data-finding-row]").length).toBe(0);
  });
});
