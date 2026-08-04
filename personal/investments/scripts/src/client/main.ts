// Client entry point, bundled by render.ts's bundleClient() and inlined into
// the rendered page. Wires the scope filter to the three-pillar sections:
// every filter change recomputes the scope and re-renders the sections and
// their charts from one place.
import type { Filter } from "./filter";
import { createFilter } from "./filter";
import type { SectionsLedger } from "./sections";
import {
  renderSections,
  resetCashflowDrilldown,
  wireProjectionRateInputs,
  wireTaxRateInput,
} from "./sections";
import { decodeScope, writeScopeUrl } from "./url";

interface LedgerPayload {
  ledger: SectionsLedger;
}

function parseLedger(text: string): SectionsLedger {
  return (JSON.parse(text) as LedgerPayload).ledger;
}

const EMPTY_IDS = [
  "headline",
  "room",
  "growth-summary",
  "tax-cards",
  "proj-summary",
  "proj-table",
  "proj-caveats",
  "proj-warning",
  "acct-table",
  "hold-table",
];

function renderEmptyState(): void {
  const headline = document.getElementById("headline");
  if (headline) headline.textContent = "No data in the selected range.";
  for (const id of EMPTY_IDS.slice(1)) {
    const el = document.getElementById(id);
    if (el) el.textContent = "";
  }
  resetCashflowDrilldown();
}

const dataEl = document.getElementById("ledger-data");
if (dataEl?.textContent) {
  const ledger = parseLedger(dataEl.textContent);
  const restored = decodeScope(location.search, ledger.accounts);
  // Survives across rerenders so the URL keeps the drill-down while only the
  // accounts or window change. A filter change clears it, matching
  // resetCashflowDrilldown() collapsing the panel in renderSections.
  let period: string | null = restored.period;
  let pending: string | null = restored.period;
  const filter: Filter = createFilter(
    ledger,
    () => {
      period = null;
      pending = null;
      rerender();
    },
    restored.state,
  );
  wireTaxRateInput();
  wireProjectionRateInputs();
  rerender();

  function syncUrl(): void {
    writeScopeUrl({ state: filter.state(), period }, ledger.accounts);
  }

  function rerender(): void {
    const summary = document.getElementById("scope-summary-text");
    if (summary) summary.textContent = filter.scopeLabel();
    const scope = { ris: filter.resolveMonths(), accts: filter.selected() };
    if (scope.ris.length === 0) {
      renderEmptyState();
      period = null;
      syncUrl();
      return;
    }
    renderSections(ledger, scope, {
      period: pending,
      onDrilldown: (next) => {
        period = next;
        syncUrl();
      },
    });
    pending = period;
    syncUrl();
  }
}
