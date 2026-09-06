/**
 * The DIY journey, read and moved by the person doing it.
 *
 * Every write is a database function, never a table write: enrolling, giving
 * consent and moving a step each carry a rule that must hold whatever the
 * interface believes. A consumer with a browser console cannot mark themselves
 * as having consented.
 */
import { requireSupabase } from "@/lib/supabase/client";
import type { DiyStage } from "@/lib/diy/journey";

export interface DiyJourneyRow {
  clientId: string;
  stage: DiyStage;
  roundNumber: number;
  identityTheftPathway: boolean;
  startedAt: string;
}

export async function fetchDiyJourney(clientId: string): Promise<DiyJourneyRow | null> {
  const sb = requireSupabase();
  const { data, error } = await sb
    .from("diy_journeys")
    .select("client_id, stage, round_number, identity_theft_pathway, started_at")
    .eq("client_id", clientId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return {
    clientId: data.client_id,
    stage: data.stage as DiyStage,
    roundNumber: data.round_number,
    identityTheftPathway: data.identity_theft_pathway,
    startedAt: data.started_at,
  };
}

export async function fetchDiyConsents(clientId: string) {
  const sb = requireSupabase();
  const { data, error } = await sb
    .from("diy_consents")
    .select("id, kind, version, agreed_at, withdrawn_at")
    .eq("client_id", clientId)
    .is("withdrawn_at", null);
  if (error) throw error;
  return data ?? [];
}

export async function enrolInDiy(organizationId: string, firstName: string, lastName: string, phone?: string) {
  const sb = requireSupabase();
  const { data, error } = await sb.rpc("diy_enroll", {
    p_org: organizationId, p_first_name: firstName, p_last_name: lastName, p_phone: phone ?? null,
  });
  if (error) throw error;
  return data as string;
}

export async function recordDiyConsent(clientId: string, kind: string, statement: string, version: string) {
  const sb = requireSupabase();
  const { error } = await sb.rpc("diy_record_consent", {
    p_client: clientId, p_kind: kind, p_statement: statement, p_version: version,
  });
  if (error) throw error;
}

export async function advanceDiy(clientId: string, stage: DiyStage) {
  const sb = requireSupabase();
  const { error } = await sb.rpc("diy_advance", { p_client: clientId, p_stage: stage });
  if (error) throw error;
}
