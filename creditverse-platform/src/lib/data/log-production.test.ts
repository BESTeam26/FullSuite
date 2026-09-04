/**
 * "Exactly once" for production is enforced by the database — a unique index
 * on (agency_id, request_id) — not by the UI. The client's job is to send the
 * same request id for the same submission and to treat the resulting 23505 as
 * what it is: proof the row already exists. This pins that contract.
 */
import { describe, expect, it, vi } from "vitest";

let insertResult: { error: null | { code: string; message: string } } = { error: null };
const insert = vi.fn(() => Promise.resolve(insertResult));
vi.mock("@/lib/supabase/client", () => ({
  requireSupabase: () => ({ from: () => ({ insert }) }),
  supabase: null, authMode: "live", siteUrl: "", isSupabaseConfigured: true,
}));

const { logProduction } = await import("./fulfillment-clients");
const input = {
  agencyId: "a", employeeId: "e", clientId: "c", department: "Onboarding" as const,
  productionUnitType: "Onboarding", actions: ["Client File Reviewed"], requestId: "11111111-1111-4111-8111-111111111111",
};

describe("logProduction idempotency contract", () => {
  it("sends the client-generated request id with the row", async () => {
    insertResult = { error: null };
    await logProduction(input);
    expect(insert).toHaveBeenLastCalledWith(expect.objectContaining({ request_id: input.requestId }));
  });

  it("treats a unique-violation on the request id as success, not failure", async () => {
    insertResult = { error: { code: "23505", message: "duplicate key value violates unique constraint" } };
    await expect(logProduction(input)).resolves.toBeUndefined();
  });

  it("still surfaces every other database error", async () => {
    insertResult = { error: { code: "42501", message: "new row violates row-level security policy" } };
    await expect(logProduction(input)).rejects.toMatchObject({ code: "42501" });
  });
});
