import type { QueryClient } from "@tanstack/react-query";
import type { FulfillmentClient } from "./fulfillment-client-domain";

/**
 * Patch ONE client in the loaded list instead of refetching the list.
 *
 * Dee, 2026-09-30: "status/assignee mutation → immediate feedback, then
 * confirm server result." Every control used to invalidate
 * ["creditops","clients"] after a write, which re-read 1,000+ rows in two
 * requests to change one row's field. The store already patches the row it
 * wrote; these give the controls that write through other paths the same
 * one-row update. The row is patched with what the SERVER returned or
 * accepted — never with a guess.
 */
export const CREDITOPS_CLIENTS_KEY = ["creditops", "clients"] as const;

export function patchCachedClient(
  qc: QueryClient, id: string, patch: Partial<FulfillmentClient>,
): void {
  qc.setQueryData<FulfillmentClient[]>(CREDITOPS_CLIENTS_KEY, (prev) =>
    prev ? prev.map((c) => (c.id === id ? { ...c, ...patch } : c)) : prev);
}

/** For a write that removes the client from the active list (archive). */
export function dropCachedClient(qc: QueryClient, id: string): void {
  qc.setQueryData<FulfillmentClient[]>(CREDITOPS_CLIENTS_KEY, (prev) =>
    prev ? prev.filter((c) => c.id !== id) : prev);
}
