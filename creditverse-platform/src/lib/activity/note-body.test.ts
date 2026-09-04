/**
 * Note body — the security-relevant parts.
 *
 * The composer stores a structured document rather than HTML precisely so that
 * rendering never parses attacker-authored markup. What still needs guarding is
 * the one place a document carries a raw string with power: a link href.
 */
import { describe, expect, it } from "vitest";
import {
  docToPlainText,
  isDocEmpty,
  isNoteDoc,
  safeUrl,
  type NoteDoc,
} from "./note-body";

describe("safeUrl", () => {
  it("allows the ordinary schemes", () => {
    for (const url of [
      "https://example.com/x?y=1",
      "http://example.com",
      "mailto:someone@example.com",
      "tel:+15551234567",
      "/app/creditops",
    ]) {
      expect(safeUrl(url), url).toBe(url);
    }
  });

  it("refuses schemes that execute or impersonate", () => {
    for (const url of [
      "javascript:alert(1)",
      "JavaScript:alert(1)",
      "  javascript:alert(1)  ",
      "data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==",
      "vbscript:msgbox(1)",
      "file:///etc/passwd",
    ]) {
      expect(safeUrl(url), url).toBeNull();
    }
  });

  it("refuses anything that is not a usable string", () => {
    for (const v of [null, undefined, 42, {}, "", "   "]) {
      expect(safeUrl(v)).toBeNull();
    }
  });
});

describe("docToPlainText", () => {
  const doc: NoteDoc = {
    type: "doc",
    content: [
      {
        type: "heading",
        attrs: { level: 2 },
        content: [{ type: "text", text: "Round 1 review" }],
      },
      {
        type: "paragraph",
        content: [
          { type: "text", text: "Bureau " },
          { type: "text", text: "responded", marks: [{ type: "bold" }] },
        ],
      },
      {
        type: "taskList",
        content: [
          {
            type: "taskItem",
            attrs: { checked: true },
            content: [
              { type: "paragraph", content: [{ type: "text", text: "Mail" }] },
            ],
          },
        ],
      },
    ],
  };

  it("flattens the document for the plain-text column", () => {
    const text = docToPlainText(doc);
    expect(text).toContain("Round 1 review");
    expect(text).toContain("Bureau responded");
    expect(text).toContain("[x] Mail");
  });

  it("treats a document with no visible text as empty", () => {
    expect(isDocEmpty({ type: "doc", content: [{ type: "paragraph" }] })).toBe(
      true,
    );
    expect(isDocEmpty(doc)).toBe(false);
  });

  it("returns nothing for input that is not a document", () => {
    expect(docToPlainText("<script>alert(1)</script>")).toBe("");
    expect(docToPlainText(null)).toBe("");
    expect(isNoteDoc({ type: "not-a-doc" })).toBe(false);
  });
});
