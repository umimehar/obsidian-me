import { describe, expect, test } from "bun:test";
import { PAGES, navHtml, pageIds } from "./nav";

describe("PAGES", () => {
  test("lists the six pages of the database", () => {
    expect(pageIds()).toEqual([
      "index",
      "lease",
      "insurance",
      "service",
      "compliance",
      "deal",
      "fleet-history",
    ]);
  });
  test("gives every page a file name and a label", () => {
    for (const page of PAGES) {
      expect(page.file).toMatch(/\.html$/);
      expect(page.label.length).toBeGreaterThan(0);
    }
  });
});

describe("navHtml", () => {
  test("links every page, so any page reaches any other in one click", () => {
    const html = navHtml("lease");
    for (const page of PAGES) {
      expect(html).toContain(`href="${page.file}"`);
      expect(html).toContain(page.label);
    }
  });

  test("marks the current page with aria-current and drops nothing from the list", () => {
    const html = navHtml("service");
    expect(html).toContain('aria-current="page"');
    expect(html.match(/aria-current="page"/g)?.length).toBe(1);
    expect(html.match(/<a /g)?.length).toBe(PAGES.length);
  });

  test("marks the right page", () => {
    const html = navHtml("compliance");
    const current = html.slice(html.indexOf("aria-current"));
    expect(current).toContain("Compliance");
  });

  test("throws on an unknown page id rather than rendering a nav with no current page", () => {
    // @ts-expect-error deliberately passing an id outside the union
    expect(() => navHtml("nope")).toThrow(/unknown page/i);
  });
});
