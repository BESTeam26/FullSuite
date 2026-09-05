/**
 * Renewals: a funded deal is monitored; the potential renewal date is a
 * reminder, never eligibility. When the client is interested a NEW funding file
 * is created with lineage — reassessed on current data and current policies.
 */
import { useState } from "react";
import { RENEWAL_STATUS_LABEL } from "@/lib/funding/document-vocabulary";
import { Link } from "react-router-dom";
import { Loader2, RefreshCw } from "lucide-react";
import { OpsSelect } from "@/components/ui/ops-select";
import { useAuth } from "@/lib/auth/auth-context";
import { errorMessage } from "@/lib/data/error-message";
import { createRenewalFile, updateRenewal, type FundingFileDomain, type RenewalStatus } from "@/lib/data/funding-domain";
import { useInvalidateFundingFile } from "@/lib/data/use-funding-domain";
import { formatDate } from "@/lib/format-date";

interface Props { fileId: string; domain: FundingFileDomain; canEdit: boolean }

const STATUS_LABEL = RENEWAL_STATUS_LABEL;
const input = "mt-1 w-full rounded-lg border border-border bg-background px-2.5 py-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary";
const label = "text-[10px] font-bold uppercase tracking-wider text-muted-foreground";

export function RenewalTab({ fileId, domain, canEdit }: Props) {
  const auth = useAuth();
  const invalidate = useInvalidateFundingFile();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [newFile, setNewFile] = useState({ purpose: "Renewal", amount: "" });
  const run = async (key: string, fn: () => Promise<unknown>, fallback: string) => {
    setBusy(key); setError(null);
    try { await fn(); invalidate(fileId); } catch (e) { setError(errorMessage(e, fallback)); } finally { setBusy(null); }
  };

  if (domain.renewals.length === 0) return <p className="text-xs text-muted-foreground">Renewal monitoring opens when funding is confirmed. Nothing here means this file has not funded.</p>;

  return (
    <div className="space-y-3">
      {domain.renewals.map((r) => {
        const funded = domain.fundedDeals.find((d) => d.id === r.fundedDealId);
        return (
          <div key={r.id} className="rounded-lg border border-border bg-background p-3 text-xs">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-bold text-foreground">{funded ? `${funded.lenderName} · funded ${formatDate(funded.fundedAt)}` : "Funded deal"}</p>
              <span className="rounded-full border border-border bg-muted px-2 py-0.5 text-[10px] font-bold text-foreground">{STATUS_LABEL[r.status]}</span>
            </div>
            <p className="mt-1 text-[11px] text-muted-foreground">Potential renewal date {formatDate(r.potentialRenewalDate)} — a reminder, not eligibility. Prior funding never means current eligibility.</p>
            {canEdit && auth.user && r.status !== "new_file_created" && (
              <div className="mt-2 grid gap-2 sm:grid-cols-3">
                <label className="block"><span className={label}>Status</span>
                  <OpsSelect value={r.status} onValueChange={(v) => void run(`st:${r.id}`, () => updateRenewal(r.id, { status: v as RenewalStatus }, auth.user!.id), "Could not update the renewal.")} options={(Object.keys(STATUS_LABEL) as RenewalStatus[]).filter((s) => s !== "new_file_created").map((s) => ({ value: s, label: STATUS_LABEL[s] }))} aria-label="Renewal status" /></label>
                <label className="block"><span className={label}>Next follow-up</span>
                  <input type="date" value={r.nextFollowUpAt ?? ""} onChange={(e) => void run(`fu:${r.id}`, () => updateRenewal(r.id, { nextFollowUpAt: e.target.value || null }, auth.user!.id), "Could not update the follow-up date.")} className={input} /></label>
                <label className="block"><span className={label}>Potential renewal date</span>
                  <input type="date" value={r.potentialRenewalDate ?? ""} onChange={(e) => void run(`pd:${r.id}`, () => updateRenewal(r.id, { potentialRenewalDate: e.target.value || null }, auth.user!.id), "Could not update the date.")} className={input} /></label>
              </div>
            )}
            {canEdit && r.status === "client_interested" && (
              <div className="mt-2 grid gap-2 rounded-lg border border-primary/30 bg-primary/5 p-3 sm:grid-cols-[1.4fr_1fr_auto] sm:items-end">
                <label className="block"><span className={label}>New file purpose</span><input value={newFile.purpose} onChange={(e) => setNewFile((x) => ({ ...x, purpose: e.target.value }))} className={input} /></label>
                <label className="block"><span className={label}>Requested amount ($)</span><input type="number" value={newFile.amount} onChange={(e) => setNewFile((x) => ({ ...x, amount: e.target.value }))} className={input} /></label>
                <button type="button" disabled={busy !== null || !newFile.purpose.trim() || !newFile.amount} onClick={() => void run(`new:${r.id}`, () => createRenewalFile(r.id, newFile.purpose.trim(), Number(newFile.amount)), "Could not create the renewal file.")}
                  className="inline-flex items-center gap-1 rounded-lg bg-primary px-3 py-1.5 text-xs font-bold text-primary-foreground hover:opacity-90 disabled:opacity-60">
                  {busy === `new:${r.id}` ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />} Create new funding file
                </button>
                <p className="text-[10px] text-muted-foreground sm:col-span-3">A new file with lineage to this one; readiness and Program Fit are assessed again on today's data and today's policies.</p>
              </div>
            )}
            {r.newFileId && <p className="mt-2 text-[11px]"><Link to={`/app/funding-files/${r.newFileId}`} className="font-semibold text-primary hover:underline">Open the new funding file →</Link></p>}
            {r.note && <p className="mt-1 text-[11px] text-muted-foreground">{r.note}</p>}
          </div>
        );
      })}
      {error && <p role="alert" className="text-xs text-status-danger">{error}</p>}
    </div>
  );
}
