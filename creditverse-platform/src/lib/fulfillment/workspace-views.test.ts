import { describe, expect, it } from "vitest";
import {
  creditOpsViewsForPerson,
  hiddenViews,
  toggleHiddenView,
  visibleCreditOpsViews,
  visibleFundingOpsViews,
  workspaceViewOptions,
} from "./workspace-views";
import { PARTNER_VIEWS } from "@/lib/fulfillment/creditops-partners";

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

/* ────────────────────────────────────────────────────────────────────────── *
 * Person scope (Dee's consolidation, 2026-09-11).
 *
 * "SHARED CLIENT VISIBILITY. DEPARTMENT-SCOPED WORK." These lock the first
 * half: the directory stays open to everyone authorized, the queues do not.
 * ────────────────────────────────────────────────────────────────────────── */
describe("a CreditOps member sees their own workspace, not everybody's", () => {
  const complaints = { departments: ["Complaints"], canAccessManagement: false };
  const processor = { departments: ["Dispute"], canAccessManagement: false };
  const bothDesks = { departments: ["Support", "Complaints"], canAccessManagement: false };
  const lead = { departments: ["Dispute"], canAccessManagement: true };

  it("gives every member the four universal views", () => {
    for (const who of [complaints, processor, bothDesks, lead]) {
      const views = creditOpsViewsForPerson(who);
      expect(views).toContain("dashboard");
      expect(views).toContain("main-list");
      expect(views).toContain("sops-logins");
    }
  });

  it("a Complaints agent gets Complaints & Mailing and no other queue", () => {
    const views = creditOpsViewsForPerson(complaints);
    expect(views).toContain("complaints-queue");
    expect(views).not.toContain("dispute-queue");
    expect(views).not.toContain("onboarding-queue");
    expect(views).not.toContain("support-queue");
    expect(views).not.toContain("bureau-queue");
  });

  it("a processor gets the Dispute Queue and not Complaints", () => {
    const views = creditOpsViewsForPerson(processor);
    expect(views).toContain("dispute-queue");
    expect(views).not.toContain("complaints-queue");
  });

  it("somebody in two departments gets both queues", () => {
    /* Dee: "Do not force somebody into one department if their actual
       assignment allows multiple departments." */
    const views = creditOpsViewsForPerson(bothDesks);
    expect(views).toContain("support-queue");
    expect(views).toContain("complaints-queue");
    expect(views).not.toContain("dispute-queue");
  });

  it("the Escalation Queue is management only", () => {
    expect(creditOpsViewsForPerson(processor)).not.toContain("escalation-queue");
    expect(creditOpsViewsForPerson(lead)).toContain("escalation-queue");
  });

  it("management sees every department queue", () => {
    const views = creditOpsViewsForPerson(lead);
    for (const q of ["onboarding-queue", "dispute-queue", "support-queue", "complaints-queue", "bureau-queue"]) {
      expect(views).toContain(q);
    }
  });

  it("somebody with no department still has the shared directory", () => {
    /* The whole point of the universal half: they can look a client up and
       report where it is. They just have no queue to work. */
    const views = creditOpsViewsForPerson({ departments: [], canAccessManagement: false });
    expect(views).toEqual(["dashboard", "main-list", "sops-logins"]);
  });

  it("keeps the views in workspace order, not the order they were asked for", () => {
    const views = creditOpsViewsForPerson(lead);
    expect(views.indexOf("dashboard")).toBeLessThan(views.indexOf("main-list"));
    expect(views.indexOf("onboarding-queue")).toBeLessThan(views.indexOf("dispute-queue"));
    expect(views[views.length - 1]).toBe("sops-logins");
  });
});

/* ────────────────────────────────────────────────────────────────────────── *
 * Global queues vs the partner workspace (Dee, 2026-09-11).
 *
 * "Since we already have GLOBAL CreditOps department queues, do NOT repeat
 * those same queues inside every Partner workspace… Global queues for work.
 * Partner workspace for visibility and client context."
 * ────────────────────────────────────────────────────────────────────────── */
describe("a department queue exists once, globally", () => {
  const partnerLevel = PARTNER_VIEWS.filter((v) => v.partnerLevel).map((v) => v.id);

  it("a partner workspace offers only the summary, the client list and the SOPs", () => {
    expect(partnerLevel).toEqual(["dashboard", "main-list", "sops-logins"]);
  });

  it("no department queue is a partner-level view", () => {
    for (const v of PARTNER_VIEWS) {
      if (v.scope === "department") expect(v.partnerLevel).toBe(false);
    }
  });

  it("the Escalation Queue is not repeated per partner either", () => {
    expect(partnerLevel).not.toContain("escalation-queue");
  });

  it("every queue is still reachable globally — consolidated, not removed", () => {
    /* The functionality Dee kept: one source of truth per department, narrowed
       with a partner filter rather than rebuilt per partner. */
    const everything = creditOpsViewsForPerson({ departments: [], canAccessManagement: true });
    for (const q of ["onboarding-queue", "dispute-queue", "support-queue", "complaints-queue", "bureau-queue", "escalation-queue"]) {
      expect(everything).toContain(q);
    }
  });
});
