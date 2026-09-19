/**
 * Team Members Performance — one row per person, the four components and the
 * overall, with the trend against the month before. Colour says the band,
 * the number says the figure; a component with nothing to measure is a dash.
 */
import { Link } from "react-router-dom";
import { ArrowDownRight, ArrowUpRight, Minus, MoreHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { bandOf, trendOf, type PersonScore } from "@/lib/people/performance-metrics";
import type { ScoredPerson } from "@/lib/people/use-team-performance";
import { cn } from "@/lib/utils";

export const BAND_TONE: Record<ReturnType<typeof bandOf>, string> = {
  outstanding: "bg-emerald-500/10 text-emerald-800",
  strong: "bg-emerald-500/10 text-emerald-800",
  on_track: "bg-amber-500/10 text-amber-900",
  needs_support: "bg-status-danger-tint text-status-danger",
};

export function ScoreCell({ value }: { value: number | null }) {
  if (value === null) return <span className="text-muted-foreground">—</span>;
  return <span className={cn("inline-block rounded-md px-2 py-0.5 text-[11px] font-bold tabular-nums", BAND_TONE[bandOf(value)])}>{value}%</span>;
}

export function Trend({ current, previous }: { current: number | null; previous: number | null }) {
  const t = trendOf(current, previous);
  if (t === null) return <span className="text-[11px] text-muted-foreground">—</span>;
  const Icon = t > 0 ? ArrowUpRight : t < 0 ? ArrowDownRight : Minus;
  return (
    <span className={cn("inline-flex items-center gap-0.5 text-[11px] font-semibold tabular-nums",
      t > 0 ? "text-status-success" : t < 0 ? "text-status-danger" : "text-muted-foreground")}>
      <Icon className="h-3 w-3" aria-hidden /> {t > 0 ? "+" : ""}{t}%
    </span>
  );
}

const initials = (name: string) =>
  name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? "").join("") || "?";

export function PerformanceTable({ rows, selectedId, onSelect, titleOf, teamOf }: {
  rows: ScoredPerson[];
  selectedId: string | null;
  onSelect: (userId: string) => void;
  titleOf: (userId: string) => string | null;
  teamOf: (userId: string) => string | null;
}) {
  /* Dee's order of weight: Quality 35 · Output 35 · Compliance 20 · Attendance 10. */
  const cols: { key: keyof PersonScore & string; label: string }[] = [
    { key: "quality", label: "Quality" }, { key: "output", label: "Output" },
    { key: "compliance", label: "Compliance" }, { key: "attendance", label: "Attendance" }, { key: "overall", label: "Overall" },
  ];
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[52rem] text-left text-xs">
        <thead className="border-y border-border bg-muted/40 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
          <tr>
            <th className="px-4 py-2">Name</th><th className="px-3 py-2">Position</th><th className="px-3 py-2">Team</th>
            {cols.map((c) => <th key={c.key} className="px-3 py-2 text-center">{c.label}</th>)}
            <th className="px-3 py-2">Trend</th><th className="px-3 py-2 text-right">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border/60">
          {rows.length === 0 && (
            <tr><td colSpan={10} className="px-4 py-8 text-center text-muted-foreground">Nobody matches.</td></tr>
          )}
          {rows.map(({ person, score, previous }) => (
            <tr key={person.userId} onClick={() => onSelect(person.userId)}
              className={cn("cursor-pointer transition-colors hover:bg-muted/40", selectedId === person.userId && "bg-primary/5")}>
              <td className="px-4 py-2">
                <span className="flex items-center gap-2.5">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[11px] font-bold text-primary">{initials(person.name)}</span>
                  <span className="min-w-0">
                    <Link to={`/app/people/${person.userId}`} onClick={(e) => e.stopPropagation()}
                      className="block truncate font-semibold text-foreground underline-offset-2 hover:underline">{person.name}</Link>
                    <span className="block truncate text-[11px] text-muted-foreground">{person.email}</span>
                  </span>
                </span>
              </td>
              <td className="px-3 py-2 text-foreground">{titleOf(person.userId) ?? <span className="text-muted-foreground">—</span>}</td>
              <td className="px-3 py-2 text-foreground">{teamOf(person.userId) ?? <span className="text-muted-foreground">—</span>}</td>
              {cols.map((c) => (
                <td key={c.key} className="px-3 py-2 text-center">
                  {c.key === "output" && score.output === null
                    /* Delivered count until a per-position target exists (D-019). */
                    ? <span className="text-[11px] tabular-nums text-muted-foreground" title="Work items delivered · no target set yet">{score.delivered} done</span>
                    : <ScoreCell value={score[c.key] as number | null} />}
                  {c.key === "overall" && score.belowMinimum && <span className="block text-[10px] font-semibold text-status-danger">⚠ below standard</span>}
                </td>
              ))}
              <td className="px-3 py-2"><Trend current={score.overall} previous={previous.overall} /></td>
              <td className="px-3 py-2 text-right" onClick={(e) => e.stopPropagation()}>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-7 w-7" aria-label={`Actions for ${person.name}`}><MoreHorizontal className="h-4 w-4" /></Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="text-xs">
                    <DropdownMenuItem onSelect={() => onSelect(person.userId)}>Show summary</DropdownMenuItem>
                    <DropdownMenuItem asChild><Link to={`/app/people/${person.userId}`}>Open full profile</Link></DropdownMenuItem>
                    <DropdownMenuItem asChild><Link to="/app/people/attendance">Review attendance</Link></DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
