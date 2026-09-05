/**
 * Lender relationship intelligence (Addendum C): contacts, partner status,
 * last contact, and the policy-update feed with deterministic file impact.
 * The impact is a list of the files whose open submissions sit on the changed
 * program — computed from rows, never inferred. Policies decide who may write
 * (lender_visible / lender_editable, 0061).
 */
import { requireSupabase } from "@/lib/supabase/client";
import type { Enums } from "@/lib/supabase/database.types";

export type PartnerStatus = "none" | "prospect" | "active_partner" | "preferred_partner" | "paused";
export const PARTNER_STATUS_LABEL: Record<PartnerStatus, string> = { none: "No relationship recorded", prospect: "Prospect", active_partner: "Active partner", preferred_partner: "Preferred partner", paused: "Paused" };
export type PolicyChangeKind = Enums<"policy_change_kind">;
export const POLICY_CHANGE_LABEL: Record<PolicyChangeKind, string> = { tightened: "Tightened", relaxed: "Relaxed", paused: "Paused", resumed: "Resumed", clarified: "Clarified" };

export interface LenderContact { id: string; lenderId: string; name: string; role: string | null; email: string | null; phone: string | null; verifiedAt: string | null; notes: string | null; createdAt: string }
export interface LenderRelationship { partnerStatus: PartnerStatus; lastContactAt: string | null; contacts: LenderContact[] }

export async function fetchLenderRelationship(lenderId: string): Promise<LenderRelationship> {
  const sb = requireSupabase();
  const [lender, contacts] = await Promise.all([
    sb.from("lenders").select("partner_status, last_contact_at").eq("id", lenderId).maybeSingle(),
    sb.from("lender_contacts").select("*").eq("lender_id", lenderId).order("created_at", { ascending: false }).limit(200),
  ]);
  if (lender.error) throw lender.error;
  if (contacts.error) throw contacts.error;
  return {
    partnerStatus: (lender.data?.partner_status ?? "none") as PartnerStatus,
    lastContactAt: lender.data?.last_contact_at ?? null,
    contacts: (contacts.data ?? []).map((c) => ({ id: c.id, lenderId: c.lender_id, name: c.name, role: c.role, email: c.email, phone: c.phone, verifiedAt: c.verified_at, notes: c.notes, createdAt: c.created_at })),
  };
}

export async function addLenderContact(input: { lenderId: string; name: string; role: string | null; email: string | null; phone: string | null; notes: string | null; actorId: string }): Promise<void> {
  const sb = requireSupabase();
  const { error } = await sb.from("lender_contacts").insert({ lender_id: input.lenderId, name: input.name, role: input.role, email: input.email, phone: input.phone, notes: input.notes, created_by: input.actorId });
  if (error) throw error;
}
/** A person confirmed this contact is real and current; only the stamp changes. */
export async function verifyLenderContact(contactId: string, actorId: string): Promise<void> {
  const sb = requireSupabase();
  const { data, error } = await sb.from("lender_contacts").update({ verified_at: new Date().toISOString(), verified_by: actorId }).eq("id", contactId).select("id");
  if (error) throw error;
  if (!data?.length) throw new Error("Nothing changed — you may not edit this lender's contacts.");
}
export async function setPartnerStatus(lenderId: string, status: PartnerStatus): Promise<void> {
  const sb = requireSupabase();
  const { data, error } = await sb.from("lenders").update({ partner_status: status }).eq("id", lenderId).select("id");
  if (error) throw error;
  if (!data?.length) throw new Error("Nothing changed — you may not edit this lender.");
}
/** "We spoke today": the relationship's last-contact stamp, an operational fact. */
export async function logLenderContact(lenderId: string, at: Date = new Date()): Promise<void> {
  const sb = requireSupabase();
  const { data, error } = await sb.from("lenders").update({ last_contact_at: at.toISOString() }).eq("id", lenderId).select("id");
  if (error) throw error;
  if (!data?.length) throw new Error("Nothing changed — you may not edit this lender.");
}

/* ------------------------------------------------------------------ */
/* Policy updates                                                       */
/* ------------------------------------------------------------------ */
export interface PolicyUpdate {
  id: string; programId: string; programName: string; lenderId: string | null; lenderName: string;
  fromVersion: number | null; toVersion: number; changeKind: PolicyChangeKind; summary: string;
  affectedFileIds: string[]; createdAt: string; acknowledgedAt: string | null;
}
const OPEN_DEAL_STATUSES: Enums<"funding_deal_status">[] = ["Submitted", "In Review", "Stipulations", "Offer Received"];

export async function fetchPolicyUpdates(): Promise<PolicyUpdate[]> {
  const sb = requireSupabase();
  const { data, error } = await sb
    .from("policy_updates")
    .select("id, program_id, from_version, to_version, change_kind, summary, affected_file_ids, created_at, acknowledged_at, lender_programs(name, lender_id, lenders(name))")
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) throw error;
  return (data ?? []).map((u) => {
    const p = u.lender_programs as { name: string; lender_id: string; lenders: { name: string } | null } | null;
    return {
      id: u.id, programId: u.program_id, programName: p?.name ?? "Program", lenderId: p?.lender_id ?? null, lenderName: p?.lenders?.name ?? "Lender",
      fromVersion: u.from_version, toVersion: u.to_version, changeKind: u.change_kind, summary: u.summary, affectedFileIds: u.affected_file_ids ?? [], createdAt: u.created_at, acknowledgedAt: u.acknowledged_at,
    };
  });
}

/** Files with an open submission on this program right now — the deterministic impact of a policy change. */
export async function affectedFilesForProgram(programId: string): Promise<string[]> {
  const sb = requireSupabase();
  const { data, error } = await sb.from("funding_deals").select("file_id").eq("program_id", programId).in("status", OPEN_DEAL_STATUSES).limit(2000);
  if (error) throw error;
  return [...new Set((data ?? []).map((d) => d.file_id))];
}

export async function recordPolicyUpdate(input: { programId: string; fromVersion: number | null; toVersion: number; changeKind: PolicyChangeKind; summary: string; actorId: string }): Promise<void> {
  const sb = requireSupabase();
  const affected = await affectedFilesForProgram(input.programId);
  const { error } = await sb.from("policy_updates").insert({
    program_id: input.programId, from_version: input.fromVersion, to_version: input.toVersion, change_kind: input.changeKind, summary: input.summary, affected_file_ids: affected, created_by: input.actorId,
  });
  if (error) throw error;
}

export async function acknowledgePolicyUpdate(updateId: string): Promise<void> {
  const sb = requireSupabase();
  const { error } = await sb.rpc("acknowledge_policy_update", { p_update: updateId });
  if (error) throw error;
}
