import { describe, expect, it } from "vitest";
import { HELP_ROUTE_COUNT, helpFor } from "./page-help";

describe("helpFor", () => {
  it("prefers the most specific route", () => {
    expect(helpFor("/app/clients/123")?.title).toBe("Client profile");
    expect(helpFor("/app/clients")?.title).toBe("Clients");
    expect(helpFor("/app/funding-files/abc")?.title).toBe("Funding file");
    expect(helpFor("/app/funding-files")?.title).toBe("Funding Files");
  });

  it("falls back to the app root and returns null outside the app", () => {
    expect(helpFor("/app/something-new")?.title).toBe("Home");
    expect(helpFor("/portal/funding")).toBeNull();
  });

  it("covers the main screens with user-facing wording", () => {
    expect(HELP_ROUTE_COUNT).toBeGreaterThanOrEqual(24);
    for (const path of ["/app/my-work", "/app/reporting", "/app/settings", "/app/dispute-dashboard", "/app/funding-dashboard"]) {
      const h = helpFor(path);
      expect(h?.steps.length).toBeGreaterThan(0);
      expect(JSON.stringify(h)).not.toMatch(/RLS|tenant|saas_pulled|outsourcing/i);
    }
  });
});
