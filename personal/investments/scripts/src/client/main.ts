// Client entry point, bundled by render.ts's bundleClient() and inlined into
// the rendered page. Wires the scope filter to the three-pillar sections:
// every filter change recomputes the scope and re-renders the sections and
// their charts from one place.
import type { Filter } from "./filter";
import { createFilter } from "./filter";
import type { SectionsLedger } from "./sections";
import { renderSections, wireTaxRateInput } from "./sections";

interface LedgerPayload {
  ledger: SectionsLedger;
}

function parseLedger(text: string): SectionsLedger {
  return (JSON.parse(text) as LedgerPayload).ledger;
}

const EMPTY_IDS = ["headline", "room", "growth-summary", "tax-cards", "acct-table", "hold-table"];

function renderEmptyState(): void {
  const headline = document.getElementById("headline");
  if (headline) headline.textContent = "No data in the selected range.";
  for (const id of EMPTY_IDS.slice(1)) {
    const el = document.getElementById(id);
    if (el) el.textContent = "";
  }
}

const dataEl = document.getElementById("ledger-data");
if (dataEl?.textContent) {
  const ledger = parseLedger(dataEl.textContent);
  const filter: Filter = createFilter(ledger, rerender);
  wireTaxRateInput(ledger);
  rerender();

  function rerender(): void {
    const summary = document.getElementById("scope-summary-text");
    if (summary) summary.textContent = filter.scopeLabel();
    const scope = { ris: filter.resolveMonths(), accts: filter.selected() };
    if (scope.ris.length === 0) {
      renderEmptyState();
      return;
    }
    renderSections(ledger, scope);
  }
}
