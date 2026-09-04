import { Sparkles, FileText, Rocket, Link2 } from "lucide-react";
import { Card } from "@/components/ui/card";

const updates = [
  {
    id: 1,
    title: "SOP Update v2.3",
    category: "Dispute Processing",
    type: "process" as const,
    date: "Aug 29, 2026",
    description:
      "Updated procedures for Round 2 escalation and direct bureau uploads now live. All fulfillment agents must review before next processing cycle.",
    priority: "high" as const,
    actionRequired: true,
  },
  {
    id: 2,
    title: "Output Benchmark Hit!",
    category: "Operations",
    type: "milestone" as const,
    date: "Aug 28, 2026",
    description:
      "Congratulations to the Fulfillment Team — new company daily output record set with 286 dispute letters processed and 42 progress reports delivered.",
    priority: "low" as const,
    actionRequired: false,
  },
  {
    id: 3,
    title: "Organization Auto-Sync Live",
    category: "System Feature",
    type: "feature" as const,
    date: "Aug 27, 2026",
    description:
      "Fulfillment subscribers now auto-stream all client dispute work orders directly into the HQ workspace. No manual file transfer required.",
    priority: "medium" as const,
    actionRequired: false,
  },
];

const configs: Record<
  string,
  {
    icon: React.ComponentType<{ className?: string }>;
    color: string;
    bg: string;
  }
> = {
  process: {
    icon: FileText,
    color: "text-status-warning",
    bg: "bg-amber-500/10",
  },
  milestone: {
    icon: Rocket,
    color: "text-status-success",
    bg: "bg-emerald-500/10",
  },
  feature: {
    icon: Link2,
    color: "text-status-info",
    bg: "bg-blue-500/10",
  },
};

const priorityStyles: Record<string, string> = {
  high: "bg-red-500/10 text-red-700 dark:text-red-300 border-red-500/20",
  medium: "bg-amber-500/10 text-status-warning border-amber-500/20",
  low: "bg-emerald-500/10 text-status-success border-emerald-500/20",
};

export const HqUpdatesPanel = () => (
  <Card className="p-5 border-border shadow-sm">
    <div className="flex items-center gap-2 mb-4">
      <Sparkles className="h-5 w-5 text-status-warning" />
      <h2 className="text-base font-bold tracking-tight text-foreground">
        HQ Updates
      </h2>
      <span className="text-[10px] text-muted-foreground font-medium ml-1">
        {updates.length} announcements
      </span>
    </div>

    <div className="grid gap-3.5 md:grid-cols-3">
      {updates.map((u) => {
        const cfg = configs[u.type] ?? configs.feature;
        return (
          <div
            key={u.id}
            className="rounded-xl border border-border bg-muted/20 p-4 hover:bg-muted/40 transition-colors"
          >
            <div className="flex items-start justify-between gap-2 mb-1.5">
              <div className="flex items-center gap-2 min-w-0">
                <cfg.icon className={`h-4 w-4 shrink-0 ${cfg.color}`} />
                <span className="text-xs font-bold text-foreground leading-snug">
                  {u.title}
                </span>
              </div>
              {u.actionRequired && (
                <span
                  className={`shrink-0 text-[9px] font-bold uppercase px-1.5 py-0.5 rounded border ${priorityStyles[u.priority]}`}
                >
                  Action
                </span>
              )}
            </div>

            <div className="flex items-center gap-2 mb-2">
              <span
                className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${cfg.bg} ${cfg.color}`}
              >
                {u.category}
              </span>
              <span className="text-[10px] text-muted-foreground">
                {u.date}
              </span>
            </div>

            <p className="text-xs text-foreground/80 leading-relaxed">
              {u.description}
            </p>
          </div>
        );
      })}
    </div>
  </Card>
);
