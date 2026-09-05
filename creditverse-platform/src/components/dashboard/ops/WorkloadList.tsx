/** Team workload rows: avatar initials, name, assigned count, and how many need action. */
import { initials } from "@/lib/format-name";
import { cn } from "@/lib/utils";

export interface WorkloadRow { id: string; name: string; total: number; action: number }
export function WorkloadList({ rows, unit, emptyText = "No active work." }: { rows: WorkloadRow[]; unit: string; emptyText?: string }) {
  if (rows.length === 0) return <p className="py-6 text-center text-xs text-muted-foreground">{emptyText}</p>;
  return (
    <ul className="space-y-2">
      {rows.map((w) => (
        <li key={w.id} className="flex items-center gap-3 rounded-xl border border-border bg-background px-3 py-2.5">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-status-warning/10 text-xs font-bold text-status-warning">{initials(w.name)}</span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-foreground">{w.name}</p>
            <p className="text-[11px] text-muted-foreground">{w.total} {unit}{w.total === 1 ? "" : "s"} assigned</p>
          </div>
          <div className="text-right">
            <p className="text-sm font-bold text-foreground">{w.total}</p>
            <p className={cn("text-[11px]", w.action > 0 ? "font-semibold text-status-warning" : "text-muted-foreground")}>{w.action} need action</p>
          </div>
        </li>
      ))}
    </ul>
  );
}
