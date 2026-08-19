/** The header nav every page shares. One source for the page list means a page can never
    go missing from another page's header. */

export interface PageDef {
  readonly id: PageId;
  readonly file: string;
  readonly label: string;
}

export type PageId = "index" | "lease" | "insurance" | "service" | "compliance" | "fleet-history";

export const PAGES: readonly PageDef[] = [
  { id: "index", file: "index.html", label: "Overview" },
  { id: "lease", file: "lease.html", label: "Lease" },
  { id: "insurance", file: "insurance.html", label: "Insurance" },
  { id: "service", file: "service.html", label: "Service" },
  { id: "compliance", file: "compliance.html", label: "Compliance" },
  { id: "fleet-history", file: "fleet-history.html", label: "Fleet history" },
];

export function pageIds(): PageId[] {
  return PAGES.map((p) => p.id);
}

export function navHtml(current: PageId): string {
  if (!PAGES.some((p) => p.id === current)) {
    throw new Error(`unknown page id: ${current}`);
  }
  const links = PAGES.map((page) => {
    const attrs =
      page.id === current
        ? ' class="nav-link is-current" aria-current="page"'
        : ' class="nav-link"';
    return `        <a href="${page.file}"${attrs}>${page.label}</a>`;
  }).join("\n");
  return `    <nav class="page-nav" aria-label="Business vehicle pages">
${links}
    </nav>`;
}
