/**
 * Letter Library, rounds and letters — data access (migration 0059). Reads
 * follow the CreditOps client; every transition that matters (open a round,
 * approve, mail) is a database function that re-checks authorization and the
 * QA gate. The interface explains a refusal before the database repeats it
 * (`letter-merge.ts`), but the database decides.
 */
import { requireSupabase } from "@/lib/supabase/client";
import type { Enums, Json, Tables } from "@/lib/supabase/database.types";

export type LetterKind = Enums<"letter_kind">;
export type LetterAudience = Enums<"letter_audience">;
export type DisputeStrategy = Enums<"dispute_strategy">;
export type DisputeOrigin = Enums<"dispute_origin">;
export type DisputeLetterStatus = Enums<"dispute_letter_status">;

export interface LetterTemplate {
  id: string;
  organizationId: string | null;
  kind: LetterKind;
  audience: LetterAudience;
  name: string;
  body: string;
  placeholders: string[];
  isActive: boolean;
  version: number;
  createdAt: string;
}
export interface DisputeRound { id: string; clientId: string; roundNumber: number; strategy: DisputeStrategy; openedAt: string; closedAt: string | null; cycleReset: boolean }
export interface DisputeLetter {
  id: string;
  roundId: string;
  clientId: string;
  templateId: string | null;
  recipientKind: LetterAudience;
  recipientName: string;
  bureau: string | null;
  itemIds: string[];
  findingIds: string[];
  disputeOrigin: DisputeOrigin;
  generatedBy: string;
  bodyFinal: string;
  status: DisputeLetterStatus;
  attested: boolean;
  approvedAt: string | null;
  mailedAt: string | null;
  respondedAt: string | null;
  createdAt: string;
  timers: { kind: Enums<"dispute_timer_kind">; dueAt: string; satisfiedAt: string | null; note: string | null }[];
}

const mapTemplate = (t: Tables<"letter_templates">): LetterTemplate => ({
  id: t.id, organizationId: t.organization_id, kind: t.kind, audience: t.audience, name: t.name, body: t.body,
  placeholders: t.placeholders, isActive: t.is_active, version: t.version, createdAt: t.created_at,
});

/** BES defaults plus the organization's own, active only. */
export async function fetchLetterTemplates(): Promise<LetterTemplate[]> {
  const sb = requireSupabase();
  const { data, error } = await sb.from("letter_templates").select("*").eq("is_active", true).order("kind").order("name");
  if (error) throw error;
  return (data ?? []).map(mapTemplate);
}

export async function createLetterTemplate(input: { organizationId: string; kind: LetterKind; audience: LetterAudience; name: string; body: string; placeholders: string[]; actorId: string }): Promise<void> {
  const sb = requireSupabase();
  const org = await sb.from("organizations").select("agency_id").eq("id", input.organizationId).single();
  if (org.error) throw org.error;
  const { error } = await sb.from("letter_templates").insert({
    agency_id: org.data.agency_id, organization_id: input.organizationId, kind: input.kind, audience: input.audience, name: input.name, body: input.body, placeholders: input.placeholders, created_by: input.actorId,
  });
  if (error) throw error;
}

/** Deleting is deactivating: history keeps its meaning. */
export async function deactivateLetterTemplate(id: string): Promise<void> {
  const sb = requireSupabase();
  const { data, error } = await sb.from("letter_templates").update({ is_active: false }).eq("id", id).select("id");
  if (error) throw error;
  if (!data?.length) throw new Error("Nothing changed — you may not edit this template.");
}

/** The client's rounds with their letters and timers, one nested request. */
export async function fetchClientRounds(clientId: string): Promise<{ rounds: DisputeRound[]; letters: DisputeLetter[] }> {
  const sb = requireSupabase();
  const [r, l] = await Promise.all([
    sb.from("dispute_rounds").select("*").eq("client_id", clientId).order("round_number", { ascending: false }),
    sb.from("dispute_letters").select("*, dispute_attestations(id), dispute_timers(kind, due_at, satisfied_at, note)").eq("client_id", clientId).order("created_at", { ascending: false }),
  ]);
  if (r.error) throw r.error;
  if (l.error) throw l.error;
  return {
    rounds: (r.data ?? []).map((x) => ({ id: x.id, clientId: x.client_id, roundNumber: x.round_number, strategy: x.strategy, openedAt: x.opened_at, closedAt: x.closed_at, cycleReset: x.cycle_reset })),
    letters: (l.data ?? []).map((x) => ({
      id: x.id, roundId: x.round_id, clientId: x.client_id, templateId: x.template_id, recipientKind: x.recipient_kind, recipientName: x.recipient_name, bureau: x.bureau,
      itemIds: x.item_ids, findingIds: x.finding_ids, disputeOrigin: x.dispute_origin, generatedBy: x.generated_by, bodyFinal: x.body_final, status: x.status,
      attested: ((x.dispute_attestations ?? []) as { id: string }[]).length > 0, approvedAt: x.approved_at, mailedAt: x.mailed_at, respondedAt: x.responded_at, createdAt: x.created_at,
      timers: ((x.dispute_timers ?? []) as { kind: Enums<"dispute_timer_kind">; due_at: string; satisfied_at: string | null; note: string | null }[]).map((t) => ({ kind: t.kind, dueAt: t.due_at, satisfiedAt: t.satisfied_at, note: t.note })),
    })),
  };
}

/** Open (reset) or extend (keep the counter) the client's round; returns the round id. */
export async function openDisputeRound(clientId: string, strategy: DisputeStrategy, resetCycle: boolean): Promise<string> {
  const sb = requireSupabase();
  const { data, error } = await sb.rpc("open_dispute_round", { p_client: clientId, p_strategy: strategy, p_reset_cycle: resetCycle });
  if (error) throw error;
  return data as string;
}

export interface NewLetter {
  roundId: string;
  clientId: string;
  templateId: string | null;
  recipientKind: LetterAudience;
  recipientName: string;
  bureau: string | null;
  itemIds: string[];
  findingIds: string[];
  disputeOrigin: DisputeOrigin;
  bodyFinal: string;
  actorId: string;
}
export async function createDraftLetter(input: NewLetter): Promise<string> {
  const sb = requireSupabase();
  const { data, error } = await sb.from("dispute_letters").insert({
    round_id: input.roundId, client_id: input.clientId, template_id: input.templateId, recipient_kind: input.recipientKind, recipient_name: input.recipientName, bureau: input.bureau,
    item_ids: input.itemIds, finding_ids: input.findingIds, dispute_origin: input.disputeOrigin, generated_by: "template", body_final: input.bodyFinal, created_by: input.actorId,
  }).select("id").single();
  if (error) throw error;
  return data.id;
}

/** The truth gate. Statements are the consumer's own words; the database refuses approval without this row. */
export async function attestLetter(letterId: string, statements: { recognises_account: "yes" | "no" | "unsure"; disputed_information: string; reason: string; documents: string[]; identity_theft_certification?: string }, actorId: string): Promise<void> {
  const sb = requireSupabase();
  const { error } = await sb.from("dispute_attestations").insert({ letter_id: letterId, statements: statements as unknown as Json, attested_by: actorId });
  if (error) throw error;
}

export async function updateLetterBody(letterId: string, body: string): Promise<void> {
  const sb = requireSupabase();
  const { data, error } = await sb.from("dispute_letters").update({ body_final: body }).eq("id", letterId).eq("status", "draft").select("id");
  if (error) throw error;
  if (!data?.length) throw new Error("Only a draft can be edited.");
}

export async function approveLetter(letterId: string): Promise<void> {
  const sb = requireSupabase();
  const { error } = await sb.rpc("approve_dispute_letter", { p_letter: letterId });
  if (error) throw error;
}

export async function markLetterMailed(letterId: string, mailedAt?: string): Promise<void> {
  const sb = requireSupabase();
  const { error } = await sb.rpc("mark_letter_mailed", { p_letter: letterId, p_mailed_at: mailedAt });
  if (error) throw error;
}
