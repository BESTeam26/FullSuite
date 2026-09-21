/**
 * Everything the top of a credit case needs, in ONE request.
 *
 * Dee's next production priority, 2026-09-21: *"work a file without knowing
 * the model."* An agent opening a client should be able to see, without
 * reading anything else: who this is, where the file is right now, who owns
 * each open piece of it, and what is missing.
 *
 * ── WHY ONE QUERY ─────────────────────────────────────────────────────────
 *
 * The case row, the canonical person behind it and the department statuses
 * are three tables, and the screen needs all three before it can say anything
 * useful. Asking for them in sequence is the waterfall rule 14 exists to
 * forbid, so they arrive as one nested select. RLS still decides every row:
 * a case the caller may not see resolves to null, which is the correct
 * answer rather than an error to interpret.
 *
 * ── AND WHY THE CANONICAL PERSON, NOT THE CASE ────────────────────────────
 *
 * `fulfillment_clients` is the credit WORK; `clients` is the PERSON (rule 2,
 * and the client-record doctrine). Name, date of birth and postal address
 * belong to the person, are shared with FundingOps and the portals, and are
 * what a dispute letter is written from. Reading them off the case row would
 * be a second copy of somebody's identity.
 */
import { useQuery } from "@tanstack/react-query";
import { requireSupabase } from "@/lib/supabase/client";
import type { DepartmentStatusRow } from "@/lib/fulfillment/department-domain";

/** The person, as the canonical record holds them. Nulls are real gaps. */
export interface ClientIdentity {
  fullName: string | null;
  preferredName: string | null;
  email: string | null;
  phone: string | null;
  dateOfBirth: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
  publicId: string | null;
  /** Where the record came from, so nothing is presented as more than it is. */
  provenance: string | null;
  needsReview: boolean;
  reviewNote: string | null;
}

export interface ClientFile {
  caseId: string;
  /** The case's own working fields. */
  name: string;
  status: string;
  round: string;
  email: string | null;
  phone: string | null;
  publicId: string | null;
  programStartedOn: string | null;
  description: string | null;
  nextAction: string | null;
  dueAt: string | null;
  assignedAgentId: string | null;
  assignedAgentName: string | null;
  partnerName: string | null;
  /** The person behind the case, or null when no canonical record is linked. */
  identity: ClientIdentity | null;
  /** One row per department that has ever held this file. */
  departments: DepartmentStatusRow[];
}

interface Joined {
  id: string; name: string; status: string; round: string;
  email: string | null; phone: string | null; public_id: string | null;
  program_started_on: string | null; description: string | null;
  next_action: string | null; due_at: string | null; assigned_agent_id: string | null;
  assigned_agent: { full_name: string | null; email: string } | null;
  organization: { name: string } | null;
  outsourcing_group: { name: string } | null;
  clients: {
    full_name: string | null; preferred_name: string | null; email: string | null;
    phone: string | null; date_of_birth: string | null; address_line1: string | null;
    address_line2: string | null; city: string | null; state: string | null;
    postal_code: string | null; public_id: string | null; provenance: string | null;
    needs_review: boolean | null; review_note: string | null;
  } | null;
  client_department_statuses: {
    department: string; status: string; assignee_id: string | null; updated_at: string;
    assignee: { full_name: string | null; email: string } | null;
  }[] | null;
}

const personName = (p: { full_name: string | null; email: string } | null) =>
  p ? (p.full_name?.trim() || p.email) : null;

export async function fetchClientFile(caseId: string): Promise<ClientFile | null> {
  const sb = requireSupabase();
  const { data, error } = await sb
    .from("fulfillment_clients")
    .select(`
      id, name, status, round, email, phone, public_id, program_started_on,
      description, next_action, due_at, assigned_agent_id,
      assigned_agent:profiles!fulfillment_clients_assigned_agent_id_fkey(full_name, email),
      organization:organizations(name),
      outsourcing_group:outsourcing_groups(name),
      clients(full_name, preferred_name, email, phone, date_of_birth,
              address_line1, address_line2, city, state, postal_code,
              public_id, provenance, needs_review, review_note),
      client_department_statuses(
        department, status, assignee_id, updated_at,
        assignee:profiles!client_department_statuses_assignee_id_fkey(full_name, email))
    `)
    .eq("id", caseId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const r = data as unknown as Joined;
  const c = r.clients;

  return {
    caseId: r.id,
    name: r.name,
    status: r.status,
    round: r.round,
    email: r.email,
    phone: r.phone,
    publicId: r.public_id,
    programStartedOn: r.program_started_on,
    description: r.description,
    nextAction: r.next_action,
    dueAt: r.due_at,
    assignedAgentId: r.assigned_agent_id,
    assignedAgentName: personName(r.assigned_agent),
    partnerName: r.organization?.name ?? r.outsourcing_group?.name ?? null,
    identity: c ? {
      fullName: c.full_name, preferredName: c.preferred_name, email: c.email,
      phone: c.phone, dateOfBirth: c.date_of_birth, addressLine1: c.address_line1,
      addressLine2: c.address_line2, city: c.city, state: c.state,
      postalCode: c.postal_code, publicId: c.public_id, provenance: c.provenance,
      needsReview: c.needs_review ?? false, reviewNote: c.review_note,
    } : null,
    departments: (r.client_department_statuses ?? []).map((d) => ({
      department: d.department,
      status: d.status,
      assigneeId: d.assignee_id,
      assignee: personName(d.assignee) ?? "Unassigned",
      updatedAt: d.updated_at,
    })),
  };
}

/**
 * The file, cached under a key the rest of CreditOps can invalidate.
 *
 * Disabled for a non-UUID id so the bundled sample route never reaches the
 * database and never claims a client that does not exist.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function useClientFile(caseId: string | undefined, enabled = true) {
  const ok = !!caseId && UUID.test(caseId) && enabled;
  const q = useQuery({
    queryKey: ["creditops", "client-file", caseId],
    queryFn: () => fetchClientFile(caseId as string),
    enabled: ok,
    staleTime: 15_000,
  });
  return {
    file: q.data ?? null,
    isLoading: ok && q.isLoading,
    error: q.error ? (q.error as Error).message : null,
  };
}
