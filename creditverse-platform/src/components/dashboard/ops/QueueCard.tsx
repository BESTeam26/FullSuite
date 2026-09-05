/** Action-queue card: icon badge, title with a count chip, one-line description, and up to four linked items. */
import type { LucideIcon } from "lucide-react";
import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";
import { TONE_BADGE, type KpiTone } from "./KpiTile";

export interface QueueItem { id: string; label: string; href: string }
export function QueueCard({ title, description, count, icon: Icon, tone = "emerald", items, informational = false }: { title: string; description: string; count: number; icon: LucideIcon; tone?: KpiTone; items: QueueItem[]; informational?: boolean }) {
  const hot = count > 0 && !informational;
  return (
    <div className={cn("rounded-2xl border bg-card p-4 shadow-sm transition-shadow hover:shadow-md", hot ? "border-status-warning/40" : "border-border")}>
      <div className="flex items-start gap-3">
        <span className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-xl", TONE_BADGE[tone])}><Icon className="h-5 w-5" /></span>
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm font-bold leading-tight text-foreground">
            <span>{title}</span>
            <span className={cn("rounded-full px-2 py-0.5 text-xs font-bold", hot ? "bg-status-warning/15 text-status-warning" : "bg-muted text-muted-foreground")}>{count}</span>
          </p>
          <p className="mt-0.5 text-[11px] text-muted-foreground">{description}</p>
        </div>
      </div>
      {items.length > 0 && (
        <ul className="mt-3 space-y-1 border-t border-border/60 pt-2">
          {items.slice(0, 4).map((it) => <li key={it.id}><Link to={it.href} className="block truncate text-[11px] font-semibold text-primary hover:underline">{it.label}</Link></li>)}
          {items.length > 4 && <li className="text-[10px] text-muted-foreground">+{items.length - 4} more</li>}
        </ul>
      )}
    </div>
  );
}
