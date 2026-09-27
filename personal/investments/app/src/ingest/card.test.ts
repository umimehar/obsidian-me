import { describe, expect, test } from "bun:test";
import { isCardStatement, maskCardNumber, parseCardStatement } from "./card";
import { type Page, parseGeometry } from "./geometry";

type Cell = readonly [number, number, string];
type StatementRow = readonly [number, readonly Cell[]];

/**
 * A synthetic card statement, built from the real July 2026 document's own
 * layout and wording. Synthetic rather than a committed fixture PDF, because
 * a real one carries the owner's name, address and card number and must never
 * reach the repository -- the same rule the investment fixtures follow.
 */
function pageXml(rows: readonly StatementRow[]): string {
  const words = rows
    .flatMap(([y, cells]) =>
      cells.map(
        ([x0, x1, text]) =>
          `<word xMin="${x0}" yMin="${y}" xMax="${x1}" yMax="${y + 8}">${text}</word>`,
      ),
    )
    .join("");
  return `<doc><page width="612" height="792">${words}</page></doc>`;
}

const STATEMENT_ROWS: readonly StatementRow[] = [
  [
    10,
    [
      [10, 200, "Wealthsimple"],
      [300, 500, "Credit card statement"],
    ],
  ],
  [22, [[300, 500, "Jun 25 — Jul 24, 2026"]]],
  [34, [[300, 500, "4126 50** **** 2377"]]],
  [
    50,
    [
      [10, 120, "STATEMENT BAL ANCE"],
      [300, 420, "PAYMENT DUE DATE"],
    ],
  ],
  [
    62,
    [
      [10, 80, "$0.00"],
      [300, 400, "Aug 18, 2026"],
    ],
  ],
  [
    74,
    [
      [10, 90, "Statement date"],
      [100, 190, "July 25, 2026"],
      [300, 400, "Minimum payment"],
      [420, 470, "$0.00"],
    ],
  ],
  [
    86,
    [
      [10, 80, "Credit limit"],
      [420, 490, "$15,000.00"],
    ],
  ],
  [
    110,
    [
      [10, 90, "Previous balance"],
      [420, 490, "$59.75"],
    ],
  ],
  [
    122,
    [
      [10, 70, "- Payments"],
      [120, 180, "$711.02"],
      [300, 380, "+ Purchases"],
      [420, 480, "$651.27"],
    ],
  ],
  [
    134,
    [
      [10, 80, "- Other credits"],
      [120, 180, "$0.00"],
      [300, 350, "+ Fees"],
      [420, 480, "$0.00"],
    ],
  ],
  [
    146,
    [
      [300, 360, "+ Interest"],
      [420, 480, "$0.00"],
    ],
  ],
  [
    158,
    [
      [300, 400, "Annual interest rate"],
      [420, 480, "20.99%"],
    ],
  ],
  [
    170,
    [
      [300, 380, "+ Cash advances"],
      [420, 480, "$0.00"],
    ],
  ],
  [
    182,
    [
      [300, 410, "Cash advance interest rate"],
      [420, 480, "22.99%"],
    ],
  ],
  [
    206,
    [
      [10, 70, "New balance"],
      [420, 480, "$0.00"],
    ],
  ],
  [
    230,
    [
      [10, 50, "Jun"],
      [55, 70, "23"],
      [90, 120, "Jun"],
      [125, 140, "25"],
      [160, 210, "Purchase"],
      [230, 400, "SHOPPERS DRUG MART #07"],
      [500, 560, "$200.00"],
    ],
  ],
  [
    242,
    [
      [10, 50, "Jun"],
      [55, 70, "25"],
      [90, 120, "Jun"],
      [125, 140, "25"],
      [160, 210, "Payment"],
      [230, 400, "From chequing account"],
      [500, 560, "–$200.00"],
    ],
  ],
];

function pages(): Page[] {
  return parseGeometry(pageXml(STATEMENT_ROWS));
}

describe("isCardStatement", () => {
  test("recognises a credit card statement by its own first-page title", () => {
    expect(isCardStatement(pages())).toBe(true);
  });

  test("does not recognise an investment statement", () => {
    // The title is the whole discriminator, and it must be scoped to the
    // FIRST page: an investment statement's later pages carry running prose
    // that could otherwise mention a card.
    const investment = parseGeometry(
      pageXml([
        [
          10,
          [
            [10, 200, "MANAGED ACCOUNT"],
            [300, 500, "Tax-Free Savings Account"],
          ],
        ],
      ]),
    );
    expect(isCardStatement(investment)).toBe(false);
  });
});

describe("maskCardNumber", () => {
  test("keeps only the last four digits, dropping the BIN entirely", () => {
    expect(maskCardNumber(pages())).toBe("card_2377");
    // The leading six identify the issuer and product, not the card. They buy
    // nothing and they are the half worth not keeping.
    expect(maskCardNumber(pages())).not.toContain("4126");
  });
});

describe("parseCardStatement", () => {
  const statement = parseCardStatement(pages(), "card.pdf");

  test("reads the period, whose year is printed once at the end", () => {
    expect(statement.periodStart).toBe("2026-06-25");
    expect(statement.periodEnd).toBe("2026-07-24");
    expect(statement.period).toBe("2026-07");
  });

  test("a December-to-January period rolls the start year back", () => {
    // The only place a card statement's single trailing year is ambiguous,
    // and the one the real corpus will hit every January.
    const rows: StatementRow[] = STATEMENT_ROWS.map(([y, cells]) =>
      y === 22 ? [y, [[300, 500, "Dec 25 — Jan 24, 2027"]]] : [y, cells],
    );
    const straddling = parseCardStatement(parseGeometry(pageXml(rows)), "card.pdf");
    expect(straddling.periodStart).toBe("2026-12-25");
    expect(straddling.periodEnd).toBe("2027-01-24");
  });

  test("reads each summary figure from BESIDE its own label, not from the row", () => {
    // "- Payments $711.02   + Purchases $651.27" is one row with two labelled
    // figures. Taking the row's first money token reads Payments' figure for
    // Purchases and its last reads the reverse -- both wrong, both plausible.
    expect(statement.payments).toBe(711.02);
    expect(statement.purchases).toBe(651.27);
    expect(statement.otherCredits).toBe(0);
    expect(statement.fees).toBe(0);
  });

  test("reads the balances, the limit and the dates", () => {
    expect(statement.previousBalance).toBe(59.75);
    expect(statement.newBalance).toBe(0);
    expect(statement.statementBalance).toBe(0);
    expect(statement.creditLimit).toBe(15000);
    expect(statement.minimumPayment).toBe(0);
    expect(statement.statementDate).toBe("2026-07-25");
    expect(statement.paymentDueDate).toBe("2026-08-18");
  });

  test("reads both interest rates as fractions, and never confuses the two", () => {
    expect(statement.purchaseRate).toBeCloseTo(0.2099, 6);
    expect(statement.cashAdvanceRate).toBeCloseTo(0.2299, 6);
    expect(statement.purchaseRate).not.toBe(statement.cashAdvanceRate);
  });

  test("activity keeps the statement's own signs: a charge positive, a payment negative", () => {
    expect(statement.activity).toHaveLength(2);
    expect(statement.activity[0]).toEqual({
      transactionDate: "2026-06-23",
      postedDate: "2026-06-25",
      type: "Purchase",
      description: "SHOPPERS DRUG MART #07",
      amount: 200,
    });
    // The en dash the statement uses for a credit, not a hyphen.
    expect(statement.activity[1]?.amount).toBe(-200);
  });

  test("the parsed statement reconciles against its own printed new balance", () => {
    const derived =
      statement.previousBalance +
      statement.purchases +
      statement.fees +
      statement.interest +
      statement.cashAdvances -
      statement.payments -
      statement.otherCredits;
    expect(derived).toBeCloseTo(statement.newBalance, 2);
  });

  test("a missing required figure throws rather than defaulting to zero", () => {
    // A zero substituted for an absent field is a claim the statement never
    // made, and on a card that claim is "you owe nothing".
    const withoutLimit = STATEMENT_ROWS.filter(([y]) => y !== 86);
    expect(() => parseCardStatement(parseGeometry(pageXml(withoutLimit)), "card.pdf")).toThrow(
      /Credit limit/,
    );
  });
});
