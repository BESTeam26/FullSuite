/** KPI tile: label, one big number, an icon badge in the metric's colour (Dee's Operations Dashboard). */
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export type KpiTone = "emerald" | "blue" | "amber" | "purple" | "green" | "slate" | "red";
export const TONE_BADGE: Record<KpiTone, string> = {
  emerald: "bg-primary/10 text-primary",
  blue: "bg-status-info/10 text-status-info",
  amber: "bg-status-warning/10 text-status-warning",
  purple: "bg-status-accent/10 text-status-accent",
  green: "bg-status-success/10 text-status-success",
  slate: "bg-muted text-muted-foreground",
  red: "bg-status-danger/10 text-status-danger",
};
/** Chart fills, one per tone — CSS variables so both palettes stay consistent. */
export const TONE_FILL: Record<KpiTone, string> = {
  emerald: "hsl(var(--primary))",
  blue: "hsl(var(--status-info))",
  amber: "hsl(var(--status-warning))",
  purple: "hsl(var(--status-accent))",
  green: "hsl(var(--status-success))",
  slate: "hsl(var(--muted-foreground))",
  red: "hsl(var(--status-danger))",
};

export function KpiTile({ label, value, icon: Icon, tone = "emerald", hint, attention = false }: { label: string; value: string | number; icon: LucideIcon; tone?: KpiTone; hint?: string; attention?: boolean }) {
  return (
    <div className={cn("flex items-start justify-between gap-3 rounded-2xl border bg-card p-4 shadow-sm transition-shadow hover:shadow-md", attention ? "border-status-warning/40" : "border-border")}>
      <div className="min-w-0">
        <p className="text-xs font-medium leading-tight text-muted-foreground">{label}</p>
        <p className={cn("mt-1 text-2xl font-bold tracking-tight", attention ? "text-status-warning" : "text-foreground")}>{value}</p>
        {hint && <p className="mt-0.5 text-[11px] leading-tight text-muted-foreground">{hint}</p>}
      </div>
      <span className={cn("flex h-11 w-11 shrink-0 items-center justify-center rounded-xl", TONE_BADGE[tone])}><Icon className="h-5 w-5" /></span>
    </div>
  );
}
