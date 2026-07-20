// Client entry point, bundled by render.ts's bundleClient() and inlined into
// the rendered page. Sections/charts land in Task 8; this task wires the
// scope filter and keeps the summary text in sync with it.
import type { Filter, FilterLedger } from "./filter";
import { createFilter } from "./filter";

interface LedgerPayload {
  ledger: FilterLedger;
}

function parseLedger(text: string): FilterLedger {
  return (JSON.parse(text) as LedgerPayload).ledger;
}

const dataEl = document.getElementById("ledger-data");
if (dataEl?.textContent) {
  const ledger = parseLedger(dataEl.textContent);
  const filter: Filter = createFilter(ledger, rerender);
  rerender();

  function rerender(): void {
    const summary = document.getElementById("scope-summary-text");
    if (summary) summary.textContent = filter.scopeLabel();
    // Sections and charts land in Task 8; for now just confirm the scope
    // resolves as expected.
    console.log(
      `scope: ${filter.resolveMonths().length} months across ${filter.selected().length} accounts`,
    );
  }
}
