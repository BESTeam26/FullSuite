/**
 * Borrower portal (Addendum D): the person's own funding files — stage in the
 * 17-step vocabulary, what is being waited on, the documents asked of them
 * with an upload control, and their uploads with the reviewer's disposition.
 * Nothing about lenders, offers, flags or internal notes. Every row comes
 * through the borrower policies; a refusal is shown, never hidden.
 */
import { useRef, useState } from "react";
import { Navigate } from "react-router-dom";
import { CheckCircle2, Clock, FileUp, Loader2, ShieldCheck, XCircle } from "lucide-react";
import { useAuth } from "@/lib/auth/auth-context";
import { errorMessage } from "@/lib/data/error-message";
import { uploadDocumentInstance } from "@/lib/data/funding-domain";
import { useBorrowerPortal, useInvalidateBorrowerPortal } from "@/lib/data/use-borrower-portal";
import type { BorrowerFile, BorrowerRequest, BorrowerUpload } from "@/lib/data/borrower-portal";
import { DOCUMENT_TYPE_LABELS } from "@/lib/funding/document-vocabulary";
import { formatDate } from "@/lib/format-date";
import { formatMoney } from "@/lib/format-money";
import { stageByLabel } from "@/lib/funding/pipeline-stages";
import type { FundingFileStage } from "@/lib/fulfillment/fundingops-domain";
import { cn } from "@/lib/utils";

const DISPOSITION: Record<string, { label: string; tone: string; icon: typeof Clock }> = {
  pending_review: { label: "Under review", tone: "border-amber-500/40 bg-amber-500/10 text-amber-800", icon: Clock },
  accepted: { label: "Accepted", tone: "border-emerald-500/30 bg-emerald-500/10 text-emerald-700", icon: CheckCircle2 },
  rejected: { label: "Needs a new upload", tone: "border-red-500/30 bg-red-500/10 text-red-700", icon: XCircle },
  superseded: { label: "Replaced", tone: "border-border bg-muted text-muted-foreground", icon: Clock },
};

export default function BorrowerPortal() {
  const auth = useAuth();
  const isClient = auth.externalMemberships.some((m) => m.role === "client");
  const portal = useBorrowerPortal(isClient);
  if (auth.mode === "live" && auth.status === "signed-in" && !isClient) return <Navigate to="/app" replace />;
  const data = portal.data;

  return (
    <div className="mx-auto max-w-4xl space-y-5 p-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight text-foreground"><ShieldCheck className="h-6 w-6 text-primary" /> Your funding</h1>
        <p className="text-sm text-muted-foreground">Where each request stands, what we still need from you, and the documents you have sent.</p>
      </div>
      {portal.isLoading && <p className="inline-flex items-center gap-1 text-xs text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</p>}
      {portal.error && <p role="alert" className="text-xs text-status-danger">Could not load your files.</p>}
      {data && data.files.length === 0 && <p className="rounded-2xl border border-border bg-card p-6 text-sm text-muted-foreground">No funding file is linked to your account yet. Your advisor will connect it.</p>}
      {data?.files.map((f) => <FileCard key={f.id} file={f} requests={data.requests.filter((r) => r.fileId === f.id)} uploads={data.uploads.filter((u) => u.fileId === f.id)} actorId={auth.user?.id ?? null} />)}
    </div>
  );
}

function FileCard({ file, requests, uploads, actorId }: { file: BorrowerFile; requests: BorrowerRequest[]; uploads: BorrowerUpload[]; actorId: string | null }) {
  const stage = stageByLabel(file.stage as FundingFileStage);
  const invalidate = useInvalidateBorrowerPortal();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inputs = useRef<Record<string, HTMLInputElement | null>>({});
  const open = requests.filter((r) => r.status === "open");

  const upload = async (request: BorrowerRequest, picked: File | undefined) => {
    if (!picked || !actorId) return;
    setBusy(request.id); setError(null);
    try {
      await uploadDocumentInstance({ file: picked, fileId: file.id, agencyId: file.agencyId, organizationId: file.organizationId, actorId, requestId: request.id, classifiedType: request.documentType, classifiedPeriod: request.period, uploadSource: "portal" });
      invalidate();
    } catch (e) { setError(errorMessage(e, "The upload was not accepted.")); } finally { setBusy(null); }
  };

  return (
    <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-lg font-bold text-foreground">{file.purpose}</p>
          <p className="text-xs text-muted-foreground">{formatMoney(file.requestedAmount)} requested{file.publicId && <span className="ml-1 font-mono text-[10px]">{file.publicId}</span>} · updated {formatDate(file.lastActivityAt)}</p>
        </div>
        <div className="text-right">
          <span className="inline-flex rounded-full border border-primary/30 bg-primary/10 px-2.5 py-1 text-xs font-bold text-primary">Step {stage.number} of 17 · {stage.label}</span>
          <p className="mt-1 text-[11px] text-muted-foreground">Waiting on: {file.waitingOn === "Client" ? "you" : file.waitingOn.toLowerCase()}</p>
        </div>
      </div>

      <div className="mt-4">
        <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Documents we still need {open.length > 0 && <span className="ml-1 rounded-full bg-amber-500/15 px-1.5 py-0.5 text-[10px] text-amber-900">{open.length}</span>}</p>
        {open.length === 0 && <p className="mt-1 text-xs text-muted-foreground">Nothing outstanding right now.</p>}
        <ul className="mt-2 space-y-2">
          {open.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-background px-3 py-2 text-xs">
              <div>
                <p className="font-semibold text-foreground">{DOCUMENT_TYPE_LABELS[r.documentType] ?? r.documentType}{r.period && <span className="font-normal text-muted-foreground"> · {r.period}</span>}</p>
                <p className="text-[11px] text-muted-foreground">{r.requirement === "required" ? "Required" : r.requirement === "conditional" ? "Requested for your situation" : "Optional"}</p>
              </div>
              {actorId && (
                <>
                  <input ref={(el) => { inputs.current[r.id] = el; }} type="file" className="hidden" accept=".pdf,.png,.jpg,.jpeg,.csv,.xlsx" onChange={(e) => void upload(r, e.target.files?.[0])} />
                  <button type="button" disabled={busy !== null} onClick={() => inputs.current[r.id]?.click()} className="inline-flex items-center gap-1 rounded-lg bg-primary px-3 py-1.5 text-xs font-bold text-primary-foreground hover:bg-primary/90 disabled:opacity-60">
                    {busy === r.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileUp className="h-3.5 w-3.5" />} Upload
                  </button>
                </>
              )}
            </li>
          ))}
        </ul>
      </div>

      {uploads.length > 0 && (
        <div className="mt-4">
          <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">What you have sent</p>
          <ul className="mt-2 divide-y divide-border/60">
            {uploads.map((u) => { const d = DISPOSITION[u.disposition] ?? DISPOSITION.pending_review; const Icon = d.icon; return (
              <li key={u.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-xs">
                <span className="text-foreground">{u.classifiedType ? DOCUMENT_TYPE_LABELS[u.classifiedType] ?? u.classifiedType : "Document"}{u.classifiedPeriod && ` · ${u.classifiedPeriod}`} <span className="text-muted-foreground">· {formatDate(u.createdAt)}</span></span>
                <span className={cn("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold", d.tone)}><Icon className="h-3 w-3" /> {d.label}{u.disposition === "rejected" && u.dispositionReason ? ` — ${u.dispositionReason}` : ""}</span>
              </li>
            ); })}
          </ul>
        </div>
      )}
      {error && <p role="alert" className="mt-2 text-xs text-status-danger">{error}</p>}
    </section>
  );
}
