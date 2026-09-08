/**
 * Permanent deletion, for the agency owner alone.
 *
 * ── THE EXCEPTION, NOT THE RULE ────────────────────────────────────────────
 *
 * Everywhere else in this platform, retiring something ARCHIVES it: a
 * cancelled service, a finished partner, a member who has left. That is rule
 * 11, and it is right — a record of something that happened is worth keeping.
 *
 * This is the deliberate exception, and Dee asked for it by name: during beta
 * they will create test partners, clients and teams to try the system, and
 * those should be gone rather than archived into the record forever.
 *
 * It is shaped so it cannot become the habit. Owner only — not an
 * administrator, and not grantable by permission. One record at a time, named
 * by table and id; there is no "delete all". Audited BEFORE the row
 * disappears, because afterwards there is nothing left to describe. And it
 * refuses the three things that would break the agency: your own membership,
 * the last active owner, and any fixture the security suite measures against.
 */
import { requireSupabase } from "@/lib/supabase/client";

export type DeletableTable =
  | "outsourcing_groups"
  | "fulfillment_clients"
  | "funding_clients"
  | "partner_services"
  | "teams"
  | "work_items"
  | "agency_memberships"
  | "partner_invoices"
  | "agency_expenses"
  | "partner_contacts";

export const DELETABLE_LABEL: Record<DeletableTable, string> = {
  outsourcing_groups: "partner",
  fulfillment_clients: "client",
  funding_clients: "funding client",
  partner_services: "service engagement",
  teams: "team",
  work_items: "work item",
  agency_memberships: "team member",
  partner_invoices: "invoice",
  agency_expenses: "expense",
  partner_contacts: "partner contact",
};

export interface DeleteOutcome {
  table: DeletableTable;
  label: string | null;
  deleted: number;
}

export async function ownerDeleteRecord(
  table: DeletableTable,
  id: string,
  reason?: string,
): Promise<DeleteOutcome> {
  const sb = requireSupabase();
  const { data, error } = await sb.rpc("owner_delete_record", {
    p_table: table, p_id: id, p_reason: reason?.trim() || null,
  });
  if (error) throw error;
  const r = (data ?? {}) as Record<string, unknown>;
  return {
    table: (r.table as DeletableTable) ?? table,
    label: (r.label as string) ?? null,
    deleted: Number(r.deleted ?? 0),
  };
}
