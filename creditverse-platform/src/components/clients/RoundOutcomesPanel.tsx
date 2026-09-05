/**
 * Manual round outcomes — for clients worked in an outside CRM (DisputeFox,
 * CRC, CDM) the person records what each bureau did per round; the report
 * shows them as manually entered, apart from engine-derived letters. Writers
 * are the client's writers, recorded as themselves (policy).
 */
import { useState } from "react";
import { ClipboardCheck, Loader2, Plus } from "lucide-react";
import { OpsSelect } from "@/components/ui/ops-select";
import { useAuth } from "@/lib/auth/auth-context";
import { errorMessage } from "@/lib/data/error-message";
import { recordRoundOutcome } from "@/lib/data/reporting-engine";
import { useInvalidateReporting, useRoundOutcomes } from "@/lib/data/use-reporting-engine";
import { formatDate } from "@/lib/format-date";

const BUREAU: Record<string, string> = { EQ: "Equifax", EX: "Experian", TU: "TransUnion" };
const inputCls = "w-full rounded-lg border border-border bg-background px-2 py-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary";
const labelCls = "mb-0.5 block text-[10px] font-bold uppercase tracking-wider text-muted-foreground";

export function RoundOutcomesPanel({ clientId }: { clientId: string }) {
  const auth = useAuth();
  const outcomes = useRoundOutcomes(clientId);
  const invalidate = useInvalidateReporting();
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [f, setF] = useState({ round: "1", bureau: "EQ", disputed: "", deleted: "", updated: "", verified: "", date: new Date().toISOString().slice(0, 10), note: "" });
  if (auth.mode !== "live") return null;

  const submit = async () => {
    if (!auth.user) return;
    setBusy(true); setError(null);
    try {
      await recordRoundOutcome({ clientId, roundNumber: Number(f.round), bureau: f.bureau, itemsDisputed: Number(f.disputed || 0), deleted: Number(f.deleted || 0), updated: Number(f.updated || 0), verified: Number(f.verified || 0), outcomeDate: f.date, note: f.note.trim() || null, actorId: auth.user.id });
      invalidate(undefined, clientId); setAdding(false); setF((x) => ({ ...x, disputed: "", deleted: "", updated: "", verified: "", note: "" }));
    } catch (e) { setError(errorMessage(e, "Could not record the outcome.")); } finally { setBusy(false); }
  };

  return (
    <section className="rounded-xl border border-border bg-card p-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-foreground"><ClipboardCheck className="h-4 w-4 text-primary" /> Round outcomes (manual)</h3>
          <p className="text-[11px] text-muted-foreground">For clients worked in an outside CRM: what each bureau did per round, as recorded by your team. Reports show these apart from engine-derived letters.</p>
        </div>
        {!adding && <button type="button" onClick={() => setAdding(true)} className="inline-flex items-center gap-1 rounded-lg border border-primary/40 px-2.5 py-1.5 text-xs font-bold text-primary hover:bg-primary/10"><Plus className="h-3.5 w-3.5" /> Record outcome</button>}
      </div>
      {adding && (
        <form className="mt-3 grid gap-2 rounded-lg border border-border bg-background p-3 sm:grid-cols-4" onSubmit={(e) => { e.preventDefault(); void submit(); }}>
          <label className="block"><span className={labelCls}>Round</span><input type="number" min="1" value={f.round} onChange={(e) => setF((x) => ({ ...x, round: e.target.value }))} className={inputCls} required /></label>
          <label className="block"><span className={labelCls}>Bureau</span><OpsSelect value={f.bureau} onValueChange={(v) => setF((x) => ({ ...x, bureau: v }))} options={Object.entries(BUREAU).map(([value, label]) => ({ value, label }))} aria-label="Bureau" /></label>
          <label className="block"><span className={labelCls}>Outcome date</span><input type="date" value={f.date} onChange={(e) => setF((x) => ({ ...x, date: e.target.value }))} className={inputCls} required /></label>
          <label className="block"><span className={labelCls}>Items disputed</span><input type="number" min="0" value={f.disputed} onChange={(e) => setF((x) => ({ ...x, disputed: e.target.value }))} className={inputCls} /></label>
          <label className="block"><span className={labelCls}>Deleted</span><input type="number" min="0" value={f.deleted} onChange={(e) => setF((x) => ({ ...x, deleted: e.target.value }))} className={inputCls} /></label>
          <label className="block"><span className={labelCls}>Updated</span><input type="number" min="0" value={f.updated} onChange={(e) => setF((x) => ({ ...x, updated: e.target.value }))} className={inputCls} /></label>
          <label className="block"><span className={labelCls}>Verified</span><input type="number" min="0" value={f.verified} onChange={(e) => setF((x) => ({ ...x, verified: e.target.value }))} className={inputCls} /></label>
          <label className="block sm:col-span-4"><span className={labelCls}>Note</span><input value={f.note} onChange={(e) => setF((x) => ({ ...x, note: e.target.value }))} placeholder="Source CRM, reference, anything a reviewer should know" className={inputCls} /></label>
          <div className="flex items-center gap-2 sm:col-span-4">
            <button type="submit" disabled={busy} className="inline-flex items-center gap-1 rounded-lg bg-primary px-3 py-1.5 text-xs font-bold text-primary-foreground hover:bg-primary/90 disabled:opacity-60">{busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />} Save</button>
            <button type="button" onClick={() => setAdding(false)} className="text-xs font-semibold text-muted-foreground hover:underline">Cancel</button>
          </div>
        </form>
      )}
      {outcomes.isLoading && <p className="mt-2 inline-flex items-center gap-1 text-xs text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading…</p>}
      {!outcomes.isLoading && (outcomes.data ?? []).length === 0 && !adding && <p className="mt-2 text-xs text-muted-foreground">No manual outcomes recorded. Letters worked in this platform report their outcomes automatically.</p>}
      {(outcomes.data ?? []).length > 0 && (
        <table className="mt-3 w-full text-left text-xs">
          <thead className="text-[10px] uppercase tracking-wider text-muted-foreground"><tr><th className="py-1 pr-3 font-bold">Round</th><th className="py-1 pr-3 font-bold">Bureau</th><th className="py-1 pr-3 text-right font-bold">Disputed</th><th className="py-1 pr-3 text-right font-bold">Deleted</th><th className="py-1 pr-3 text-right font-bold">Updated</th><th className="py-1 pr-3 text-right font-bold">Verified</th><th className="py-1 pr-3 font-bold">Date</th><th className="py-1 font-bold">Source</th></tr></thead>
          <tbody>
            {(outcomes.data ?? []).map((o) => (
              <tr key={o.id} className="border-t border-border/60"><td className="py-1.5 pr-3 font-semibold text-foreground">Round {o.roundNumber}</td><td className="py-1.5 pr-3 text-foreground">{BUREAU[o.bureau] ?? o.bureau}</td><td className="py-1.5 pr-3 text-right text-foreground">{o.itemsDisputed}</td><td className="py-1.5 pr-3 text-right font-semibold text-foreground">{o.deleted}</td><td className="py-1.5 pr-3 text-right text-foreground">{o.updated}</td><td className="py-1.5 pr-3 text-right text-foreground">{o.verified}</td><td className="py-1.5 pr-3 text-muted-foreground">{formatDate(o.outcomeDate)}</td><td className="py-1.5"><span className="rounded-full border border-border bg-muted px-1.5 py-0.5 text-[10px] font-bold text-muted-foreground">Manual</span>{o.note && <span className="ml-1 text-[10px] text-muted-foreground">{o.note}</span>}</td></tr>
            ))}
          </tbody>
        </table>
      )}
      {error && <p role="alert" className="mt-2 text-xs text-status-danger">{error}</p>}
    </section>
  );
}
