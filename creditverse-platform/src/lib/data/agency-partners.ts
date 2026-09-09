/**
 * BES Partners — real records, no tenant.
 *
 * A partner is an `outsourcing_groups` row and the people at it are
 * `partner_contacts`. Neither involves an Organization: rule 16 says a partner
 * is not a subclass of a customer, and model 3 (BES fulfilment WITHOUT SaaS)
 * exists precisely because a partner may have no organization at all.
 *
 * Creating one needs a name and an email. That is the whole requirement. A
 * phone number nobody has to hand must never stop somebody recording a partner
 * they just agreed terms with — a blank field is honest, and a form that
 * refuses is how records fill up with "n/a".
 */
import { requireSupabase } from "@/lib/supabase/client";
import { sendInvitationEmail, type EmailOutcome } from "@/lib/data/emails";
import type { PartnerHealth, PartnerLifecycle } from "@/lib/partners/partner-account";

/**
 * LEGACY. `lifecycle` is canonical and a database trigger mirrors it into
 * `status` so older readers do not go stale. Write lifecycle.
 */
export type PartnerStatus = "Active" | "Paused" | "Onboarding" | "Suspended" | "Archived";

export interface AgencyPartner {
  id: string;
  name: string;
  /** The partner's company, when they have one. */
  companyName: string | null;
  contactEmail: string;
  phone: string | null;
  address: string | null;
  notes: string | null;
  primaryContact: string | null;
  service: string | null;
  contractRef: string | null;
  /** The RELATIONSHIP. What they buy lives on their service engagements. */
  lifecycle: PartnerLifecycle;
  /** A recorded human judgement, or null when nobody has made one. */
  health: PartnerHealth | null;
  healthNote: string | null;
  healthChangedBy: string | null;
  healthChangedAt: string | null;
  startedOn: string | null;
  endedOn: string | null;
  /** Their BES SaaS plan, if they also subscribe. Not a service they buy. */
  saasPlan: string | null;
  accountManagerId: string | null;
  teamId: string | null;
  primaryContactId: string | null;
  /** What the spreadsheet said, verbatim: "300-400", "60 Average". */
  legacyClientVolume: string | null;
  legacyActiveClients: number | null;
  sourceType: string;
  credentialMigrationRequired: boolean;
  status: PartnerStatus;
  archivedAt: string | null;
  createdAt: string;
}

export interface PartnerContact {
  id: string;
  groupId: string;
  fullName: string;
  email: string;
  phone: string | null;
  isPrimary: boolean;
  userId: string | null;
  status: "active" | "suspended" | "archived";
  invitedAt: string | null;
  activatedAt: string | null;
}

/** Where a contact stands with the portal, in one word a person can act on. */
export type PortalState = "no_access" | "invited" | "active" | "suspended" | "archived";

export function portalState(c: PartnerContact): PortalState {
  if (c.status === "archived") return "archived";
  if (c.status === "suspended") return "suspended";
  if (c.userId) return "active";
  if (c.invitedAt) return "invited";
  return "no_access";
}

export const PORTAL_LABEL: Record<PortalState, string> = {
  no_access: "Not invited",
  invited: "Invited — not activated yet",
  active: "Portal active",
  suspended: "Portal suspended",
  archived: "Archived",
};

const mapPartner = (r: Record<string, unknown>): AgencyPartner => ({
  id: r.id as string,
  name: r.name as string,
  companyName: (r.partner_name as string) ?? null,
  contactEmail: String(r.contact_email ?? ""),
  phone: (r.phone as string) ?? null,
  address: (r.address as string) ?? null,
  notes: (r.notes as string) ?? null,
  primaryContact: (r.primary_contact as string) ?? null,
  service: (r.service as string) ?? null,
  contractRef: (r.contract_ref as string) ?? null,
  lifecycle: (r.lifecycle as PartnerLifecycle) ?? "new",
  health: (r.health as PartnerHealth) ?? null,
  healthNote: (r.health_note as string) ?? null,
  healthChangedBy: (r.health_changed_by as string) ?? null,
  healthChangedAt: (r.health_changed_at as string) ?? null,
  startedOn: (r.started_on as string) ?? null,
  endedOn: (r.ended_on as string) ?? null,
  saasPlan: (r.saas_plan as string) ?? null,
  accountManagerId: (r.account_manager_id as string) ?? null,
  teamId: (r.team_id as string) ?? null,
  primaryContactId: (r.primary_contact_id as string) ?? null,
  legacyClientVolume: (r.legacy_reported_client_volume as string) ?? null,
  legacyActiveClients: r.legacy_reported_active_clients === null || r.legacy_reported_active_clients === undefined
    ? null : Number(r.legacy_reported_active_clients),
  sourceType: (r.source_type as string) ?? "bes",
  credentialMigrationRequired: Boolean(r.credential_migration_required),
  status: (r.status as PartnerStatus) ?? "Active",
  archivedAt: (r.archived_at as string) ?? null,
  createdAt: r.created_at as string,
});

/* ONE string literal. supabase-js infers the row shape from the literal
   itself, so a joined array or a concatenation degrades every result. */
// prettier-ignore
const COLUMNS = "id, name, partner_name, contact_email, phone, address, notes, primary_contact, service, contract_ref, status, archived_at, created_at, lifecycle, health, health_note, health_changed_by, health_changed_at, started_on, ended_on, saas_plan, account_manager_id, team_id, primary_contact_id, legacy_reported_client_volume, legacy_reported_active_clients, source_type, credential_migration_required";

/** Active partners. Archived ones are excluded here and never deleted. */
export async function fetchAgencyPartners(includeArchived = false): Promise<AgencyPartner[]> {
  const sb = requireSupabase();
  /* Fixtures are excluded from the LIST, never from a read by id: the
     matrix measures them and a developer still has to be able to open one. */
  let q = sb.from("outsourcing_groups").select(COLUMNS).eq("is_fixture", false).order("name");
  if (!includeArchived) q = q.is("archived_at", null);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []).map((r) => mapPartner(r as Record<string, unknown>));
}

export async function fetchAgencyPartner(id: string): Promise<AgencyPartner | null> {
  const sb = requireSupabase();
  const { data, error } = await sb.from("outsourcing_groups").select(COLUMNS).eq("id", id).maybeSingle();
  if (error) throw error;
  return data ? mapPartner(data as Record<string, unknown>) : null;
}

export interface NewPartner {
  /** Required. */
  name: string;
  /** Required. */
  contactEmail: string;
  /** Everything below is optional, deliberately. */
  companyName?: string;
  phone?: string;
  address?: string;
  notes?: string;
  primaryContact?: string;
  service?: string;
  contractRef?: string;
  lifecycle?: PartnerLifecycle;
  startedOn?: string;
  saasPlan?: string;
  accountManagerId?: string | null;
  teamId?: string | null;
}

const blankToNull = (v?: string) => {
  const t = (v ?? "").trim();
  return t === "" ? null : t;
};

export async function createAgencyPartner(agencyId: string, input: NewPartner): Promise<string> {
  const sb = requireSupabase();
  const { data, error } = await sb
    .from("outsourcing_groups")
    .insert({
      agency_id: agencyId,
      name: input.name.trim(),
      contact_email: input.contactEmail.trim(),
      /* Blank stays NULL rather than becoming an empty string. An empty
         string reads as "we recorded that they have no company"; NULL reads
         as "nobody has told us yet", which is what is true. */
      partner_name: blankToNull(input.companyName),
      phone: blankToNull(input.phone),
      address: blankToNull(input.address),
      notes: blankToNull(input.notes),
      primary_contact: blankToNull(input.primaryContact),
      service: blankToNull(input.service),
      contract_ref: blankToNull(input.contractRef),
      /* Lifecycle is what is written. A trigger mirrors it into the legacy
         `status` column, so setting both here would be two sources of one
         truth waiting to disagree. */
      lifecycle: input.lifecycle ?? "active",
      started_on: input.startedOn || new Date().toISOString().slice(0, 10),
      saas_plan: blankToNull(input.saasPlan),
      account_manager_id: input.accountManagerId ?? null,
      team_id: input.teamId ?? null,
    })
    .select("id").single();
  if (error) throw error;
  return data.id as string;
}

export async function updateAgencyPartner(id: string, patch: Partial<NewPartner>): Promise<void> {
  const sb = requireSupabase();
  const row: Record<string, unknown> = {};
  if (patch.name !== undefined) row.name = patch.name.trim();
  if (patch.contactEmail !== undefined) row.contact_email = patch.contactEmail.trim();
  if (patch.companyName !== undefined) row.partner_name = blankToNull(patch.companyName);
  if (patch.phone !== undefined) row.phone = blankToNull(patch.phone);
  if (patch.address !== undefined) row.address = blankToNull(patch.address);
  if (patch.notes !== undefined) row.notes = blankToNull(patch.notes);
  if (patch.primaryContact !== undefined) row.primary_contact = blankToNull(patch.primaryContact);
  if (patch.service !== undefined) row.service = blankToNull(patch.service);
  if (patch.contractRef !== undefined) row.contract_ref = blankToNull(patch.contractRef);
  if (patch.lifecycle !== undefined) row.lifecycle = patch.lifecycle;
  if (patch.startedOn !== undefined) row.started_on = patch.startedOn || null;
  if (patch.saasPlan !== undefined) row.saas_plan = blankToNull(patch.saasPlan);
  if (patch.accountManagerId !== undefined) row.account_manager_id = patch.accountManagerId;
  if (patch.teamId !== undefined) row.team_id = patch.teamId;
  if (Object.keys(row).length === 0) return;
  const { error } = await sb.from("outsourcing_groups").update(row as never).eq("id", id);
  if (error) throw error;
}

/**
 * Lifecycle. Archive rather than delete: a partner with any history is a
 * record of something that happened, and destroying it destroys the history
 * of every engagement, file and note attached to it (rule 11).
 */
export async function setPartnerLifecycle(id: string, lifecycle: PartnerLifecycle): Promise<void> {
  const sb = requireSupabase();
  /* `archived_at` and the legacy `status` are set by the database trigger, so
     there is exactly one place that decides what "archived" means. */
  const { error } = await sb.from("outsourcing_groups").update({ lifecycle } as never).eq("id", id);
  if (error) throw error;
}

/**
 * Record how the relationship feels, with who said so and when.
 *
 * Through an RPC rather than a plain update so the actor and timestamp cannot
 * be forgotten by a caller — and so a later Attention Center reads one field
 * written one way. The function is SECURITY INVOKER: the ordinary update
 * policy still decides who may do this.
 */
export async function setPartnerHealth(id: string, health: PartnerHealth, note?: string): Promise<void> {
  const sb = requireSupabase();
  const { error } = await sb.rpc("set_partner_health", {
    p_group: id, p_health: health, p_note: note?.trim() || null,
  });
  if (error) throw error;
}

/* ── Contacts ─────────────────────────────────────────────────────────── */

const mapContact = (r: Record<string, unknown>): PartnerContact => ({
  id: r.id as string,
  groupId: r.group_id as string,
  fullName: r.full_name as string,
  email: String(r.email ?? ""),
  phone: (r.phone as string) ?? null,
  isPrimary: Boolean(r.is_primary),
  userId: (r.user_id as string) ?? null,
  status: (r.status as PartnerContact["status"]) ?? "active",
  invitedAt: (r.invited_at as string) ?? null,
  activatedAt: (r.activated_at as string) ?? null,
});

export async function fetchPartnerContacts(groupId: string): Promise<PartnerContact[]> {
  const sb = requireSupabase();
  const { data, error } = await sb
    .from("partner_contacts").select("*").eq("group_id", groupId).order("is_primary", { ascending: false }).order("full_name");
  if (error) throw error;
  return (data ?? []).map((r) => mapContact(r as Record<string, unknown>));
}

export async function createPartnerContact(input: {
  agencyId: string; groupId: string; fullName: string; email: string; phone?: string; isPrimary?: boolean;
}): Promise<string> {
  const sb = requireSupabase();
  const { data, error } = await sb
    .from("partner_contacts")
    .insert({
      agency_id: input.agencyId, group_id: input.groupId,
      full_name: input.fullName.trim(), email: input.email.trim(),
      phone: blankToNull(input.phone), is_primary: input.isPrimary ?? false,
    })
    .select("id").single();
  if (error) throw error;
  return data.id as string;
}

/**
 * Suspend or restore one contact's portal access.
 *
 * `partner_group_of_user()` resolves to nothing for a suspended contact, so
 * this ends their access everywhere at once — not screen by screen.
 */
export async function setContactStatus(id: string, status: PartnerContact["status"]): Promise<void> {
  const sb = requireSupabase();
  const { error } = await sb.from("partner_contacts").update({ status } as never).eq("id", id);
  if (error) throw error;
}

/** The partner the signed-in portal user belongs to. Null for everyone else. */
export async function fetchMyPartner(): Promise<AgencyPartner | null> {
  const sb = requireSupabase();
  const { data, error } = await sb.rpc("partner_group_of_user");
  if (error) throw error;
  const id = data as string | null;
  return id ? fetchAgencyPartner(id) : null;
}

/* ── Derived client counts ────────────────────────────────────────────── */

export interface PartnerClientCount {
  groupId: string;
  activeClients: number;
  totalClients: number;
}

/**
 * How many end clients each partner has, for the whole list in ONE call.
 *
 * The alternative — counting per partner as each row renders — is the N+1 that
 * rule 14 forbids, and on a list of twenty-five partners it is twenty-five
 * round trips to render one column.
 *
 * The count is a fact about the relationship, not a client record: the
 * function returns numbers and nothing else, and every actual client stays
 * behind `fulfillment_clients`' own policies.
 */
export async function fetchPartnerClientCounts(): Promise<Record<string, PartnerClientCount>> {
  const sb = requireSupabase();
  const { data, error } = await sb.rpc("partner_client_counts");
  if (error) throw error;
  const out: Record<string, PartnerClientCount> = {};
  for (const row of (data ?? []) as Record<string, unknown>[]) {
    const id = row.group_id as string;
    out[id] = {
      groupId: id,
      activeClients: Number(row.active_clients ?? 0),
      totalClients: Number(row.total_clients ?? 0),
    };
  }
  return out;
}

/* ── Documents filed against a partner ────────────────────────────────── */

export interface PartnerFile {
  id: string;
  name: string;
  mimeType: string | null;
  sizeBytes: number | null;
  createdAt: string;
  path: string;
  /** True only when BES deliberately published it to the partner portal. */
  sharedWithPartner: boolean;
  sharedAt: string | null;
  sharedByName: string | null;
}

/**
 * Documents filed against this partner.
 *
 * Filing a document here does NOT share it with the partner (0146: the portal
 * policy requires `shared_with_partner`, default false). Publication is the
 * separate, audited act below — `setPartnerFileShared` — so a margin sheet
 * filed against a partner stays BES's until somebody deliberately shares it.
 */
export async function fetchPartnerFiles(groupId: string): Promise<PartnerFile[]> {
  const sb = requireSupabase();
  const { data, error } = await sb
    .from("files")
    .select("id, name, mime_type, size_bytes, created_at, path, shared_with_partner, shared_at, shared_by_profile:profiles!files_shared_by_fkey(full_name, email)")
    .eq("entity_type", "partner").eq("entity_id", groupId)
    .order("created_at", { ascending: false }).limit(200);
  if (error) throw error;
  return (data ?? []).map((r) => {
    const row = r as Record<string, unknown>;
    const sharer = row.shared_by_profile as { full_name?: string | null; email?: string | null } | null;
    return {
      id: row.id as string, name: row.name as string,
      mimeType: (row.mime_type as string) ?? null,
      sizeBytes: row.size_bytes === null ? null : Number(row.size_bytes),
      createdAt: row.created_at as string,
      path: row.path as string,
      sharedWithPartner: Boolean(row.shared_with_partner),
      sharedAt: (row.shared_at as string) ?? null,
      sharedByName: sharer?.full_name?.trim() || sharer?.email || null,
    };
  });
}

/**
 * Upload against the partner. Object first, row second; if the row is refused
 * the object is removed again, so a half-finished upload never lingers (the
 * same shape as company documents). The `agency/` prefix keeps the object
 * readable by staff; a partner contact reaches it only through the
 * shared-file storage policy once the row is shared.
 */
export async function uploadPartnerFile(groupId: string, file: File): Promise<void> {
  const sb = requireSupabase();
  const { data: group, error: groupError } = await sb
    .from("outsourcing_groups").select("id, agency_id").eq("id", groupId).single();
  if (groupError) throw groupError;
  const extension = file.name.includes(".") ? file.name.split(".").pop()!.slice(0, 12) : "bin";
  const path = `agency/partner/${groupId}/${crypto.randomUUID()}.${extension}`;
  const { error: uploadError } = await sb.storage.from("bes-files").upload(path, file, {
    contentType: file.type || "application/octet-stream",
    upsert: false,
  });
  if (uploadError) throw uploadError;
  const { data: me } = await sb.auth.getUser();
  const { error } = await sb.from("files").insert({
    agency_id: group.agency_id,
    entity_type: "partner",
    entity_id: groupId,
    bucket: "bes-files",
    path,
    name: file.name,
    mime_type: file.type || null,
    size_bytes: file.size,
    uploaded_by: me.user?.id ?? null,
  });
  if (error) {
    await sb.storage.from("bes-files").remove([path]);
    throw error;
  }
}

/**
 * Publish or withdraw a file from the partner portal. The database function
 * is the only path (files has no staff UPDATE policy): permission-gated on
 * `partners.portal`, and every change writes an activity event.
 */
export async function setPartnerFileShared(fileId: string, shared: boolean): Promise<void> {
  const sb = requireSupabase();
  const { error } = await sb.rpc("set_partner_file_shared", { p_file: fileId, p_shared: shared });
  if (error) throw error;
}

/** A five-minute download link; storage RLS decides who may mint one. */
export async function partnerFileUrl(path: string): Promise<string> {
  const sb = requireSupabase();
  const { data, error } = await sb.storage.from("bes-files").createSignedUrl(path, 5 * 60);
  if (error) throw error;
  return data.signedUrl;
}

/* ── The portal's own reads ──────────────────────────────────────────── */

/** One row of `my_partner_clients()` — partner-safe columns only. */
export interface PartnerPortalClient {
  publicId: string;
  name: string;
  email: string;
  status: string;
  round: string;
  openItems: number;
  lifecycle: string;
  lastActivityAt: string;
  processedOn: string | null;
  createdAt: string;
}

/**
 * The signed-in partner contact's own clients. The database function is the
 * whole gate — a suspended contact or partner resolves to nothing — and it
 * returns only partner-safe columns: no BES agent names, no internal notes.
 */
export async function fetchMyPartnerClients(includeClosed: boolean): Promise<PartnerPortalClient[]> {
  const sb = requireSupabase();
  const { data, error } = await sb.rpc("my_partner_clients", { p_include_closed: includeClosed });
  if (error) throw error;
  return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
    publicId: r.public_id as string,
    name: r.name as string,
    email: String(r.email ?? ""),
    status: r.status as string,
    round: r.round as string,
    openItems: Number(r.open_items ?? 0),
    lifecycle: r.lifecycle as string,
    lastActivityAt: r.last_activity_at as string,
    processedOn: (r.processed_on as string) ?? null,
    createdAt: r.created_at as string,
  }));
}

/** Files BES shared with the signed-in partner (RLS returns shared rows only). */
export async function fetchMySharedFiles(groupId: string): Promise<PartnerFile[]> {
  return fetchPartnerFiles(groupId);
}

/* ── Portal invitations ──────────────────────────────────────────────── */

export interface PartnerInviteResult {
  invitationId: string;
  /** For "Copy link" when email is not connected. */
  token: string;
  emailOutcome: EmailOutcome;
}

/**
 * Invite (or re-invite) a contact to the portal. The database function mints
 * or extends the ONE open invitation and stamps invited_at; the email goes
 * out through the same pipe as every other invitation, and answers honestly
 * when mail is not connected so the caller offers Copy link instead.
 */
export async function invitePartnerContact(contactId: string): Promise<PartnerInviteResult> {
  const sb = requireSupabase();
  const { data, error } = await sb.rpc("invite_partner_contact", { p_contact: contactId });
  if (error) throw error;
  const invitationId = data as unknown as string;
  const { data: inv, error: tokenError } = await sb
    .from("invitations").select("token").eq("id", invitationId).single();
  if (tokenError) throw tokenError;
  const emailOutcome = await sendInvitationEmail(invitationId);
  return { invitationId, token: (inv as { token: string }).token, emailOutcome };
}

/** The invitee's half: bind the signed-in account to the contact row. */
export async function acceptPartnerInvitation(token: string): Promise<string> {
  const sb = requireSupabase();
  const { data, error } = await sb.rpc("accept_partner_invitation", { p_token: token });
  if (error) throw error;
  return data as unknown as string;
}
