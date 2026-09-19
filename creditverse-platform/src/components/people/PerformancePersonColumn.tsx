/**
 * The selected person's performance summary, QA summary and recent QA
 * feedback — the right column of the Performance page. QA facts come from
 * the work items themselves (qa_result, qa_feedback, reviewer, time).
 */
import { Link } from "react-router-dom";
import { ArrowRight, CheckCircle2, ClipboardCheck, ClipboardList, Mail, MapPin, Phone, Star, TriangleAlert, XCircle } from "lucide-react";
import { Pill } from "@/components/agency/partner/partner-ui";
import { Donut } from "@/components/people/Donut";
import { Trend } from "@/components/people/PerformanceTable";
import { SCORE_KEYS, SCORE_LABEL, bandOf, type PersonScore } from "@/lib/people/performance-metrics";
import type { PerformancePolicy } from "@/lib/people/performance-policy";
import type { DateRange } from "@/lib/people/overview-metrics";
import type { AgencyMember } from "@/lib/data/agency-teams";
import type { WorkItem } from "@/lib/bes-domain";
import { formatDate } from "@/lib/format-date";
import { cn } from "@/lib/utils";

const initials = (name: string) =>
  name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? "").join("") || "?";
const pct = (n: number | null) => (n === null ? "—" : `${n}%`);
const tone = (n: number | null) =>
  n === null ? "bg-muted text-muted-foreground"
    : bandOf(n) === "needs_support" ? "bg-status-danger-tint text-status-danger"
      : bandOf(n) === "on_track" ? "bg-amber-500/10 text-amber-900" : "bg-emerald-500/10 text-emerald-800";

export function PerformancePersonColumn({ member, title, teamName, score, previous, items, period, nameOf, weighting }: {
  member: AgencyMember; title: string | null; teamName: string | null;
  score: PersonScore; previous: PersonScore; weighting: PerformancePolicy;
  /** All work items in scope; filtered here to this person and the period. */
  items: readonly WorkItem[];
  period: DateRange;
  nameOf: (userId: string) => string;
}) {
  const mine = items.filter((w) => w.assignedTo === member.userId);
  const reviewed = mine.filter((w) => w.qaReviewedAt && w.qaReviewedAt.slice(0, 10) >= period.from && w.qaReviewedAt.slice(0, 10) <= period.to
    && (w.qaResult === "passed" || w.qaResult === "needs_fix"));
  const passed = reviewed.filter((w) => w.qaResult === "passed").length;
  const needsFix = reviewed.filter((w) => w.qaResult === "needs_fix").length;
  /* Rework still owed: sent back and not yet completed again. */
  const rework = mine.filter((w) => w.qaResult === "needs_fix" && w.stage !== "Completed").length;
  const recent = mine.filter((w) => w.qaReviewedAt).sort((a, b) => (a.qaReviewedAt! < b.qaReviewedAt! ? 1 : -1)).slice(0, 3);
  const share = (n: number) => (reviewed.length === 0 ? "" : ` (${Math.round((n / reviewed.length) * 100)}%)`);
  const periodLabel = new Date(`${period.from}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", year: "numeric", timeZone: "UTC" });

  const ICONS = { quality: CheckCircle2, output: Star, compliance: ClipboardList, attendance: ClipboardCheck } as const;
  const metric = (key: (typeof SCORE_KEYS)[number]) => {
    const Icon = ICONS[key];
    const value = score[key];
    const shown = key === "output" && value === null ? `${score.delivered} done` : pct(value);
    return (
      <li key={key} className="flex items-center justify-between gap-2 text-xs">
        <span className="inline-flex items-center gap-2 text-foreground">
          <span className="flex h-6 w-6 items-center justify-center rounded-md bg-status-success/10 text-status-success"><Icon className="h-3.5 w-3.5" aria-hidden /></span>
          <span>{SCORE_LABEL[key]} <span className="text-[10px] text-muted-foreground">· {weighting.weights[key]}% weight</span></span>
        </span>
        <span className={cn("rounded-md px-2 py-0.5 text-[11px] font-bold tabular-nums", key === "output" && value === null ? "bg-muted text-muted-foreground" : tone(value))}>{shown}</span>
      </li>
    );
  };

  return (
    <aside className="space-y-3 self-start" aria-label={`${member.name} performance`}>
      <div className="rounded-2xl border border-border bg-card p-4">
        <div className="flex items-start gap-3">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-bold text-primary">{initials(member.name)}</span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-bold text-foreground">{member.name}</span>
            <span className="block truncate text-xs text-muted-foreground">{[title, teamName].filter(Boolean).join(" · ") || "No position yet"}</span>
            <span className="mt-1 inline-block"><Pill tone={member.status === "inactive" ? "border-destructive/30 bg-status-danger-tint text-status-danger" : "border-emerald-500/40 bg-emerald-500/10 text-emerald-800"}>{member.status === "inactive" ? "Inactive" : "Active"}</Pill></span>
          </span>
          <Link to={`/app/people/${member.userId}`} className="rounded-md border border-border px-2 py-1 text-[11px] font-semibold text-foreground hover:bg-muted">Edit</Link>
        </div>
        <ul className="mt-3 space-y-1.5 text-xs text-foreground">
          <li className="flex items-center gap-2 truncate"><Mail className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden /> <span className="truncate">{member.email}</span></li>
          <li className="flex items-center gap-2"><Phone className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden /> {member.phone ?? <span className="text-muted-foreground">No phone on file</span>}</li>
          <li className="flex items-center gap-2"><MapPin className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden /> <span className="text-muted-foreground">Location not recorded</span></li>
        </ul>

        <h4 className="mt-4 text-xs font-bold text-foreground">Performance Summary <span className="font-normal text-muted-foreground">({periodLabel})</span></h4>
        <div className="mt-2 flex items-center gap-3">
          <Donut size={96} centre={pct(score.overall)} caption="" segments={[
            { label: "Overall", value: score.overall ?? 0, className: "stroke-status-success" },
            { label: "Remaining", value: score.overall === null ? 1 : 100 - score.overall, className: "stroke-muted" },
          ]} />
          <span>
            <span className="block text-sm font-bold text-foreground">Overall</span>
            <Trend current={score.overall} previous={previous.overall} />
            <span className="block text-[11px] text-muted-foreground">vs last month</span>
          </span>
        </div>
        <ul className="mt-3 space-y-2">
          {(["quality", "output", "compliance", "attendance"] as const).map(metric)}
        </ul>
        {score.belowMinimum && (
          <p className="mt-2 rounded-lg bg-status-danger-tint px-2.5 py-1.5 text-[11px] font-semibold text-status-danger">
            ⚠ Below the minimum standard for Quality ({weighting.minQuality ?? "—"}%) or Compliance ({weighting.minCompliance ?? "—"}%). The overall stands; the exception is flagged.
          </p>
        )}
        {score.output === null && (
          <p className="mt-2 text-[10px] text-muted-foreground">Output shows items delivered until a target is set for this position; it is not in the overall yet.</p>
        )}
      </div>

      <div className="rounded-2xl border border-border bg-card p-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-foreground">QA Summary <span className="font-normal text-muted-foreground">({periodLabel})</span></h3>
          <Link to="/app/people/performance?tab=qa" className="inline-flex items-center gap-1 text-[11px] font-semibold text-primary hover:underline">View all <ArrowRight className="h-3 w-3" aria-hidden /></Link>
        </div>
        <ul className="mt-2 grid grid-cols-2 gap-2 text-xs">
          <li className="flex items-center gap-2"><ClipboardList className="h-4 w-4 text-muted-foreground" aria-hidden /><span><strong className="block text-foreground">{reviewed.length}</strong><span className="text-muted-foreground">Items reviewed</span></span></li>
          <li className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-status-success" aria-hidden /><span><strong className="block text-foreground">{passed}</strong><span className="text-muted-foreground">Passed{share(passed)}</span></span></li>
          <li className="flex items-center gap-2"><TriangleAlert className="h-4 w-4 text-amber-600" aria-hidden /><span><strong className="block text-foreground">{needsFix}</strong><span className="text-muted-foreground">Needs Fix{share(needsFix)}</span></span></li>
          <li className="flex items-center gap-2"><XCircle className="h-4 w-4 text-status-danger" aria-hidden /><span><strong className="block text-foreground">{rework}</strong><span className="text-muted-foreground">Required rework</span></span></li>
        </ul>
        {reviewed.length === 0 && <p className="mt-2 text-[11px] text-muted-foreground">No QA reviews recorded for {member.name.split(" ")[0]} in this period.</p>}
      </div>

      <div className="rounded-2xl border border-border bg-card p-4">
        <h3 className="text-sm font-bold text-foreground">Recent QA Feedback</h3>
        <ul className="mt-2 space-y-3 text-xs">
          {recent.length === 0 && <li className="text-muted-foreground">No QA feedback on file yet.</li>}
          {recent.map((w) => (
            <li key={w.id} className="flex items-start gap-2.5">
              <span className={cn("mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full",
                w.qaResult === "passed" ? "bg-status-success/10 text-status-success" : "bg-amber-500/10 text-amber-700")}>
                {w.qaResult === "passed" ? <CheckCircle2 className="h-3.5 w-3.5" aria-hidden /> : <TriangleAlert className="h-3.5 w-3.5" aria-hidden />}
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center justify-between gap-2">
                  <span className="truncate font-semibold text-foreground" title={w.title}>{w.title}</span>
                  <span className="shrink-0 text-[11px] text-muted-foreground">{formatDate(w.qaReviewedAt)}</span>
                </span>
                <Pill tone={w.qaResult === "passed" ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-800" : "border-amber-500/40 bg-amber-500/10 text-amber-900"}>
                  {w.qaResult === "passed" ? "Passed" : w.qaResult === "needs_fix" ? "Needs Fix" : "Pending"}
                </Pill>
                {w.qaFeedback && <span className="mt-1 block text-muted-foreground">“{w.qaFeedback}”</span>}
                {w.qaReviewedBy && <span className="block text-[11px] text-muted-foreground">— {nameOf(w.qaReviewedBy)}</span>}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </aside>
  );
}
