/**
 * The three state axes of a funding file, moved by a person through
 * move_funding_file(): stage (17-step spine), secondary status (disposition)
 * and waiting-on. Funded is not offered here — only confirming funding sets
 * it. One audit row per axis changed.
 */
import { useState } from "react";
import { ArrowRightLeft, Loader2 } from "lucide-react";
import { OpsSelect } from "@/components/ui/ops-select";
import { errorMessage } from "@/lib/data/error-message";
import { moveFundingFile } from "@/lib/data/funding-domain";
import { useInvalidateFundingFile } from "@/lib/data/use-funding-domain";
import type { FundingFileStage, FundingSecondaryStatus, FundingWaitingOn } from "@/lib/fulfillment/fundingops-domain";
import { PIPELINE_PHASES, SECONDARY_STATUSES, WAITING_ON } from "@/lib/funding/pipeline-stages";

interface Props { fileId: string; stage: string; secondaryStatus: string; waitingOn: string; canEdit: boolean }

export function MoveFileControl({ fileId, stage, secondaryStatus, waitingOn, canEdit }: Props) {
  const invalidate = useInvalidateFundingFile();
  const [draft, setDraft] = useState({ stage, secondaryStatus, waitingOn });
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dirty = draft.stage !== stage || draft.secondaryStatus !== secondaryStatus || draft.waitingOn !== waitingOn;

  const apply = async () => {
    setBusy(true); setError(null);
    try {
      await moveFundingFile({
        fileId,
        stage: draft.stage !== stage ? (draft.stage as FundingFileStage) : undefined,
        secondary: draft.secondaryStatus !== secondaryStatus ? (draft.secondaryStatus as FundingSecondaryStatus) : undefined,
        waitingOn: draft.waitingOn !== waitingOn ? (draft.waitingOn as FundingWaitingOn) : undefined,
        note: note.trim() || undefined,
      });
      setNote(""); invalidate(fileId);
    } catch (e) { setError(errorMessage(e, "Could not move the file.")); }
    finally { setBusy(false); }
  };

  const stageOptions = PIPELINE_PHASES.flatMap((p) => p.stages.filter((s) => s.label !== "Funded").map((s) => ({ value: s.label, label: `${s.number}. ${s.label} · ${p.label}` })));
  return (
    <div className="grid gap-2 rounded-lg border border-border bg-background p-3 md:grid-cols-[1.4fr_1.2fr_1fr_1.4fr_auto] md:items-end">
      <label className="block"><span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Stage</span>
        <OpsSelect value={draft.stage} onValueChange={(v) => setDraft((d) => ({ ...d, stage: v }))} options={[...stageOptions, ...(stage === "Funded" ? [{ value: "Funded", label: "17. Funded (set by Confirm Funding)" }] : [])]} disabled={!canEdit || stage === "Funded"} aria-label="Stage" /></label>
      <label className="block"><span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Status</span>
        <OpsSelect value={draft.secondaryStatus} onValueChange={(v) => setDraft((d) => ({ ...d, secondaryStatus: v }))} options={SECONDARY_STATUSES.filter((s) => s !== "Funded" || secondaryStatus === "Funded").map((s) => ({ value: s, label: s }))} disabled={!canEdit || secondaryStatus === "Funded"} aria-label="Secondary status" /></label>
      <label className="block"><span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Waiting on</span>
        <OpsSelect value={draft.waitingOn} onValueChange={(v) => setDraft((d) => ({ ...d, waitingOn: v }))} options={WAITING_ON.map((w) => ({ value: w, label: w }))} disabled={!canEdit} aria-label="Waiting on" /></label>
      <label className="block"><span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Note (optional)</span>
        <input value={note} onChange={(e) => setNote(e.target.value)} disabled={!canEdit} className="mt-1 w-full rounded-lg border border-border bg-background px-2.5 py-1.5 text-xs text-foreground disabled:bg-muted/40 focus:outline-none focus:ring-1 focus:ring-primary" /></label>
      <button type="button" onClick={() => void apply()} disabled={!canEdit || !dirty || busy}
        className="inline-flex items-center justify-center gap-1 rounded-lg bg-primary px-3 py-1.5 text-xs font-bold text-primary-foreground hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60">
        {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ArrowRightLeft className="h-3.5 w-3.5" />} Move
      </button>
      {error && <p role="alert" className="text-xs text-status-danger md:col-span-5">{error}</p>}
    </div>
  );
}
