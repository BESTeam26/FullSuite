/**
 * Canonical credit reports — data access. Reads are RLS-scoped (a report is
 * visible to whoever sees its client); the import goes through
 * `create_credit_report`, which inserts the whole report atomically as the
 * caller. History is append-only: a re-import is a new report.
 */
import { requireSupabase } from "@/lib/supabase/client";
import type { Json } from "@/lib/supabase/database.types";
import type { Bureau, RawReportItem } from "@/lib/credit-classification";
import type { ParsedReportItem } from "@/lib/credit-report/import-parser";

export interface CreditReportSummary {
  id: string;
  pulledAt: string;
  bureaus: Bureau[];
  source: string;
  parserVersion: string;
  createdAt: string;
  scores: { bureau: Bureau; model: string; score: number }[];
}

export interface CreditReportDetail extends CreditReportSummary {
  items: (RawReportItem & { accountRef: string; balanceCents: number | null })[];
}

export async function fetchClientReports(fulfillmentClientId: string): Promise<CreditReportSummary[]> {
  const sb = requireSupabase();
  const { data, error } = await sb
    .from("credit_reports")
    .select("id, pulled_at, bureaus, source, parser_version, created_at, report_scores(bureau, model, score)")
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
    createdAt: r.created_at,
    scores: (r.report_scores ?? []).map((s) => ({ bureau: s.bureau as Bureau, model: s.model, score: s.score })),
  }));
}

export async function fetchReportItems(reportId: string): Promise<CreditReportDetail["items"]> {
  const sb = requireSupabase();
  const { data, error } = await sb
    .from("report_items")
    .select("id, kind, name, subtype, status, balance_text, balance_cents, bureaus, dofd, open_date, linked_creditor, remarks, account_ref")
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
    .select("id, report_id, kind, name, subtype, status, balance_text, balance_cents, bureaus, dofd, open_date, linked_creditor, remarks, account_ref")
    .in("report_id", reportIds)
    .order("position");
  if (error) throw error;
  const out: Record<string, CreditReportDetail["items"]> = {};
  for (const i of data ?? []) {
    (out[i.report_id] ??= []).push({
      id: i.id, kind: i.kind as RawReportItem["kind"], name: i.name, subtype: i.subtype ?? undefined, status: i.status,
      balance: i.balance_text ?? undefined, balanceCents: i.balance_cents === null ? null : Number(i.balance_cents), bureaus: i.bureaus as Bureau[],
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
      bureaus: i.bureaus,
      dofd: i.dofd ?? null,
      open_date: i.openDate ?? null,
      linked_creditor: i.linkedCreditor ?? null,
      remarks: i.remarks ?? null,
      account_ref: i.accountRef,
      raw: null,
    })) as unknown as Json,
    p_scores: input.scores as unknown as Json,
  });
  if (error) throw error;
  return data as string;
}

/** How many reports this organization has imported — a head count, no rows (Home guide). */
export async function fetchOrganizationReportCount(organizationId: string): Promise<number> {
  const sb = requireSupabase();
  const { count, error } = await sb.from("credit_reports").select("id", { count: "exact", head: true }).eq("organization_id", organizationId);
  if (error) throw error;
  return count ?? 0;
}
