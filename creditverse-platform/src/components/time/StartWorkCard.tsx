/**
 * "What are you working on?" — starting the clock.
 *
 * The search box narrows the SAME recent work the strip below offers; it does
 * not search the whole system. A box that finds tasks you have never tracked
 * would need a picker for division and partner anyway, so "Choose manually"
 * opens exactly that and the box stays a filter over what you actually do.
 *
 * Starting is refused while the timesheet is unavailable or in demo mode: a
 * clock-in that silently does nothing is worse than a disabled button.
 */
import { useMemo, useState } from "react";
import { ChevronDown, Play, Search, SlidersHorizontal } from "lucide-react";
import { OpsSelect } from "@/components/ui/ops-select";
import { cn } from "@/lib/utils";
import { DIVISION_LABELS, TIMER_DIVISIONS } from "@/lib/time-domain";
import type { RecentTask } from "@/lib/time/my-time-view";

const DIVISION_OPTIONS = TIMER_DIVISIONS.map((value) => ({ value, label: DIVISION_LABELS[value] }));
const NO_PARTNER = "__none";

export interface StartRequest {
  divisionId: string;
  partnerGroupId: string | null;
  taskNote?: string;
}

export function StartWorkCard({
  recent, partners, partnerNameOf, disabled, busy, onStart,
}: {
  recent: RecentTask[];
  partners: { id: string; name: string }[];
  partnerNameOf: (id: string | null) => string | null;
  disabled: boolean;
  busy: boolean;
  onStart: (r: StartRequest) => void;
}) {
  const [query, setQuery] = useState("");
  const [manual, setManual] = useState(false);
  const [division, setDivision] = useState("creditops");
  const [partner, setPartner] = useState(NO_PARTNER);
  const [note, setNote] = useState("");

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return recent;
    return recent.filter((r) =>
      [r.title, partnerNameOf(r.partnerGroupId) ?? "", DIVISION_LABELS[r.divisionId] ?? r.divisionId]
        .join(" ").toLowerCase().includes(q));
  }, [query, recent, partnerNameOf]);

  return (
    <div className="rounded-2xl border border-border bg-card p-5">
      <h2 className="text-sm font-bold text-foreground">What are you working on?</h2>

      <div className="relative mt-3">
        <Search aria-hidden className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Search your recent work"
          placeholder="Search tasks, projects, or partners…"
          className="w-full rounded-xl border border-border bg-background py-2.5 pl-9 pr-3 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
      </div>

      <p className="mt-4 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
        Quick start
      </p>
      {matches.length === 0 ? (
        <p className="mt-2 text-xs text-muted-foreground">
          {query.trim()
            ? "Nothing you have tracked matches that. Choose manually below."
            : "Nothing tracked yet — choose manually below to start your first timer."}
        </p>
      ) : (
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          {matches.map((r) => (
            <button key={r.key} type="button" disabled={disabled || busy}
              onClick={() => onStart({
                divisionId: r.divisionId,
                partnerGroupId: r.partnerGroupId,
                taskNote: r.taskNote ?? undefined,
              })}
              className="flex min-w-0 items-center gap-2 rounded-xl border border-border bg-background px-3 py-2 text-left transition-colors hover:border-emerald-500/40 hover:bg-emerald-500/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50">
              <Play aria-hidden className="h-3.5 w-3.5 shrink-0 text-status-success" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-foreground">{r.title}</span>
                <span className="block truncate text-[11px] text-muted-foreground">
                  {partnerNameOf(r.partnerGroupId) ?? "Internal"} · {DIVISION_LABELS[r.divisionId] ?? r.divisionId}
                </span>
              </span>
            </button>
          ))}
        </div>
      )}

      <button type="button" onClick={() => setManual((v) => !v)} aria-expanded={manual}
        className="mt-3 inline-flex items-center gap-1.5 rounded-lg text-xs font-semibold text-status-success underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        <SlidersHorizontal className="h-3.5 w-3.5" aria-hidden /> Choose manually
        <ChevronDown aria-hidden className={cn("h-3.5 w-3.5 transition-transform", manual && "rotate-180")} />
      </button>

      {manual && (
        <div className="mt-3 space-y-2 border-t border-border pt-3">
          <OpsSelect size="field" value={division} onValueChange={setDivision}
            options={DIVISION_OPTIONS} aria-label="Division" />
          {/* Their partners, not every partner. The list is already narrowed by
              `can_see_partner`, and the database refuses one they cannot see
              even if the value were forged. */}
          <OpsSelect size="field" value={partner} onValueChange={setPartner}
            aria-label="Partner this time is for"
            options={[
              { value: NO_PARTNER, label: partners.length > 0 ? "No partner (admin/internal)" : "No partner" },
              ...partners.map((p) => ({ value: p.id, label: p.name })),
            ]} />
          <input value={note} onChange={(e) => setNote(e.target.value)}
            aria-label="What you are working on"
            placeholder="What are you working on? (optional)"
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" />
          <button type="button" disabled={disabled || busy}
            onClick={() => onStart({
              divisionId: division,
              partnerGroupId: partner === NO_PARTNER ? null : partner,
              taskNote: note.trim() || undefined,
            })}
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-700 px-4 py-2.5 text-sm font-bold text-white transition-colors hover:bg-emerald-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60">
            <Play className="h-4 w-4" aria-hidden /> Start timer
          </button>
        </div>
      )}
    </div>
  );
}
