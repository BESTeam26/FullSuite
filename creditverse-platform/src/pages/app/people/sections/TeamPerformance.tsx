/**
 * People & Teams → Performance.
 *
 * Dee's mockup, 2026-09-19: "This is the Performance Page." Five tiles,
 * trends, distribution, the team table, and the selected person's column —
 * with sub-views Overview | Individuals | Teams | QA & Quality | Coaching.
 *
 * Every figure is derived by lib/people/performance-metrics.ts and each
 * tile states its definition. Coaching lists who needs support and why, from
 * the same scores and the attendance alerts; coaching NOTES are not recorded
 * anywhere yet, and the tab says so rather than offering a form that saves
 * nothing (D-018). Export Report writes the individuals table as CSV.
 *
 * Four views, one page: `scored` is the caller's management scope.
 */
import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { BarChart3, CalendarCheck, ClipboardList, Download, Search, Star, TrendingUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { OpsSelect } from "@/components/ui/ops-select";
import { Donut } from "@/components/people/Donut";
import { PerformanceTrends, type TrendPoint } from "@/components/people/PerformanceTrends";
import { PerformanceTable, ScoreCell, Trend } from "@/components/people/PerformanceTable";
import { PerformancePersonColumn } from "@/components/people/PerformancePersonColumn";
import { useTeamPerformance, type ScoredPerson } from "@/lib/people/use-team-performance";
import {
  BANDS, SCORE_KEYS, SCORE_LABEL, averageOf, bandOf, distribution, lastMonths, monthLabel, performanceCsv, type PersonScore,
} from "@/lib/people/performance-metrics";
import type { DateRange } from "@/lib/people/overview-metrics";
import { useAgencyMembers } from "@/lib/data/use-agency-teams";
import { usePositions } from "@/lib/data/use-positions";
import { useManagedTeam } from "@/lib/people/use-managed-team";
import { orgDivisionLabel } from "@/lib/agency/division-label";
import { formatDate } from "@/lib/format-date";
import { cn } from "@/lib/utils";

const SUBTABS = [
  { key: "overview", label: "Overview" }, { key: "individuals", label: "Individuals" }, { key: "teams", label: "Teams" },
  { key: "qa", label: "QA & Quality" }, { key: "coaching", label: "Coaching" },
] as const;
type SubTab = (typeof SUBTABS)[number]["key"];
const ALL = "__all__";
const pct = (n: number | null) => (n === null ? "—" : `${n}%`);

export function TeamPerformance() {
  const [params, setParams] = useSearchParams();
  const tab: SubTab = (SUBTABS.find((t) => t.key === params.get("tab"))?.key ?? "overview");
  const setTab = (t: SubTab) => setParams(t === "overview" ? {} : { tab: t }, { replace: true });
  const team = useManagedTeam();
  const periods = useMemo(() => lastMonths(team.today, 6).reverse(), [team.today]);
  const [periodKey, setPeriodKey] = useState<string>(() => periods[0]?.from ?? "");
  const period: DateRange = periods.find((p) => p.from === periodKey) ?? periods[0];
  const perf = useTeamPerformance(period);
  const members = useAgencyMembers();
  const positions = usePositions();
  const [division, setDivision] = useState(ALL);
  const [teamFilter, setTeamFilter] = useState(ALL);
  const [positionFilter, setPositionFilter] = useState(ALL);
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  /* Where each person sits and what they hold — the same lookups Members uses. */
  const liveTeams = useMemo(() => perf.teams.filter((t) => !t.archived), [perf.teams]);
  const teamOf = useMemo(() => {
    const m = new Map<string, { name: string; division: string | null; id: string }>();
    for (const t of liveTeams) for (const mem of t.members) if (!m.has(mem.userId)) m.set(mem.userId, { name: t.name, division: t.division, id: t.id });
    return m;
  }, [liveTeams]);
  const memberOf = useMemo(() => new Map((members.data ?? []).map((m) => [m.userId, m])), [members.data]);
  const titleOf = useMemo(() => {
    const seat = new Map<string, string>();
    for (const p of positions.data ?? []) for (const h of p.holders) if (!seat.has(h.userId)) seat.set(h.userId, p.title);
    return (userId: string) => seat.get(userId) ?? memberOf.get(userId)?.jobTitle ?? null;
  }, [positions.data, memberOf]);
  const nameOf = (id: string) => memberOf.get(id)?.name ?? "Someone";

  const divisions = useMemo(() => [...new Set(liveTeams.map((t) => t.division).filter((d): d is string => !!d))].sort(), [liveTeams]);
  const positionTitles = useMemo(() => [...new Set(perf.scored.map((s) => titleOf(s.person.userId)).filter((t): t is string => !!t))].sort(), [perf.scored, titleOf]);

  const inDivision = (s: ScoredPerson) => division === ALL || teamOf.get(s.person.userId)?.division === division;
  const scoped = perf.scored.filter(inDivision);
  const needle = search.trim().toLowerCase();
  const rows = scoped.filter((s) =>
    (teamFilter === ALL || teamOf.get(s.person.userId)?.id === teamFilter)
    && (positionFilter === ALL || titleOf(s.person.userId) === positionFilter)
    && (!needle || `${s.person.name} ${s.person.email} ${titleOf(s.person.userId) ?? ""}`.toLowerCase().includes(needle)))
    .sort((a, b) => (b.score.overall ?? -1) - (a.score.overall ?? -1));

  const scores = scoped.map((s) => s.score), previous = scoped.map((s) => s.previous);
  const avg = (k: keyof PersonScore) => averageOf(scores, k);
  const prevAvg = (k: keyof PersonScore) => averageOf(previous, k);
  const dist = distribution(scores);
  const points: TrendPoint[] = perf.months.map((m, i) => {
    const monthScores = scoped.map((s) => s.months[i]);
    return { month: monthLabel(m), overall: averageOf(monthScores, "overall"), quality: averageOf(monthScores, "quality"),
      output: averageOf(monthScores, "output"), compliance: averageOf(monthScores, "compliance"), attendance: averageOf(monthScores, "attendance") };
  });
  const delivered = scoped.reduce((s, x) => s + x.score.delivered, 0);
  const w = perf.weighting.weights;

  const selected = rows.find((s) => s.person.userId === selectedId) ?? rows[0] ?? null;
  const selectedMember = selected ? memberOf.get(selected.person.userId) : undefined;

  const exportCsv = () => {
    const csv = performanceCsv(rows.map((r) => ({ name: r.person.name, position: titleOf(r.person.userId) ?? "", team: teamOf.get(r.person.userId)?.name ?? "", score: r.score })));
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = `performance-${period.from.slice(0, 7)}.csv`; a.click();
    URL.revokeObjectURL(a.href);
  };

  if (!perf.loading && perf.scored.length === 0) {
    return (
      <p className="rounded-2xl border border-dashed border-border bg-muted/30 p-8 text-center text-sm text-muted-foreground">
        Nobody is in your management scope yet.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-extrabold text-foreground">Performance</h2>
          <p className="text-xs text-muted-foreground">
            Overall = Quality {w.quality}% + Productivity &amp; Output {w.output}% + Compliance {w.compliance}% + Attendance {w.attendance}%
            {perf.weighting.minQuality === null && perf.weighting.minCompliance === null ? " · minimum thresholds not set yet" : ` · minimums: Quality ${perf.weighting.minQuality ?? "—"}%, Compliance ${perf.weighting.minCompliance ?? "—"}%`}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <OpsSelect aria-label="Period" size="sm" value={period.from} onValueChange={setPeriodKey}
            options={periods.map((p) => ({ value: p.from, label: `${formatDate(p.from)} – ${formatDate(p.to)}` }))} />
          <OpsSelect aria-label="Division" size="sm" value={division} onValueChange={setDivision}
            options={[{ value: ALL, label: "All divisions" }, ...divisions.map((d) => ({ value: d, label: orgDivisionLabel(d) }))]} />
          <Button size="sm" className="h-8 text-xs" onClick={exportCsv} disabled={rows.length === 0}>
            <Download className="mr-1.5 h-3.5 w-3.5" aria-hidden /> Export Report
          </Button>
        </div>
      </div>

      <div role="tablist" aria-label="Performance views" className="flex flex-wrap gap-1 border-b border-border">
        {SUBTABS.map((t) => (
          <button key={t.key} type="button" role="tab" aria-selected={tab === t.key} onClick={() => setTab(t.key)}
            className={cn("-mb-px border-b-2 px-3 py-2 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              tab === t.key ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:border-border hover:text-foreground")}>
            {t.label}
          </button>
        ))}
      </div>

      {perf.error && <p className="rounded-xl border border-destructive/30 bg-status-danger-tint px-3 py-2 text-xs text-status-danger">Could not load performance data: {(perf.error as Error).message}</p>}

      <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_19rem]">
        <div className="min-w-0 space-y-3">
          {(tab === "overview" || tab === "individuals") && (
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
              <Tile icon={TrendingUp} label="Overall Performance (avg.)" value={avg("overall")} prev={prevAvg("overall")}
                note={`Quality ${w.quality} · Output ${w.output} · Compliance ${w.compliance} · Attendance ${w.attendance}`} />
              <Tile icon={Star} label={`Quality · ${w.quality}%`} value={avg("quality")} prev={prevAvg("quality")} note="QA passed ÷ QA reviewed" />
              <Tile icon={BarChart3} label={`Productivity & Output · ${w.output}%`} value={avg("output")} prev={prevAvg("output")}
                note={avg("output") === null ? `${delivered} items delivered · no targets set yet` : "Delivered ÷ position target"} />
              <Tile icon={ClipboardList} label={`Compliance · ${w.compliance}%`} value={avg("compliance")} prev={prevAvg("compliance")} note="EOD reports filed ÷ scheduled days" />
              <Tile icon={CalendarCheck} label={`Attendance & Reliability · ${w.attendance}%`} value={avg("attendance")} prev={prevAvg("attendance")} note="On-time days ÷ scheduled days" />
            </div>
          )}

          {tab === "overview" && (
            <div className="grid gap-3 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
              <Card title="Performance Trends" sub="(Company Average)"><PerformanceTrends points={points} /></Card>
              <Card title="Performance Distribution">
                <div className="flex items-center gap-4">
                  <Donut centre={String(scores.filter((s) => s.overall !== null).length)} caption="Team Members" segments={[
                    { label: "Outstanding", value: dist.outstanding, className: "stroke-emerald-600" },
                    { label: "Strong", value: dist.strong, className: "stroke-emerald-400" },
                    { label: "On Track", value: dist.on_track, className: "stroke-amber-500" },
                    { label: "Needs Support", value: dist.needs_support, className: "stroke-status-danger" },
                  ]} />
                  <ul className="space-y-1.5 text-xs">
                    {BANDS.map((b, i) => (
                      <li key={b.key} className="flex items-center justify-between gap-3">
                        <span className="inline-flex items-center gap-2 text-foreground"><span className={cn("h-2.5 w-2.5 rounded-sm", ["bg-emerald-600", "bg-emerald-400", "bg-amber-500", "bg-status-danger"][i])} aria-hidden /> {b.label}</span>
                        <span className="font-bold tabular-nums text-foreground">{dist[b.key]}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </Card>
            </div>
          )}

          {(tab === "overview" || tab === "individuals") && (
            <div className="rounded-2xl border border-border bg-card">
              <div className="flex flex-wrap items-center justify-between gap-2 px-4 pt-3">
                <h3 className="text-sm font-bold text-foreground">Team Members Performance</h3>
                <div className="flex flex-wrap items-center gap-2">
                  <div className="relative">
                    <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden />
                    <Input className="h-8 w-48 pl-8 text-xs" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search team members…" aria-label="Search team members" />
                  </div>
                  <OpsSelect aria-label="Team" size="sm" value={teamFilter} onValueChange={setTeamFilter}
                    options={[{ value: ALL, label: "All teams" }, ...liveTeams.map((t) => ({ value: t.id, label: t.name }))]} />
                  <OpsSelect aria-label="Position" size="sm" value={positionFilter} onValueChange={setPositionFilter}
                    options={[{ value: ALL, label: "All positions" }, ...positionTitles.map((t) => ({ value: t, label: t }))]} />
                </div>
              </div>
              <div className="mt-2">
                <PerformanceTable rows={tab === "overview" ? rows.slice(0, 8) : rows} selectedId={selected?.person.userId ?? null}
                  onSelect={setSelectedId} titleOf={titleOf} teamOf={(id) => teamOf.get(id)?.name ?? null} />
              </div>
            </div>
          )}

          {tab === "teams" && <TeamsView scored={scoped} teams={liveTeams} />}
          {tab === "qa" && <QaView items={perf.items} scoped={scoped} period={period} nameOf={nameOf} />}
          {tab === "coaching" && <CoachingView scored={scoped} alerts={team.attendanceByUser} />}
        </div>

        {selected && selectedMember && (
          <PerformancePersonColumn member={selectedMember} title={titleOf(selected.person.userId)}
            teamName={teamOf.get(selected.person.userId)?.name ?? null} score={selected.score} previous={selected.previous}
            items={perf.items} period={period} nameOf={nameOf} weighting={perf.weighting} />
        )}
      </div>
    </div>
  );
}

/* ── Pieces ─────────────────────────────────────────────────────────────── */

function Tile({ icon: Icon, label, value, prev, note }: { icon: React.ElementType; label: string; value: number | null; prev: number | null; note: string }) {
  return (
    <div className="rounded-2xl border border-border bg-card px-3.5 py-3" title={note}>
      <div className="flex items-start justify-between gap-2">
        <span className="text-[11px] font-semibold text-foreground">{label}</span>
        <Icon className="h-4 w-4 shrink-0 text-primary" aria-hidden />
      </div>
      <div className="mt-1 flex items-end gap-2">
        <span className="text-2xl font-extrabold leading-none tabular-nums text-foreground">{pct(value)}</span>
        <span className="pb-0.5"><Trend current={value} previous={prev} /></span>
      </div>
      <span className="block text-[10px] text-muted-foreground">{prev === null ? note : "vs previous month"}</span>
    </div>
  );
}

function Card({ title, sub, children }: { title: string; sub?: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <h3 className="mb-2 text-sm font-bold text-foreground">{title} {sub && <span className="font-normal text-muted-foreground">{sub}</span>}</h3>
      {children}
    </div>
  );
}

function TeamsView({ scored, teams }: { scored: ScoredPerson[]; teams: { id: string; name: string; division: string | null; members: { userId: string }[] }[] }) {
  const rows = teams.map((t) => {
    const theirs = scored.filter((s) => t.members.some((m) => m.userId === s.person.userId));
    const scores = theirs.map((s) => s.score);
    return { team: t, people: theirs.length, ...Object.fromEntries(SCORE_KEYS.map((k) => [k, averageOf(scores, k)])), overall: averageOf(scores, "overall") } as
      { team: typeof t; people: number; overall: number | null } & Record<(typeof SCORE_KEYS)[number], number | null>;
  }).filter((r) => r.people > 0).sort((a, b) => (b.overall ?? -1) - (a.overall ?? -1));
  return (
    <div className="overflow-x-auto rounded-2xl border border-border bg-card">
      <table className="w-full min-w-[44rem] text-left text-xs">
        <thead className="border-b border-border bg-muted/40 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
          <tr><th className="px-4 py-2">Team</th><th className="px-3 py-2">Division</th><th className="px-3 py-2 text-right">People</th>
            {SCORE_KEYS.map((k) => <th key={k} className="px-3 py-2 text-center">{SCORE_LABEL[k]}</th>)}<th className="px-3 py-2 text-center">Overall</th></tr>
        </thead>
        <tbody className="divide-y divide-border/60">
          {rows.length === 0 && <tr><td colSpan={8} className="px-4 py-8 text-center text-muted-foreground">No teams in your scope yet.</td></tr>}
          {rows.map((r) => (
            <tr key={r.team.id}>
              <td className="px-4 py-2 font-semibold text-foreground">{r.team.name}</td>
              <td className="px-3 py-2 text-foreground">{r.team.division ? orgDivisionLabel(r.team.division) : "—"}</td>
              <td className="px-3 py-2 text-right tabular-nums">{r.people}</td>
              {SCORE_KEYS.map((k) => <td key={k} className="px-3 py-2 text-center"><ScoreCell value={r[k]} /></td>)}
              <td className="px-3 py-2 text-center"><ScoreCell value={r.overall} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function QaView({ items, scoped, period, nameOf }: { items: readonly import("@/lib/bes-domain").WorkItem[]; scoped: ScoredPerson[]; period: DateRange; nameOf: (id: string) => string }) {
  const ids = new Set(scoped.map((s) => s.person.userId));
  const reviewed = items.filter((w) => w.assignedTo && ids.has(w.assignedTo) && w.qaReviewedAt
    && w.qaReviewedAt.slice(0, 10) >= period.from && w.qaReviewedAt.slice(0, 10) <= period.to)
    .sort((a, b) => (a.qaReviewedAt! < b.qaReviewedAt! ? 1 : -1));
  const passed = reviewed.filter((w) => w.qaResult === "passed").length;
  const needsFix = reviewed.filter((w) => w.qaResult === "needs_fix").length;
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-3">
        {[["Items reviewed", reviewed.length], ["Passed", passed], ["Needs Fix", needsFix]].map(([l, v]) => (
          <div key={String(l)} className="rounded-2xl border border-border bg-card px-3.5 py-3">
            <span className="block text-2xl font-extrabold tabular-nums text-foreground">{v}</span>
            <span className="block text-[11px] font-semibold text-foreground">{l}</span>
          </div>
        ))}
      </div>
      <div className="overflow-x-auto rounded-2xl border border-border bg-card">
        <table className="w-full min-w-[44rem] text-left text-xs">
          <thead className="border-b border-border bg-muted/40 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
            <tr><th className="px-4 py-2">Work item</th><th className="px-3 py-2">Person</th><th className="px-3 py-2">Verdict</th><th className="px-3 py-2">Feedback</th><th className="px-3 py-2">Reviewer</th><th className="px-3 py-2">Reviewed</th></tr>
          </thead>
          <tbody className="divide-y divide-border/60">
            {reviewed.length === 0 && <tr><td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">No QA reviews were recorded in this period. A verdict appears here the moment a reviewer marks a completed unit passed or needs fix.</td></tr>}
            {reviewed.map((w) => (
              <tr key={w.id}>
                <td className="px-4 py-2 font-medium text-foreground">{w.title}</td>
                <td className="px-3 py-2 text-foreground">{nameOf(w.assignedTo!)}</td>
                <td className="px-3 py-2"><span className={cn("rounded-md px-2 py-0.5 text-[11px] font-bold", w.qaResult === "passed" ? "bg-emerald-500/10 text-emerald-800" : "bg-amber-500/10 text-amber-900")}>{w.qaResult === "passed" ? "Passed" : "Needs Fix"}</span></td>
                <td className="px-3 py-2 text-muted-foreground">{w.qaFeedback ?? "—"}</td>
                <td className="px-3 py-2 text-foreground">{w.qaReviewedBy ? nameOf(w.qaReviewedBy) : "—"}</td>
                <td className="px-3 py-2 text-muted-foreground">{formatDate(w.qaReviewedAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function CoachingView({ scored, alerts }: { scored: ScoredPerson[]; alerts: Map<string, { alerts: { title: string; detail?: string }[] }> }) {
  const needs = scored.filter((s) => (s.score.overall !== null && bandOf(s.score.overall) !== "outstanding" && bandOf(s.score.overall) !== "strong")
    || s.score.belowMinimum || (alerts.get(s.person.userId)?.alerts.length ?? 0) > 0)
    .sort((a, b) => (a.score.overall ?? 101) - (b.score.overall ?? 101));
  return (
    <div className="space-y-3">
      <ul className="space-y-2">
        {needs.length === 0 && <li className="rounded-2xl border border-border bg-card p-6 text-center text-sm text-muted-foreground">Nobody in your scope needs coaching on the current numbers.</li>}
        {needs.map((s) => (
          <li key={s.person.userId} className="rounded-2xl border border-border bg-card p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-sm font-bold text-foreground">{s.person.name}</span>
              <span className="flex items-center gap-2"><span className="text-[11px] text-muted-foreground">Overall</span><ScoreCell value={s.score.overall} /></span>
            </div>
            <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
              {SCORE_KEYS.filter((k) => s.score[k] !== null && s.score[k]! < 75).map((k) => (
                <li key={k}>• {SCORE_LABEL[k]} at {s.score[k]}% — below the Strong band</li>
              ))}
              {(alerts.get(s.person.userId)?.alerts ?? []).map((a) => <li key={a.title}>• {a.title}{a.detail ? ` — ${a.detail}` : ""}</li>)}
            </ul>
          </li>
        ))}
      </ul>
      <p className="rounded-xl border border-border bg-card px-4 py-3 text-[11px] text-muted-foreground">
        Coaching notes are not recorded anywhere yet — this view is derived from the scores and attendance alerts. Recording a
        coaching conversation against a person is in the backlog (D-018).
      </p>
    </div>
  );
}

export default TeamPerformance;
