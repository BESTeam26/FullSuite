import { describe, expect, it } from "vitest";
import { attachmentKind, canPreview, formatBytes } from "./attachment-kind";

describe("what an attachment is", () => {
  it("reads the MIME type first", () => {
    expect(attachmentKind("image/png", "x")).toBe("image");
    expect(attachmentKind("application/pdf", "x")).toBe("pdf");
    expect(attachmentKind("text/html", "x")).toBe("html");
    expect(attachmentKind("text/csv", "x")).toBe("text");
    expect(attachmentKind("application/json", "x")).toBe("text");
    expect(attachmentKind("video/mp4", "x")).toBe("video");
    expect(attachmentKind("audio/mpeg", "x")).toBe("audio");
  });
  it("falls back to the name when the type is missing or generic", () => {
    expect(attachmentKind(null, "brand_mock.html")).toBe("html");
    expect(attachmentKind("application/octet-stream", "report.PDF")).toBe("pdf");
    expect(attachmentKind("", "notes.md")).toBe("text");
    expect(attachmentKind(null, "clip.MOV")).toBe("video");
  });
  it("calls a spreadsheet or a Word file what it is: downloadable, not previewable", () => {
    expect(attachmentKind("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "q3.xlsx")).toBe("other");
    expect(canPreview("other")).toBe(false);
    expect(canPreview("html")).toBe(true);
  });
  it("says sizes the way people do", () => {
    expect(formatBytes(2154386)).toBe("2.1 MB");
    expect(formatBytes(103896)).toBe("101 KB");
    expect(formatBytes(10)).toBe("1 KB");
    expect(formatBytes(null)).toBeNull();
  });
});
