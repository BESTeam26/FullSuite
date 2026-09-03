import { describe, it, expect } from "vitest";
import {
  normalizeEmail,
  checkClientConflict,
  clientGroupKey,
  clientGroupLabel,
  stageToClientStatus,
  needsAttention,
  isStatusAutoSynced,
  type FulfillmentClient,
} from "./fulfillment-client-domain";
import type { WorkStage } from "@/lib/bes-domain";

const client = (
  o: Partial<FulfillmentClient> & { id: string },
): FulfillmentClient => ({
  name: o.id,
  email: `${o.id}@example.com`,
  mode: "saas_pulled",
  autoSync: true,
  status: "In Processing",
  round: "Round 1",
  openItems: 0,
  lastActivity: "2026-09-01",
  createdAt: "2026-09-01",
  ...o,
});

describe("normalizeEmail", () => {
  it("trims whitespace and lower-cases", () => {
    expect(normalizeEmail("  Foo.Bar@Example.COM ")).toBe(
      "foo.bar@example.com",
    );
  });
});

describe("checkClientConflict", () => {
  const A = client({
    id: "A",
    email: "jane@x.com",
    mode: "saas_pulled",
    organizationId: "org-1",
  });
  const B = client({
    id: "B",
    email: "Jane@X.com",
    mode: "outsourcing_only",
    autoSync: false,
    outsourcingGroupId: "grp-1",
  });
  const C = client({
    id: "C",
    email: "other@x.com",
    mode: "saas_pulled",
    organizationId: "org-1",
  });
  const all = [A, B, C];

  it("hard-blocks a duplicate inside the same partner scope and warns about others", () => {
    const r = checkClientConflict("jane@x.com", "org-1", all);
    expect(r.sameScopeDuplicate?.id).toBe("A");
    expect(r.crossScopeMatches.map((c) => c.id)).toEqual(["B"]);
  });

  it("only warns (no hard block) when the email exists solely in other scopes", () => {
    const r = checkClientConflict("jane@x.com", "org-99", all);
    expect(r.sameScopeDuplicate).toBeUndefined();
    expect(r.crossScopeMatches.map((c) => c.id)).toEqual(["A", "B"]);
  });

  it("matches case- and whitespace-insensitively", () => {
    const r = checkClientConflict("  JANE@x.COM ", "grp-1", all);
    expect(r.sameScopeDuplicate?.id).toBe("B");
    expect(r.crossScopeMatches.map((c) => c.id)).toEqual(["A"]);
  });

  it("returns no conflicts for an empty or whitespace-only email", () => {
    expect(checkClientConflict("", "org-1", all)).toEqual({
      crossScopeMatches: [],
    });
    expect(checkClientConflict("   ", "org-1", all)).toEqual({
      crossScopeMatches: [],
    });
  });

  it("returns no conflicts for an unknown email", () => {
    const r = checkClientConflict("new@x.com", "org-1", all);
    expect(r.sameScopeDuplicate).toBeUndefined();
    expect(r.crossScopeMatches).toEqual([]);
  });
});

describe("clientGroupKey / clientGroupLabel", () => {
  it("groups SaaS-pulled clients by organization", () => {
    const c = client({
      id: "s",
      organizationId: "org-7",
      organizationName: "Seven LLC",
    });
    expect(clientGroupKey(c)).toBe("org-7");
    expect(clientGroupLabel(c)).toBe("Seven LLC");
  });

  it("groups outsourcing-only clients by outsourcing group, ignoring any org fields", () => {
    const c = client({
      id: "o",
      mode: "outsourcing_only",
      autoSync: false,
      organizationId: "org-stale",
      organizationName: "Stale Org",
      outsourcingGroupId: "grp-3",
      outsourcingGroupName: "CRC Q3 Cohort",
    });
    expect(clientGroupKey(c)).toBe("grp-3");
    expect(clientGroupLabel(c)).toBe("CRC Q3 Cohort");
  });

  it("falls back to mode-specific 'unassigned' values", () => {
    const saas = client({ id: "s" });
    const outs = client({ id: "o", mode: "outsourcing_only", autoSync: false });
    expect(clientGroupKey(saas)).toBe("unassigned");
    expect(clientGroupLabel(saas)).toBe("Unassigned Org");
    expect(clientGroupKey(outs)).toBe("unassigned");
    expect(clientGroupLabel(outs)).toBe("Unassigned Group");
  });
});

describe("stageToClientStatus", () => {
  it("maps every WorkStage to the expected client status", () => {
    const expected: Record<WorkStage, string> = {
      Queued: "Ready for Processing",
      Assigned: "Ready for Processing",
      "In Processing": "In Processing",
      "Ready for QA": "Ready for QA",
      "QA Review": "Ready for QA",
      Completed: "Completed",
      Blocked: "Attention",
      Attention: "Attention",
    };
    for (const [stage, status] of Object.entries(expected)) {
      expect(stageToClientStatus(stage as WorkStage)).toBe(status);
    }
  });
});

describe("needsAttention", () => {
  it("flags Attention and Monitoring Issue statuses", () => {
    expect(needsAttention(client({ id: "a", status: "Attention" }))).toBe(true);
    expect(
      needsAttention(client({ id: "b", status: "Monitoring Issue" })),
    ).toBe(true);
  });

  it("flags SLA at or below 4 hours, but not above", () => {
    expect(needsAttention(client({ id: "c", slaHoursRemaining: 4 }))).toBe(
      true,
    );
    expect(needsAttention(client({ id: "d", slaHoursRemaining: 0 }))).toBe(
      true,
    );
    expect(needsAttention(client({ id: "e", slaHoursRemaining: 5 }))).toBe(
      false,
    );
  });

  it("does not flag a healthy client with no SLA value", () => {
    expect(needsAttention(client({ id: "f", status: "In Processing" }))).toBe(
      false,
    );
  });
});

describe("isStatusAutoSynced", () => {
  it("is true only for SaaS-pulled clients with autoSync on", () => {
    expect(
      isStatusAutoSynced(
        client({ id: "a", mode: "saas_pulled", autoSync: true }),
      ),
    ).toBe(true);
    expect(
      isStatusAutoSynced(
        client({ id: "b", mode: "saas_pulled", autoSync: false }),
      ),
    ).toBe(false);
    expect(
      isStatusAutoSynced(
        client({ id: "c", mode: "outsourcing_only", autoSync: true }),
      ),
    ).toBe(false);
  });
});
