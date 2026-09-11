import { describe, expect, it, vi } from "vitest";

/* The builder reads the app's own origin; jsdom serves it as localhost:3000. */
vi.mock("@/lib/supabase/client", () => ({ siteUrl: "https://app.bescrm.net" }));

import { authCallbackUrl, safeRedirectPath } from "./safe-redirect";

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

describe("authCallbackUrl", () => {
  it("sends a recovery link where a new password can actually be set", () => {
    /* Not `/login`: supabase-js consumes the recovery token wherever it lands,
       so a reset that lands on the sign-in page signs the person in and never
       asks for the password they asked to change. Both callers use this. */
    expect(authCallbackUrl({ recovery: true })).toBe(
      "https://app.bescrm.net/auth/callback?type=recovery",
    );
  });

  it("is the plain callback for a confirmation with nowhere onward to go", () => {
    expect(authCallbackUrl()).toBe("https://app.bescrm.net/auth/callback");
    expect(authCallbackUrl({ next: null })).toBe("https://app.bescrm.net/auth/callback");
  });

  it("carries an onward path", () => {
    expect(authCallbackUrl({ next: "/accept-invitation/abc" })).toBe(
      "https://app.bescrm.net/auth/callback?next=%2Faccept-invitation%2Fabc",
    );
  });

  it("will not carry a foreign origin onward", () => {
    expect(authCallbackUrl({ next: "https://evil.example" })).toBe(
      "https://app.bescrm.net/auth/callback",
    );
    expect(authCallbackUrl({ next: "//evil.example" })).toBe(
      "https://app.bescrm.net/auth/callback",
    );
  });
});
