import { describe, expect, test } from "bun:test";
import { render } from "@testing-library/react";
import { AboutNumbers } from "./AboutNumbers";

describe("AboutNumbers", () => {
  test("renders a native disclosure naming itself, with one paragraph per note", () => {
    render(<AboutNumbers notes={["First note.", "Second note."]} />);
    const details = document.querySelector("details[data-about-numbers]");
    expect(details).not.toBeNull();
    expect(details?.querySelector("summary")?.textContent).toBe("About these numbers");
    const paragraphs = [...(details?.querySelectorAll("p") ?? [])];
    expect(paragraphs.map((p) => p.textContent)).toEqual(["First note.", "Second note."]);
  });

  test("renders nothing at all when there are no notes", () => {
    const { container } = render(<AboutNumbers notes={[]} />);
    expect(container.querySelector("details[data-about-numbers]")).toBeNull();
    expect(container.innerHTML).toBe("");
  });
});
