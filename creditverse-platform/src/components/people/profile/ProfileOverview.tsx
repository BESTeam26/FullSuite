/**
 * The Agent Profile → Overview, to Dee's mockup (2026-09-19).
 *
 * Every figure is a canonical record or a derivation of one, by the same
 * engine the Performance page uses. Where the mockup shows a thing this
 * platform does not record yet — scorecard workmanship, deletion results,
 * sampling — the card says exactly that instead of a number, because the
 * CreditOps QA build (approved, next) is what fills it. Nothing here is
 * seeded, sampled or invented.
 */
import { Link } from "react-router-dom";
import {
  ArrowRight, BarChart3, CalendarCheck, CheckCircle2, ClipboardCheck, ClipboardList, FileText, Info,
  MessageSquareText, Star, Target, TriangleAlert, UserRound,
} from "lucide-react";
import { Pill } from "@/components/agency/partner/partner-ui";
import { Donut } from "@/components/people/Donut";
import { Trend } from "@/components/people/PerformanceTable";
import { GoalsCard } from "@/components/people/profile/GoalsCard";
import { initialsOf } from "@/components/people/profile/ProfileHeader";
import { usePersonPerformance } from "@/lib/people/use-person-performance";
import { useProductionMarks } from "@/lib/data/use-production-marks";
import { useMemberDocuments } from "@/lib/data/member-documents";
import { useAvatarUrls } from "@/lib/data/use-account";
import { periodProduction, periodWorkStats } from "@/lib/people/profile-period";
import { bandOf, SCORE_LABEL, type PersonScore, type ScoreKey } from "@/lib/people/performance-metrics";
import { qualityScore } from "@/lib/people/overview-metrics";
import { formatDate } from "@/lib/format-date";
import type { AgencyMember } from "@/lib/data/agency-teams";
import { cn } from "@/lib/utils";

const pct = (n: number | null) => (n === null ? "—" : `${n.toFixed(1).replace(/\.0$/, "")}%`);
const BAND_LABEL: Record<ReturnType<typeof bandOf>, string> = {
  outstanding: "Outstanding", strong: "Strong Performance", on_track: "On Track", needs_support: "Needs Support",
};
const QA_GRADE = (n: number) => n >= 95 ? "Exceptional" : n >= 90 ? "Strong" : n >= 85 ? "Meets Standard" : n >= 80 ? "Coaching Needed" : n >= 70 ? "Improvement Required" : "Critical Improvement";

export function ProfileOverview({ member, lead, nameOf, canEditGoals, onOpenTab }: {
  member: AgencyMember;
  lead: { userId: string; name: string; title: string | null; avatarPath: string | null } | null;
  nameOf: (id: string) => string;
  canEditGoals: boolean;
  onOpenTab: (tab: string) => void;
}) {
  const perf = usePersonPerformance(member.userId);
  const { score, previous, weighting, range, today, items } = perf;
  const marks = useProductionMarks(member.userId, range.from, range.to);
  const docs = useMemberDocuments(member.userId, true);
  const leadAvatar = useAvatarUrls([lead?.avatarPath]);
  const work = periodWorkStats(items, member.userId, range, today);
  const prod = periodProduction(marks.data ?? [], range);
  const quality = qualityScore(items, member.userId, range);
  const mine = items.filter((w) => w.assignedTo === member.userId);
  const reviewed = mine.filter((w) => w.qaReviewedAt).sort((a, b) => (a.qaReviewedAt! < b.qaReviewedAt! ? 1 : -1));
  const reviewedThisMonth = reviewed.filter((w) => w.qaReviewedAt!.slice(0, 10) >= range.from);
  const feedback = reviewed.filter((w) => w.qaFeedback).slice(0, 3);
  const training = (docs.data ?? []).filter((d) => d.kind === "training").slice(0, 3);
  const periodLabel = new Date(`${range.from}T12:00:00Z`).toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });

  const tile = (key: ScoreKey | "overall", icon: React.ElementType, tone: string) => {
    const Icon = icon;
    const value = score ? score[key] : null;
    const prev = previous ? previous[key] : null;
    const label = key === "overall" ? "Overall Performance" : `${SCORE_LABEL[key]} (${weighting.weights[key]}%)`;
    const sub = key === "output" && value === null ? `${score?.delivered ?? 0} items delivered · no target yet`
      : value === null ? "No data this month" : key === "overall" ? BAND_LABEL[bandOf(value)] : key === "quality" ? QA_GRADE(value) : BAND_LABEL[bandOf(value)];
    const flagged = score?.belowMinimum && ((key === "quality" && value !== null && weighting.minQuality !== null && value < weighting.minQuality)
      || (key === "compliance" && value !== null && weighting.minCompliance !== null && value < weighting.minCompliance));
    return (
      <div key={key} className="rounded-2xl border border-border bg-card px-4 py-3">
        <div className="flex items-center gap-2">
          <span className={cn("flex h-8 w-8 items-center justify-center rounded-lg", tone)}><Icon className="h-4 w-4" aria-hidden /></span>
          <span className="text-[11px] font-semibold text-foreground">{label}</span>
        </div>
        <p className="mt-2 text-2xl font-extrabold leading-none tabular-nums text-foreground">{pct(value)}</p>
        <p className={cn("mt-1 text-[11px] font-medium", flagged ? "text-status-danger" : "text-muted-foreground")}>{flagged ? "⚠ Below Standard" : sub}</p>
        <p className="mt-1 text-[11px]"><Trend current={value} previous={prev} /> <span className="text-muted-foreground">vs. last month</span></p>
      </div>
    );
  };

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        {tile("overall", UserRound, "bg-blue-500/10 text-blue-700")}
        {tile("quality", Star, "bg-emerald-500/10 text-emerald-700")}
        {tile("output", BarChart3, "bg-emerald-500/10 text-emerald-700")}
        {tile("compliance", ClipboardCheck, "bg-emerald-500/10 text-emerald-700")}
        {tile("attendance", CalendarCheck, "bg-blue-500/10 text-blue-700")}
      </div>

      <div className="grid gap-3 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,1.3fr)_minmax(0,0.9fr)]">
        {/* Quality breakdown — today's QA verdicts; the 70/30 scorecard blend arrives with the CreditOps QA build. */}
        <Card title="Quality Breakdown" badge={score?.quality !== null && score?.quality !== undefined ? QA_GRADE(score.quality) : undefined}>
          <div className="flex items-center gap-4">
            <Donut size={112} centre={pct(score?.quality ?? null)} caption="Quality" segments={[
              { label: "Quality", value: score?.quality ?? 0, className: "stroke-status-success" },
              { label: "Rest", value: score?.quality === null || score?.quality === undefined ? 1 : 100 - score.quality, className: "stroke-muted" },
            ]} />
            <ul className="space-y-2 text-xs">
              <li className="rounded-lg border border-border px-3 py-2">
                <span className="flex items-center justify-between gap-3"><span className="text-muted-foreground">QA Workmanship</span><strong className="text-foreground">Pending</strong></span>
                <span className="block text-[10px] text-muted-foreground">Scorecard reviews arrive with the CreditOps QA build</span>
              </li>
              <li className="rounded-lg border border-border px-3 py-2">
                <span className="flex items-center justify-between gap-3"><span className="text-muted-foreground">Deletion Rate</span><strong className="text-foreground">Pending</strong></span>
                <span className="block text-[10px] text-muted-foreground">No resulted rounds attributed yet</span>
              </li>
            </ul>
          </div>
          <p className="mt-3 inline-flex items-center gap-1 rounded-lg bg-muted/50 px-2.5 py-1.5 text-[10px] text-muted-foreground">
            <Info className="h-3 w-3" aria-hidden /> Today: QA passed ÷ reviewed ({quality.reviewed} reviewed). Final Quality = (Workmanship × 70%) + (Deletion Rate × 30%) once scorecards are live.
          </p>
        </Card>

        <Card title="Dispute Results" sub="(All Resulted Work)">
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
            {[["Items Disputed", "—"], ["Deleted", "—"], ["Corrected", "—"], ["Partial", "—"], ["Remain", "—"], ["Pending", "—"]].map(([l, v]) => (
              <div key={l} className="rounded-lg bg-muted/40 px-2 py-2 text-center"><span className="block text-lg font-extrabold text-foreground">{v}</span><span className="block text-[10px] text-muted-foreground">{l}</span></div>
            ))}
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            No dispute rounds are attributed to {member.preferredName || member.name.split(" ")[0]} yet. Round results and contributor
            attribution are part of the approved CreditOps QA build; Deletion Rate and Positive Outcome Rate will show here with their denominators.
          </p>
        </Card>

        <Card title="Current Period" sub={periodLabel}>
          <ul className="divide-y divide-border/60 text-xs">
            {[
              ["Files Completed", String(prod.files)], ["Rounds Completed", String(prod.rounds)],
              ["On-Time Completion", work.onTimePct === null ? "—" : `${work.onTimePct}%`],
              ["Overdue Files", String(work.overdue)], ["Current Backlog", String(work.backlog)],
              ["QA Reviews (Completed)", String(reviewedThisMonth.length)],
            ].map(([l, v]) => (
              <li key={l} className="flex items-center justify-between py-1.5"><span className="text-muted-foreground">{l}</span><strong className="tabular-nums text-foreground">{v}</strong></li>
            ))}
          </ul>
          <button type="button" onClick={() => onOpenTab("production")} className="mt-2 inline-flex items-center gap-1 text-[11px] font-semibold text-primary hover:underline">
            View Production Details <ArrowRight className="h-3 w-3" aria-hidden />
          </button>
        </Card>
      </div>

      <div className="grid gap-3 xl:grid-cols-[minmax(0,2fr)_minmax(0,0.9fr)]">
        <Card title="Recent QA Reviews" sub={reviewedThisMonth.length ? `(${reviewedThisMonth.length} this month)` : undefined}
          more={{ label: "View All QA Reviews", onClick: () => onOpenTab("qa") }}>
          {reviewed.length === 0 ? (
            <p className="text-xs text-muted-foreground">No QA reviews recorded yet. A verdict appears here the moment a reviewer marks one of {member.name.split(" ")[0]}'s completed items.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[32rem] text-left text-xs">
                <thead className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground"><tr><th className="py-1.5 pr-3">Date</th><th className="py-1.5 pr-3">Work item</th><th className="py-1.5 pr-3">Verdict</th><th className="py-1.5 pr-3">Reviewer</th></tr></thead>
                <tbody className="divide-y divide-border/60">
                  {reviewed.slice(0, 5).map((w) => (
                    <tr key={w.id}>
                      <td className="py-1.5 pr-3 text-muted-foreground">{formatDate(w.qaReviewedAt)}</td>
                      <td className="py-1.5 pr-3 font-medium text-foreground">{w.title}</td>
                      <td className="py-1.5 pr-3"><Pill tone={w.qaResult === "passed" ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-800" : "border-amber-500/40 bg-amber-500/10 text-amber-900"}>{w.qaResult === "passed" ? "Pass" : "Needs Fix"}</Pill></td>
                      <td className="py-1.5 pr-3 text-foreground">{w.qaReviewedBy ? nameOf(w.qaReviewedBy) : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <div className="space-y-3">
          <Card title="Sampling Status" badge="Pending">
            <ul className="divide-y divide-border/60 text-xs">
              <li className="flex items-center justify-between py-1.5"><span className="text-muted-foreground">Standard Policy</span><strong className="text-foreground">5 files per month</strong></li>
              <li className="flex items-center justify-between py-1.5"><span className="text-muted-foreground">Reviewed This Month</span><strong className="text-foreground">{reviewedThisMonth.length}</strong></li>
              <li className="flex items-center justify-between py-1.5"><span className="text-muted-foreground">Selection</span><strong className="text-foreground">System-selected (coming)</strong></li>
            </ul>
            <p className="mt-2 text-[10px] text-muted-foreground">Automatic sampling is part of the approved CreditOps QA build.</p>
          </Card>
          <Card title="Team Lead">
            {lead ? (
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-primary/10 text-xs font-bold text-primary">
                  {lead.avatarPath && leadAvatar.data?.[lead.avatarPath] ? <img src={leadAvatar.data[lead.avatarPath]} alt="" className="h-full w-full object-cover" /> : initialsOf(lead.name)}
                </span>
                <span className="min-w-0 flex-1">
                  <Link to={`/app/people/${lead.userId}`} className="block truncate text-sm font-semibold text-foreground hover:underline">{lead.name}</Link>
                  <span className="block truncate text-[11px] text-muted-foreground">{lead.title ?? "Team Lead"}</span>
                </span>
              </div>
            ) : <p className="text-xs text-muted-foreground">No team lead is set on {member.name.split(" ")[0]}'s team yet.</p>}
          </Card>
        </div>
      </div>

      <div className="grid gap-3 xl:grid-cols-3">
        <Card title="Recent Feedback" icon={MessageSquareText} more={{ label: "View All Feedback", onClick: () => onOpenTab("feedback") }}>
          {feedback.length === 0 ? <p className="text-xs text-muted-foreground">No QA feedback on file yet.</p> : (
            <ul className="space-y-3 text-xs">
              {feedback.map((w) => (
                <li key={w.id} className="flex items-start gap-2.5">
                  <span className={cn("mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full", w.qaResult === "passed" ? "bg-status-success/10 text-status-success" : "bg-amber-500/10 text-amber-700")}>
                    {w.qaResult === "passed" ? <CheckCircle2 className="h-3.5 w-3.5" aria-hidden /> : <TriangleAlert className="h-3.5 w-3.5" aria-hidden />}
                  </span>
                  <span className="min-w-0">
                    <span className="flex items-center gap-2 text-[11px] text-muted-foreground">{formatDate(w.qaReviewedAt)} · <span className="font-semibold text-foreground">{w.qaReviewedBy ? nameOf(w.qaReviewedBy) : "Reviewer"}</span>
                      <Pill tone={w.qaResult === "passed" ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-800" : "border-amber-500/40 bg-amber-500/10 text-amber-900"}>{w.qaResult === "passed" ? "Positive" : "Coaching"}</Pill></span>
                    <span className="block text-foreground">“{w.qaFeedback}”</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card title="Goals & Development" icon={Target} more={{ label: "View All", onClick: () => onOpenTab("goals") }}>
          <GoalsCard userId={member.userId} canEdit={canEditGoals} limit={4} compact />
        </Card>
        <Card title="Training & Certifications" icon={FileText} more={{ label: "View All", onClick: () => onOpenTab("training") }}>
          {training.length === 0 ? <p className="text-xs text-muted-foreground">No training documents on file yet.</p> : (
            <ul className="space-y-2">
              {training.map((d) => (
                <li key={d.id} className="flex items-center gap-2.5 rounded-xl border border-border px-3 py-2 text-xs">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-status-success/10 text-status-success"><ClipboardList className="h-4 w-4" aria-hidden /></span>
                  <span className="min-w-0"><span className="block truncate font-semibold text-foreground">{d.name}</span>
                    <span className="block text-[10px] text-muted-foreground">{d.signedAt ? `Completed ${formatDate(d.signedAt)}` : `${d.status} · ${formatDate(d.createdAt)}`}</span></span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}

export function Card({ title, sub, badge, icon: Icon, more, children }: {
  title: string; sub?: string; badge?: string; icon?: React.ElementType;
  more?: { label: string; onClick?: () => void; to?: string }; children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 className="inline-flex items-center gap-2 text-sm font-bold text-foreground">
          {Icon && <Icon className="h-4 w-4 text-muted-foreground" aria-hidden />}{title} {sub && <span className="font-normal text-muted-foreground">{sub}</span>}
        </h3>
        {badge && <Pill tone="border-amber-500/40 bg-amber-500/10 text-amber-900">{badge}</Pill>}
        {more && (more.to
          ? <Link to={more.to} className="inline-flex items-center gap-1 text-[11px] font-semibold text-primary hover:underline">{more.label} <ArrowRight className="h-3 w-3" aria-hidden /></Link>
          : <button type="button" onClick={more.onClick} className="inline-flex items-center gap-1 text-[11px] font-semibold text-primary hover:underline">{more.label} <ArrowRight className="h-3 w-3" aria-hidden /></button>)}
      </div>
      {children}
    </div>
  );
}

export type { PersonScore };
