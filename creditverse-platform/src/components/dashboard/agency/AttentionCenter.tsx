import {
  AlertTriangle,
  DollarSign,
  ShieldCheck,
  Zap,
  Crown,
  Bell,
  ChevronRight,
  ArrowRight,
  Clock,
  Ban,
} from "lucide-react";
import type { ElementType } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import { useAttention } from "@/lib/data/use-work";
import { DataSourceBadge } from "@/components/dashboard/DataSourceBadge";

type Severity = "high" | "medium" | "low";

interface AttentionCard {
  icon: ElementType;
  label: string;
  count: number;
  severity: Severity;
  action: string;
  route: string;
  description: string;
  /** false = signal not wired to a backend yet (later build phases). */
  live: boolean;
}

const severityConfig: Record<
  Severity,
  { border: string; bg: string; dot: string; countText: string; badge: string }
> = {
  high: {
    border: "border-red-500/40",
    bg: "bg-red-500/5",
    dot: "text-red-500",
    countText: "text-red-700 dark:text-red-300",
    badge: "bg-red-500/15 text-red-800 dark:text-red-300 border-red-500/30",
  },
  medium: {
    border: "border-amber-500/40",
    bg: "bg-amber-500/5",
    dot: "text-amber-500",
    countText: "text-amber-700 dark:text-amber-300",
    badge:
      "bg-amber-500/15 text-amber-800 dark:text-amber-300 border-amber-500/30",
  },
  low: {
    border: "border-blue-500/40",
    bg: "bg-blue-500/5",
    dot: "text-blue-500",
    countText: "text-blue-700 dark:text-blue-300",
    badge: "bg-blue-500/15 text-blue-800 dark:text-blue-300 border-blue-500/30",
  },
};

export const AttentionCenter = () => {
  const navigate = useNavigate();
  const { counts, items, source } = useAttention();

  // Work-engine signals are real (live or seed-derived, never invented).
  const workCards: AttentionCard[] = [
    {
      icon: Clock,
      label: "SLA risk",
      count: counts.sla_risk,
      severity: "high",
      action: "Open Attention Center",
      route: "/app/attention",
      description: "Due within 4 hours",
      live: true,
    },
    {
      icon: AlertTriangle,
      label: "Overdue",
      count: counts.overdue,
      severity: "high",
      action: "Open Attention Center",
      route: "/app/attention",
      description: "Past the SLA deadline",
      live: true,
    },
    {
      icon: Ban,
      label: "Blocked",
      count: counts.blocked,
      severity: "medium",
      action: "Open Attention Center",
      route: "/app/attention",
      description: "Waiting on a blocker",
      live: true,
    },
  ];

  // Not yet wired to a backend — labelled so nobody reads them as real.
  const pendingCards: AttentionCard[] = [
    {
      icon: DollarSign,
      label: "Billing issues",
      count: 0,
      severity: "low",
      action: "Review billing",
      route: "/app/billing",
      description: "Arrives with Billing",
      live: false,
    },
    {
      icon: ShieldCheck,
      label: "Compliance reviews",
      count: 0,
      severity: "low",
      action: "Open compliance",
      route: "/app/compliance",
      description: "Arrives with Compliance",
      live: false,
    },
    {
      icon: Zap,
      label: "Integration problems",
      count: 0,
      severity: "low",
      action: "Open settings",
      route: "/app/settings",
      description: "Arrives with Integrations",
      live: false,
    },
    {
      icon: Crown,
      label: "Escalations",
      count: 0,
      severity: "low",
      action: "Review escalations",
      route: "/app/subaccounts",
      description: "Arrives with Workforce",
      live: false,
    },
  ];

  const cards = [...workCards, ...pendingCards];

  return (
    <Card className="p-5 border-border shadow-sm">
      <div className="flex items-center justify-between mb-4">
        <div className="flex flex-wrap items-center gap-2.5">
          <Bell className="h-5 w-5 text-red-500" />
          <h2 className="text-base font-bold tracking-tight text-foreground">
            Needs Your Attention
          </h2>
          <Badge className={`${severityConfig.high.badge} font-semibold`}>
            {items.length} {items.length === 1 ? "item" : "items"}
          </Badge>
          <DataSourceBadge source={source} />
        </div>
        <Button
          size="sm"
          variant="outline"
          onClick={() => navigate("/app/attention")}
          className="shrink-0"
        >
          Open Attention Center <ChevronRight className="h-3.5 w-3.5 ml-1" />
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
        {cards.map((item) => {
          const cfg = severityConfig[item.severity];
          return (
            <button
              key={item.label}
              onClick={() => navigate(item.route)}
              className={`group text-left rounded-xl border p-4 transition-all hover:shadow-md hover:-translate-y-0.5 ${cfg.border} ${cfg.bg} ${
                item.live ? "" : "opacity-60"
              }`}
            >
              <div className="flex items-center justify-between">
                <item.icon className={`h-4 w-4 ${cfg.dot}`} />
                <span
                  className={`text-2xl font-extrabold tabular-nums ${cfg.countText}`}
                >
                  {item.live ? item.count : "—"}
                </span>
              </div>

              <p className="mt-2 text-xs font-bold text-foreground leading-snug">
                {item.label}
              </p>

              <p className="mt-0.5 text-[11px] text-muted-foreground line-clamp-1">
                {item.description}
              </p>

              <p className="mt-2 text-[11px] font-semibold opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-0.5 text-foreground/70">
                {item.action} <ArrowRight className="h-3 w-3" />
              </p>
            </button>
          );
        })}
      </div>
    </Card>
  );
};
