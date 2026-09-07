/**
 * Canonical credit reports — data access. Reads are RLS-scoped (a report is
 * visible to whoever sees its client); the import goes through
 * `create_credit_report`, which inserts the whole report atomically as the
 * caller. History is append-only: a re-import is a new report.
 */
import { requireSupabase } from "@/lib/supabase/client";
import type { Json } from "@/lib/supabase/database.types";
import type { Bureau, BureauValues, RawReportItem } from "@/lib/credit-classification";
import type { ParsedReportItem } from "@/lib/credit-report/import-parser";
import type { CompletenessFact, CompletenessState, ImportQuality, ReconciliationCheck } from "@/lib/credit-report/completeness";

export interface CreditReportSummary {
  id: string;
  pulledAt: string;
  bureaus: Bureau[];
  source: string;
  parserVersion: string;
  /** CR-14's verdict. Null means UNKNOWN — never complete. */
  importQuality: ImportQuality | null;
  createdAt: string;
  scores: { bureau: Bureau; model: string; score: number }[];
}

export interface CreditReportDetail extends CreditReportSummary {
  items: (RawReportItem & { accountRef: string; balanceCents: number | null; creditLimitCents: number | null })[];
}

export async function fetchClientReports(fulfillmentClientId: string): Promise<CreditReportSummary[]> {
  const sb = requireSupabase();
  const { data, error } = await sb
    .from("credit_reports")
    .select("id, pulled_at, bureaus, source, parser_version, import_quality, created_at, report_scores(bureau, model, score)")
    .eq("fulfillment_client_id", fulfillmentClientId)
    .order("pulled_at", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(24);
  if (error) throw error;
  return (data ?? []).map((r) => ({
    id: r.id,
    pulledAt: r.pulled_at,
    bureaus: r.bureaus as Bureau[],
    source: r.source,
    parserVersion: r.parser_version,
    importQuality: (r.import_quality as ImportQuality | null) ?? null,
    createdAt: r.created_at,
    scores: (r.report_scores ?? []).map((s) => ({ bureau: s.bureau as Bureau, model: s.model, score: s.score })),
  }));
}

export async function fetchReportItems(reportId: string): Promise<CreditReportDetail["items"]> {
  const sb = requireSupabase();
  const { data, error } = await sb
    .from("report_items")
    .select("id, kind, name, subtype, status, balance_text, balance_cents, credit_limit_text, credit_limit_cents, bureaus, dofd, open_date, linked_creditor, remarks, account_ref")
    .eq("report_id", reportId)
    .order("position");
  if (error) throw error;
  return (data ?? []).map((i) => ({
    id: i.id,
    kind: i.kind as RawReportItem["kind"],
    name: i.name,
    subtype: i.subtype ?? undefined,
    status: i.status,
    balance: i.balance_text ?? undefined,
    balanceCents: i.balance_cents === null ? null : Number(i.balance_cents),
    creditLimit: i.credit_limit_text ?? undefined,
    creditLimitCents: i.credit_limit_cents === null ? null : Number(i.credit_limit_cents),
    bureaus: i.bureaus as Bureau[],
    dofd: i.dofd ?? undefined,
    openDate: i.open_date ?? undefined,
    linkedCreditor: i.linked_creditor ?? undefined,
    remarks: i.remarks ?? undefined,
    accountRef: i.account_ref,
  }));
}

/** Items of several reports in ONE query (chronology needs every snapshot; never one request per report). */
export async function fetchReportItemsForReports(reportIds: string[]): Promise<Record<string, CreditReportDetail["items"]>> {
  if (reportIds.length === 0) return {};
  const sb = requireSupabase();
  const { data, error } = await sb
    .from("report_items")
    .select("id, report_id, kind, name, subtype, status, balance_text, balance_cents, credit_limit_text, credit_limit_cents, bureaus, dofd, open_date, linked_creditor, remarks, account_ref")
    .in("report_id", reportIds)
    .order("position");
  if (error) throw error;
  const out: Record<string, CreditReportDetail["items"]> = {};
  for (const i of data ?? []) {
    (out[i.report_id] ??= []).push({
      id: i.id, kind: i.kind as RawReportItem["kind"], name: i.name, subtype: i.subtype ?? undefined, status: i.status,
      balance: i.balance_text ?? undefined, balanceCents: i.balance_cents === null ? null : Number(i.balance_cents), creditLimit: i.credit_limit_text ?? undefined, creditLimitCents: i.credit_limit_cents === null ? null : Number(i.credit_limit_cents), bureaus: i.bureaus as Bureau[],
      dofd: i.dofd ?? undefined, openDate: i.open_date ?? undefined, linkedCreditor: i.linked_creditor ?? undefined, remarks: i.remarks ?? undefined, accountRef: i.account_ref,
    });
  }
  return out;
}

export interface CreateCreditReportInput {
  organizationId: string | null;
  outsourcingGroupId: string | null;
  fulfillmentClientId: string | null;
  consumerUserId: string | null;
  bureaus: Bureau[];
  pulledAt: string; // YYYY-MM-DD
  source: "manual_upload" | `connector:${string}`;
  fileId: string | null;
  parserVersion: string;
  items: ParsedReportItem[];
  scores: { bureau: Bureau; model: string; score: number }[];
  /** CR-14. Optional: a source that supports no reconciliation sends none, and
   *  the report's `import_quality` is then null — which reads as UNKNOWN, not
   *  complete. */
  completeness?: CompletenessFact[];
  reconciliation?: ReconciliationCheck[];
}

export async function createCreditReport(input: CreateCreditReportInput): Promise<string> {
  const sb = requireSupabase();
  const { data, error } = await sb.rpc("create_credit_report", {
    p_org: input.organizationId,
    p_group: input.outsourcingGroupId,
    p_client: input.fulfillmentClientId,
    p_consumer: input.consumerUserId,
    p_bureaus: input.bureaus,
    p_pulled_at: input.pulledAt,
    p_source: input.source,
    p_file: input.fileId,
    p_parser_version: input.parserVersion,
    p_items: input.items.map((i) => ({
      kind: i.kind,
      name: i.name,
      subtype: i.subtype ?? null,
      status: i.status,
      balance_text: i.balance ?? null,
      balance_cents: i.balanceCents,
      credit_limit_text: i.creditLimit ?? null,
      credit_limit_cents: i.creditLimitCents,
      bureaus: i.bureaus,
      dofd: i.dofd ?? null,
      open_date: i.openDate ?? null,
      linked_creditor: i.linkedCreditor ?? null,
      remarks: i.remarks ?? null,
      account_ref: i.accountRef,
      raw: null,
      /* CR-2. Two destinations, and which one a value reaches is decided by
         the source's own header, never by column position:
           bureau_values   attribution proven → one row per bureau
           source_columns  attribution not proven → the raw values, unattributed
         Both absent is the ordinary case for a single-bureau row, and stays
         UNKNOWN rather than becoming an assumption. */
      bureau_values: i.bureauValues ?? null,
      source_columns: i.sourceColumns ?? null,
    })) as unknown as Json,
    p_scores: input.scores as unknown as Json,
    /* The verdict is NOT sent. `create_credit_report` derives
       `import_quality` from these checks in SQL, so a client that parsed 24 of
       30 accounts cannot claim a complete import. */
    p_completeness: (input.completeness ?? []).map((c) => ({
      bureau: c.bureau ?? null, field_key: c.fieldKey, state: c.state, reason: c.reason ?? null,
    })) as unknown as Json,
    /* The SCOPE travels with every figure. A count whose window is missing is
       a count that can be compared against the wrong population later — the
       summary's two-year inquiry figure against a three-year listing — and
       `comparable: false` is what stops the database grading a verdict on a
       comparison that was never made. */
    p_reconciliation: (input.reconciliation ?? []).map((c) => ({
      bureau: c.bureau ?? null, check_key: c.checkKey,
      stated: c.stated ?? null, parsed: c.parsed, ok: c.ok, reason: c.reason ?? null,
      comparable: c.comparable ?? true, window: c.window ?? null,
      source_section: c.sourceSection ?? null, source_definition: c.sourceDefinition ?? null,
    })) as unknown as Json,
  });
  if (error) throw error;
  return data as string;
}

/**
 * Per-bureau observations for one report's items (CR-2).
 *
 * Fetched SEPARATELY rather than embedded in `fetchReportItems`, and only when
 * something asks for them: most screens show one merged value per field and
 * have no use for three. One bounded query for the whole report, never one per
 * item.
 *
 * Authorization is the parent's — `report_item_bureau_values` has no tenancy
 * column of its own, and its policy resolves through `report_items` to
 * `credit_reports` to `credit_report_visible`. Nothing here supplies an
 * organization id, so nothing here can forge one.
 */
export async function fetchBureauValues(reportId: string): Promise<Record<string, BureauValues[]>> {
  const sb = requireSupabase();
  const { data, error } = await sb
    .from("report_item_bureau_values")
    .select(
      "bureau, status, payment_status, account_type, account_number_masked, balance_cents, high_balance_cents, credit_limit_cents, past_due_cents, monthly_payment_cents, term_months, open_date, date_closed, date_last_payment, date_last_active, dofd, payment_history, remarks, responsibility_raw, dispute_status, account_rating, creditor_type, payment_frequency, last_verified, account_information_date, filed_on, reference_number, court, liability_cents, asset_cents, exempt_cents, inquiry_date, inquiry_type, report_items!inner(id, account_ref, report_id)",
    )
    .eq("report_items.report_id", reportId)
    .limit(1000);
  if (error) throw error;

  const out: Record<string, BureauValues[]> = {};
  for (const row of data ?? []) {
    const parent = row.report_items as unknown as { account_ref: string } | null;
    if (!parent) continue;
    const cents = (v: number | string | null) => (v === null ? undefined : Number(v) / 100);
    (out[parent.account_ref] ??= []).push({
      bureau: row.bureau as Bureau,
      status: row.status ?? undefined,
      paymentStatus: row.payment_status ?? undefined,
      accountType: row.account_type ?? undefined,
      accountNumberMasked: row.account_number_masked ?? undefined,
      balance: cents(row.balance_cents),
      highBalance: cents(row.high_balance_cents),
      creditLimit: cents(row.credit_limit_cents),
      pastDue: cents(row.past_due_cents),
      monthlyPayment: cents(row.monthly_payment_cents),
      termMonths: row.term_months ?? undefined,
      openDate: row.open_date ?? undefined,
      dateClosed: row.date_closed ?? undefined,
      dateLastPayment: row.date_last_payment ?? undefined,
      dateLastActive: row.date_last_active ?? undefined,
      dofd: row.dofd ?? undefined,
      paymentHistory: row.payment_history ?? undefined,
      remarks: row.remarks ?? undefined,
      responsibilityRaw: row.responsibility_raw ?? undefined,
      disputeStatus: row.dispute_status ?? undefined,
      accountRating: row.account_rating ?? undefined,
      creditorType: row.creditor_type ?? undefined,
      paymentFrequency: row.payment_frequency ?? undefined,
      lastVerified: row.last_verified ?? undefined,
      filedOn: row.filed_on ?? undefined,
      referenceNumber: row.reference_number ?? undefined,
      court: row.court ?? undefined,
      liability: cents(row.liability_cents),
      assetAmount: cents(row.asset_cents),
      exemptAmount: cents(row.exempt_cents),
      inquiryDate: row.inquiry_date ?? undefined,
      /* Only where the source stated it. Absent stays UNKNOWN. */
      inquiryType: row.inquiry_type ?? undefined,
      accountInformationDate: row.account_information_date ?? undefined,
    });
  }
  return out;
}

/**
 * Per-bureau values for SEVERAL reports at once (CR-3).
 *
 * One bounded query for a whole chronology, never one per report and never one
 * per item. Returned keyed by report and then by `account_ref`, which is the
 * stable handle that matches the same tradeline across imports.
 */
export async function fetchBureauValuesForReports(
  reportIds: string[],
): Promise<Record<string, Record<string, BureauValues[]>>> {
  if (reportIds.length === 0) return {};
  const sb = requireSupabase();
  const { data, error } = await sb
    .from("report_item_bureau_values")
    .select(
      "bureau, status, payment_status, account_type, account_number_masked, balance_cents, high_balance_cents, credit_limit_cents, past_due_cents, monthly_payment_cents, term_months, open_date, date_closed, date_last_payment, date_last_active, dofd, payment_history, remarks, responsibility_raw, dispute_status, account_rating, creditor_type, payment_frequency, last_verified, account_information_date, reporting_period, filed_on, reference_number, court, liability_cents, asset_cents, exempt_cents, inquiry_date, inquiry_type, report_items!inner(account_ref, report_id)",
    )
    .in("report_items.report_id", reportIds)
    .limit(5000);
  if (error) throw error;

  const out: Record<string, Record<string, BureauValues[]>> = {};
  for (const row of data ?? []) {
    const parent = row.report_items as unknown as { account_ref: string; report_id: string } | null;
    if (!parent) continue;
    const cents = (v: number | string | null) => (v === null ? undefined : Number(v) / 100);
    ((out[parent.report_id] ??= {})[parent.account_ref] ??= []).push({
      bureau: row.bureau as Bureau,
      status: row.status ?? undefined,
      paymentStatus: row.payment_status ?? undefined,
      accountType: row.account_type ?? undefined,
      accountNumberMasked: row.account_number_masked ?? undefined,
      balance: cents(row.balance_cents),
      highBalance: cents(row.high_balance_cents),
      creditLimit: cents(row.credit_limit_cents),
      pastDue: cents(row.past_due_cents),
      monthlyPayment: cents(row.monthly_payment_cents),
      termMonths: row.term_months ?? undefined,
      openDate: row.open_date ?? undefined,
      dateClosed: row.date_closed ?? undefined,
      dateLastPayment: row.date_last_payment ?? undefined,
      dateLastActive: row.date_last_active ?? undefined,
      dofd: row.dofd ?? undefined,
      paymentHistory: row.payment_history ?? undefined,
      remarks: row.remarks ?? undefined,
      responsibilityRaw: row.responsibility_raw ?? undefined,
      disputeStatus: row.dispute_status ?? undefined,
      accountRating: row.account_rating ?? undefined,
      creditorType: row.creditor_type ?? undefined,
      paymentFrequency: row.payment_frequency ?? undefined,
      lastVerified: row.last_verified ?? undefined,
      filedOn: row.filed_on ?? undefined,
      referenceNumber: row.reference_number ?? undefined,
      court: row.court ?? undefined,
      liability: cents(row.liability_cents),
      assetAmount: cents(row.asset_cents),
      exemptAmount: cents(row.exempt_cents),
      inquiryDate: row.inquiry_date ?? undefined,
      /* Only where the source stated it. Absent stays UNKNOWN. */
      inquiryType: row.inquiry_type ?? undefined,
      accountInformationDate: row.account_information_date ?? undefined,
    });
  }
  return out;
}

/**
 * The completeness record of one report (CR-14).
 *
 * Read for display, and for the one decision that matters: whether
 * completeness-dependent analysis may run. The verdict comes from the
 * database, which derived it — never recomputed here from the checks, because
 * then a UI bug could disagree with the record.
 */
export interface ReportQualityRecord {
  quality: ImportQuality | null;
  checks: ReconciliationCheck[];
  facts: CompletenessFact[];
  acceptance: { acceptedBy: string; reason: string; acceptedAt: string } | null;
}

export async function fetchReportQuality(reportId: string): Promise<ReportQualityRecord> {
  const sb = requireSupabase();
  /* Four bounded reads in parallel, never one per row. */
  const [report, checks, facts, acceptance] = await Promise.all([
    sb.from("credit_reports").select("import_quality").eq("id", reportId).maybeSingle(),
    sb.from("report_reconciliation").select("bureau, check_key, stated, parsed, ok, reason").eq("report_id", reportId).limit(200),
    sb.from("report_completeness").select("bureau, field_key, state, reason").eq("report_id", reportId).limit(500),
    sb.from("report_partial_acceptances").select("accepted_by, reason, accepted_at").eq("report_id", reportId).maybeSingle(),
  ]);
  for (const r of [report, checks, facts, acceptance]) if (r.error) throw r.error;

  return {
    quality: (report.data?.import_quality as ImportQuality | null) ?? null,
    checks: (checks.data ?? []).map((c) => ({
      bureau: (c.bureau as Bureau | null) ?? undefined,
      checkKey: c.check_key,
      stated: c.stated ?? undefined,
      parsed: c.parsed,
      ok: c.ok,
      reason: c.reason ?? undefined,
    })),
    facts: (facts.data ?? []).map((f) => ({
      bureau: (f.bureau as Bureau | null) ?? undefined,
      fieldKey: f.field_key,
      state: f.state as CompletenessState,
      reason: f.reason ?? undefined,
    })),
    acceptance: acceptance.data
      ? { acceptedBy: acceptance.data.accepted_by, reason: acceptance.data.reason, acceptedAt: acceptance.data.accepted_at }
      : null,
  };
}

/**
 * Record that an authorised person chose to work a partial snapshot.
 *
 * This changes NO completeness fact. `import_quality` stays partial, every
 * failed check stays failed, and `report_analysis_complete()` still returns
 * false — so the analyses that need a complete snapshot stay off. All it adds
 * is who decided, when, and why.
 */
export async function acceptPartialReport(reportId: string, actorId: string, reason: string): Promise<void> {
  const sb = requireSupabase();
  const { data, error } = await sb
    .from("report_partial_acceptances")
    .insert({ report_id: reportId, accepted_by: actorId, reason })
    .select("id");
  if (error) throw error;
  if (!data?.length) throw new Error("Nothing was recorded — you may not accept a partial import for this client.");
}

/** How many reports this organization has imported — a head count, no rows (Home guide). */
export async function fetchOrganizationReportCount(organizationId: string): Promise<number> {
  const sb = requireSupabase();
  const { count, error } = await sb.from("credit_reports").select("id", { count: "exact", head: true }).eq("organization_id", organizationId);
  if (error) throw error;
  return count ?? 0;
}
