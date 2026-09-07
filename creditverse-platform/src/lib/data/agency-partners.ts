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
  status: (r.status as PartnerStatus) ?? "Active",
  archivedAt: (r.archived_at as string) ?? null,
  createdAt: r.created_at as string,
});

const COLUMNS =
  "id, name, partner_name, contact_email, phone, address, notes, primary_contact, service, contract_ref, status, archived_at, created_at";

/** Active partners. Archived ones are excluded here and never deleted. */
export async function fetchAgencyPartners(includeArchived = false): Promise<AgencyPartner[]> {
  const sb = requireSupabase();
  let q = sb.from("outsourcing_groups").select(COLUMNS).order("name");
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
      status: "Active",
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
  if (Object.keys(row).length === 0) return;
  const { error } = await sb.from("outsourcing_groups").update(row as never).eq("id", id);
  if (error) throw error;
}

/**
 * Lifecycle. Archive rather than delete: a partner with any history is a
 * record of something that happened, and destroying it destroys the history
 * of every engagement, file and note attached to it (rule 11).
 */
export async function setPartnerStatus(id: string, status: PartnerStatus): Promise<void> {
  const sb = requireSupabase();
  const { error } = await sb
    .from("outsourcing_groups")
    .update({ status, archived_at: status === "Archived" ? new Date().toISOString() : null } as never)
    .eq("id", id);
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
