/** The header nav every page shares. Year pages all count as "years". */

export type PageId =
  | "index"
  | "todo"
  | "timeline"
  | "years"
  | "filings"
  | "rules"
  | "people"
  | "documents"
  | "glossary";

export function navItems(latestYear: number): readonly (readonly [PageId, string, string])[] {
  return [
    ["index", "index.html", "Overview"],
    ["todo", "todo.html", "To do"],
    ["timeline", "timeline.html", "Timeline"],
    ["years", `year-${latestYear}.html`, "Years"],
    ["filings", "filings.html", "Returns"],
    ["rules", "rules.html", "Rules"],
    ["people", "people.html", "People"],
    ["documents", "documents.html", "Documents"],
    ["glossary", "glossary.html", "Glossary"],
  ];
}

export function navHtml(current: PageId, latestYear: number): string {
  const links = navItems(latestYear)
    .map(([id, href, label]) =>
      id === current
        ? `<a href="${href}" class="nav-link is-current" aria-current="page">${label}</a>`
        : `<a href="${href}" class="nav-link">${label}</a>`,
    )
    .join("\n      ");
  return `    <nav class="page-nav" aria-label="Taxes pages">
      ${links}
    </nav>`;
}
