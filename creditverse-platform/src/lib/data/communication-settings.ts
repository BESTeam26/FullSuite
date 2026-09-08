/**
 * Agency Communication policy: the guard, and the words it refuses.
 *
 * Dee, §40: only an owner or administrator may change any of this — "Regular
 * Agents cannot disable their own guard." That is enforced by
 * `agency_communication_settings_update` and
 * `communication_blocked_terms_insert`, both of which ask `is_admin_of`.
 * Nothing here is the permission; this is the screen's way of asking.
 *
 * Staff CAN read the policy. Being refused by a rule you are not allowed to
 * look up is its own kind of unfair.
 */
import { requireSupabase } from "@/lib/supabase/client";

export interface BlockedTerm {
  id: string;
  term: string;
  kind: "word" | "phrase";
  category: "profanity" | "harassment" | "threat" | "sexual" | "custom";
  /** Built-in terms belong to no agency and cannot be removed here. */
  builtIn: boolean;
}

export interface CommunicationSettings {
  guardEnabled: boolean;
  terms: BlockedTerm[];
}

export async function fetchCommunicationSettings(agencyId: string): Promise<CommunicationSettings> {
  const sb = requireSupabase();
  const [settings, terms] = await Promise.all([
    sb.from("agency_communication_settings").select("guard_enabled").eq("agency_id", agencyId).maybeSingle(),
    sb.from("communication_blocked_terms").select("id, term, kind, category, agency_id").order("term"),
  ]);
  if (settings.error) throw settings.error;
  if (terms.error) throw terms.error;
  return {
    /* No row means the default, and the default is ON (§35). */
    guardEnabled: settings.data?.guard_enabled ?? true,
    terms: (terms.data ?? []).map((t) => ({
      id: t.id,
      term: t.term,
      kind: t.kind as BlockedTerm["kind"],
      category: t.category as BlockedTerm["category"],
      builtIn: t.agency_id === null,
    })),
  };
}

export async function setGuardEnabled(agencyId: string, enabled: boolean): Promise<void> {
  const sb = requireSupabase();
  const { error } = await sb.from("agency_communication_settings")
    .upsert({ agency_id: agencyId, guard_enabled: enabled, updated_at: new Date().toISOString() } as never,
            { onConflict: "agency_id" });
  if (error) throw error;
}

export async function addBlockedTerm(input: {
  agencyId: string; term: string; kind: "word" | "phrase";
}): Promise<void> {
  const sb = requireSupabase();
  const { error } = await sb.from("communication_blocked_terms").insert({
    agency_id: input.agencyId, term: input.term.trim(), kind: input.kind, category: "custom",
  } as never);
  if (error) throw error;
}

export async function removeBlockedTerm(id: string): Promise<void> {
  const sb = requireSupabase();
  const { error } = await sb.from("communication_blocked_terms").delete().eq("id", id);
  if (error) throw error;
}
