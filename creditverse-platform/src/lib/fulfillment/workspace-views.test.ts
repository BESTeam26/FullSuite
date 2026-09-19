import { describe, expect, it } from "vitest";
import {
  creditOpsQueuesToInspect,
  creditOpsViewsForPerson,
  hiddenViews,
  toggleHiddenView,
  visibleCreditOpsViews,
  visibleFundingOpsViews,
  workspaceViewOptions,
  creditOpsNavForPerson,
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

  it("gives every member the universal views — the directory and the SOPs; the Dashboard is management (Dee, 2026-09-19)", () => {
    for (const who of [complaints, processor, bothDesks, lead]) {
      const views = creditOpsViewsForPerson(who);
      /* Dashboard follows management capability, never membership alone. */
      expect(views.includes("dashboard")).toBe(who.canAccessManagement);
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

  it("management still reaches every department queue — but not as MY DEPARTMENT", () => {
    /* The reach is unchanged; the LABEL is the fix. Dee, 2026-09-13: "If a
       Team Lead / Operations Manager needs broader visibility, do not fake it
       by putting every department under My Department." So a queue a manager
       is not a member of arrives through `creditOpsQueuesToInspect`, under a
       band that says ALL QUEUES. */
    const mine = creditOpsViewsForPerson(lead);
    const inspect = creditOpsQueuesToInspect(lead);
    const reachable = new Set<string>([...mine, ...inspect]);
    for (const q of ["onboarding-queue", "dispute-queue", "support-queue", "complaints-queue", "bureau-queue"]) {
      expect(reachable.has(q)).toBe(true);
    }
    /* And the ones they merely inspect are NOT in their own department band. */
    for (const q of inspect) expect(mine).not.toContain(q);
  });

  it("a manager's own department is the one their team is in", () => {
    const disputeLead = { departments: ["Dispute"], canAccessManagement: true };
    expect(creditOpsViewsForPerson(disputeLead)).toContain("dispute-queue");
    expect(creditOpsQueuesToInspect(disputeLead)).not.toContain("dispute-queue");
    expect(creditOpsQueuesToInspect(disputeLead)).toContain("support-queue");
  });

  it("somebody placed in another division gets no CreditOps queue at all", () => {
    /* The defect this fixed: a TalentOps agent was shown all five CreditOps
       queues under MY DEPARTMENT. Asserted by SHAPE — no department, no
       management — so it holds for anybody, not for one person. */
    const elsewhere = { departments: [], canAccessManagement: false };
    const views = creditOpsViewsForPerson(elsewhere);
    for (const q of ["onboarding-queue", "dispute-queue", "support-queue", "complaints-queue", "bureau-queue"]) {
      expect(views).not.toContain(q);
    }
    expect(creditOpsQueuesToInspect(elsewhere)).toEqual([]);
  });

  it("somebody with no department still has the shared directory", () => {
    /* The whole point of the universal half: they can look a client up and
       report where it is. They just have no queue to work. */
    const views = creditOpsViewsForPerson({ departments: [], canAccessManagement: false });
    /* The client list leads: CreditOps opens on the work, not on a summary
       of it (Dee, 2026-09-12). */
    expect(views).toEqual(["main-list", "sops-logins"]);
  });

  it("keeps the views in workspace order, not the order they were asked for", () => {
    const views = creditOpsViewsForPerson(lead);
    expect(views.indexOf("main-list")).toBeLessThan(views.indexOf("dashboard"));
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
    expect(partnerLevel).toEqual(["main-list", "dashboard", "sops-logins"]);
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
    const scope = { departments: [], canAccessManagement: true };
    const everything = new Set<string>([
      ...creditOpsViewsForPerson(scope),
      ...creditOpsQueuesToInspect(scope),
    ]);
    for (const q of ["onboarding-queue", "dispute-queue", "support-queue", "complaints-queue", "bureau-queue", "escalation-queue"]) {
      expect(everything.has(q)).toBe(true);
    }
  });
});

/* Dee, 2026-09-19 (UAT case, not a name): a Complaints & Mailing agent's
   CreditOps navigation is Main Client List · Dashboard · their one queue —
   and never management. Multi-placement keeps every department they are in. */
describe("a department agent's CreditOps navigation", () => {
  it("is the universal pair plus their own queue, with no management section", () => {
    const nav = creditOpsNavForPerson({ departments: ["Complaints"], canAccessManagement: false });
    expect(nav.universal.map((v) => v.label).sort()).toEqual(["Main Client List", "SOPs & Logins"].sort());
    expect(nav.department.map((v) => v.label)).toEqual(["Complaints & Mailing"]);
    expect(nav.management).toEqual([]);
    expect(nav.allQueues).toEqual([]);
  });

  it("keeps both queues for somebody legitimately placed in two departments", () => {
    const nav = creditOpsNavForPerson({ departments: ["Complaints", "Support"], canAccessManagement: false });
    expect(nav.department.map((v) => v.label).sort()).toEqual(["Complaints & Mailing", "Support Queue"].sort());
    expect(nav.management).toEqual([]);
  });
});

