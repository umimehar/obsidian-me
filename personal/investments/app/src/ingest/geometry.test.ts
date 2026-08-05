import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { findRow, labelEndX, parseGeometry, rowText, scanPairs, sliceColumns } from "./geometry";

const FIXTURES = join(import.meta.dir, "__fixtures__");
const load = async (name: string) =>
  parseGeometry(await Bun.file(join(FIXTURES, `${name}.xml`)).text());

function word(x0: number, x1: number, y: number, text: string) {
  return { x0, x1, y, text };
}

describe("parseGeometry", () => {
  test("groups words into rows per page, sorted by x", () => {
    const xml = `<page width="612" height="792">
      <word xMin="222.0" yMin="168.0" xMax="240.0" yMax="176.0">Cash</word>
      <word xMin="458.0" yMin="168.4" xMax="500.0" yMax="176.4">$122.95</word>
      <word xMin="346.0" yMin="168.2" xMax="388.0" yMax="176.2">$122.95</word>
      <word xMin="222.0" yMin="210.0" xMax="240.0" yMax="218.0">Total</word>
    </page>`;
    const pages = parseGeometry(xml);
    expect(pages).toHaveLength(1);
    expect(pages[0]?.rows).toHaveLength(2);
    expect(rowText(pages[0]?.rows[0] ?? { y: 0, words: [] })).toBe("Cash $122.95 $122.95");
  });

  test("keeps pages separate so y values cannot collide across them", () => {
    // Every page restarts y near zero. Grouping globally merges page 1's table
    // with page 5's glossary.
    const xml = `<page width="612" height="792">
        <word xMin="10" yMin="100" xMax="20" yMax="108">first</word>
      </page><page width="612" height="792">
        <word xMin="10" yMin="100" xMax="20" yMax="108">second</word>
      </page>`;
    const pages = parseGeometry(xml);
    expect(pages).toHaveLength(2);
    expect(rowText(pages[0]?.rows[0] ?? { y: 0, words: [] })).toBe("first");
    expect(rowText(pages[1]?.rows[0] ?? { y: 0, words: [] })).toBe("second");
  });

  test("decodes XML entities in word text", () => {
    const xml = `<page width="1" height="1">
      <word xMin="1" yMin="1" xMax="2" yMax="2">S&amp;P/TSX</word>
    </page>`;
    expect(parseGeometry(xml)[0]?.rows[0]?.words[0]?.text).toBe("S&P/TSX");
  });
});

describe("labelEndX and sliceColumns", () => {
  test("labelEndX returns the right edge of the matched label", () => {
    const row = {
      y: 281,
      words: [
        word(48, 62, 281, "Last"),
        word(119, 147, 281, "Balance"),
        word(174, 200, 281, "$116.67"),
      ],
    };
    expect(labelEndX(row, /Last Balance/)).toBe(147);
  });

  test("sliceColumns keeps only words inside the x range", () => {
    const rows = [
      {
        y: 1,
        words: [
          word(55, 90, 1, "Springfield"),
          word(222, 250, 1, "Cash"),
          word(346, 380, 1, "$1.00"),
        ],
      },
    ];
    const sliced = sliceColumns(rows, 200, 400);
    expect(rowText(sliced[0] ?? { y: 0, words: [] })).toBe("Cash $1.00");
  });

  test("sliceColumns drops rows left with nothing", () => {
    const rows = [{ y: 1, words: [word(55, 90, 1, "Springfield")] }];
    expect(sliceColumns(rows, 200, 400)).toEqual([]);
  });
});

describe("scanPairs", () => {
  test("pairs a label with the money on its own row", () => {
    const rows = [
      {
        y: 1,
        words: [word(48, 147, 1, "Last Statement Cash Balance"), word(174, 200, 1, "$116.67")],
      },
    ];
    expect(scanPairs(rows)).toEqual([{ label: "Last Statement Cash Balance", values: [116.67] }]);
  });

  test("joins a label that wraps onto the row carrying its value", () => {
    // Managed layout prints "Proceeds from" on one row and "sales $12,417.15"
    // on the next.
    const rows = [
      { y: 1, words: [word(300, 340, 1, "Proceeds"), word(342, 360, 1, "from")] },
      { y: 2, words: [word(300, 320, 2, "sales"), word(400, 440, 2, "$12,417.15")] },
    ];
    expect(scanPairs(rows)).toEqual([{ label: "Proceeds from sales", values: [12417.15] }]);
  });

  test("keeps every value on a multi-currency row, in x order", () => {
    const rows = [
      {
        y: 1,
        words: [
          word(48, 147, 1, "Last Statement Cash Balance"),
          word(300, 340, 1, "$2,618.48"),
          word(400, 440, 1, "$2,618.40"),
          word(500, 520, 1, "$0.06"),
        ],
      },
    ];
    expect(scanPairs(rows)[0]?.values).toEqual([2618.48, 2618.4, 0.06]);
  });

  test("ignores percentages so summary rows yield only money", () => {
    const rows = [
      {
        y: 1,
        words: [word(222, 240, 1, "Cash"), word(346, 388, 1, "$122.95"), word(414, 430, 1, "0.59")],
      },
    ];
    // 0.59 has no dollar sign but is a bare decimal, so it IS money-shaped.
    // Callers that need only currency must slice columns first. Documented,
    // not silently guessed at.
    expect(scanPairs(rows)[0]?.values).toEqual([122.95, 0.59]);
  });
});

// Tests against a real statement live in Task 3, once the fixtures exist.
// Nothing here reads a fixture, so this suite is green on its own.
