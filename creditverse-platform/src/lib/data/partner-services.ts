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
import type { ServiceStatus } from "@/lib/partners/partner-account";

export type PartnerServiceStatus = ServiceStatus;

/**
 * One COMMERCIAL service engagement. Visible to anyone who may view partners.
 *
 * This is not `fulfillment_engagements`, which sounds identical and is the
 * opposite thing: that record is an AUTHORIZATION and is what decides whether
 * BES staff may open a customer's operational data (rule 16). This one is what
 * BES sells. A GHL build has a commercial line and grants no access at all.
 */
export interface PartnerService {
  id: string;
  groupId: string;
  name: string;
  /** A catalogue code from `partner_service_types`, or null for a bare name. */
  serviceType: string | null;
  description: string | null;
  status: PartnerServiceStatus;
  startedOn: string | null;
  endedOn: string | null;
  processorId: string | null;
  teamId: string | null;
  quantity: number | null;
  quantityUnit: string | null;
  /** What the spreadsheet said about volume, verbatim: "14 Active Clients". */
  clientVolumeText: string | null;
  notes: string | null;
  sourceType: string;
}

/** What BES charges. Behind a named permission. */
export interface PartnerBilling {
  id?: string;
  serviceId: string;
  /** These terms took effect on this date and applied until `effectiveTo`. */
  effectiveFrom?: string;
  effectiveTo?: string | null;
  quantity?: number | null;
  quantitySource?: string;
  autopay?: boolean;
  /** A catalogue code from `partner_billing_models`. */
  billingModel: string | null;
  billingStatus: string | null;
  paymentChannel: string | null;
  transactionType: string | null;
  paymentFrequency: string | null;
  invoiceDay: string | null;
  rateCents: number | null;
  currency: string;
  expectedMonthlyCents: number | null;
  mrrCents: number | null;
  contractedHours: number | null;
  /** The currency it was agreed in, and the rate used AT THE TIME. Historical
      amounts are never recomputed at today's rate. */
  currencyOriginal: string | null;
  fxRateUsed: number | null;
  pricingNotes: string | null;
}

const svc = (r: Record<string, unknown>): PartnerService => ({
  id: r.id as string, groupId: r.group_id as string, name: r.name as string,
  serviceType: (r.service_type as string) ?? null,
  description: (r.description as string) ?? null,
  status: (r.status as PartnerServiceStatus) ?? "active",
  startedOn: (r.started_on as string) ?? null, endedOn: (r.ended_on as string) ?? null,
  processorId: (r.processor_id as string) ?? null, teamId: (r.team_id as string) ?? null,
  quantity: r.quantity === null || r.quantity === undefined ? null : Number(r.quantity),
  quantityUnit: (r.quantity_unit as string) ?? null,
  clientVolumeText: (r.client_volume_text as string) ?? null,
  notes: (r.notes as string) ?? null,
  sourceType: (r.source_type as string) ?? "bes",
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
export async function fetchPartnerBilling(
  serviceIds: string[],
  asOf = new Date().toISOString().slice(0, 10),
): Promise<Record<string, PartnerBilling>> {
  if (serviceIds.length === 0) return {};
  const sb = requireSupabase();
  /* Newest first, so the first row per service that covers `asOf` wins. Terms
     are effective-dated rows: a rate that rose in October must not restate
     what January was billed. */
  const { data, error } = await sb
    .from("partner_service_billing").select("*").in("service_id", serviceIds)
    .order("effective_from", { ascending: false });
  if (error) throw error;
  const out: Record<string, PartnerBilling> = {};
  for (const row of data ?? []) {
    const r = row as Record<string, unknown>;
    const serviceId = r.service_id as string;
    const from = (r.effective_from as string) ?? "0000-01-01";
    const to = (r.effective_to as string) ?? null;
    /* Skip terms that are not in force today; keep the first that is. */
    if (from > asOf || (to !== null && to < asOf) || out[serviceId]) continue;
    out[r.service_id as string] = {
      id: r.id as string,
      serviceId: r.service_id as string,
      effectiveFrom: (r.effective_from as string) ?? undefined,
      effectiveTo: (r.effective_to as string) ?? null,
      quantity: r.quantity === null || r.quantity === undefined ? null : Number(r.quantity),
      quantitySource: (r.quantity_source as string) ?? "manual",
      autopay: Boolean(r.autopay),
      billingModel: (r.billing_model as string) ?? null,
      billingStatus: (r.billing_status as string) ?? null,
      paymentChannel: (r.payment_channel as string) ?? null,
      transactionType: (r.transaction_type as string) ?? null,
      paymentFrequency: (r.payment_frequency as string) ?? null,
      invoiceDay: (r.invoice_day as string) ?? null,
      rateCents: r.rate_cents === null ? null : Number(r.rate_cents),
      currency: (r.currency as string) ?? "USD",
      expectedMonthlyCents: r.expected_monthly_cents === null ? null : Number(r.expected_monthly_cents),
      mrrCents: r.mrr_cents === null || r.mrr_cents === undefined ? null : Number(r.mrr_cents),
      contractedHours: r.contracted_hours === null || r.contracted_hours === undefined ? null : Number(r.contracted_hours),
      currencyOriginal: (r.currency_original as string) ?? null,
      fxRateUsed: r.fx_rate_used === null || r.fx_rate_used === undefined ? null : Number(r.fx_rate_used),
      pricingNotes: (r.pricing_notes as string) ?? null,
    };
  }
  return out;
}

export async function savePartnerService(input: {
  id?: string; groupId: string; agencyId: string; name: string;
  serviceType?: string | null; description?: string | null;
  status?: PartnerServiceStatus; startedOn?: string | null; endedOn?: string | null;
  processorId?: string | null; teamId?: string | null;
  quantity?: number | null; quantityUnit?: string | null;
  clientVolumeText?: string | null; notes?: string | null;
}): Promise<string> {
  const sb = requireSupabase();
  const row = {
    group_id: input.groupId, agency_id: input.agencyId, name: input.name.trim(),
    service_type: input.serviceType || null,
    description: input.description?.trim() || null,
    status: input.status ?? "active",
    started_on: input.startedOn || null, ended_on: input.endedOn || null,
    processor_id: input.processorId ?? null, team_id: input.teamId ?? null,
    quantity: input.quantity ?? null, quantity_unit: input.quantityUnit?.trim() || null,
    client_volume_text: input.clientVolumeText?.trim() || null,
    notes: input.notes?.trim() || null,
  };
  const q = input.id
    ? sb.from("partner_services").update(row as never).eq("id", input.id).select("id").single()
    : sb.from("partner_services").insert(row as never).select("id").single();
  const { data, error } = await q;
  if (error) throw error;
  return (data as { id: string }).id;
}

/**
 * Change what a partner is charged, from a date.
 *
 * NOT an update. A new terms row is inserted and the previous one is closed
 * the day before it, because January's invoices were issued under January's
 * terms — overwriting them would silently restate history, and every past
 * month would suddenly agree with today's rate (Dee, §29-30).
 *
 * Editing terms that took effect TODAY is a correction, not a change, so that
 * one row is updated in place rather than leaving two rows for one day.
 */
export async function savePartnerBilling(
  input: PartnerBilling & { agencyId: string; effectiveFrom?: string },
): Promise<void> {
  const sb = requireSupabase();
  const from = input.effectiveFrom || new Date().toISOString().slice(0, 10);
  const row = {
    service_id: input.serviceId, agency_id: input.agencyId,
    effective_from: from,
    billing_model: input.billingModel, billing_status: input.billingStatus,
    payment_channel: input.paymentChannel ?? "UNKNOWN",
    transaction_type: input.transactionType,
    payment_frequency: input.paymentFrequency, invoice_day: input.invoiceDay,
    rate_cents: input.rateCents, currency: input.currency,
    expected_monthly_cents: input.expectedMonthlyCents,
    mrr_cents: input.mrrCents, contracted_hours: input.contractedHours,
    quantity: input.quantity ?? null,
    quantity_source: input.quantitySource ?? "manual",
    autopay: input.autopay ?? false,
    currency_original: input.currencyOriginal, fx_rate_used: input.fxRateUsed,
    pricing_notes: input.pricingNotes,
  };

  const { data: existing, error: readError } = await sb
    .from("partner_service_billing").select("id, effective_from")
    .eq("service_id", input.serviceId).order("effective_from", { ascending: false }).limit(1);
  if (readError) throw readError;
  const previous = (existing ?? [])[0] as { id: string; effective_from: string } | undefined;

  if (previous && previous.effective_from === from) {
    const { error } = await sb.from("partner_service_billing")
      .update(row as never).eq("id", previous.id);
    if (error) throw error;
    return;
  }

  const { data: inserted, error } = await sb
    .from("partner_service_billing").insert(row as never).select("id").single();
  if (error) throw error;

  if (previous) {
    const closesOn = new Date(Date.parse(`${from}T00:00:00Z`) - 86_400_000).toISOString().slice(0, 10);
    const { error: closeError } = await sb.from("partner_service_billing")
      .update({ effective_to: closesOn, superseded_by: (inserted as { id: string }).id } as never)
      .eq("id", previous.id);
    if (closeError) throw closeError;
  }
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
  /** How the work runs. WHO runs the account lives on the partner itself, so
      the profile header can show it without opening this record. */
  operationsManagerId: string | null;
  notes: string | null;
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
    operationsManagerId: (r.operations_manager_id as string) ?? null,
    notes: (r.notes as string) ?? null,
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
    operations_manager_id: patch.operationsManagerId ?? null,
    notes: blank(patch.notes),
  } as never, { onConflict: "group_id" });
  if (error) throw error;
}

/* ── Catalogues ───────────────────────────────────────────────────────── */

/**
 * What BES sells, how it charges, and where the money arrives.
 *
 * Rows in the database, not enums in this file (rule 17: customisation is
 * data). Adding a service is an insert, not a migration and a deploy.
 */
export interface CatalogueEntry {
  code: string;
  label: string;
  sort: number;
}
export interface ServiceTypeEntry extends CatalogueEntry {
  category: string;
}
export interface BillingModelEntry extends CatalogueEntry {
  unit: string | null;
  recurring: boolean;
}

export interface PartnerCatalogues {
  serviceTypes: ServiceTypeEntry[];
  billingModels: BillingModelEntry[];
  paymentChannels: CatalogueEntry[];
}

/** All three in one round trip. They change about once a year; the screens
    that need them need them together. */
export async function fetchPartnerCatalogues(): Promise<PartnerCatalogues> {
  const sb = requireSupabase();
  const [types, models, channels] = await Promise.all([
    sb.from("partner_service_types").select("code, label, category, sort").eq("active", true).order("sort"),
    sb.from("partner_billing_models").select("code, label, unit, recurring, sort").eq("active", true).order("sort"),
    sb.from("partner_payment_channels").select("code, label, sort").eq("active", true).order("sort"),
  ]);
  if (types.error) throw types.error;
  if (models.error) throw models.error;
  if (channels.error) throw channels.error;
  return {
    serviceTypes: (types.data ?? []) as ServiceTypeEntry[],
    billingModels: (models.data ?? []) as BillingModelEntry[],
    paymentChannels: (channels.data ?? []) as CatalogueEntry[],
  };
}

/* ── Cancellation ─────────────────────────────────────────────────────── */

export interface CancellationOutcome {
  service: string;
  effective: string;
  scheduledCancelled: number;
  workArchived: number;
  workspacesArchived: number;
  clientsParked: number;
  partnerStillActive: boolean;
}

/**
 * End one service engagement and everything that hangs off it.
 *
 * ONE database call, not five screens: future billing stops, the run-rate
 * drops, that service's open work leaves the active queues and its assignees
 * are released. Scope-aware — another live service is untouched and the
 * partner stays active.
 *
 * Returns what actually happened, so the interface can tell somebody exactly
 * what the cancellation moved rather than claiming it worked.
 */
export async function cancelPartnerService(
  serviceId: string, effectiveOn: string, reason?: string,
): Promise<CancellationOutcome> {
  const sb = requireSupabase();
  const { data, error } = await sb.rpc("cancel_partner_service", {
    p_service: serviceId, p_effective: effectiveOn, p_reason: reason?.trim() || null,
  });
  if (error) throw error;
  const r = (data ?? {}) as Record<string, unknown>;
  return {
    service: String(r.service ?? ""),
    effective: String(r.effective ?? effectiveOn),
    scheduledCancelled: Number(r.scheduled_cancelled ?? 0),
    workArchived: Number(r.work_archived ?? 0),
    workspacesArchived: Number(r.workspaces_archived ?? 0),
    clientsParked: Number(r.clients_parked ?? 0),
    partnerStillActive: Boolean(r.partner_still_active),
  };
}

export interface ArchiveOutcome {
  partner: string;
  workArchived: number;
  workspacesArchived: number;
  clientsParked: number;
  portalSuspended: number;
}

/**
 * End the whole relationship.
 *
 * Refuses while any service is still running, and names it — archiving a
 * partner BES is still being paid to serve would stop the work without
 * stopping the invoice.
 */
export async function archivePartner(groupId: string, reason?: string): Promise<ArchiveOutcome> {
  const sb = requireSupabase();
  const { data, error } = await sb.rpc("archive_partner", {
    p_group: groupId, p_reason: reason?.trim() || null,
  });
  if (error) throw error;
  const r = (data ?? {}) as Record<string, unknown>;
  return {
    partner: String(r.partner ?? ""),
    workArchived: Number(r.work_archived ?? 0),
    workspacesArchived: Number(r.workspaces_archived ?? 0),
    clientsParked: Number(r.clients_parked ?? 0),
    portalSuspended: Number(r.portal_suspended ?? 0),
  };
}

/**
 * Bring an archived partner back.
 *
 * Undoes what archiving did to the active views — client files return to the
 * queues, the lifecycle goes back to active — and deliberately not more.
 * Portal contacts and work assignments are given back one at a time, because
 * some were suspended or released on purpose and an undo cannot tell which.
 */
export async function restorePartner(groupId: string): Promise<{ partner: string; clientsRestored: number }> {
  const sb = requireSupabase();
  const { data, error } = await sb.rpc("restore_partner", { p_group: groupId });
  if (error) throw error;
  const r = (data ?? {}) as Record<string, unknown>;
  return { partner: String(r.partner ?? ""), clientsRestored: Number(r.clients_restored ?? 0) };
}
