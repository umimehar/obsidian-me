import { expect, test } from "bun:test";
import type { Analytics } from "./analytics";
import type { Datastore } from "./datastore";
import { renderPages } from "./render";

function store(): Pick<Datastore, "accounts"> {
  return {
    accounts: [
      {
        masked_id: "acct_a",
        kind: "TFSA",
        name: "Managed (TFSA)",
        short_id: "a4f2",
        currency: "CAD",
        first_activity: "",
        last_activity: "",
        txn_count: 0,
      },
      {
        masked_id: "acct_b",
        kind: "RRSP",
        name: "Umar's RRSP",
        short_id: "9c31",
        currency: "CAD",
        first_activity: "",
        last_activity: "",
        txn_count: 0,
      },
    ],
  };
}

function analytics(): Analytics {
  return {
    ledger: {
      accounts: [
        { id: "acct_a", kind: "TFSA", name: "Managed (TFSA)", short_id: "a4f2", currency: "CAD" },
        { id: "acct_b", kind: "RRSP", name: "Umar's RRSP", short_id: "9c31", currency: "CAD" },
      ],
      months: ["2025-03"],
      series: [
        {
          account_id: "acct_a",
          month: "2025-03",
          contrib: 500,
          deposits: 500,
          income: 3,
          inflow: 503,
          outflow: 0,
          cash: 10,
          acb: 490,
        },
        {
          account_id: "acct_b",
          month: "2025-03",
          contrib: 200,
          deposits: 200,
          income: 0,
          inflow: 200,
          outflow: 0,
          cash: 0,
          acb: 200,
        },
      ],
      holdings: [{ account_id: "acct_a", symbol: "ZAG", qty: 5, acb: 80 }],
      limits: { TFSA: { "2025": 7000 } },
      growth: {
        as_of: "2025-03-01T00:00:00Z",
        coverage: 0,
        accounts: [],
        total: { cost: 0, market: 0, gain: 0, gainPct: 0 },
      },
      tax: { current_year: "2025", years: [] },
    },
  };
}

// biome-ignore lint/suspicious/noExplicitAny: test fixtures are structurally compatible
const pages = () => renderPages(store() as any, analytics());

test("renders only the index page", () => {
  expect(Object.keys(pages())).toEqual(["index.html"]);
});

test("index is html linking the shared stylesheet", () => {
  const html = pages()["index.html"] ?? "";
  expect(html).toContain("<!DOCTYPE html>");
  expect(html).toContain("../../_assets/personal.css");
  expect(html).toContain("The Ledger");
});

test("index embeds the ledger data and the filter bar", () => {
  const html = pages()["index.html"] ?? "";
  expect(html).toContain('id="ledger-data"');
  expect(html).toContain('class="filterbar"');
  expect(html).toContain('id="headline"');
  expect(html).toContain('"month":"2025-03"');
});

test("accounts are unmasked with kind badge, name, and short id", () => {
  const html = pages()["index.html"] ?? "";
  expect(html).toContain("Managed (TFSA)");
  expect(html).toContain("Umar");
  expect(html).toContain("a4f2");
  expect(html).toContain('<span class="badge">TFSA</span>');
});

test("store accounts absent from the ledger are not chipped", () => {
  const a = analytics();
  a.ledger.accounts = a.ledger.accounts.filter((x) => x.id !== "acct_b");
  a.ledger.series = a.ledger.series.filter((x) => x.account_id !== "acct_b");
  // biome-ignore lint/suspicious/noExplicitAny: test fixtures are structurally compatible
  const html = renderPages(store() as any, a)["index.html"] ?? "";
  expect(html).not.toContain('data-acct="acct_b"');
  expect(html).not.toContain("9c31");
});
