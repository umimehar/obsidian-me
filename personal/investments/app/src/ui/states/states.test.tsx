import { describe, expect, spyOn, test } from "bun:test";
import { Theme } from "@radix-ui/themes";
import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { DataError } from "./DataError";
import { ErrorBoundary } from "./ErrorBoundary";

function Boom({ message }: { message: string }): ReactNode {
  throw new Error(message);
}

/**
 * React logs a caught render error to console.error. Silencing it keeps the
 * test output readable; the assertion is on what the boundary renders, which
 * is the part a reader of a broken dashboard would actually see.
 */
function renderBoundary(node: ReactNode) {
  const spy = spyOn(console, "error").mockImplementation(() => {});
  try {
    render(
      <Theme>
        <ErrorBoundary>{node}</ErrorBoundary>
      </Theme>,
    );
  } finally {
    spy.mockRestore();
  }
}

describe("DataError", () => {
  test("tells the reader the command that rebuilds the data", () => {
    render(
      <Theme>
        <DataError message="analytics.json is missing rollups" />
      </Theme>,
    );
    expect(screen.getByText(/bun run analytics/)).toBeDefined();
  });

  test("shows the underlying message rather than a generic apology", () => {
    render(
      <Theme>
        <DataError message="analytics.json is missing rollups" />
      </Theme>,
    );
    expect(screen.getByText("analytics.json is missing rollups")).toBeDefined();
  });

  test("is announced, so a reader who cannot see it is still told", () => {
    render(
      <Theme>
        <DataError message="broken" />
      </Theme>,
    );
    expect(screen.getByRole("alert")).toBeDefined();
  });
});

describe("ErrorBoundary", () => {
  test("renders its children untouched when nothing throws", () => {
    render(
      <Theme>
        <ErrorBoundary>
          <p>the dashboard</p>
        </ErrorBoundary>
      </Theme>,
    );
    expect(screen.getByText("the dashboard")).toBeDefined();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  test("catches a throwing view and surfaces its message with the rebuild command", () => {
    renderBoundary(<Boom message="analytics.json is missing one of meta, series, rooms" />);
    expect(screen.getByRole("alert")).toBeDefined();
    expect(screen.getByText("analytics.json is missing one of meta, series, rooms")).toBeDefined();
    expect(screen.getByText(/bun run analytics/)).toBeDefined();
  });

  test("does not render the broken children beside the error", () => {
    renderBoundary(
      <>
        <p>a figure that cannot be trusted</p>
        <Boom message="broken" />
      </>,
    );
    expect(screen.queryByText("a figure that cannot be trusted")).toBeNull();
  });
});
