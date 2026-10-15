/**
 * Dee, 2026-10-15: a GHL form pasted into Activity keeps its table shape.
 */
import { describe, expect, it } from "vitest";
import { detailBlocks, htmlTableToText } from "./pasted-table";

describe("htmlTableToText", () => {
  it("turns a pasted GHL form table into one line per row, cells separated by ' | '", () => {
    const html = `<meta charset="utf-8"><table><tbody>
      <tr><td><b>First Name</b></td><td>Leslie</td></tr>
      <tr><td>Last Name</td><td>Caudillo  Zamora</td></tr>
      <tr><td>Phone</td><td>+17273071318</td></tr>
    </tbody></table>`;
    expect(htmlTableToText(html)).toBe("First Name | Leslie\nLast Name | Caudillo Zamora\nPhone | +17273071318");
  });

  it("is null when the clipboard holds no table", () => {
    expect(htmlTableToText("<p>just a paragraph</p>")).toBeNull();
    expect(htmlTableToText("")).toBeNull();
  });

  it("drops rows with no text at all", () => {
    expect(htmlTableToText("<table><tr><td></td><td> </td></tr><tr><td>Email</td><td>a@b.c</td></tr></table>")).toBe("Email | a@b.c");
  });
});

describe("detailBlocks", () => {
  it("draws a run of row lines as a table and keeps the rest as text", () => {
    const blocks = detailBlocks("Form submission:\nFirst Name | Leslie\nLast Name | Caudillo Zamora\nThanks");
    expect(blocks).toEqual([
      { kind: "text", text: "Form submission:" },
      { kind: "table", rows: [["First Name", "Leslie"], ["Last Name", "Caudillo Zamora"]] },
      { kind: "text", text: "Thanks" },
    ]);
  });

  it("a single line with a pipe is just text — a year of ClickUp comments must not change shape", () => {
    expect(detailBlocks("Called client | left voicemail")).toEqual([{ kind: "text", text: "Called client | left voicemail" }]);
  });

  it("plain text is one block, line breaks kept", () => {
    expect(detailBlocks("line one\nline two")).toEqual([{ kind: "text", text: "line one\nline two" }]);
  });
});
