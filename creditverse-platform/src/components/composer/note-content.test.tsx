/**
 * The renderer's default-deny.
 *
 * Nothing here is parsed as HTML, so the interesting assertions are about what
 * the renderer refuses to emit: unsafe hrefs, and node types it does not know.
 */
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { NoteContent } from "./NoteContent";
import type { NoteDoc } from "@/lib/activity/note-body";

const doc = (content: unknown[]): NoteDoc =>
  ({ type: "doc", content }) as NoteDoc;

describe("NoteContent", () => {
  it("renders a safe link as a link", () => {
    render(
      <NoteContent
        fallbackText=""
        body={doc([
          {
            type: "paragraph",
            content: [
              {
                type: "text",
                text: "docs",
                marks: [{ type: "link", attrs: { href: "https://example.com" } }],
              },
            ],
          },
        ])}
      />,
    );
    const a = screen.getByText("docs").closest("a");
    expect(a?.getAttribute("href")).toBe("https://example.com");
    expect(a?.getAttribute("rel")).toContain("noopener");
  });

  it("strips the href from an unsafe link but keeps the words", () => {
    render(
      <NoteContent
        fallbackText=""
        body={doc([
          {
            type: "paragraph",
            content: [
              {
                type: "text",
                text: "click me",
                marks: [
                  { type: "link", attrs: { href: "javascript:alert(1)" } },
                ],
              },
            ],
          },
        ])}
      />,
    );
    expect(screen.getByText("click me")).toBeTruthy();
    expect(screen.getByText("click me").closest("a")).toBeNull();
  });

  it("renders nothing for a node type it does not know", () => {
    const { container } = render(
      <NoteContent
        fallbackText=""
        body={doc([{ type: "iframe", attrs: { src: "https://evil.test" } }])}
      />,
    );
    expect(container.querySelector("iframe")).toBeNull();
    expect(container.textContent).toBe("");
  });

  it("ignores a mark it does not know", () => {
    render(
      <NoteContent
        fallbackText=""
        body={doc([
          {
            type: "paragraph",
            content: [
              { type: "text", text: "plain", marks: [{ type: "onclick" }] },
            ],
          },
        ])}
      />,
    );
    expect(screen.getByText("plain").tagName).toBe("P");
  });

  it("falls back to plain text for notes written before rich bodies", () => {
    render(<NoteContent body={null} fallbackText="an older note" />);
    expect(screen.getByText("an older note")).toBeTruthy();
  });
});
