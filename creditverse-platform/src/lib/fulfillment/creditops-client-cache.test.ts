/**
 * One row changes, one row is patched — the list is never refetched to
 * change a field (Dee, 2026-09-30: immediate feedback, then the server's
 * result). These helpers touch the loaded list only; a list that is not
 * loaded stays not loaded.
 */
import { describe, expect, it } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import { CREDITOPS_CLIENTS_KEY, dropCachedClient, patchCachedClient } from "./creditops-client-cache";
import type { FulfillmentClient } from "./fulfillment-client-domain";

const row = (id: string, status: string): FulfillmentClient =>
  ({ id, name: `Client ${id}`, email: `${id}@example.test`, phone: null, status, mode: "outsourcing_only" } as unknown as FulfillmentClient);

describe("patching the loaded client list", () => {
  it("changes only the row that was written", () => {
    const qc = new QueryClient();
    qc.setQueryData(CREDITOPS_CLIENTS_KEY, [row("a", "Ready for Round 1"), row("b", "Ready for Round 1")]);
    patchCachedClient(qc, "a", { status: "Round 1 Sent" } as Partial<FulfillmentClient>);
    const list = qc.getQueryData<FulfillmentClient[]>(CREDITOPS_CLIENTS_KEY)!;
    expect(list.find((c) => c.id === "a")!.status).toBe("Round 1 Sent");
    expect(list.find((c) => c.id === "b")!.status).toBe("Ready for Round 1");
  });
  it("drops an archived client from the active list", () => {
    const qc = new QueryClient();
    qc.setQueryData(CREDITOPS_CLIENTS_KEY, [row("a", "x"), row("b", "x")]);
    dropCachedClient(qc, "a");
    expect(qc.getQueryData<FulfillmentClient[]>(CREDITOPS_CLIENTS_KEY)!.map((c) => c.id)).toEqual(["b"]);
  });
  it("leaves an unloaded list unloaded rather than inventing one", () => {
    const qc = new QueryClient();
    patchCachedClient(qc, "a", { status: "x" } as unknown as Partial<FulfillmentClient>);
    expect(qc.getQueryData(CREDITOPS_CLIENTS_KEY)).toBeUndefined();
  });
});
