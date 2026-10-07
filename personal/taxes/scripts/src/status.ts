/** Human words for every status, and the ordering rules the pages share. */

import { escapeHtml } from "./format";
import type { Filing, FilingStatus, ItemStatus, OpenItem } from "./types";

const FILING_STATUS: Record<FilingStatus, string> = {
  filed: "Filed",
  assessed: "Filed and assessed",
  prepared: "Prepared, not filed",
  "in-progress": "In progress",
  upcoming: "Not started",
  "not-required": "Not required",
};

const ITEM_STATUS: Record<ItemStatus, string> = {
  open: "To do",
  waiting: "Waiting on someone",
  done: "Done",
  superseded: "No longer needed",
};

/** Returns that are paid on a schedule rather than filed. */
export const PAID_NOT_FILED: readonly string[] = ["instalments", "payroll"];

export function filingBadge(status: FilingStatus): string {
  return `<span class="tax-status tax-status-${status}">${FILING_STATUS[status]}</span>`;
}

export function itemBadge(status: ItemStatus): string {
  return `<span class="tax-status tax-item-${status}">${ITEM_STATUS[status]}</span>`;
}

export function resultText(f: Filing): string {
  if (!f.result) return "—";
  if (f.result.kind === "nil") return "Nothing owing";
  const amount = new Intl.NumberFormat("en-CA", { style: "currency", currency: "CAD" }).format(
    f.result.amount,
  );
  return escapeHtml(f.result.kind === "refund" ? `Refund ${amount}` : `Owing ${amount}`);
}

/** Open items first, then waiting; within each, soonest due first and undated last. */
export function sortItems(items: readonly OpenItem[]): OpenItem[] {
  const rank: Record<ItemStatus, number> = { open: 0, waiting: 1, done: 2, superseded: 3 };
  return [...items].sort(
    (a, b) =>
      rank[a.status] - rank[b.status] ||
      (a.due ?? "9999").localeCompare(b.due ?? "9999") ||
      a.title.localeCompare(b.title),
  );
}

export function isLive(item: OpenItem): boolean {
  return item.status === "open" || item.status === "waiting";
}
