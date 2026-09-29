/**
 * The EOD report, drawn from the canonical document.
 *
 * Dee, 2026-09-29, with the Team Lead report as the reference: date, lead,
 * a table of the people under them with production columns "dynamic based
 * on the department/team", total output and notes; then the summary grouped
 * by work type; then OVERALL TOTAL. The same shape at department, division
 * and organization level, where the rows are the units one level down, with
 * drill-down.
 *
 * ── THIS COMPONENT COMPUTES NOTHING ──────────────────────────────────────
 *
 * Every number on screen is read from the document `eod_report()` built —
 * the same document the email was rendered from. The columns are whatever
 * `doc.categories` says; the word "Complaints" does not appear in this file.
 * If a figure looks wrong here it is wrong in the database, and that is
 * where to look.
 *
 * ── AND IT COSTS ONE ROW FETCH ───────────────────────────────────────────
 *
 * For a lead who has filed, the document comes off their submission row.
 * Children are embedded, so expanding a team inside a department opens data
 * already in hand — no request. Nothing here runs on a CreditOps screen.
 */
import { useState } from "react";
import { ChevronDown, ChevronRight, CircleAlert, Loader2, Send } from "lucide-react";
import { ContentCard } from "@/components/dashboard/DivisionLayout";
import { formatDate } from "@/lib/format-date";
import { cn } from "@/lib/utils";
import {
  useEodReportsRoutedToMe,
  useMyEodReport,
  type EodReportDoc,
  type EodReportLevel,
} from "@/lib/data/use-eod-report";

const TITLE: Record<EodReportLevel, string> = {
  team: "Team Lead EOD Report",
  department: "Department EOD Report",
  division: "Division EOD Report",
  agency: "Organization EOD Report",
};
const LEAD_TITLE: Record<EodReportLevel, string> = {
  team: "Team Lead", department: "Department Lead", division: "Division Lead", agency: "Management",
};
const ROW_WORD: Record<EodReportLevel, string> = {
  team: "Agent", department: "Team", division: "Department", agency: "Division",
};

const n = (v: unknown) => (typeof v === "number" ? v : Number(v ?? 0)) || 0;

/**
 * Which category columns to draw. A team report shows every category for its
 * service, zeros included, the way Dee's reference does. Above team level the
 * organization can span twelve categories, so only the ones with any output
 * that day are drawn — an empty column at agency level is a question, not
 * information.
 */
const visibleCategories = (doc: EodReportDoc) =>
  doc.categories.filter((c) => doc.level === "team" || n(doc.totals.categories[c.key]) > 0);

/** Pure. Exported so the test can render a fixture document without auth. */
export function EodReportView({ doc, depth = 0 }: { doc: EodReportDoc; depth?: number }) {
  const cats = visibleCategories(doc);
  const rowWord = ROW_WORD[doc.level];
  const [open, setOpen] = useState<Set<string>>(() => new Set());
  const toggle = (id: string) =>
    setOpen((s) => { const next = new Set(s); if (next.has(id)) next.delete(id); else next.add(id); return next; });

  return (
    <div className={cn("space-y-4", depth > 0 && "border-l-2 border-border pl-3")}>
      {/* ── The table ─────────────────────────────────────────────────── */}
      <div className="-mx-1 overflow-x-auto">
        <table className="w-full min-w-[640px] text-xs" aria-label={`${rowWord} submissions`}>
          <thead>
            <tr className="border-b border-border text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              <th className="sticky left-0 bg-card px-2 py-2">{rowWord}</th>
              <th className="px-2 py-2">{doc.level === "team" ? "Role" : "Members"}</th>
              <th className="px-2 py-2">{doc.level === "team" ? "Status" : "Submitted"}</th>
              {cats.map((c) => <th key={c.key} className="px-2 py-2 text-right">{c.label}</th>)}
              <th className="px-2 py-2 text-right">Total</th>
              {doc.level === "team" && <th className="px-2 py-2">Notes</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-border/60">
            {doc.rows.map((r) => (
              <tr key={r.id} className="text-foreground">
                <td className="sticky left-0 bg-card px-2 py-2 font-medium">{r.name}</td>
                <td className="px-2 py-2 text-muted-foreground">
                  {doc.level === "team" ? (r.role ?? "—") : n(r.members)}
                </td>
                <td className="px-2 py-2">
                  {doc.level === "team" ? (
                    <span className={cn("rounded-full border px-2 py-0.5 text-[10px] font-bold",
                      r.submitted
                        ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700"
                        : "border-amber-500/40 bg-amber-500/10 text-amber-700")}>
                      {r.submitted ? (r.auto_submitted ? "Auto-submitted" : "Submitted") : "Pending"}
                    </span>
                  ) : `${n(r.submitted)} / ${n(r.members)}`}
                </td>
                {cats.map((c) => (
                  <td key={c.key} className="px-2 py-2 text-right tabular-nums">{n(r.categories[c.key])}</td>
                ))}
                <td className="px-2 py-2 text-right font-semibold tabular-nums">{n(r.total)}</td>
                {doc.level === "team" && (
                  <td className="max-w-[16rem] truncate px-2 py-2 text-muted-foreground"
                    title={[r.notes, r.blockers].filter(Boolean).join(" · ") || undefined}>
                    {r.blockers ? <span className="text-amber-700">Blocker: {r.blockers}</span> : (r.notes ?? "—")}
                  </td>
                )}
              </tr>
            ))}
            {doc.rows.length === 0 && (
              <tr><td colSpan={5 + cats.length} className="px-2 py-6 text-center text-muted-foreground">
                Nobody in this scope.
              </td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* ── Summary by work type, and the overall total ──────────────── */}
      <div className="grid gap-4 lg:grid-cols-[1fr_16rem]">
        <div>
          <p className="text-sm font-semibold text-foreground">
            EOD Summary <span className="text-xs font-normal text-muted-foreground">(from production records)</span>
          </p>
          {doc.groups.length === 0 ? (
            <p className="mt-1 text-xs text-muted-foreground">No completed production recorded for this day.</p>
          ) : (
            <div className="mt-2 grid gap-3 sm:grid-cols-2">
              {doc.groups.map((g) => (
                <div key={g.key}>
                  <p className="text-xs font-semibold text-foreground">{g.label}</p>
                  <ul className="mt-1 space-y-0.5 text-xs text-foreground">
                    {g.lines.map((l) => (
                      <li key={l.name}>• {l.name} completed {n(l.units)} {g.label}</li>
                    ))}
                    <li className="font-semibold">Total {g.label} Output: {n(g.total)}</li>
                  </ul>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-3">
          <p className="text-sm font-semibold text-foreground">Overall Total</p>
          <ul className="mt-2 space-y-1 text-xs text-foreground">
            {doc.categories.map((c) => (
              <li key={c.key} className="flex justify-between">
                <span>{c.label}</span><span className="font-semibold tabular-nums">{n(doc.totals.categories[c.key])}</span>
              </li>
            ))}
            <li className="mt-1 flex justify-between border-t border-emerald-500/30 pt-1 font-bold">
              <span>Total {doc.level === "team" ? "Team" : ""} Output</span>
              <span className="tabular-nums">{n(doc.totals.total)}</span>
            </li>
            <li className="text-muted-foreground">
              {n(doc.totals.submitted)} of {n(doc.totals.members)} submitted
            </li>
          </ul>
        </div>
      </div>

      {/* ── Attention ────────────────────────────────────────────────── */}
      {doc.attention.length > 0 && (
        <div className="rounded-xl border border-amber-500/40 bg-amber-500/5 p-3">
          <p className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
            <CircleAlert className="h-4 w-4 text-amber-600" aria-hidden /> Blockers / attention needed
          </p>
          <ul className="mt-1 space-y-0.5 text-xs text-foreground">
            {doc.attention.map((a, i) => (
              <li key={`${a.name}-${i}`}>
                <span className="font-medium">{a.name}</span>
                {a.unit && <span className="text-muted-foreground"> ({a.unit})</span>}
                <span className="text-muted-foreground">: {[a.blockers, a.help_needed].filter(Boolean).join(" · ")}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* ── Drill-down: the level below, already in hand ─────────────── */}
      {doc.children.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {/* The children ARE this document's rows, one level down: an
                organization's are divisions, a division's are departments. */}
            {ROW_WORD[doc.level]} reports
          </p>
          {doc.children.map((child) => {
            const isOpen = open.has(child.scope.id);
            return (
              <div key={child.scope.id} className="rounded-lg border border-border">
                <button type="button" aria-expanded={isOpen} onClick={() => toggle(child.scope.id)}
                  className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-muted focus-visible:bg-muted focus-visible:outline-none">
                  <span className="flex items-center gap-1.5 font-medium text-foreground">
                    {isOpen ? <ChevronDown className="h-4 w-4" aria-hidden /> : <ChevronRight className="h-4 w-4" aria-hidden />}
                    {child.scope.name}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    Total {n(child.totals.total)} · {n(child.totals.submitted)}/{n(child.totals.members)} submitted
                  </span>
                </button>
                {isOpen && <div className="px-3 pb-3"><EodReportView doc={child} depth={depth + 1} /></div>}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/**
 * The header line every document shares: the day, who leads the scope, and
 * where the submission goes.
 */
function DocMeta({ doc, toName, stored, error }: {
  doc: EodReportDoc; toName: string | null; stored: boolean; error: string | null;
}) {
  return (
    <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
      <span>{formatDate(doc.work_date)}</span>
      <span>{LEAD_TITLE[doc.level]}: <span className="text-foreground">{doc.lead.name ?? "Not assigned"}</span></span>
      <span className="flex items-center gap-1">
        <Send className="h-3 w-3" aria-hidden />
        {doc.level === "agency"
          ? <>Top of the ladder — nobody above</>
          : toName
            ? <>Goes to <span className="text-foreground">{toName}</span></>
            : <>Nobody is one rung up — goes to BES Support</>}
      </span>
      {error && (
        <span className="text-amber-700">The stored copy failed to build ({error}); showing nothing rather than a guess.</span>
      )}
      {!stored && (
        <span className="flex items-center gap-1"><Loader2 className="h-3 w-3" aria-hidden /> Updates as work is completed; frozen when you submit.</span>
      )}
    </div>
  );
}

const StoredBadge = ({ stored }: { stored: boolean }) => (
  <span className={cn("rounded-full border px-2 py-0.5 text-[10px] font-bold",
    stored
      ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700"
      : "border-border bg-muted text-muted-foreground")}>
    {stored ? "Submitted" : "Live preview"}
  </span>
);

/**
 * The cards on the Team EOD page: this person's own rollup for the day, one
 * card per scope they lead. Rowell, seated on two divisions, sees two —
 * neither is dropped for being the older seat (Dee, 2026-09-30). Renders
 * nothing at all for somebody who leads nothing (rule 3): there is no report
 * to show, and an empty card would be a question.
 */
export function EodReportCard({ date }: { date: string }) {
  const q = useMyEodReport(date);

  if (q.isLoading) {
    return (
      <ContentCard title="EOD Report">
        <div className="space-y-2" aria-busy="true" aria-label="Loading the report">
          {[0, 1, 2].map((i) => <div key={i} className="h-8 animate-pulse rounded bg-muted" />)}
        </div>
      </ContentCard>
    );
  }
  if (q.isError) {
    return (
      <ContentCard title="EOD Report">
        <p className="text-sm text-status-danger">The report could not be loaded. {String((q.error as Error)?.message ?? "")}</p>
      </ContentCard>
    );
  }
  const r = q.data;
  if (!r || r.docs.length === 0) {
    /* A lead whose stored build failed has a submission and no document:
       say so, rather than showing nothing and letting them assume it went. */
    if (r?.error && r.level) {
      return (
        <ContentCard title="EOD Report">
          <p className="text-sm text-amber-700">Your submission went through, but its report failed to build: {r.error}</p>
        </ContentCard>
      );
    }
    return null;
  }

  return (
    <>
      {r.docs.map((doc) => (
        <ContentCard key={doc.scope.id} title={`${TITLE[doc.level]} — ${doc.scope.name}`}
          action={<StoredBadge stored={r.stored} />}>
          <DocMeta doc={doc} toName={r.routing.toName} stored={r.stored} error={r.error} />
          <EodReportView doc={doc} />
        </ContentCard>
      ))}
    </>
  );
}

/**
 * Reports filed TO this person — the department reports a division manager
 * receives, the division reports an executive receives — exactly as stored,
 * which is exactly what the email carried. Dee, 2026-09-30: "Executives should
 * receive the division-level EOD reports submitted/escalated by the Division
 * Leads, rather than simply receiving a flat dump."
 *
 * Renders nothing when nothing was addressed to them today: the absence of
 * a report is already counted on the page as "Missing EOD".
 */
export function EodRoutedReportsCard({ date }: { date: string }) {
  const q = useEodReportsRoutedToMe(date);
  const rows = q.data ?? [];
  if (q.isLoading || q.isError || rows.length === 0) return null;
  return (
    <>
      {rows.flatMap((row) => row.docs.map((doc) => (
        <ContentCard key={`${row.eodId}-${doc.scope.id}`}
          title={`${TITLE[doc.level]} — ${doc.scope.name}`}
          action={
            <span className="text-[11px] text-muted-foreground">
              Submitted by <span className="font-medium text-foreground">{row.employeeName}</span> · {formatDate(row.submittedAt)}
            </span>
          }>
          <EodReportView doc={doc} />
        </ContentCard>
      )))}
    </>
  );
}
