/**
 * A client's protected identity and access data, from the browser.
 *
 * The list read here carries NO secret values — only that a secret exists, and
 * what it is for. The value comes back one at a time from
 * `client_secret_reveal`, which checks the capability and writes an audit row
 * before it answers. So an unauthorized viewer does not receive the secret in
 * the payload and then have it hidden by CSS; they never receive it at all.
 */
import { requireSupabase } from "@/lib/supabase/client";

export type ClientSecretKind = "ssn" | "monitoring" | "cfpb" | "other";

export interface ClientSecret {
  id: string;
  kind: ClientSecretKind;
  label: string | null;
  provider: string | null;
  username: string | null;
  url: string | null;
  /** False when the row is a placeholder with nothing stored. */
  hasValue: boolean;
  lastRotatedAt: string | null;
}

/**
 * Secrets for a CreditOps client, addressed by its FULFILLMENT id.
 *
 * The secrets hang off the canonical person (`clients`), because an SSN
 * follows the human being across services — but every screen that needs them
 * holds the CreditOps record's id. One bounded lookup here beats making six
 * call sites carry two ids.
 */
export async function fetchClientSecretsForWorkFile(fulfillmentClientId: string): Promise<ClientSecret[]> {
  const sb = requireSupabase();
  const { data, error } = await sb
    .from("fulfillment_clients")
    .select("client_id")
    .eq("id", fulfillmentClientId)
    .maybeSingle();
  if (error) throw error;
  const canonical = (data?.client_id as string) ?? null;
  return canonical ? fetchClientSecrets(canonical) : [];
}

export async function fetchClientSecrets(clientId: string): Promise<ClientSecret[]> {
  const sb = requireSupabase();
  const { data, error } = await sb
    .from("client_secrets")
    .select("id, kind, label, provider, username, url, secret_id, last_rotated_at")
    .eq("client_id", clientId)
    .is("archived_at", null)
    .order("kind");
  if (error) throw error;
  return (data ?? []).map((r) => ({
    id: r.id as string,
    kind: r.kind as ClientSecretKind,
    label: (r.label as string) ?? null,
    provider: (r.provider as string) ?? null,
    username: (r.username as string) ?? null,
    url: (r.url as string) ?? null,
    /* `secret_id` is a Vault id, not a secret: Vault is not readable by
       `authenticated` at all, so knowing the id reveals nothing. */
    hasValue: r.secret_id !== null,
    lastRotatedAt: (r.last_rotated_at as string) ?? null,
  }));
}

/** One value, audited server-side before it is returned. */
export async function revealClientSecret(id: string): Promise<string> {
  const sb = requireSupabase();
  const { data, error } = await sb.rpc("client_secret_reveal", { p_id: id });
  if (error) throw error;
  return data as string;
}
