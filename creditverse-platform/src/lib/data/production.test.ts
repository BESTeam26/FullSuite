import { beforeEach, describe, expect, it, vi } from "vitest";

const insert = vi.fn();
vi.mock("@/lib/supabase/client", () => ({
  requireSupabase: () => ({ from: () => ({ insert }) }),
  supabase: { from: () => ({ insert }) },
}));

const { logProduction } = await import("./production");

const base = { agencyId: "a", employeeId: "e", requestId: "r", actions: ["x"] };

describe("canonical production — one engine, service-specific subject", () => {
  beforeEach(() => insert.mockReset());

  it("CreditOps rows carry the fulfillment client and department", async () => {
    insert.mockResolvedValue({ error: null });
    await logProduction({ ...base, service: "creditops", fulfillmentClientId: "c", departmentKey: "Onboarding" });
    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({ service: "creditops", client_id: "c", department_key: "Onboarding", request_id: "r", production_unit_quantity: 1 }),
    );
    // division_id is a legacy reader column, derived from service on the server.
    expect(insert.mock.calls[0][0].division_id).toBe("creditops");
  });

  it("FundingOps rows carry the funding client, the deal and a funding department", async () => {
    insert.mockResolvedValue({ error: null });
    await logProduction({ ...base, service: "fundingops", fundingClientId: "fc", fundingDealId: "d", departmentKey: "Submissions" });
    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({ service: "fundingops", funding_client_id: "fc", funding_deal_id: "d", department_key: "Submissions" }),
    );
    expect(insert.mock.calls[0][0].client_id).toBeUndefined();
  });

  it("work-item services carry the work item and no department", async () => {
    insert.mockResolvedValue({ error: null });
    await logProduction({ ...base, service: "talentops", workItemId: "w", unitType: "Task" });
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({ service: "talentops", work_item_id: "w", production_unit_type: "Task" }));
    expect(insert.mock.calls[0][0].department_key).toBeNull();
  });

  it("23505 on the request id is the idempotent success", async () => {
    insert.mockResolvedValue({ error: { code: "23505" } });
    await expect(logProduction({ ...base, service: "creditops", fulfillmentClientId: "c" })).resolves.toBeUndefined();
  });

  it("other errors surface", async () => {
    insert.mockResolvedValue({ error: { code: "42501", message: "denied" } });
    await expect(logProduction({ ...base, service: "fundingops", fundingClientId: "fc" })).rejects.toMatchObject({ code: "42501" });
  });
});
