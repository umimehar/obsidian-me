/** The evidence library: every file in ~/Documents/Taxes, searchable, each one a click away. */

import { homedir } from "node:os";
import { bytes, escapeHtml, plainDate } from "../format";
import { layout, section, table } from "../layout";
import type { DocCategory, TaxData } from "../types";
import { DOC_LABEL } from "./year";

function summary(d: TaxData): string {
  const unique = d.catalog.files.filter((f) => f.duplicate_of === null);
  const years = [...new Set(unique.map((f) => f.year))].sort((a, b) => (a ?? 9999) - (b ?? 9999));
  const cats = [...new Set(unique.map((f) => f.category))].sort(
    (a, b) =>
      unique.filter((f) => f.category === b).length - unique.filter((f) => f.category === a).length,
  );
  const cell = (c: DocCategory, y: number | null) => {
    const n = unique.filter((f) => f.category === c && f.year === y).length;
    return n === 0
      ? ""
      : `<a href="?cat=${c}&amp;year=${y ?? "none"}" data-jump="${c}|${y ?? "none"}">${n}</a>`;
  };
  const rows = cats.map((c) => [escapeHtml(DOC_LABEL[c]), ...years.map((y) => cell(c, y))]);
  return table(
    ["", ...years.map((y) => (y === null ? "No year" : String(y)))],
    rows,
    years.map((_, i) => i + 1),
  );
}

const SCRIPT = `      (() => {
        const data = JSON.parse(document.getElementById("doc-data").textContent);
        const root = data.root, labels = data.labels, files = data.files;
        const q = document.getElementById("doc-q"), cat = document.getElementById("doc-cat"),
          year = document.getElementById("doc-year"), dup = document.getElementById("doc-dup"),
          body = document.getElementById("doc-body"), count = document.getElementById("doc-count");
        const params = new URLSearchParams(location.search);
        const pick = (sel, v) => { if (v && [...sel.options].some((o) => o.value === v)) sel.value = v; };
        pick(cat, params.get("cat"));
        pick(year, params.get("year"));
        const href = (p) => "file://" + (root + "/" + p).split("/").map(encodeURIComponent).join("/");
        const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
        const size = (n) => n < 1048576 ? Math.round(n / 1024) + " KB" : (n / 1048576).toFixed(1) + " MB";
        function render() {
          const words = q.value.toLowerCase().split(/\\s+/).filter(Boolean);
          const rows = files.filter((f) =>
            (cat.value === "all" || f[1] === cat.value) &&
            (year.value === "all" || String(f[3] ?? "none") === year.value) &&
            (!dup.checked || !f[5]) &&
            words.every((w) => f[0].toLowerCase().includes(w)));
          count.textContent = rows.length + " of " + files.length + " files";
          body.innerHTML = rows.map((f) => {
            const parts = f[0].split("/"), name = parts.pop();
            const copy = f[5] ? '<span class="tax-row-note">Copy of ' + esc(f[5]) + "</span>" : "";
            return "<tr><td><a href=\\"" + href(f[0]) + "\\">" + esc(name) + "</a>" + copy +
              '<span class="tax-row-note">' + esc(parts.join(" / ")) + "</span></td><td>" + esc(labels[f[1]]) +
              "</td><td class=\\"num\\">" + (f[3] ?? "") + '</td><td class="num">' + size(f[4]) + "</td></tr>";
          }).join("");
        }
        [q, cat, year, dup].forEach((el) => el.addEventListener("input", render));
        document.querySelectorAll("[data-jump]").forEach((a) => a.addEventListener("click", (ev) => {
          ev.preventDefault();
          const [c, y] = a.dataset.jump.split("|");
          cat.value = c; year.value = y; q.value = ""; render();
          document.getElementById("library").scrollIntoView();
        }));
        render();
      })();`;

export function documentsPage(d: TaxData): string {
  const root = d.catalog.root.replace(homedir(), "~");
  const payload = {
    root: d.catalog.root,
    labels: DOC_LABEL,
    files: d.catalog.files.map((f) => [
      f.path,
      f.category,
      f.scope,
      f.year,
      f.bytes,
      f.duplicate_of,
    ]),
  };
  const json = JSON.stringify(payload).replace(/</g, "\\u003c");
  const cats = (Object.keys(DOC_LABEL) as DocCategory[])
    .filter((c) => d.catalog.files.some((f) => f.category === c))
    .map((c) => `<option value="${c}">${DOC_LABEL[c]}</option>`)
    .join("");
  const years = [...new Set(d.catalog.files.map((f) => f.year))]
    .sort((a, b) => (a ?? 9999) - (b ?? 9999))
    .map((y) => `<option value="${y ?? "none"}">${y ?? "No year"}</option>`)
    .join("");
  const total = d.catalog.files.reduce((s, f) => s + f.bytes, 0);
  const body = `      <p class="tax-headline">The receipts, statements and slips stay in <code>${escapeHtml(root)}</code>. This page lists every one of the ${d.catalog.files.length} files (${bytes(total)}), catalogued ${plainDate(d.catalog.generated)}. Links open the file on this Mac.</p>
${section("What is on file", "Counts per kind and year, not counting copies inside packages. Click a number to list those files.")}
${summary(d)}
      <hr class="hr mt-rule" />
${section("Library", undefined, "library")}
      <div class="tax-filters">
        <label class="tax-search">Search names <input id="doc-q" type="search" placeholder="uber, T4, march" /></label>
        <label class="tax-select">Kind <select id="doc-cat"><option value="all">Everything</option>${cats}</select></label>
        <label class="tax-select">Year <select id="doc-year"><option value="all">All years</option>${years}</select></label>
        <label class="tax-check"><input id="doc-dup" type="checkbox" checked /> Hide copies</label>
        <span class="tax-count-line" id="doc-count" aria-live="polite"></span>
      </div>
      <div class="tax-scroll table-wrap tax-doc-table"><table class="table">
        <thead><tr><th>File</th><th>Kind</th><th class="num">Year</th><th class="num">Size</th></tr></thead>
        <tbody id="doc-body"></tbody>
      </table></div>
      <script type="application/json" id="doc-data">${json}</script>`;
  return layout(d, {
    page: "documents",
    title: "Documents",
    kicker: "The evidence on file",
    standfirst: "Every receipt, statement and slip",
    body,
    script: SCRIPT,
  });
}
