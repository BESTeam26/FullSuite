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

/* No journey reader here: the journey comes down with client_portal_home(),
   in one request with the rest of the first screen (rule 14). */

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
