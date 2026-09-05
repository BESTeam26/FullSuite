/**
 * Persisted Credit Reporting Integrity findings (report_findings, 0059). The
 * engine's output is deterministic and re-derivable; what is persisted is the
 * record that a person saw a finding and what they decided about it. Saving
 * never overwrites a row that already exists for the same report, account and
 * rule version — a disposition already given stays given. Policies decide who
 * may write (credit_client_writable).
 */
import { requireSupabase } from "@/lib/supabase/client";
import type { Enums, Json } from "@/lib/supabase/database.types";
import type { IntegrityFinding } from "@/lib/dispute/reporting-integrity-engine";

export type FindingDisposition = Enums<"finding_disposition">;
export const FINDING_DISPOSITION_LABEL: Record<FindingDisposition, string> = {
  confirmed: "Confirmed — fact established with evidence",
  dismissed: "Dismissed — explained, not an inaccuracy",
  needs_evidence: "Needs evidence before anything is disputed",
  escalated: "Escalated to a manager",
};

export interface SavedFinding {
  id: string;
  clientId: string;
  reportId: string;
  accountRef: string;
  ruleId: string;
  ruleVersion: number;
  classification: Enums<"finding_classification">;
  observation: string;
  remedy: string;
  route: string;
  humanReviewRequired: boolean;
  humanDisposition: FindingDisposition | null;
  reviewerReason: string | null;
  reviewedAt: string | null;
  createdAt: string;
}

export async function fetchClientFindings(clientId: string): Promise<SavedFinding[]> {
  const sb = requireSupabase();
  const { data, error } = await sb.from("report_findings").select("*").eq("client_id", clientId).order("created_at", { ascending: false }).limit(1000);
  if (error) throw error;
  return (data ?? []).map((r) => ({
    id: r.id, clientId: r.client_id, reportId: r.report_id, accountRef: r.account_ref, ruleId: r.rule_id, ruleVersion: r.rule_version, classification: r.classification,
    observation: r.observation, remedy: r.remedy, route: r.route, humanReviewRequired: r.human_review_required, humanDisposition: r.human_disposition, reviewerReason: r.reviewer_reason, reviewedAt: r.reviewed_at, createdAt: r.created_at,
  }));
}

/** Persist the engine's current findings for the client; rows that already exist are left exactly as they are. */
export async function saveFindings(clientId: string, findings: IntegrityFinding[], actorId: string): Promise<number> {
  if (findings.length === 0) return 0;
  const sb = requireSupabase();
  const rows = findings.filter((f): f is IntegrityFinding & { reportId: string } => f.reportId !== null).map((f) => ({
    client_id: clientId, report_id: f.reportId, account_ref: f.accountRef, rule_id: f.ruleId, rule_version: f.ruleVersion, catalogue_version: f.catalogueVersion,
    classification: f.classification, verdict: f.verdict, observation: f.observation, evidence: f.evidence as Json, fields: f.fields, route: f.route, remedy: f.remedy,
    human_review_required: f.humanReviewRequired, raw_metro2_verified: false, created_by: actorId,
  }));
  const { data, error } = await sb.from("report_findings").upsert(rows, { onConflict: "client_id,report_id,account_ref,rule_id,rule_version", ignoreDuplicates: true }).select("id");
  if (error) throw error;
  return data?.length ?? 0;
}

/** A person's decision about a finding, with their reason; previous value stays visible in the row's history through updated timestamps. */
export async function setFindingDisposition(findingId: string, disposition: FindingDisposition, reason: string | null, actorId: string): Promise<void> {
  const sb = requireSupabase();
  const { data, error } = await sb.from("report_findings").update({ human_disposition: disposition, reviewer: actorId, reviewer_reason: reason, reviewed_at: new Date().toISOString() }).eq("id", findingId).select("id");
  if (error) throw error;
  if (!data?.length) throw new Error("Nothing changed — you may not review findings for this client.");
}
