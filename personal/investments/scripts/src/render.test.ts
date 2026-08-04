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
        {
          id: "acct_a",
          kind: "TFSA",
          name: "Managed (TFSA)",
          short_id: "a4f2",
          currency: "CAD",
          first_activity: "2025-03-01",
        },
        {
          id: "acct_b",
          kind: "RRSP",
          name: "Umar's RRSP",
          short_id: "9c31",
          currency: "CAD",
          first_activity: "2025-03-01",
        },
      ],
      months: ["2025-03"],
      series: [
        {
          account_id: "acct_a",
          month: "2025-03",
          contrib: 500,
          external_in: 500,
          external_out: 0,
          deposits: 500,
          grant: 0,
          income: 3,
          inflow: 503,
          outflow: 0,
          cash: 10,
          acb: 490,
          interest: 0,
          eligible_dividends: 3,
          foreign_income: 0,
          realized_gain: 0,
        },
        {
          account_id: "acct_b",
          month: "2025-03",
          contrib: 200,
          external_in: 200,
          external_out: 0,
          deposits: 200,
          grant: 0,
          income: 0,
          inflow: 200,
          outflow: 0,
          cash: 0,
          acb: 200,
          interest: 0,
          eligible_dividends: 0,
          foreign_income: 0,
          realized_gain: 0,
        },
      ],
      holdings: [{ account_id: "acct_a", symbol: "ZAG", qty: 5, acb: 80 }],
      limits: { TFSA: { "2025": 7000 } },
      assessed_room: {},
      registered_rules: {
        fhsaAnnual: 8000,
        fhsaLifetime: 40000,
        respLifetime: 50000,
        respGrantTarget: 2500,
        respCatchupTarget: 5000,
        cesgRate: 0.2,
        cesgAnnualBasic: 500,
        cesgAnnualMax: 1000,
        cesgLifetime: 7200,
        tfsaRounding: 500,
        rrspRounding: 10,
      },
      flows: [],
    },
  };
}

// biome-ignore lint/suspicious/noExplicitAny: test fixtures are structurally compatible
const pages = () => renderPages(store() as any, analytics());

test("renders only the index page", async () => {
  expect(Object.keys(await pages())).toEqual(["index.html"]);
});

test("index is html linking the shared stylesheet", async () => {
  const html = (await pages())["index.html"] ?? "";
  expect(html).toContain("<!DOCTYPE html>");
  expect(html).toContain("../../_assets/personal.css");
  expect(html).toContain("The Ledger");
});

test("index embeds the ledger data and the progressive filter shell", async () => {
  const html = (await pages())["index.html"] ?? "";
  expect(html).toContain('id="ledger-data"');
  expect(html).toContain('id="scope-summary"');
  expect(html).toContain('id="scope-popover"');
  expect(html).toContain('id="account-groups"');
  expect(html).toContain('id="range-picker"');
  expect(html).toContain('id="headline"');
  expect(html).toContain('"month":"2025-03"');
});

test("index shows the data date range in the masthead", async () => {
  const html = (await pages())["index.html"] ?? "";
  expect(html).toContain('id="data-range"');
  expect(html).toContain("Data: Mar 2025 – Mar 2025");
});

test("index has the four pillar sections", async () => {
  const html = (await pages())["index.html"] ?? "";
  expect(html).toContain("Contributions &amp; Room");
  expect(html).toContain(">Growth<");
  expect(html).toContain('id="tax-section-title">Tax<');
  expect(html).toContain(">Detail<");
});

test("index has the tax disclaimer and tax rate input", async () => {
  const html = (await pages())["index.html"] ?? "";
  expect(html).toContain("not for filing");
  expect(html).toContain('id="tax-rate"');
});

test("index has the four chart canvases", async () => {
  const html = (await pages())["index.html"] ?? "";
  expect(html).toContain('id="chart-cashflow"');
  expect(html).toContain('id="chart-growth"');
  expect(html).toContain('id="chart-trend"');
  expect(html).toContain('id="chart-income"');
});

test("index has the projection section host elements", async () => {
  const html = (await pages())["index.html"] ?? "";
  expect(html).toContain('id="proj-return"');
  expect(html).toContain('id="proj-index"');
  expect(html).toContain('id="proj-summary"');
  expect(html).toContain('id="proj-table"');
  expect(html).toContain('id="chart-projection"');
  expect(html).toContain('id="proj-caveats"');
  expect(html).toContain('id="proj-warning"');
});

test("index has the collapsed cashflow transaction drill-down", async () => {
  const html = (await pages())["index.html"] ?? "";
  expect(html).toContain('id="cashflow-drill"');
  expect(html).toContain('id="cashflow-drill-body"');
});

test("Growth section has no market-value, unrealized-gain, as-of, or coverage copy", async () => {
  const html = (await pages())["index.html"] ?? "";
  expect(html).toContain('id="section-growth"');
  expect(html).toContain(">Growth<");
  expect(html).toContain('id="chart-trend"');
  expect(html).toContain('id="chart-growth"');
  expect(html).toContain('id="chart-income"');
  expect(html).not.toContain("Market value");
  expect(html).not.toContain("Unrealized");
  expect(html).not.toContain('id="growth-coverage-note"');
  expect(html).not.toContain("priced at market");
  expect(html).not.toMatch(/as of the latest pricing run/i);
});

test("index bundles all scripts offline, no CDN", async () => {
  const html = (await pages())["index.html"] ?? "";
  expect(html).not.toContain("https://cdn");
});

test("accounts are unmasked in the embedded ledger data", async () => {
  const html = (await pages())["index.html"] ?? "";
  expect(html).toContain("Managed (TFSA)");
  expect(html).toContain("Umar");
  expect(html).toContain("a4f2");
  expect(html).toContain('"kind":"TFSA"');
});

test("ledger-data payload escapes < so a crafted value cannot close the script tag", async () => {
  const a = analytics();
  const acct = a.ledger.accounts[0];
  if (acct) acct.name = "</script><script>alert(1)</script>";
  // biome-ignore lint/suspicious/noExplicitAny: test fixtures are structurally compatible
  const html = (await renderPages(store() as any, a))["index.html"] ?? "";
  const dataStart = html.indexOf('id="ledger-data"');
  const dataEnd = html.indexOf("</script>", dataStart);
  const payload = html.slice(dataStart, dataEnd);
  expect(payload).not.toContain("</script>");
  expect(payload).toContain("\\u003c");
});

test("store accounts absent from the ledger are not embedded", async () => {
  const a = analytics();
  a.ledger.accounts = a.ledger.accounts.filter((x) => x.id !== "acct_b");
  a.ledger.series = a.ledger.series.filter((x) => x.account_id !== "acct_b");
  // biome-ignore lint/suspicious/noExplicitAny: test fixtures are structurally compatible
  const html = (await renderPages(store() as any, a))["index.html"] ?? "";
  expect(html).not.toContain('"id":"acct_b"');
  expect(html).not.toContain("9c31");
});
