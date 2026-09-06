/**
 * Stipulations on one deal — what this lender asked for after seeing the file.
 *
 * A stipulation is not a file requirement. A requirement comes from a
 * versioned rule and carries `rule_id`/`rule_version`; a stipulation comes
 * from a person at a lender and carries what they said, verbatim. The
 * database keeps them apart (`deal_id` set vs null) and so does this panel.
 *
 * Every move goes through `move_document_request()`, which owns the legal
 * transitions. The buttons here offer only what that function will accept —
 * the mirror is in `stipulation-lifecycle.ts`, next to a test that says it is
 * a mirror.
 */
import { useState } from "react";
import { Loader2, Plus, ClipboardList } from "lucide-react";
import { OpsSelect } from "@/components/ui/ops-select";
import { Button } from "@/components/ui/button";
import { formatDate } from "@/lib/format-date";
import { errorMessage } from "@/lib/data/error-message";
import { documentTypeLabel } from "@/lib/funding/document-vocabulary";
import { useDealWrites } from "@/lib/data/use-funding-deal";
import {
  REQUEST_STATUS_LABEL,
  isOutstanding,
  nextStatuses,
  type RequestStatus,
} from "@/lib/funding/stipulation-lifecycle";
import type { DealDetail } from "@/lib/data/funding-domain";

const TONE: Record<RequestStatus, string> = {
  open: "border-amber-500/40 bg-amber-500/10 text-amber-800",
  assigned: "border-blue-500/30 bg-blue-500/10 text-status-info",
  waiting_on_client: "border-amber-500/40 bg-amber-500/10 text-amber-800",
  received: "border-blue-500/30 bg-blue-500/10 text-status-info",
  under_review: "border-blue-500/30 bg-blue-500/10 text-status-info",
  submitted_to_lender: "border-primary/40 bg-primary/10 text-primary",
  satisfied: "border-emerald-500/40 bg-emerald-500/10 text-status-success",
  waived: "border-border bg-muted text-muted-foreground",
};

const inputCls =
  "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary";

export function DealStipulationsPanel({ deal, canEdit }: { deal: DealDetail; canEdit: boolean }) {
  const writes = useDealWrites(deal.id, deal.fileId);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ documentType: "", lenderNote: "" });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const submitted = deal.status !== "Draft";

  const move = async (requestId: string, status: RequestStatus) => {
    setError(null);
    let note: string | undefined;
    if (status === "waived") {
      /* The database refuses a waiver with no reason. Ask for it rather than
         letting the call fail and reporting the refusal as a bug. */
      const reason = window.prompt("Why is this stipulation being waived?");
      if (!reason || !reason.trim()) return;
      note = reason.trim();
    }
    setBusy(requestId);
    try {
      await writes.moveRequest.mutateAsync({ requestId, status, note });
    } catch (e) {
      setError(errorMessage(e, "Could not move this stipulation."));
    } finally {
      setBusy(null);
    }
  };

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.documentType.trim()) {
      setError("A stipulation needs a document type.");
      return;
    }
    setError(null);
    try {
      await writes.addStipulation.mutateAsync({
        documentType: form.documentType.trim(),
        lenderNote: form.lenderNote.trim() || null,
      });
      setForm({ documentType: "", lenderNote: "" });
      setAdding(false);
    } catch (err) {
      setError(errorMessage(err, "Could not record this stipulation."));
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
          <ClipboardList className="h-3.5 w-3.5" /> What this lender asked for
        </h3>
        {canEdit && submitted && !adding && (
          <Button type="button" size="sm" variant="outline" onClick={() => setAdding(true)}>
            <Plus className="mr-1 h-3.5 w-3.5" /> Record a stipulation
          </Button>
        )}
      </div>

      {!submitted && (
        <p className="text-xs text-muted-foreground">
          This lender has been selected but not submitted to. A stipulation is something a lender asks
          for after seeing the file, so there cannot be one yet.
        </p>
      )}

      {error && <p role="alert" className="text-xs text-status-danger">{error}</p>}

      {adding && (
        <form onSubmit={(e) => void add(e)} className="space-y-2 rounded-lg border border-border bg-background p-3">
          <label className="block">
            <span className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              Document type
            </span>
            <input
              className={inputCls}
              value={form.documentType}
              onChange={(e) => setForm((f) => ({ ...f, documentType: e.target.value }))}
              placeholder="bank_statement, voided_check, tax_return…"
              autoFocus
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              What the lender said
            </span>
            <input
              className={inputCls}
              value={form.lenderNote}
              onChange={(e) => setForm((f) => ({ ...f, lenderNote: e.target.value }))}
              placeholder="Recorded verbatim — never paraphrased into the requirement"
            />
          </label>
          <div className="flex justify-end gap-2">
            <Button type="button" size="sm" variant="outline" onClick={() => { setAdding(false); setError(null); }}>
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={writes.addStipulation.isPending}>
              {writes.addStipulation.isPending && <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />} Record
            </Button>
          </div>
        </form>
      )}

      {deal.stipulations.length === 0 ? (
        submitted && <p className="text-xs text-muted-foreground">Nothing outstanding from this lender.</p>
      ) : (
        <ul className="space-y-2">
          {deal.stipulations.map((s) => {
            const options = nextStatuses(s.status);
            return (
              <li key={s.id} className="rounded-lg border border-border bg-background p-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-foreground">
                      {documentTypeLabel(s.documentType)}
                      {s.period && <span className="ml-1 font-normal text-muted-foreground">· {s.period}</span>}
                    </p>
                    {s.lenderNote && (
                      <p className="mt-0.5 text-[11px] italic text-muted-foreground">“{s.lenderNote}”</p>
                    )}
                    <p className="mt-0.5 text-[10px] text-muted-foreground">
                      Asked {formatDate(s.createdAt)}
                      {s.waivedReason ? ` · waived: ${s.waivedReason}` : ""}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-bold ${TONE[s.status]}`}>
                      {REQUEST_STATUS_LABEL[s.status]}
                    </span>
                    {canEdit && options.length > 0 && (
                      busy === s.id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
                      ) : (
                        <OpsSelect
                          value=""
                          onValueChange={(v) => void move(s.id, v as RequestStatus)}
                          options={options.map((o) => ({ value: o, label: `Move to ${REQUEST_STATUS_LABEL[o]}` }))}
                          placeholder="Move"
                          size="inline"
                          aria-label={`Move ${s.documentType}`}
                        />
                      )
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {deal.stipulations.length > 0 && (
        <p className="text-[10px] text-muted-foreground">
          {deal.stipulations.filter((s) => isOutstanding(s.status)).length} outstanding. A stipulation
          is satisfied only once it has gone to the lender and been accepted — nothing else can assert
          that.
        </p>
      )}
    </div>
  );
}
