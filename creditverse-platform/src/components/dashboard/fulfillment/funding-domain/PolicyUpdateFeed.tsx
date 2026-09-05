/**
 * Policy-update feed: what changed on which program, when, and the files with
 * an open submission on it at the time (deterministic impact, computed from
 * rows). Acknowledging records that a person saw it; it moves no file.
 */
import { useState } from "react";
import { Link } from "react-router-dom";
import { BellRing, Check, Loader2 } from "lucide-react";
import { errorMessage } from "@/lib/data/error-message";
import { acknowledgePolicyUpdate, POLICY_CHANGE_LABEL } from "@/lib/data/lender-relationship";
import { useInvalidateLender, usePolicyUpdates } from "@/lib/data/use-lender-relationship";
import { formatDate } from "@/lib/format-date";
import { cn } from "@/lib/utils";

const KIND_TONE: Record<string, string> = { tightened: "border-amber-500/40 bg-amber-500/10 text-amber-800", paused: "border-red-500/30 bg-red-500/10 text-red-700", relaxed: "border-emerald-500/30 bg-emerald-500/10 text-emerald-700", resumed: "border-emerald-500/30 bg-emerald-500/10 text-emerald-700", clarified: "border-border bg-muted text-muted-foreground" };

export function PolicyUpdateFeed({ canAcknowledge }: { canAcknowledge: boolean }) {
  const updates = usePolicyUpdates();
  const invalidate = useInvalidateLender();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  const all = updates.data ?? [];
  const open = all.filter((u) => u.acknowledgedAt === null);
  const rows = showAll ? all : open;
  if (!updates.isLoading && all.length === 0) return null;

  const ack = async (id: string) => {
    setBusy(id); setError(null);
    try { await acknowledgePolicyUpdate(id); invalidate(); } catch (e) { setError(errorMessage(e, "Could not acknowledge the update.")); } finally { setBusy(null); }
  };

  return (
    <section className="rounded-xl border border-border bg-card p-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="inline-flex items-center gap-2 text-sm font-bold text-foreground"><BellRing className="h-4 w-4 text-primary" /> Policy updates {open.length > 0 && <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-xs font-bold text-amber-900">{open.length} unacknowledged</span>}</h2>
        <button type="button" onClick={() => setShowAll((v) => !v)} className="text-[11px] font-semibold text-primary hover:underline">{showAll ? "Show unacknowledged only" : `Show all (${all.length})`}</button>
      </div>
      {updates.isLoading && <p className="mt-2 inline-flex items-center gap-1 text-xs text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading…</p>}
      {!updates.isLoading && rows.length === 0 && <p className="mt-2 text-xs text-muted-foreground">Every policy update has been acknowledged.</p>}
      <ul className="mt-2 divide-y divide-border/60">
        {rows.map((u) => (
          <li key={u.id} className="flex flex-wrap items-start justify-between gap-2 py-2 text-xs">
            <div className="min-w-0">
              <p className="text-foreground"><span className="font-semibold">{u.lenderName}</span> · {u.programName} · <span className={cn("inline-flex rounded-full border px-2 py-0.5 text-[10px] font-bold", KIND_TONE[u.changeKind] ?? KIND_TONE.clarified)}>{POLICY_CHANGE_LABEL[u.changeKind]}</span> {u.fromVersion !== null ? `v${u.fromVersion} → ` : ""}v{u.toVersion}</p>
              <p className="mt-0.5 text-foreground">{u.summary}</p>
              <p className="text-[11px] text-muted-foreground">
                {formatDate(u.createdAt)} · {u.affectedFileIds.length === 0 ? "no open submission on this program at the time" : `${u.affectedFileIds.length} file${u.affectedFileIds.length === 1 ? "" : "s"} with an open submission: `}
                {u.affectedFileIds.slice(0, 5).map((id, i) => <Link key={id} to={`/app/funding-files/${id}`} className="font-semibold text-primary hover:underline">{i > 0 ? ", " : ""}open file {i + 1}</Link>)}
                {u.acknowledgedAt && ` · acknowledged ${formatDate(u.acknowledgedAt)}`}
              </p>
            </div>
            {u.acknowledgedAt === null && canAcknowledge && (
              <button type="button" disabled={busy !== null} onClick={() => void ack(u.id)} className="inline-flex items-center gap-1 rounded-lg border border-primary/40 px-2 py-1 text-[11px] font-bold text-primary hover:bg-primary/10 disabled:opacity-60">
                {busy === u.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />} Acknowledge
              </button>
            )}
          </li>
        ))}
      </ul>
      {error && <p role="alert" className="mt-2 text-xs text-status-danger">{error}</p>}
    </section>
  );
}
