/**
 * The canonical client record, read as a directory and as one profile.
 *
 * `clients` is the person. `fulfillment_clients`, `funding_clients` and
 * `diy_journeys` are the WORK being done for that person, each behind its own
 * permission key and its own RLS policy. This module reads the person and the
 * *shape* of their service relationships — never the work.
 *
 * Two consequences worth stating, because they are the reason for the split:
 *
 *   • A funding-only user gets the client row and an empty `fulfillment_clients`
 *     embed. That is RLS doing its job, not a missing record, and the directory
 *     renders it as "no CreditOps relationship visible to you" rather than
 *     inventing one.
 *   • Nothing here writes. Identity edits go through `updateClientIdentity`,
 *     which the database gates on `client_writable()`.
 */

import { requireSupabase } from "@/lib/supabase/client";
import type { Tables, TablesUpdate } from "@/lib/supabase/database.types";
import {
  deriveServices,
  type ClientDirectoryRow,
} from "@/lib/clients/client-directory-domain";

/**
 * One bounded request for the whole directory (rule 14: no N+1).
 *
 * The nesting mirrors the doctrine exactly — client, then each service, then
 * the businesses under funding, then a COUNT of files per business rather than
 * the files themselves. A directory never needs a funding file's contents, so
 * it never asks for them.
 */
const DIRECTORY_SELECT = `
  id, public_id, full_name, email, phone, status, needs_review, created_at, updated_at,
  organization_id,
  fulfillment_clients(
    id, lifecycle, round, last_activity_at,
    assigned_agent:profiles!fulfillment_clients_assigned_agent_id_fkey(full_name, email)
  ),
  funding_clients(
    id, lifecycle, last_activity_at,
    assigned_agent:profiles!funding_clients_assigned_agent_id_fkey(full_name, email),
    funding_businesses(id, legal_name, dba, funding_files(count))
  ),
  diy_journeys(stage, round_number, updated_at)
`;

type AgentEmbed = { full_name: string | null; email: string } | null;

type DirectoryRecord = Pick<
  Tables<"clients">,
  "id" | "public_id" | "full_name" | "email" | "phone" | "status" | "needs_review" | "created_at" | "updated_at" | "organization_id"
> & {
  fulfillment_clients: {
    id: string;
    lifecycle: string | null;
    round: string | null;
    last_activity_at: string | null;
    assigned_agent: AgentEmbed;
  }[];
  funding_clients: {
    id: string;
    lifecycle: string | null;
    last_activity_at: string | null;
    assigned_agent: AgentEmbed;
    funding_businesses: {
      id: string;
      legal_name: string;
      dba: string | null;
      funding_files: { count: number }[] | null;
    }[];
  }[];
  diy_journeys: { stage: string | null; round_number: number | null; updated_at: string | null }[];
};

const agentName = (a: AgentEmbed): string | null => a?.full_name?.trim() || a?.email || null;

/** The most recent of several timestamps, ignoring the ones that are absent. */
const latest = (...dates: (string | null | undefined)[]): string | null => {
  const usable = dates.filter((d): d is string => !!d && !Number.isNaN(Date.parse(d)));
  if (usable.length === 0) return null;
  return usable.reduce((a, b) => (Date.parse(a) >= Date.parse(b) ? a : b));
};

function toDirectoryRow(r: DirectoryRecord): ClientDirectoryRow {
  /* PostgREST returns a one-to-many embed as an array even where the data model
     allows only one row, so take the first rather than assuming a shape. */
  const credit = r.fulfillment_clients?.[0] ?? null;
  const funding = r.funding_clients?.[0] ?? null;
  const diy = r.diy_journeys?.[0] ?? null;

  const businesses = (funding?.funding_businesses ?? []).map((b) => ({
    id: b.id,
    name: b.dba?.trim() || b.legal_name,
    fundingFileCount: b.funding_files?.[0]?.count ?? 0,
  }));

  return {
    id: r.id,
    publicId: r.public_id,
    name: r.full_name ?? r.email,
    email: r.email,
    phone: r.phone,
    status: r.status as ClientDirectoryRow["status"],
    services: deriveServices({
      creditCase: credit ? { id: credit.id, lifecycle: credit.lifecycle, round: credit.round } : null,
      fundingClient: funding
        ? {
            id: funding.id,
            lifecycle: funding.lifecycle,
            businessCount: businesses.length,
            fundingFileCount: businesses.reduce((n, b) => n + b.fundingFileCount, 0),
          }
        : null,
      diy: diy ? { stage: diy.stage, roundNumber: diy.round_number } : null,
    }),
    businesses,
    assigned: [...new Set([agentName(credit?.assigned_agent ?? null), agentName(funding?.assigned_agent ?? null)].filter((n): n is string => !!n))],
    lastActivity: latest(credit?.last_activity_at, funding?.last_activity_at, diy?.updated_at),
    createdAt: r.created_at,
    needsReview: r.needs_review,
  };
}

/**
 * Every client this user may see, scoped by RLS.
 *
 * `organizationId` narrows; it never widens. The database decides what is
 * visible, and passing an id the caller has no membership in returns nothing
 * rather than someone else's clients (rule 16).
 */
export async function fetchClientDirectory(organizationId?: string | null): Promise<ClientDirectoryRow[]> {
  const sb = requireSupabase();
  let query = sb.from("clients").select(DIRECTORY_SELECT).order("full_name", { ascending: true });
  if (organizationId) query = query.eq("organization_id", organizationId);
  const { data, error } = await query;
  if (error) throw error;
  return ((data ?? []) as unknown as DirectoryRecord[]).map(toDirectoryRow);
}

/* ─── One client's profile ────────────────────────────────────────────────── */

export interface ClientProfile extends ClientDirectoryRow {
  firstName: string | null;
  lastName: string;
  preferredName: string | null;
  dateOfBirth: string | null;
  address: {
    line1: string | null;
    line2: string | null;
    city: string | null;
    state: string | null;
    postalCode: string | null;
  };
  /** Whether this person has a portal login at all — not who it is. */
  hasPortalLogin: boolean;
  /** The organization, or the outsourcing group for a contract-only client.
      The storage folder for their documents is derived from it. */
  partnerScopeId: string | null;
  provenance: string;
  reviewNote: string | null;
  updatedAt: string;
}

const PROFILE_SELECT = `${DIRECTORY_SELECT},
  first_name, last_name, preferred_name, date_of_birth,
  address_line1, address_line2, city, state, postal_code,
  portal_user_id, provenance, review_note, partner_scope_id`;

export async function fetchClientProfile(clientId: string): Promise<ClientProfile | null> {
  const sb = requireSupabase();
  const { data, error } = await sb.from("clients").select(PROFILE_SELECT).eq("id", clientId).maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const r = data as unknown as DirectoryRecord & Tables<"clients">;
  return {
    ...toDirectoryRow(r),
    firstName: r.first_name,
    lastName: r.last_name,
    preferredName: r.preferred_name,
    dateOfBirth: r.date_of_birth,
    address: {
      line1: r.address_line1,
      line2: r.address_line2,
      city: r.city,
      state: r.state,
      postalCode: r.postal_code,
    },
    hasPortalLogin: !!r.portal_user_id,
    partnerScopeId: r.partner_scope_id,
    provenance: r.provenance,
    reviewNote: r.review_note,
    updatedAt: r.updated_at,
  };
}

/* ─── Identity edits ──────────────────────────────────────────────────────── */

export interface ClientIdentityPatch {
  firstName?: string | null;
  lastName?: string;
  preferredName?: string | null;
  email?: string;
  phone?: string | null;
  dateOfBirth?: string | null;
  addressLine1?: string | null;
  addressLine2?: string | null;
  city?: string | null;
  state?: string | null;
  postalCode?: string | null;
}

/**
 * Update the person, not the work.
 *
 * The write is a plain table update because `client_writable()` already gates
 * it in the database: either engine's edit key qualifies, so a FundingOps-only
 * organization can still correct a borrower's phone number. A caller without
 * either key gets 42501 from Postgres, not a hidden button.
 */
export async function updateClientIdentity(clientId: string, patch: ClientIdentityPatch): Promise<void> {
  const sb = requireSupabase();
  const row: TablesUpdate<"clients"> = {};
  if (patch.firstName !== undefined) row.first_name = patch.firstName;
  if (patch.lastName !== undefined) row.last_name = patch.lastName;
  if (patch.preferredName !== undefined) row.preferred_name = patch.preferredName;
  if (patch.email !== undefined) row.email = patch.email;
  if (patch.phone !== undefined) row.phone = patch.phone;
  if (patch.dateOfBirth !== undefined) row.date_of_birth = patch.dateOfBirth;
  if (patch.addressLine1 !== undefined) row.address_line1 = patch.addressLine1;
  if (patch.addressLine2 !== undefined) row.address_line2 = patch.addressLine2;
  if (patch.city !== undefined) row.city = patch.city;
  if (patch.state !== undefined) row.state = patch.state;
  if (patch.postalCode !== undefined) row.postal_code = patch.postalCode;
  if (Object.keys(row).length === 0) return;
  const { error } = await sb.from("clients").update(row).eq("id", clientId);
  if (error) throw error;
}

/* ─── Cross-service history and documents ─────────────────────────────────── */

/**
 * The engine records this client is known by.
 *
 * Activity and files are keyed by `(entity_type, entity_id)` on the ENGINE
 * records, and deliberately stay that way. `entity_visible()` falls through to
 * `true` for an entity type it does not know, so inventing an `entity_type =
 * 'client'` today would create rows whose visibility nothing checks. The
 * profile therefore reads the history the engines already write, which is
 * properly gated, and shows it in one place.
 */
export interface ClientEntityLink {
  entityType: "fulfillment_client" | "funding_client";
  entityId: string;
}

export function entityLinksFor(row: Pick<ClientDirectoryRow, "services">): ClientEntityLink[] {
  const links: ClientEntityLink[] = [];
  for (const s of row.services) {
    if (!s.recordId) continue;
    if (s.service === "creditops") links.push({ entityType: "fulfillment_client", entityId: s.recordId });
    if (s.service === "fundingops") links.push({ entityType: "funding_client", entityId: s.recordId });
  }
  return links;
}

/** An exact (type, id) pair match, so a uuid can never match the wrong type. */
const pairFilter = (links: ClientEntityLink[]) =>
  links.map((l) => `and(entity_type.eq.${l.entityType},entity_id.eq.${l.entityId})`).join(",");

export interface ClientActivityEntry {
  id: number;
  action: string;
  detail: string | null;
  actorName: string | null;
  createdAt: string;
  entityType: string;
  visibility: string;
}

export async function fetchClientActivity(
  links: ClientEntityLink[],
  limit = 50,
): Promise<ClientActivityEntry[]> {
  if (links.length === 0) return [];
  const sb = requireSupabase();
  const { data, error } = await sb
    .from("activity_events")
    .select("id, action, detail, actor_name, created_at, entity_type, visibility")
    .or(pairFilter(links))
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []).map((r) => ({
    id: Number(r.id),
    action: r.action,
    detail: r.detail,
    actorName: r.actor_name,
    createdAt: r.created_at,
    entityType: r.entity_type,
    visibility: r.visibility as string,
  }));
}

export interface ClientDocument {
  id: string;
  name: string;
  mimeType: string | null;
  sizeBytes: number | null;
  createdAt: string;
  entityType: string;
}

export async function fetchClientDocuments(links: ClientEntityLink[]): Promise<ClientDocument[]> {
  if (links.length === 0) return [];
  const sb = requireSupabase();
  const { data, error } = await sb
    .from("files")
    .select("id, name, mime_type, size_bytes, created_at, entity_type")
    .or(pairFilter(links))
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) throw error;
  return (data ?? []).map((r) => ({
    id: r.id,
    name: r.name,
    mimeType: r.mime_type,
    sizeBytes: r.size_bytes,
    createdAt: r.created_at,
    entityType: r.entity_type ?? "",
  }));
}
