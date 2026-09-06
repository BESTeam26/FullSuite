/**
 * Borrower portal reads (Addendum D). The borrower sees their own funding
 * files through the `borrower_funding_files` view (stage, purpose, amount,
 * FND-, waiting on — nothing about lenders or internal notes), the open
 * document requests on them, and their own uploads with the reviewer's
 * disposition. Policies decide every row; this module shapes them.
 */
import { requireSupabase } from "@/lib/supabase/client";

export interface BorrowerFile { id: string; publicId: string | null; purpose: string; requestedAmount: number; stage: string; secondaryStatus: string; waitingOn: string; lastActivityAt: string; agencyId: string; organizationId: string | null }
export interface BorrowerRequest { id: string; fileId: string; documentType: string; period: string | null; status: string; requirement: string }
export interface BorrowerUpload { id: string; fileId: string; requestId: string | null; classifiedType: string | null; classifiedPeriod: string | null; disposition: string; dispositionReason: string | null; createdAt: string; sizeBytes: number | null; mimeType: string | null }
export interface BorrowerPortalData { files: BorrowerFile[]; requests: BorrowerRequest[]; uploads: BorrowerUpload[] }

/** Three bounded queries in parallel; RLS returns only the borrower's own rows. */
export async function fetchBorrowerPortal(): Promise<BorrowerPortalData> {
  const sb = requireSupabase();
  const [files, requests, uploads] = await Promise.all([
    sb.from("borrower_funding_files").select("*").order("last_activity_at", { ascending: false }).limit(50),
    sb.from("document_requests").select("id, file_id, document_type, period, status, requirement").not("status", "in", "(satisfied,waived)").limit(500),
    sb.from("document_instances").select("id, file_id, request_id, classified_type, classified_period, disposition, reason, created_at, size_bytes, mime_type").order("created_at", { ascending: false }).limit(500),
  ]);
  for (const r of [files, requests, uploads]) if (r.error) throw r.error;
  return {
    files: (files.data ?? []).map((f) => ({ id: f.id as string, publicId: f.public_id as string | null, purpose: f.purpose as string, requestedAmount: Number(f.requested_amount), stage: f.stage as string, secondaryStatus: f.secondary_status as string, waitingOn: f.waiting_on as string, lastActivityAt: f.last_activity_at as string, agencyId: f.agency_id as string, organizationId: (f.organization_id as string | null) ?? null })),
    requests: (requests.data ?? []).map((r) => ({ id: r.id, fileId: r.file_id, documentType: r.document_type, period: r.period, status: r.status, requirement: r.requirement })),
    uploads: (uploads.data ?? []).map((u) => ({ id: u.id, fileId: u.file_id, requestId: u.request_id, classifiedType: u.classified_type, classifiedPeriod: u.classified_period, disposition: u.disposition, dispositionReason: u.reason, createdAt: u.created_at, sizeBytes: u.size_bytes, mimeType: u.mime_type })),
  };
}
