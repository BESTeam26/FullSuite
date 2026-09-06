/**
 * What changed between a client's consecutive report imports — the
 * `report_item_changes` view (0071): deleted · updated · unchanged accounts,
 * observed on the later import's date. Observations of the consumer-facing
 * display, never a statement about the furnisher's record. RLS of the
 * underlying reports decides who sees them.
 */
import { requireSupabase } from "@/lib/supabase/client";

export interface ReportItemChange { reportId: string; previousReportId: string; observedOn: string; accountRef: string; name: string; change: "deleted" | "updated" | "unchanged"; previousStatus: string | null; currentStatus: string | null; previousBalanceCents: number | null; currentBalanceCents: number | null; bureaus: string[] }

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
