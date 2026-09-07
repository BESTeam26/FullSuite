/**
 * What changed between a client's consecutive report imports — the
 * `report_item_changes` view (0140).
 *
 * Every value here is an observation of two imported snapshots. None of them
 * is a bureau's statement: an item absent from the later report is
 * `no_longer_observed`, and only where that report read COMPLETELY —
 * otherwise `unable_to_compare`, because an account the importer failed to
 * read is not an account the bureau removed. A bureau-confirmed deletion
 * needs the bureau's own result and lives in `dispute_item_outcomes`.
 *
 * RLS of the underlying reports decides who sees these.
 */
import { requireSupabase } from "@/lib/supabase/client";

export interface ReportItemChange { reportId: string; previousReportId: string; observedOn: string; accountRef: string; name: string; change: "no_longer_observed" | "updated" | "unchanged" | "newly_reported" | "unable_to_compare" | "ambiguous_match"; previousStatus: string | null; currentStatus: string | null; previousBalanceCents: number | null; currentBalanceCents: number | null; bureaus: string[] }

export async function fetchReportChanges(clientId: string): Promise<ReportItemChange[]> {
  const sb = requireSupabase();
  const { data, error } = await sb.from("report_item_changes").select("report_id, prev_report_id, observed_on, account_ref, name, change, previous_status, current_status, previous_balance_cents, current_balance_cents, bureaus").eq("client_id", clientId).neq("change", "unchanged").order("observed_on", { ascending: false }).limit(500);
  if (error) throw error;
  return (data ?? []).map((r) => ({
    reportId: r.report_id as string, previousReportId: r.prev_report_id as string, observedOn: r.observed_on as string, accountRef: r.account_ref as string, name: r.name as string,
    change: r.change as ReportItemChange["change"], previousStatus: r.previous_status as string | null, currentStatus: r.current_status as string | null,
    previousBalanceCents: r.previous_balance_cents === null ? null : Number(r.previous_balance_cents), currentBalanceCents: r.current_balance_cents === null ? null : Number(r.current_balance_cents), bureaus: (r.bureaus as string[]) ?? [],
  }));
}
