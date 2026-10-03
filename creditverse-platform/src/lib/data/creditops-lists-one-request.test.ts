/**
 * The CreditOps lists arrive in one request each (2026-10-03). Before, the
 * client list and its department rows were paged under PostgREST's 1,000-row
 * cap: two round trips before a full-scope viewer saw a row. This pins that
 * each is ONE call to its jsonb function, mapped exactly as before — and that
 * a large book is still returned whole, never cut at a page boundary.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";

const rpc = vi.fn();
vi.mock("@/lib/supabase/client", () => ({ requireSupabase: () => ({ rpc }) }));

import { fetchDepartmentStatusesForScope, fetchFulfillmentClients } from "./fulfillment-clients";

const client = (i: number) => ({
  id: `c-${i}`, name: `Client ${i}`, email: `c${i}@example.test`, phone: null, mode: "outsourcing",
  organization_id: null, organizations: null, outsourcing_group_id: "g1", outsourcing_groups: { name: "Vanquish" },
  auto_sync: false, status: "Processing", round: "Round 1", lifecycle: "active", archived_at: null, team_id: null,
  open_items: 0, due_at: null, processed_on: null, assigned_agent_id: "a1",
  assigned_agent: { full_name: "Jet", email: "jet@example.test" }, description: null, description_body: null,
  next_action: null, last_activity_at: "2026-10-01T10:00:00Z", created_at: "2026-09-01T10:00:00Z",
});

beforeEach(() => rpc.mockReset());

describe("CreditOps lists in one request", () => {
  it("reads the whole client list in one call, past 1,000 rows, mapped as before", async () => {
    rpc.mockResolvedValue({ data: Array.from({ length: 1459 }, (_, i) => client(i)), error: null });
    const rows = await fetchFulfillmentClients();
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith("creditops_client_list");
    expect(rows).toHaveLength(1459);
    expect(rows[0]).toMatchObject({ id: "c-0", outsourcingGroupName: "Vanquish", assignedAgent: "Jet", assignedAgentId: "a1", lifecycle: "active" });
  });

  it("reads a scope's department rows in one call and groups them by client", async () => {
    rpc.mockResolvedValue({ data: [
      { client_id: "c-1", department: "Dispute", status: "READY FOR ROUND 1", assignee_id: null, updated_at: "2026-10-01", assignee_name: null, assignee_email: null },
      { client_id: "c-1", department: "Support", status: "MONITORING ISSUE", assignee_id: "a1", updated_at: "2026-10-01", assignee_name: "Jet", assignee_email: "jet@example.test" },
    ], error: null });
    const byClient = await fetchDepartmentStatusesForScope("g1");
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith("creditops_department_rows_all", { p_group: "g1" });
    expect(byClient["c-1"].map((d) => [d.department, d.assignee])).toEqual([["Dispute", "Unassigned"], ["Support", "Jet"]]);
  });

  it("surfaces a database refusal instead of showing an empty list", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "permission denied", code: "42501" } });
    await expect(fetchFulfillmentClients()).rejects.toBeTruthy();
  });
});
