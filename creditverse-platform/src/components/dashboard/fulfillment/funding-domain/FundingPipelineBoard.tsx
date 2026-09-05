/**
 * Pipeline view of Funding Files — the 17-stage spine grouped by phase
 * (Dee's design): a phase expands to a row of stage columns; each column holds
 * the files on that stage as cards. Same records as the list view. Dragging a
 * card onto another stage column calls move_funding_file() — the same function
 * the file page's Move control uses — so the audit row and the Funded refusal
 * are the database's, not the board's. Funded is never a drop target.
 */
import { useState, type DragEvent } from "react";
import { Link } from "react-router-dom";
import { ChevronDown, Loader2 } from "lucide-react";
import type { FundingFileStage } from "@/lib/fulfillment/fundingops-domain";
import type { FundingFile } from "@/lib/fulfillment/fundingops-domain";
import { formatCurrency } from "@/lib/fulfillment/fundingops-domain";
import { groupByPhase, type PipelinePhaseKey } from "@/lib/funding/pipeline-stages";
import { cn } from "@/lib/utils";

const PHASE_BAR: Record<PipelinePhaseKey, string> = {
  intake: "bg-blue-500", preparation: "bg-amber-500", submission: "bg-purple-500", decision: "bg-cyan-600", closing: "bg-emerald-500",
};
const COLUMN_TOP: Record<PipelinePhaseKey, string> = {
  intake: "border-t-blue-500", preparation: "border-t-amber-500", submission: "border-t-purple-500", decision: "border-t-cyan-600", closing: "border-t-emerald-500",
};

interface Props {
  files: FundingFile[];
  /** Whether this user may move stages; when false the board reads and links only. */
  canMove?: boolean;
  /** Called with the file and the target stage label after a drop; the caller performs the move and refreshes. */
  onMove?: (fileId: string, stage: FundingFileStage) => Promise<void>;
}

export function FundingPipelineBoard({ files, canMove = false, onMove }: Props) {
  const { phases, offPipeline } = groupByPhase(files);
  const [open, setOpen] = useState<Record<string, boolean>>(() => Object.fromEntries(phases.filter((p) => p.total > 0).map((p) => [p.phase.key, true])));
  const [dragging, setDragging] = useState<{ fileId: string; stage: FundingFileStage } | null>(null);
  const [overStage, setOverStage] = useState<FundingFileStage | null>(null);
  const [moving, setMoving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const interactive = canMove && !!onMove;
  const droppable = (stage: FundingFileStage) => interactive && stage !== "Funded" && dragging !== null && dragging.stage !== stage;

  const onDragStart = (e: DragEvent, f: FundingFile) => {
    if (!interactive) return;
    e.dataTransfer.setData("text/plain", f.id); e.dataTransfer.effectAllowed = "move";
    setDragging({ fileId: f.id, stage: f.stage }); setError(null);
  };
  const onDrop = async (e: DragEvent, stage: FundingFileStage) => {
    e.preventDefault();
    const fileId = e.dataTransfer.getData("text/plain") || dragging?.fileId;
    setOverStage(null); setDragging(null);
    if (!fileId || !onMove || !droppableFor(fileId, stage)) return;
    setMoving(fileId);
    try { await onMove(fileId, stage); } catch (err) { setError(err instanceof Error ? err.message : "Could not move the file."); } finally { setMoving(null); }
  };
  const droppableFor = (fileId: string, stage: FundingFileStage) => interactive && stage !== "Funded" && files.find((f) => f.id === fileId)?.stage !== stage;

  return (
    <div className="space-y-3">
      {interactive && <p className="text-[11px] text-muted-foreground">Drag a file onto another stage to move it. Funded is not a drop target — only confirming funding sets it. Secondary status and waiting-on change on the file page.</p>}
      {error && <p role="alert" className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-700">{error}</p>}
      {phases.map(({ phase, total, byStage }) => {
        const expanded = !!open[phase.key];
        return (
          <section key={phase.key} className={cn("rounded-xl border bg-card shadow-sm", expanded ? "border-primary/40" : "border-border")}>
            <button type="button" onClick={() => setOpen((o) => ({ ...o, [phase.key]: !expanded }))} aria-expanded={expanded}
              className="flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left hover:bg-muted/30 focus:outline-none focus-visible:ring-1 focus-visible:ring-primary">
              <span className={cn("h-8 w-1 rounded-full", PHASE_BAR[phase.key])} />
              <span className="flex-1">
                <span className="block text-sm font-bold uppercase tracking-wide text-foreground">{phase.label}</span>
                <span className="block text-[11px] text-muted-foreground">{phase.stages.length} stages · {total} active file{total === 1 ? "" : "s"}</span>
              </span>
              <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-bold text-foreground">{total}</span>
              <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform", expanded && "rotate-180")} />
            </button>
            {expanded && (
              <div className="overflow-x-auto border-t border-border/60 p-3">
                <ol className="flex min-w-max gap-3">
                  {phase.stages.map((s) => {
                    const rows = byStage.get(s.number) ?? [];
                    return (
                      <li key={s.number}
                        onDragOver={(e) => { if (droppable(s.label)) { e.preventDefault(); e.dataTransfer.dropEffect = "move"; if (overStage !== s.label) setOverStage(s.label); } }}
                        onDragLeave={() => { if (overStage === s.label) setOverStage(null); }}
                        onDrop={(e) => void onDrop(e, s.label)}
                        className={cn("flex w-56 shrink-0 flex-col rounded-xl border border-t-4 bg-muted/30 transition-colors", COLUMN_TOP[phase.key],
                          overStage === s.label && droppable(s.label) ? "border-primary bg-primary/5" : "border-border",
                          dragging && s.label === "Funded" && "opacity-60")}>
                        <div className="flex items-start justify-between gap-2 px-3 pt-2.5">
                          <p className="text-sm font-bold leading-tight text-foreground"><span className="mr-1 font-mono text-[10px] text-muted-foreground">{s.number}.</span>{s.label}</p>
                          <span className="rounded-full bg-card px-2 py-0.5 text-[11px] font-bold text-foreground shadow-sm">{rows.length}</span>
                        </div>
                        <div className="flex flex-1 flex-col gap-2 p-2.5">
                          {rows.length === 0 && (
                            <p className="flex flex-1 items-center justify-center rounded-lg border border-dashed border-border/70 px-2 py-6 text-center text-[11px] text-muted-foreground">No files on this stage</p>
                          )}
                          {rows.map((f) => (
                            <Link key={f.id} to={`/app/funding-files/${f.id}`} draggable={interactive} onDragStart={(e) => onDragStart(e, f)} onDragEnd={() => { setDragging(null); setOverStage(null); }}
                              aria-grabbed={dragging?.fileId === f.id || undefined}
                              className={cn("block rounded-lg border border-border bg-card p-3 text-xs shadow-sm transition-colors hover:border-primary/40 hover:bg-primary/5 focus:outline-none focus-visible:ring-1 focus-visible:ring-primary",
                                interactive && "cursor-grab active:cursor-grabbing", dragging?.fileId === f.id && "opacity-50", moving === f.id && "pointer-events-none opacity-60")}>
                              <p className="flex items-center gap-1 truncate text-sm font-bold text-foreground">{moving === f.id && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}{f.clientName ?? f.businessName}</p>
                              {f.clientName && <p className="truncate text-[11px] text-foreground">{f.businessName}</p>}
                              <p className="truncate text-[11px] text-muted-foreground">{f.purpose}{f.publicId && <span className="ml-1 font-mono text-[10px]">{f.publicId}</span>}</p>
                              <div className="mt-2 flex items-center justify-between gap-2">
                                <span className="text-[11px] text-muted-foreground">{f.dealCount} submission{f.dealCount === 1 ? "" : "s"}</span>
                                <span className="text-sm font-bold text-foreground">{formatCurrency(f.requestedAmount)}</span>
                              </div>
                              <div className="mt-1.5 flex items-center justify-between gap-2 text-[11px]">
                                <span className="truncate text-muted-foreground">{f.assignedAgent ?? "Unassigned"}</span>
                                <span className="text-muted-foreground">{f.lastActivity}</span>
                              </div>
                            </Link>
                          ))}
                        </div>
                      </li>
                    );
                  })}
                </ol>
              </div>
            )}
          </section>
        );
      })}

      <section className="rounded-xl border border-border bg-card p-4 shadow-sm">
        <h3 className="text-sm font-bold text-foreground">Off-pipeline files</h3>
        <p className="text-[11px] text-muted-foreground">Dispositions that leave the active flow — a separate axis from the stage (Not Funding Ready, No Current Program Fit, Lender Declined, Withdrawn, Closed …).</p>
        {offPipeline.length === 0 ? <p className="mt-2 text-xs text-muted-foreground">None.</p> : (
          <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {offPipeline.map((f) => (
              <Link key={f.id} to={`/app/funding-files/${f.id}`} className="flex items-center justify-between gap-2 rounded-lg border border-border bg-background px-3 py-2 text-xs hover:border-primary/40">
                <span><span className="block font-semibold text-foreground">{f.clientName ?? f.businessName}</span><span className="text-muted-foreground">{f.clientName ? `${f.businessName} · ` : ""}{f.secondaryStatus}</span></span>
                <span className="font-bold text-foreground">{formatCurrency(f.requestedAmount)}</span>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
