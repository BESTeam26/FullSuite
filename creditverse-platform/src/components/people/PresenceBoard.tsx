/**
 * The presence board — Dee's 2026-09-21 layout: how many are online, on break,
 * on lunch, off and on leave; then every person, their team, their status,
 * when they clocked in, what they are on, and today's total.
 *
 * Read off the canonical clock through `team_presence()`, which answers only
 * for `managed_people()`. Nothing here decides who is visible; the filters
 * narrow what came back and never widen it (rule 20b).
 */
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Search } from "lucide-react";
import { Avatar } from "@/components/common/Avatar";
import { Input } from "@/components/ui/input";
import { OpsSelect } from "@/components/ui/ops-select";
import { formatDuration } from "@/lib/time-domain";
import { timeIn, BES_TIMEZONE } from "@/lib/communication/conversation-clock";
import {
  presenceCounts, PRESENCE_LABEL, PRESENCE_ORDER, PRESENCE_PILL, PRESENCE_TONE,
  useTeamPresence, type Presence, type PresenceState,
} from "@/lib/data/use-team-presence";
import { cn } from "@/lib/utils";

const ALL = "__all__";

/** The person's own line: what they wrote on the clock, or what the state means. */
const activityOf = (p: Presence): string => {
  if (p.state === "on_leave") return p.leaveLabel ?? "On leave";
  if (p.state === "on_break") return "Break";
  if (p.state === "on_lunch") return "Lunch";
  if (p.state === "not_in_yet") return "Has not clocked in yet";
  if (p.state === "absent") return "Scheduled, never clocked in";
  if (p.state === "off") return "Not scheduled today";
  if (p.state === "no_schedule") return "No work schedule set";
  if (p.state === "clocked_out") return "Clocked out for the day";
  return p.activity ?? "Working";
};

export function PresenceBoard({ names }: { names: Map<string, string> }) {
  const { presence, isLoading, error } = useTeamPresence();
  const [search, setSearch] = useState("");
  const [team, setTeam] = useState<string>(ALL);
  const [status, setStatus] = useState<string>(ALL);

  const counts = presenceCounts(presence);
  const teams = useMemo(
    () => [...new Set(presence.map((p) => p.teamName).filter((t): t is string => !!t))].sort(),
    [presence],
  );

  const rows = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return presence
      .filter((p) => {
        const name = names.get(p.userId) ?? "";
        if (needle && !name.toLowerCase().includes(needle)
            && !(p.teamName ?? "").toLowerCase().includes(needle)
            && !(p.positionTitle ?? "").toLowerCase().includes(needle)) return false;
        if (team !== ALL && p.teamName !== team) return false;
        if (status !== ALL && p.state !== status) return false;
        return true;
      })
      .sort((a, b) => (names.get(a.userId) ?? "").localeCompare(names.get(b.userId) ?? ""));
  }, [presence, names, search, team, status]);

  return (
    <div className="space-y-3">
      {/* A state nobody is in is not drawn: a permanent zero tile is furniture. */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6">
        {PRESENCE_ORDER.filter((s) => counts[s] > 0 || status === s).map((s) => (
          <button key={s} type="button" aria-pressed={status === s}
            onClick={() => setStatus((cur) => (cur === s ? ALL : s))}
            className={cn(
              "rounded-2xl border px-3 py-2.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              status === s ? "border-primary bg-primary/5" : "border-border bg-card hover:border-primary/40",
            )}>
            <span className="flex items-center gap-1.5">
              <span className={cn("h-2.5 w-2.5 rounded-full", PRESENCE_TONE[s])} aria-hidden />
              <span className="text-xl font-extrabold leading-none tabular-nums text-foreground">{counts[s]}</span>
            </span>
            <span className="mt-1 block text-[11px] font-semibold text-muted-foreground">{PRESENCE_LABEL[s]}</span>
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <label className="relative min-w-[12rem] flex-1 sm:max-w-xs">
          <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search team members…"
            aria-label="Search team members" className="h-8 pl-7 text-sm" />
        </label>
        <OpsSelect aria-label="Team" size="sm" value={team} onValueChange={setTeam}
          options={[{ value: ALL, label: "All teams" }, ...teams.map((t) => ({ value: t, label: t }))]} />
        <OpsSelect aria-label="Status" size="sm" value={status} onValueChange={setStatus}
          options={[{ value: ALL, label: "All statuses" }, ...PRESENCE_ORDER.map((s) => ({ value: s, label: PRESENCE_LABEL[s] }))]} />
        <span className="ml-auto text-[11px] text-muted-foreground">
          {rows.length} of {presence.length}
        </span>
      </div>

      {error ? (
        <p className="rounded-xl border border-destructive/30 bg-status-danger-tint px-3 py-2 text-sm text-status-danger">Could not read the clock: {error}</p>
      ) : isLoading ? (
        <p className="py-8 text-center text-sm text-muted-foreground">Reading the clock…</p>
      ) : rows.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-border bg-muted/30 px-6 py-8 text-center text-sm text-muted-foreground">
          {presence.length === 0
            ? "Nobody is in your management scope yet."
            : "Nobody matches these filters."}
        </p>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-border bg-card">
          <table className="w-full min-w-[46rem] text-left text-xs">
            <thead className="border-b border-border text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-3 py-2">Team member</th>
                <th className="px-3 py-2">Team</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Clock in</th>
                <th className="px-3 py-2">Current activity</th>
                <th className="px-3 py-2 text-right">Today</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {rows.map((p) => {
                const name = names.get(p.userId) ?? "Team member";
                return (
                  <tr key={p.userId} className="hover:bg-muted/40">
                    <td className="px-3 py-2">
                      <span className="flex items-center gap-2">
                        <Avatar name={name} size="sm" className="h-7 w-7 text-[10px]" />
                        <span className="min-w-0">
                          <Link to={`/app/people/${p.userId}`}
                            className="block truncate font-semibold text-foreground underline-offset-2 hover:underline">
                            {name}
                          </Link>
                          <span className="block truncate text-[11px] text-muted-foreground">{p.positionTitle ?? "—"}</span>
                        </span>
                      </span>
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">{p.teamName ?? "—"}</td>
                    <td className="px-3 py-2">
                      <span className={cn("inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-semibold", PRESENCE_PILL[p.state])}>
                        <span className={cn("h-1.5 w-1.5 rounded-full", PRESENCE_TONE[p.state])} aria-hidden />
                        {PRESENCE_LABEL[p.state]}
                      </span>
                    </td>
                    <td className="px-3 py-2 tabular-nums text-foreground">
                      {p.firstIn ? timeIn(p.firstIn, BES_TIMEZONE) : "—"}
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">{activityOf(p)}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-foreground">
                      {p.workMinutes > 0 ? formatDuration(p.workMinutes) : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
