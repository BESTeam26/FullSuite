import { describe, expect, it } from "vitest";
import { safeRedirectPath } from "./safe-redirect";

describe("safeRedirectPath", () => {
  it("keeps a path inside the application", () => {
    expect(safeRedirectPath("/accept-invitation/abc")).toBe("/accept-invitation/abc");
    expect(safeRedirectPath("/app/settings?tab=profile")).toBe("/app/settings?tab=profile");
  });

  it("falls back when nothing was asked for", () => {
    expect(safeRedirectPath(null)).toBe("/app");
    expect(safeRedirectPath(undefined)).toBe("/app");
    expect(safeRedirectPath("")).toBe("/app");
    expect(safeRedirectPath("  ", "/login")).toBe("/login");
  });

  it("refuses another origin however it is spelled", () => {
    expect(safeRedirectPath("https://evil.example/app")).toBe("/app");
    expect(safeRedirectPath("//evil.example")).toBe("/app");
    expect(safeRedirectPath("/\\evil.example")).toBe("/app");
    expect(safeRedirectPath("/%2Fevil.example")).toBe("/app");
    expect(safeRedirectPath("/%5cevil.example")).toBe("/app");
    expect(safeRedirectPath("evil.example")).toBe("/app");
    expect(safeRedirectPath("javascript:alert(1)")).toBe("/app");
  });
});
