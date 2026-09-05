import { describe, expect, it } from "vitest";
import {
  hiddenViews,
  toggleHiddenView,
  visibleCreditOpsViews,
  visibleFundingOpsViews,
  workspaceViewOptions,
} from "./workspace-views";

describe("organization workspace views", () => {
  it("shows every view when nothing is configured", () => {
    expect(visibleCreditOpsViews(null)).toContain("dispute-queue");
    expect(visibleCreditOpsViews({})).toHaveLength(9);
    expect(visibleFundingOpsViews(undefined).length).toBeGreaterThan(3);
  });

  it("hides exactly what the organization switched off", () => {
    const s = { creditOps: { hidden: ["dispute-queue", "bureau-queue"] } };
    const views = visibleCreditOpsViews(s);
    expect(views).not.toContain("dispute-queue");
    expect(views).not.toContain("bureau-queue");
    expect(views).toContain("support-queue");
    // A CreditOps setting never touches FundingOps.
    expect(hiddenViews(s, "fundingOps")).toEqual([]);
  });

  it("never hides the dashboard or the record list, even if the data says so", () => {
    const s = { creditOps: { hidden: ["dashboard", "main-list", "support-queue"] } };
    expect(visibleCreditOpsViews(s)).toContain("dashboard");
    expect(visibleCreditOpsViews(s)).toContain("main-list");
    expect(visibleCreditOpsViews(s)).not.toContain("support-queue");
    expect(() => toggleHiddenView(s, "creditOps", "dashboard", true)).toThrow();
    expect(workspaceViewOptions("creditOps").find((o) => o.id === "dashboard")?.configurable).toBe(false);
    expect(workspaceViewOptions("fundingOps").find((o) => o.id === "deal-list")?.configurable).toBe(false);
  });

  it("builds the merge patch for one switch without disturbing the rest", () => {
    const s = { creditOps: { hidden: ["dispute-queue"] } };
    expect(toggleHiddenView(s, "creditOps", "bureau-queue", true)).toEqual({
      creditOps: { hidden: ["dispute-queue", "bureau-queue"] },
    });
    expect(toggleHiddenView(s, "creditOps", "dispute-queue", false)).toEqual({
      creditOps: { hidden: [] },
    });
  });
});
