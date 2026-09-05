import { describe, expect, it } from "vitest";
import { formatDate, formatDateTime } from "./format-date";

describe("user-facing dates", () => {
  it("turns a machine timestamp into a plain date, never the raw string", () => {
    const out = formatDate("2026-09-01T01:20:24.550162+00:00");
    expect(out).not.toContain("T");
    expect(out).not.toContain("+00:00");
    expect(out).toMatch(/2026/);
  });
  it("keeps a date-only value on its own calendar day", () => {
    expect(formatDate("2026-08-20")).toMatch(/Aug 20, 2026/);
  });
  it("adds a time only when asked", () => {
    expect(formatDateTime("2026-09-01T13:05:00Z")).toMatch(/2026/);
    expect(formatDateTime("2026-09-01T13:05:00Z")).toMatch(/\d:\d\d/);
  });
  it("leaves text that is not a timestamp alone and shows a dash for nothing", () => {
    expect(formatDate("5 hours ago")).toBe("5 hours ago");
    expect(formatDate("01/2023")).toBe("01/2023");
    expect(formatDate(null)).toBe("—");
    expect(formatDate("", "not set")).toBe("not set");
  });
});
