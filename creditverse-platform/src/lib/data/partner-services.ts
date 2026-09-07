/**
 * A partner's services, what BES charges for them, and how the work is run.
 *
 * ── THE SHAPE THAT MATTERS ─────────────────────────────────────────────────
 *
 * Operational and financial data are DIFFERENT TABLES, not different fields on
 * one. Postgres RLS is row-level: a policy cannot return some columns and
 * withhold others, so "a manager must not receive the rate" cannot be done by
 * hiding a card. `partner_services` holds what a manager needs to run the
 * work; `partner_service_billing` holds what BES charges, behind
 * `partners.financials.view`.
 *
 * The consequence to remember when reading this file: a manager's fetch of
 * billing returns an EMPTY LIST, not an error. That is RLS filtering, and it
 * is why nothing here treats "no billing rows" as a failure.
 */
import { requireSupabase } from "@/lib/supabase/client";

export type PartnerServiceStatus = "onboarding" | "active" | "paused" | "ended";

/** What BES does. Visible to anyone who may view partners. */
export interface PartnerService {
  id: string;
  groupId: string;
  name: string;
  status: PartnerServiceStatus;
  startedOn: string | null;
  endedOn: string | null;
  processorId: string | null;
  teamId: string | null;
  quantity: number | null;
  quantityUnit: string | null;
  notes: string | null;
}

/** What BES charges. Behind a named permission. */
export interface PartnerBilling {
  serviceId: string;
  paymentChannel: string | null;
  transactionType: string | null;
  paymentFrequency: string | null;
  invoiceDay: string | null;
  rateCents: number | null;
  currency: string;
  expectedMonthlyCents: number | null;
  pricingNotes: string | null;
}

const svc = (r: Record<string, unknown>): PartnerService => ({
  id: r.id as string, groupId: r.group_id as string, name: r.name as string,
  status: (r.status as PartnerServiceStatus) ?? "active",
  startedOn: (r.started_on as string) ?? null, endedOn: (r.ended_on as string) ?? null,
  processorId: (r.processor_id as string) ?? null, teamId: (r.team_id as string) ?? null,
  quantity: r.quantity === null || r.quantity === undefined ? null : Number(r.quantity),
  quantityUnit: (r.quantity_unit as string) ?? null, notes: (r.notes as string) ?? null,
});

export async function fetchPartnerServices(groupId: string): Promise<PartnerService[]> {
  const sb = requireSupabase();
  const { data, error } = await sb
    .from("partner_services").select("*").eq("group_id", groupId).order("created_at");
  if (error) throw error;
  return (data ?? []).map((r) => svc(r as Record<string, unknown>));
}

/**
 * Billing for a partner's services.
 *
 * An empty map means one of two things and the caller cannot tell them apart:
 * nothing is billed, or this person may not see billing. That ambiguity is
 * deliberate — the screen asks `agency_can` separately to decide what to SAY,
 * rather than inferring permission from missing data.
 */
export async function fetchPartnerBilling(serviceIds: string[]): Promise<Record<string, PartnerBilling>> {
  if (serviceIds.length === 0) return {};
  const sb = requireSupabase();
  const { data, error } = await sb
    .from("partner_service_billing").select("*").in("service_id", serviceIds);
  if (error) throw error;
  const out: Record<string, PartnerBilling> = {};
  for (const row of data ?? []) {
    const r = row as Record<string, unknown>;
    out[r.service_id as string] = {
      serviceId: r.service_id as string,
      paymentChannel: (r.payment_channel as string) ?? null,
      transactionType: (r.transaction_type as string) ?? null,
      paymentFrequency: (r.payment_frequency as string) ?? null,
      invoiceDay: (r.invoice_day as string) ?? null,
      rateCents: r.rate_cents === null ? null : Number(r.rate_cents),
      currency: (r.currency as string) ?? "USD",
      expectedMonthlyCents: r.expected_monthly_cents === null ? null : Number(r.expected_monthly_cents),
      pricingNotes: (r.pricing_notes as string) ?? null,
    };
  }
  return out;
}

export async function savePartnerService(input: {
  id?: string; groupId: string; agencyId: string; name: string;
  status?: PartnerServiceStatus; startedOn?: string | null; endedOn?: string | null;
  processorId?: string | null; teamId?: string | null;
  quantity?: number | null; quantityUnit?: string | null; notes?: string | null;
}): Promise<string> {
  const sb = requireSupabase();
  const row = {
    group_id: input.groupId, agency_id: input.agencyId, name: input.name.trim(),
    status: input.status ?? "active",
    started_on: input.startedOn || null, ended_on: input.endedOn || null,
    processor_id: input.processorId ?? null, team_id: input.teamId ?? null,
    quantity: input.quantity ?? null, quantity_unit: input.quantityUnit?.trim() || null,
    notes: input.notes?.trim() || null,
  };
  const q = input.id
    ? sb.from("partner_services").update(row as never).eq("id", input.id).select("id").single()
    : sb.from("partner_services").insert(row as never).select("id").single();
  const { data, error } = await q;
  if (error) throw error;
  return (data as { id: string }).id;
}

export async function savePartnerBilling(input: PartnerBilling & { agencyId: string }): Promise<void> {
  const sb = requireSupabase();
  const { error } = await sb.from("partner_service_billing").upsert({
    service_id: input.serviceId, agency_id: input.agencyId,
    payment_channel: input.paymentChannel, transaction_type: input.transactionType,
    payment_frequency: input.paymentFrequency, invoice_day: input.invoiceDay,
    rate_cents: input.rateCents, currency: input.currency,
    expected_monthly_cents: input.expectedMonthlyCents, pricing_notes: input.pricingNotes,
  } as never, { onConflict: "service_id" });
  if (error) throw error;
}

/* ── Monthly revenue ──────────────────────────────────────────────────── */

export interface RevenueEntry {
  id: string; groupId: string; serviceId: string | null;
  year: number; month: number;
  expectedCents: number | null; actualCents: number | null;
  currency: string; paymentChannel: string | null; notes: string | null;
}

export async function fetchPartnerRevenue(groupId: string, year: number): Promise<RevenueEntry[]> {
  const sb = requireSupabase();
  const { data, error } = await sb
    .from("partner_revenue_entries").select("*").eq("group_id", groupId).eq("year", year)
    .order("month");
  if (error) throw error;
  return (data ?? []).map((row) => {
    const r = row as Record<string, unknown>;
    return {
      id: r.id as string, groupId: r.group_id as string,
      serviceId: (r.service_id as string) ?? null,
      year: Number(r.year), month: Number(r.month),
      expectedCents: r.expected_cents === null ? null : Number(r.expected_cents),
      actualCents: r.actual_cents === null ? null : Number(r.actual_cents),
      currency: (r.currency as string) ?? "USD",
      paymentChannel: (r.payment_channel as string) ?? null,
      notes: (r.notes as string) ?? null,
    };
  });
}

export async function saveRevenueEntry(input: {
  groupId: string; agencyId: string; serviceId: string | null;
  year: number; month: number;
  expectedCents: number | null; actualCents: number | null;
  currency?: string; paymentChannel?: string | null; notes?: string | null;
}): Promise<void> {
  const sb = requireSupabase();
  const { error } = await sb.from("partner_revenue_entries").upsert({
    group_id: input.groupId, agency_id: input.agencyId, service_id: input.serviceId,
    year: input.year, month: input.month,
    expected_cents: input.expectedCents, actual_cents: input.actualCents,
    currency: input.currency ?? "USD", payment_channel: input.paymentChannel ?? null,
    notes: input.notes ?? null, source: "manual",
  } as never, { onConflict: "group_id,service_id,year,month" });
  if (error) throw error;
}

/* ── Operational configuration ────────────────────────────────────────── */

export interface PartnerOperations {
  groupId: string;
  crmName: string | null; crmUrl: string | null;
  mailingSystem: string | null; mailingUrl: string | null;
  ghlLocation: string | null; ghlUrl: string | null;
  sopUrl: string | null;
  commChannel: string | null; commUrl: string | null;
  accountManagerId: string | null; operationsManagerId: string | null;
  teamId: string | null; notes: string | null;
}

export async function fetchPartnerOperations(groupId: string): Promise<PartnerOperations | null> {
  const sb = requireSupabase();
  const { data, error } = await sb
    .from("partner_operations").select("*").eq("group_id", groupId).maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const r = data as Record<string, unknown>;
  return {
    groupId: r.group_id as string,
    crmName: (r.crm_name as string) ?? null, crmUrl: (r.crm_url as string) ?? null,
    mailingSystem: (r.mailing_system as string) ?? null, mailingUrl: (r.mailing_url as string) ?? null,
    ghlLocation: (r.ghl_location as string) ?? null, ghlUrl: (r.ghl_url as string) ?? null,
    sopUrl: (r.sop_url as string) ?? null,
    commChannel: (r.comm_channel as string) ?? null, commUrl: (r.comm_url as string) ?? null,
    accountManagerId: (r.account_manager_id as string) ?? null,
    operationsManagerId: (r.operations_manager_id as string) ?? null,
    teamId: (r.team_id as string) ?? null, notes: (r.notes as string) ?? null,
  };
}

export async function savePartnerOperations(groupId: string, agencyId: string, patch: Partial<PartnerOperations>): Promise<void> {
  const sb = requireSupabase();
  const blank = (v?: string | null) => (v ?? "").trim() || null;
  const { error } = await sb.from("partner_operations").upsert({
    group_id: groupId, agency_id: agencyId,
    crm_name: blank(patch.crmName), crm_url: blank(patch.crmUrl),
    mailing_system: blank(patch.mailingSystem), mailing_url: blank(patch.mailingUrl),
    ghl_location: blank(patch.ghlLocation), ghl_url: blank(patch.ghlUrl),
    sop_url: blank(patch.sopUrl),
    comm_channel: blank(patch.commChannel), comm_url: blank(patch.commUrl),
    account_manager_id: patch.accountManagerId ?? null,
    operations_manager_id: patch.operationsManagerId ?? null,
    team_id: patch.teamId ?? null, notes: blank(patch.notes),
  } as never, { onConflict: "group_id" });
  if (error) throw error;
}
