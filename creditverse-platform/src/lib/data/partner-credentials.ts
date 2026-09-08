/**
 * The logins BES needs to fulfil for a partner.
 *
 * ── WHAT THIS FILE DOES NOT DO ─────────────────────────────────────────────
 *
 * It never reads a password from a table, because there is no password column
 * to read. `partner_credentials` holds a `secret_id` pointing into Supabase
 * Vault, which `authenticated` has no grant on, so a row fetched here contains
 * the label, the username, the link and the notes — and nothing else. The
 * password comes back only from `partner_credential_reveal`, one at a time,
 * and that call writes an audit row naming the person before it returns.
 *
 * So the ordinary case — copy the username, open the link — costs one query
 * and leaves no audit trail, and the sensitive case costs a deliberate click
 * and always leaves one. That asymmetry is the whole design.
 *
 * Seeing that an entry EXISTS needs `partners.view`. Seeing its password needs
 * `partners.credentials.view`, which is off by default for every role below
 * agency admin. Changing one needs `partners.credentials.manage`.
 */
import { requireSupabase } from "@/lib/supabase/client";

/** A platform from the catalogue: what to call it, and whether it texts a code. */
export interface CredentialPlatform {
  key: string;
  label: string;
  sendsCode: boolean;
  sort: number;
}

/** One login, without its password. */
export interface PartnerCredential {
  id: string;
  groupId: string;
  platformKey: string;
  label: string;
  username: string | null;
  url: string | null;
  /** Where the second factor arrives — a mailbox or a number, not the code. */
  codeDestination: string | null;
  notes: string | null;
  /** Whether a password is stored at all. An SSO login legitimately has none. */
  hasSecret: boolean;
  lastRotatedAt: string | null;
  rotationDueOn: string | null;
  archivedAt: string | null;
  archivedReason: string | null;
  createdAt: string;
}

/** An entry in the access record. Note that reads appear here, not just writes. */
export interface CredentialEvent {
  id: number;
  credentialId: string;
  actorId: string | null;
  actorName: string | null;
  action: "created" | "updated" | "revealed" | "rotated" | "archived";
  note: string | null;
  createdAt: string;
}

const row = (r: Record<string, unknown>): PartnerCredential => ({
  id: r.id as string,
  groupId: r.group_id as string,
  platformKey: r.platform_key as string,
  label: r.label as string,
  username: (r.username as string) ?? null,
  url: (r.url as string) ?? null,
  codeDestination: (r.code_destination as string) ?? null,
  notes: (r.notes as string) ?? null,
  hasSecret: r.secret_id != null,
  lastRotatedAt: (r.last_rotated_at as string) ?? null,
  rotationDueOn: (r.rotation_due_on as string) ?? null,
  archivedAt: (r.archived_at as string) ?? null,
  archivedReason: (r.archived_reason as string) ?? null,
  createdAt: r.created_at as string,
});

export async function fetchCredentialPlatforms(): Promise<CredentialPlatform[]> {
  const sb = requireSupabase();
  const { data, error } = await sb
    .from("credential_platforms")
    .select("key,label,sends_code,sort")
    .order("sort");
  if (error) throw error;
  return (data ?? []).map((r) => ({
    key: r.key as string,
    label: r.label as string,
    sendsCode: Boolean(r.sends_code),
    sort: Number(r.sort ?? 0),
  }));
}

/**
 * A partner's credentials.
 *
 * Archived entries are excluded by default. They are kept rather than deleted
 * because "who could sign in to this last March" is a question that gets asked
 * after an incident, and a deleted row cannot answer it (rule 11).
 */
export async function fetchPartnerCredentials(
  groupId: string,
  includeArchived = false,
): Promise<PartnerCredential[]> {
  const sb = requireSupabase();
  let q = sb.from("partner_credentials").select("*").eq("group_id", groupId);
  if (!includeArchived) q = q.is("archived_at", null);
  const { data, error } = await q.order("platform_key").order("label");
  if (error) throw error;
  return (data ?? []).map((r) => row(r as Record<string, unknown>));
}

export interface SaveCredentialInput {
  /** Omit to create; supply to update in place. */
  id?: string;
  groupId: string;
  platformKey: string;
  label: string;
  username?: string | null;
  url?: string | null;
  /**
   * The password. Three distinct meanings, and the database honours all three:
   * `undefined` leaves the stored one untouched, `""` clears it, and a string
   * replaces it and records a rotation.
   */
  secret?: string | null;
  codeDestination?: string | null;
  notes?: string | null;
  rotationDue?: string | null;
}

export async function savePartnerCredential(
  input: SaveCredentialInput,
): Promise<string> {
  const sb = requireSupabase();
  const { data, error } = await sb.rpc("partner_credential_save", {
    p_group: input.groupId,
    p_platform: input.platformKey,
    p_label: input.label,
    p_username: input.username ?? null,
    p_url: input.url ?? null,
    p_secret: input.secret === undefined ? null : input.secret,
    p_code_destination: input.codeDestination ?? null,
    p_notes: input.notes ?? null,
    p_rotation_due: input.rotationDue ?? null,
    p_id: input.id ?? null,
  });
  if (error) throw error;
  return data as string;
}

/**
 * Fetch one password.
 *
 * The audit row is written by the function BEFORE the value is returned, so a
 * reveal that reaches the caller has already been recorded and a dropped
 * response cannot lose the record of it. Refusals are recorded as refusals,
 * not as reads.
 *
 * Never store what this returns. It belongs in the clipboard and nowhere else.
 */
export async function revealPartnerCredential(id: string): Promise<string> {
  const sb = requireSupabase();
  const { data, error } = await sb.rpc("partner_credential_reveal", { p_id: id });
  if (error) throw error;
  return (data as string) ?? "";
}

export async function archivePartnerCredential(
  id: string,
  reason: string,
): Promise<void> {
  const sb = requireSupabase();
  const { error } = await sb.rpc("partner_credential_archive", {
    p_id: id,
    p_reason: reason,
  });
  if (error) throw error;
}

/** The access record for one credential, newest first. */
export async function fetchCredentialEvents(
  credentialId: string,
): Promise<CredentialEvent[]> {
  const sb = requireSupabase();
  const { data, error } = await sb
    .from("partner_credential_events")
    .select("id,credential_id,actor_id,action,note,created_at,profiles:actor_id(full_name)")
    .eq("credential_id", credentialId)
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) throw error;
  return (data ?? []).map((r) => {
    const rec = r as Record<string, unknown>;
    const actor = rec.profiles as { full_name?: string } | null;
    return {
      id: Number(rec.id),
      credentialId: rec.credential_id as string,
      actorId: (rec.actor_id as string) ?? null,
      actorName: actor?.full_name ?? null,
      action: rec.action as CredentialEvent["action"],
      note: (rec.note as string) ?? null,
      createdAt: rec.created_at as string,
    };
  });
}
