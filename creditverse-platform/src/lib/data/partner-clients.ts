/**
 * A partner's own end clients.
 *
 * ── WHY THERE IS NO `partner_clients` TABLE ────────────────────────────────
 *
 * A partner's client is a `fulfillment_clients` row with an
 * `outsourcing_group_id` — the SAME canonical client record CreditOps works
 * on, not a copy of it (rule 2). A partner's client list and a CreditOps queue
 * are two views of one truth. A second table would be a second truth, and the
 * moment one of them was updated the other would be wrong.
 *
 * ── NAME AND EMAIL ARE THE WHOLE REQUIREMENT ───────────────────────────────
 *
 * Dee's rule: adding a client must not demand a phone number nobody has to
 * hand. Everything else has a database default. A form that refuses is how
 * records fill up with "n/a", which is worse than a blank.
 *
 * ── CLIENTS ARE OPTIONAL ───────────────────────────────────────────────────
 *
 * A partner may have none, and that is not a gap. A GHL build client has no
 * end clients BES manages; a TalentOps arrangement has none either. Zero is an
 * answer.
 */
import { requireSupabase } from "@/lib/supabase/client";

export interface PartnerClient {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  status: string;
  round: string;
  assignedAgentId: string | null;
  openItems: number;
  lastActivityAt: string;
  createdAt: string;
}

const CLIENT_COLUMNS =
  "id, name, email, phone, status, round, assigned_agent_id, open_items, last_activity_at, created_at";

const mapClient = (r: Record<string, unknown>): PartnerClient => ({
  id: r.id as string,
  name: r.name as string,
  email: String(r.email ?? ""),
  phone: (r.phone as string) ?? null,
  status: (r.status as string) ?? "Onboarding",
  round: (r.round as string) ?? "Pre-Round",
  assignedAgentId: (r.assigned_agent_id as string) ?? null,
  openItems: Number(r.open_items ?? 0),
  lastActivityAt: r.last_activity_at as string,
  createdAt: r.created_at as string,
});

/**
 * One page of a partner's clients.
 *
 * Paged rather than "all of them": one partner in the real data has several
 * hundred, and a profile tab that fetches every row to show the first twenty
 * is the payload problem rule 14 names.
 */
export async function fetchPartnerClients(
  groupId: string,
  { limit = 50, offset = 0, search = "" }: { limit?: number; offset?: number; search?: string } = {},
): Promise<{ rows: PartnerClient[]; total: number }> {
  const sb = requireSupabase();
  let q = sb
    .from("fulfillment_clients")
    .select(CLIENT_COLUMNS, { count: "exact" })
    .eq("outsourcing_group_id", groupId)
    .eq("is_fixture", false)
    .order("last_activity_at", { ascending: false })
    .range(offset, offset + limit - 1);
  /* Server-side, so filtering a long list does not mean downloading it. */
  const needle = search.trim();
  if (needle) q = q.or(`name.ilike.%${needle}%,email.ilike.%${needle}%`);
  const { data, error, count } = await q;
  if (error) throw error;
  return { rows: (data ?? []).map((r) => mapClient(r as Record<string, unknown>)), total: count ?? 0 };
}

export async function createPartnerClient(input: {
  agencyId: string;
  groupId: string;
  /** Required. */
  name: string;
  /** Required. */
  email: string;
  /** Optional, deliberately. */
  phone?: string;
}): Promise<string> {
  const sb = requireSupabase();
  const { data, error } = await sb
    .from("fulfillment_clients")
    .insert({
      agency_id: input.agencyId,
      outsourcing_group_id: input.groupId,
      /* The partner has no BES tenant, so the record cannot be pulled from a
         customer's own workspace — it is BES's to hold (rule 16, model 3). */
      mode: "outsourcing_only",
      name: input.name.trim(),
      email: input.email.trim(),
      phone: input.phone?.trim() || null,
    } as never)
    .select("id")
    .single();
  if (error) throw error;
  return (data as { id: string }).id;
}
