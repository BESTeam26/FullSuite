/**
 * Documents: what the file NEEDS (requests) versus what was UPLOADED
 * (instances). An upload never satisfies a request by itself — a reviewer's
 * "Accepted for package" does, through `record_document_disposition`. Flags
 * are shown to reviewers with their client-safe meaning; a flag is a potential
 * issue to check, never a verdict.
 */
import { useRef, useState } from "react";
import { formatDate, formatDateTime } from "@/lib/format-date";
import { Loader2, Plus, Upload } from "lucide-react";
import { OpsSelect } from "@/components/ui/ops-select";
import { errorMessage } from "@/lib/data/error-message";
import {
  addDocumentRequest, addResolvedRequests, recordDocumentDisposition, resolveDocumentFlag, uploadDocumentInstance, waiveDocumentRequest,
  type DocumentInstance, type DocumentRequest, type FundingFileDomain,
} from "@/lib/data/funding-domain";
import { useInvalidateFundingFile } from "@/lib/data/use-funding-domain";
import { missingRequests, resolveRequirements } from "@/lib/funding/requirement-resolver";
import {
  DISPOSITION_LABELS, DOCUMENT_TYPES, FLAG_MEANINGS, PERIOD_PATTERN, REVIEWER_DISPOSITIONS, documentTypeLabel, periodLabel,
  type DocumentDisposition,
} from "@/lib/funding/document-vocabulary";
import { cn } from "@/lib/utils";

interface Props {
  fileId: string;
  agencyId: string;
  organizationId: string | null;
  domain: FundingFileDomain;
  canEdit: boolean;
  actorId: string | null;
}

const REQUEST_TONE: Record<DocumentRequest["status"], string> = {
  open: "border-amber-500/40 bg-amber-500/10 text-amber-800",
  satisfied: "border-emerald-500/40 bg-emerald-500/10 text-status-success",
  waived: "border-border bg-muted text-muted-foreground",
};
const DISPOSITION_TONE: Record<DocumentDisposition, string> = {
  pending_review: "border-border bg-muted text-foreground",
  accepted: "border-emerald-500/40 bg-emerald-500/10 text-status-success",
  needs_correction: "border-amber-500/40 bg-amber-500/10 text-amber-800",
  not_accepted: "border-red-500/30 bg-red-500/10 text-red-700",
  escalated: "border-purple-500/30 bg-purple-500/10 text-purple-800",
};

export function DocumentsTab({ fileId, agencyId, organizationId, domain, canEdit, actorId }: Props) {
  const invalidate = useInvalidateFundingFile();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [newType, setNewType] = useState("bank_statement");
  const [newPeriod, setNewPeriod] = useState("");
  const periodic = DOCUMENT_TYPES.find((d) => d.key === newType)?.periodic ?? false;

  const run = async (key: string, fn: () => Promise<void>, fallback: string) => {
    setBusy(key); setError(null);
    try { await fn(); invalidate(fileId); } catch (e) { setError(errorMessage(e, fallback)); } finally { setBusy(null); }
  };

  const addRequest = () => {
    if (!actorId) return;
    const period = periodic && newPeriod.trim() ? newPeriod.trim() : null;
    if (period && !PERIOD_PATTERN.test(period)) { setError("Period must look like 2026-06."); return; }
    void run("add", () => addDocumentRequest({ fileId, documentType: newType, period, actorId }), "Could not add the request.").then(() => setNewPeriod(""));
  };

  const upload = (file: File, request: DocumentRequest | null) => {
    if (!actorId) return;
    void run(`upload:${request?.id ?? "loose"}`, () => uploadDocumentInstance({
      file, fileId, agencyId, organizationId, actorId, requestId: request?.id ?? null,
      classifiedType: request?.documentType ?? null, classifiedPeriod: request?.period ?? null,
    }), "Could not upload the document.");
  };

  /* What the configured rules say this file still needs today. Empty when no
     rule row targets the application's product family — the interface says so
     rather than inventing a checklist. */
  const app = domain.application;
  const resolvedMissing = app
    ? missingRequests(
        resolveRequirements({
          rules: domain.rules,
          application: { productFamily: app.productFamily, requestedAmount: app.requestedAmount, state: app.state, entityType: app.entityType, scenario: app.scenario },
          parties: domain.parties,
          asOf: new Date().toISOString().slice(0, 10),
        }),
        domain.requests,
      )
    : [];
  const rulesForProduct = app?.productFamily ? domain.rules.filter((r) => r.productFamily === app.productFamily).length : 0;
  const [resolvedNote, setResolvedNote] = useState<string | null>(null);
  const addResolved = () => {
    if (!actorId || resolvedMissing.length === 0) return;
    void run("resolve", async () => { const n = await addResolvedRequests(fileId, resolvedMissing, actorId); setResolvedNote(`${n} request(s) opened from the configured rules.`); }, "Could not open the required documents.");
  };

  const byRequest = new Map<string, DocumentInstance[]>();
  const loose: DocumentInstance[] = [];
  for (const i of domain.instances) { if (i.requestId) { const arr = byRequest.get(i.requestId) ?? []; arr.push(i); byRequest.set(i.requestId, arr); } else loose.push(i); }
  const openFlags = domain.flags.filter((f) => !f.humanDisposition);

  return (
    <div className="space-y-4">
      {/* Add a request */}
      <div className="grid gap-2 rounded-lg border border-border bg-background p-3 md:grid-cols-[1.6fr_1fr_auto] md:items-end">
        <label className="block">
          <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Request a document</span>
          <OpsSelect value={newType} onValueChange={setNewType} options={DOCUMENT_TYPES.map((d) => ({ value: d.key, label: d.label }))} disabled={!canEdit} aria-label="Document type" />
        </label>
        <label className="block">
          <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Period (yyyy-mm)</span>
          <input value={newPeriod} onChange={(e) => setNewPeriod(e.target.value)} placeholder={periodic ? "2026-06" : "—"} disabled={!canEdit || !periodic}
            className="mt-1 w-full rounded-lg border border-border bg-background px-2.5 py-1.5 text-xs text-foreground disabled:bg-muted/40 disabled:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary" />
        </label>
        <button type="button" onClick={addRequest} disabled={!canEdit || busy === "add" || !actorId}
          className="inline-flex items-center justify-center gap-1 rounded-lg bg-primary px-3 py-1.5 text-xs font-bold text-primary-foreground hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60">
          {busy === "add" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />} Add request
        </button>
      </div>

      {/* Rule-driven requests */}
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-muted/30 px-3 py-2">
        <p className="text-[11px] text-muted-foreground">
          {!app ? "Record an application first — the requirement rules read its product family, amount, state and scenario."
            : rulesForProduct === 0 ? `No requirement rule targets "${app.productFamily ?? "this product"}" yet; requests are opened by hand until rules exist.`
            : resolvedMissing.length === 0 ? `All ${rulesForProduct} configured rule(s) for ${app.productFamily} are already covered by requests.`
            : `${resolvedMissing.length} document(s) the configured rules require are not requested yet.`}
          {resolvedNote && <span className="ml-1 text-status-success">{resolvedNote}</span>}
        </p>
        {canEdit && resolvedMissing.length > 0 && (
          <button type="button" onClick={addResolved} disabled={busy !== null || !actorId}
            className="inline-flex items-center gap-1 rounded-lg border border-primary/40 px-2.5 py-1 text-[11px] font-bold text-primary hover:bg-primary/10 disabled:cursor-not-allowed disabled:opacity-60">
            {busy === "resolve" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />} Open required documents
          </button>
        )}
      </div>

      {/* Requests */}
      {domain.requests.length === 0 ? (
        <p className="text-xs text-muted-foreground">No document requests yet. Requests say what the package must contain; uploads answer them.</p>
      ) : (
        <ul className="space-y-2">
          {domain.requests.map((r) => (
            <li key={r.id} className="rounded-lg border border-border bg-background p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-xs font-bold text-foreground">{documentTypeLabel(r.documentType)}{r.period && <span className="ml-1 text-muted-foreground">· {periodLabel(r.period)}</span>}</p>
                  <p className="text-[10px] text-muted-foreground">{r.requirement} · requested {formatDate(r.createdAt)}{r.waivedReason && ` · waived: ${r.waivedReason}`}</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className={cn("inline-flex rounded-full border px-2 py-0.5 text-[10px] font-bold capitalize", REQUEST_TONE[r.status])}>{r.status}</span>
                  {r.status === "open" && canEdit && (
                    <>
                      <UploadButton disabled={busy !== null || !actorId} busy={busy === `upload:${r.id}`} onFile={(f) => upload(f, r)} />
                      <button type="button" disabled={busy !== null || !actorId}
                        onClick={() => { const reason = window.prompt("Why is this request waived?"); if (reason && actorId) void run(`waive:${r.id}`, () => waiveDocumentRequest(r.id, reason, actorId), "Could not waive the request."); }}
                        className="rounded-lg border border-border px-2 py-1 text-[11px] font-bold text-foreground hover:bg-muted disabled:opacity-60">Waive</button>
                    </>
                  )}
                </div>
              </div>
              <InstanceList instances={byRequest.get(r.id) ?? []} canEdit={canEdit} busy={busy} onDispose={(i, d, reason) => run(`dispose:${i.id}`, () => recordDocumentDisposition(i.id, d, reason), "Could not record the disposition.")} />
            </li>
          ))}
        </ul>
      )}

      {/* Uploads not tied to a request */}
      <div className="rounded-lg border border-dashed border-border p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Other uploads</p>
          {canEdit && <UploadButton disabled={busy !== null || !actorId} busy={busy === "upload:loose"} onFile={(f) => upload(f, null)} />}
        </div>
        {loose.length === 0 ? <p className="mt-1 text-[11px] text-muted-foreground">None.</p> : (
          <InstanceList instances={loose} canEdit={canEdit} busy={busy} onDispose={(i, d, reason) => run(`dispose:${i.id}`, () => recordDocumentDisposition(i.id, d, reason), "Could not record the disposition.")} />
        )}
      </div>

      {/* Flags — reviewers only (the policies return none to anyone else) */}
      {domain.flags.length > 0 && (
        <div className="rounded-lg border border-border bg-background p-3">
          <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Review flags ({openFlags.length} open)</p>
          <ul className="mt-2 space-y-2">
            {domain.flags.map((f) => (
              <li key={f.id} className={cn("rounded-lg border p-2", f.humanDisposition ? "border-border bg-muted/30" : "border-amber-500/40 bg-amber-500/5")}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-xs font-bold text-foreground">{FLAG_MEANINGS[f.flagCode]}</p>
                    <p className="text-[10px] text-muted-foreground">
                      {f.flagCode} · {f.automatedStatus.replace(/_/g, " ")}{f.confidence !== null && ` · confidence ${Math.round(f.confidence * 100)}%`}
                      {Object.keys(f.evidence).length > 0 && ` · evidence: ${JSON.stringify(f.evidence)}`}
                    </p>
                    {f.humanDisposition && <p className="text-[10px] text-muted-foreground">Reviewer: {f.humanDisposition.replace(/_/g, " ")}{f.reviewerReason && ` — ${f.reviewerReason}`}</p>}
                  </div>
                  {!f.humanDisposition && canEdit && actorId && (
                    <OpsSelect value="" onValueChange={(v) => { if (!v) return; const reason = window.prompt("Reason (optional)") ?? null; void run(`flag:${f.id}`, () => resolveDocumentFlag(f.id, v as "accepted" | "dismissed" | "correction_requested" | "escalated", reason, actorId), "Could not resolve the flag."); }}
                      options={[{ value: "", label: "Resolve…" }, { value: "accepted", label: "Accepted (issue confirmed)" }, { value: "dismissed", label: "Dismissed (no issue)" }, { value: "correction_requested", label: "Correction requested" }, { value: "escalated", label: "Escalated" }]}
                      disabled={busy !== null} aria-label="Resolve flag" />
                  )}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {error && <p role="alert" className="text-xs text-status-danger">{error}</p>}
      <p className="text-[10px] text-muted-foreground">Accepted means acceptable for this package under the configured requirements. It is not a statement that a document is legally valid for every purpose, and it is not a credit decision.</p>
    </div>
  );
}

function UploadButton({ onFile, disabled, busy }: { onFile: (f: File) => void; disabled: boolean; busy: boolean }) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <>
      <input ref={ref} type="file" className="hidden" accept=".pdf,.png,.jpg,.jpeg,.webp" onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); e.currentTarget.value = ""; }} />
      <button type="button" onClick={() => ref.current?.click()} disabled={disabled}
        className="inline-flex items-center gap-1 rounded-lg border border-primary/40 px-2 py-1 text-[11px] font-bold text-primary hover:bg-primary/10 disabled:cursor-not-allowed disabled:opacity-60">
        {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />} Upload
      </button>
    </>
  );
}

function InstanceList({ instances, canEdit, busy, onDispose }: { instances: DocumentInstance[]; canEdit: boolean; busy: string | null; onDispose: (i: DocumentInstance, d: DocumentDisposition, reason: string | null) => Promise<void> }) {
  if (instances.length === 0) return null;
  return (
    <ul className="mt-2 space-y-1.5">
      {instances.map((i) => (
        <li key={i.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border/60 bg-card px-2.5 py-1.5">
          <div className="min-w-0">
            <p className="truncate text-xs font-semibold text-foreground">{i.fileName}</p>
            <p className="text-[10px] text-muted-foreground">
              uploaded {formatDateTime(i.createdAt)} · {i.uploadSource}{i.classifiedPeriod && ` · ${periodLabel(i.classifiedPeriod)}`}{i.reason && ` · ${i.reason}`}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className={cn("inline-flex rounded-full border px-2 py-0.5 text-[10px] font-bold", DISPOSITION_TONE[i.disposition])}>{DISPOSITION_LABELS[i.disposition]}</span>
            {canEdit && i.disposition === "pending_review" && (
              <OpsSelect value="" onValueChange={(v) => { if (!v) return; const reason = v === "accepted" ? null : window.prompt("Reason the client will read (optional)"); void onDispose(i, v as DocumentDisposition, reason); }}
                options={[{ value: "", label: "Disposition…" }, ...REVIEWER_DISPOSITIONS.map((d) => ({ value: d, label: DISPOSITION_LABELS[d] }))]}
                disabled={busy !== null} aria-label={`Disposition for ${i.fileName}`} />
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}
