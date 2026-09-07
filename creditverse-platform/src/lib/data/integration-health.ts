/**
 * Are the provider integrations actually working?
 *
 * A key stored in Supabase secrets and a key that works are different things,
 * and the settings screen used to show neither — it showed a hand-written list
 * with invented "last sync" times. This asks each provider a read-only
 * question with the real credential and reports what it said.
 *
 * The credential never comes back here. The Edge Function holds it, asks, and
 * returns a state and a sentence.
 */
import { requireSupabase } from "@/lib/supabase/client";

export type IntegrationState = "working" | "rejected" | "not_configured" | "unreachable";

export interface IntegrationCheck {
  provider: string;
  state: IntegrationState;
  detail: string;
  /** What a red row actually costs, so the list means something. */
  powers: string;
}

export interface IntegrationHealth {
  checkedAt: string;
  checks: IntegrationCheck[];
}

export const STATE_LABEL: Record<IntegrationState, string> = {
  working: "Working",
  rejected: "Refused",
  not_configured: "No key set",
  unreachable: "Unreachable",
};

export async function fetchIntegrationHealth(): Promise<IntegrationHealth> {
  const sb = requireSupabase();
  const { data, error } = await sb.functions.invoke("integration-health", { body: {} });
  if (error) throw error;
  return data as IntegrationHealth;
}
