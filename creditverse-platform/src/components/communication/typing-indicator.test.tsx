import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { TypingIndicator, typingLabel } from "./TypingIndicator";

describe("typingLabel", () => {
  it("names one person, two people, and counts the rest", () => {
    expect(typingLabel([{ userId: "a", name: "Ally" }])).toBe("Ally is typing");
    expect(typingLabel([{ userId: "a", name: "Ally" }, { userId: "b", name: "Laz" }]))
      .toBe("Ally and Laz are typing");
    expect(typingLabel([
      { userId: "a", name: "Ally" }, { userId: "b", name: "Laz" }, { userId: "c", name: "Dan" },
    ])).toBe("3 people are typing");
  });

  it("says nothing when nobody is typing", () => {
    expect(typingLabel([])).toBe("");
  });

  it("does not produce a sentence about a blank name", () => {
    expect(typingLabel([{ userId: "a", name: "   " }])).toBe("");
  });
});

describe("TypingIndicator", () => {
  it("reserves its height when nobody is typing, so the list cannot jump", () => {
    /* Rule 15: loading and transient states preserve layout. The row is
       always present; only its contents come and go. */
    const { container } = render(<TypingIndicator people={[]} />);
    const row = container.firstElementChild as HTMLElement;
    expect(row.className).toContain("h-5");
    expect(row.textContent).toBe("");
  });

  it("writes the name out, not only the dots", () => {
    render(<TypingIndicator people={[{ userId: "a", name: "Ally" }]} />);
    expect(screen.getByText("Ally is typing")).toBeTruthy();
  });

  it("announces politely rather than on every dot", () => {
    const { container } = render(<TypingIndicator people={[{ userId: "a", name: "Ally" }]} />);
    const row = container.firstElementChild as HTMLElement;
    expect(row.getAttribute("aria-live")).toBe("polite");
    /* The dots themselves are decorative and must not be read out. */
    expect(container.querySelector('[aria-hidden="true"]')).toBeTruthy();
  });

  it("leaves the dots still for anybody who asked for less motion", () => {
    const { container } = render(<TypingIndicator people={[{ userId: "a", name: "Ally" }]} />);
    const dots = container.querySelectorAll("span.rounded-full");
    expect(dots.length).toBe(3);
    for (const d of dots) expect(d.className).toContain("motion-reduce:animate-none");
  });
});
