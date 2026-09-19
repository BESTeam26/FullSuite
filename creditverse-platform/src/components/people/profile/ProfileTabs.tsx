/**
 * The Agent Profile's own tabs (Dee's mockup, 2026-09-19): Performance, QA
 * Reviews, Production, Feedback, Goals, Training. Each is a view over the
 * canonical records the rest of the platform writes; the management tabs
 * (Access & Assignments, Time & Pay, Documents, Activity Log) keep their
 * existing components.
 */
import { Pill } from "@/components/agency/partner/partner-ui";
import { PerformanceTrends, type TrendPoint } from "@/components/people/PerformanceTrends";
import { PerformancePersonColumn } from "@/components/people/PerformancePersonColumn";
import { GoalsCard } from "@/components/people/profile/GoalsCard";
import { Card } from "@/components/people/profile/ProfileOverview";
import { usePersonPerformance } from "@/lib/people/use-person-performance";
import { useProductionMarks } from "@/lib/data/use-production-marks";
import { useMemberDocuments, MEMBER_DOCUMENT_KINDS } from "@/lib/data/member-documents";
import { monthLabel } from "@/lib/people/performance-metrics";
import { periodProduction } from "@/lib/people/profile-period";
import { formatDate } from "@/lib/format-date";
import type { AgencyMember } from "@/lib/data/agency-teams";
import { cn } from "@/lib/utils";

export function PersonPerformanceTab({ member, title, teamName, nameOf }: {
  member: AgencyMember; title: string | null; teamName: string | null; nameOf: (id: string) => string;
}) {
  const perf = usePersonPerformance(member.userId);
  const points: TrendPoint[] = perf.months.map((m) => ({
    month: monthLabel(m.range), overall: m.score.overall, quality: m.score.quality, output: m.score.output,
    compliance: m.score.compliance, attendance: m.score.attendance,
  }));
  return (
    <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_19rem]">
      <Card title="Performance Trends" sub="(last six months)">
        <PerformanceTrends points={points} />
        <p className="mt-2 text-[10px] text-muted-foreground">
          Overall = Quality {perf.weighting.weights.quality}% + Productivity &amp; Output {perf.weighting.weights.output}% + Compliance {perf.weighting.weights.compliance}% + Attendance {perf.weighting.weights.attendance}%,
          over the components with data. Output joins the overall once a target exists for the position.
        </p>
      </Card>
      {perf.score && perf.previous && (
        <PerformancePersonColumn member={member} title={title} teamName={teamName} score={perf.score} previous={perf.previous}
          items={perf.items} period={perf.range} nameOf={nameOf} weighting={perf.weighting} />
      )}
    </div>
  );
}

export function QaReviewsTab({ member, nameOf }: { member: AgencyMember; nameOf: (id: string) => string }) {
  const perf = usePersonPerformance(member.userId);
  const reviewed = perf.items.filter((w) => w.assignedTo === member.userId && w.qaReviewedAt)
    .sort((a, b) => (a.qaReviewedAt! < b.qaReviewedAt! ? 1 : -1));
  return (
    <Card title="QA Reviews" sub={`(${reviewed.length})`}>
      {reviewed.length === 0 ? (
        <p className="text-xs text-muted-foreground">No QA reviews recorded yet. Scorecard reviews — checklist, workmanship score, critical errors — arrive with the CreditOps QA build; verdicts on completed work items show here today.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[40rem] text-left text-xs">
            <thead className="border-b border-border text-[10px] font-bold uppercase tracking-wider text-muted-foreground"><tr><th className="py-2 pr-3">Reviewed</th><th className="py-2 pr-3">Work item</th><th className="py-2 pr-3">Verdict</th><th className="py-2 pr-3">Feedback</th><th className="py-2 pr-3">Reviewer</th></tr></thead>
            <tbody className="divide-y divide-border/60">
              {reviewed.map((w) => (
                <tr key={w.id}>
                  <td className="py-2 pr-3 text-muted-foreground">{formatDate(w.qaReviewedAt)}</td>
                  <td className="py-2 pr-3 font-medium text-foreground">{w.title}</td>
                  <td className="py-2 pr-3"><Pill tone={w.qaResult === "passed" ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-800" : "border-amber-500/40 bg-amber-500/10 text-amber-900"}>{w.qaResult === "passed" ? "Pass" : w.qaResult === "needs_fix" ? "Needs Fix" : "Pending"}</Pill></td>
                  <td className="py-2 pr-3 text-muted-foreground">{w.qaFeedback ?? "—"}</td>
                  <td className="py-2 pr-3 text-foreground">{w.qaReviewedBy ? nameOf(w.qaReviewedBy) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

export function FeedbackTab({ member, nameOf }: { member: AgencyMember; nameOf: (id: string) => string }) {
  const perf = usePersonPerformance(member.userId);
  const feedback = perf.items.filter((w) => w.assignedTo === member.userId && w.qaFeedback)
    .sort((a, b) => ((a.qaReviewedAt ?? "") < (b.qaReviewedAt ?? "") ? 1 : -1));
  return (
    <Card title="Feedback" sub={`(${feedback.length})`}>
      {feedback.length === 0 ? <p className="text-xs text-muted-foreground">No feedback on file yet.</p> : (
        <ul className="space-y-3 text-xs">
          {feedback.map((w) => (
            <li key={w.id} className="rounded-xl border border-border px-3 py-2">
              <span className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                {formatDate(w.qaReviewedAt)} · <span className="font-semibold text-foreground">{w.qaReviewedBy ? nameOf(w.qaReviewedBy) : "Reviewer"}</span> · {w.title}
                <Pill tone={w.qaResult === "passed" ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-800" : "border-amber-500/40 bg-amber-500/10 text-amber-900"}>{w.qaResult === "passed" ? "Positive" : "Coaching"}</Pill>
              </span>
              <span className="mt-1 block text-foreground">“{w.qaFeedback}”</span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

export function ProductionPeriodCard({ member }: { member: AgencyMember }) {
  const perf = usePersonPerformance(member.userId);
  const marks = useProductionMarks(member.userId, perf.range.from, perf.range.to);
  const prod = periodProduction(marks.data ?? [], perf.range);
  const byDept = new Map<string, number>();
  for (const m of marks.data ?? []) byDept.set(m.department ?? "—", (byDept.get(m.department ?? "—") ?? 0) + 1);
  return (
    <Card title="This period" sub={`${formatDate(perf.range.from)} – ${formatDate(perf.range.to)}`}>
      <div className="grid grid-cols-3 gap-2 text-xs">
        {[["Files", prod.files], ["Rounds completed", prod.rounds], ["Actions", prod.actions]].map(([l, v]) => (
          <div key={String(l)} className="rounded-lg bg-muted/40 px-2 py-2 text-center"><span className="block text-lg font-extrabold text-foreground">{v}</span><span className="block text-[10px] text-muted-foreground">{l}</span></div>
        ))}
      </div>
      {byDept.size > 0 && (
        <ul className="mt-2 divide-y divide-border/60 text-xs">
          {[...byDept.entries()].map(([d, n]) => <li key={d} className="flex items-center justify-between py-1"><span className="text-foreground">{d}</span><span className="text-muted-foreground">{n} file{n === 1 ? "" : "s"}</span></li>)}
        </ul>
      )}
    </Card>
  );
}

export function GoalsTab({ member, canEdit }: { member: AgencyMember; canEdit: boolean }) {
  return <Card title="Goals & Development"><GoalsCard userId={member.userId} canEdit={canEdit} /></Card>;
}

export function TrainingTab({ member }: { member: AgencyMember }) {
  const docs = useMemberDocuments(member.userId, true);
  const training = (docs.data ?? []).filter((d) => d.kind === "training" || d.kind === "policy" || d.kind === "acknowledgment");
  const label = (k: string) => MEMBER_DOCUMENT_KINDS.find((x) => x.value === k)?.label ?? k;
  return (
    <Card title="Training & Certifications" sub={`(${training.length})`}>
      {training.length === 0 ? <p className="text-xs text-muted-foreground">No training, policy or acknowledgment documents on file yet. They are added on the Documents tab.</p> : (
        <ul className="space-y-2">
          {training.map((d) => (
            <li key={d.id} className={cn("flex items-center justify-between gap-2 rounded-xl border border-border px-3 py-2 text-xs")}>
              <span className="min-w-0"><span className="block truncate font-semibold text-foreground">{d.name}</span><span className="block text-[10px] text-muted-foreground">{label(d.kind)}</span></span>
              <span className="shrink-0 text-[11px] text-muted-foreground">{d.signedAt ? `Completed ${formatDate(d.signedAt)}` : `${d.status} · ${formatDate(d.createdAt)}`}</span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
