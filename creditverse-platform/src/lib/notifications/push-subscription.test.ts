import { describe, expect, it } from "vitest";
import { blockedInstructions } from "./push-subscription";

describe("how to unblock notifications", () => {
  it("speaks the browser's own words", () => {
    expect(blockedInstructions("Mozilla/5.0 (Macintosh) Chrome/129 Safari/537.36")).toMatch(/Chrome.*lock icon.*Notifications/);
    expect(blockedInstructions("Mozilla/5.0 (Windows) Chrome/129 Safari/537.36 Edg/129")).toMatch(/Edge/);
    expect(blockedInstructions("Mozilla/5.0 (Macintosh) Firefox/130")).toMatch(/Firefox/);
    expect(blockedInstructions("Mozilla/5.0 (Macintosh) Version/17 Safari/605")).toMatch(/Safari menu/);
    expect(blockedInstructions("Mozilla/5.0 (iPhone) Version/17 Mobile Safari")).toMatch(/Settings → Notifications → FullSuite/);
  });
});
