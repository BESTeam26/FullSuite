import {
  AlertTriangle,
  DollarSign,
  ShieldCheck,
  Zap,
  Crown,
  Bell,
  ChevronRight,
  ArrowRight,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";

const attentionItems = [
  {
    icon: AlertTriangle,
    label: "Fulfillment SLA risks",
    count: 4,
    severity: "high" as const,
    action: "Open Fulfillment Desk",
    route: "/app/fulfillment",
    description: "Work orders approaching deadline",
  },
  {
    icon: DollarSign,
    label: "Billing issues",
    count: 2,
    severity: "high" as const,
    action: "Review billing",
    route: "/app/compliance",
    description: "Payment method or plan issues",
  },
  {
    icon: ShieldCheck,
    label: "Compliance reviews",
    count: 3,
    severity: "medium" as const,
    action: "Open compliance",
    route: "/app/compliance",
    description: "Contract or disclosure updates needed",
  },
  {
    icon: Zap,
    label: "Integration problem",
    count: 1,
    severity: "medium" as const,
    action: "Open settings",
    route: "/app/settings",
    description: "SmartCredit API sync error",
  },
  {
    icon: Crown,
    label: "Management escalations",
    count: 2,
    severity: "low" as const,
    action: "Review escalations",
    route: "/app/subaccounts",
    description: "Partner requests pending review",
  },
];

const severityConfig: Record<
  string,
  {
    border: string;
    bg: string;
    dot: string;
    countText: string;
    badge: string;
  }
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
  const totalCount = attentionItems.reduce((a, i) => a + i.count, 0);

  return (
    <Card className="p-5 border-border shadow-sm">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2.5">
          <Bell className="h-5 w-5 text-red-500" />
          <h2 className="text-base font-bold tracking-tight text-foreground">
            Needs Your Attention
          </h2>
          <Badge className={`${severityConfig.high.badge} font-semibold`}>
            {totalCount} items
          </Badge>
        </div>
        <Button
          size="sm"
          variant="outline"
          onClick={() => navigate("/app/fulfillment")}
          className="shrink-0"
        >
          Open Attention Center <ChevronRight className="h-3.5 w-3.5 ml-1" />
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        {attentionItems.map((item) => {
          const cfg = severityConfig[item.severity];
          return (
            <button
              key={item.label}
              onClick={() => navigate(item.route)}
              className={`group text-left rounded-xl border p-4 transition-all hover:shadow-md hover:-translate-y-0.5 ${cfg.border} ${cfg.bg}`}
            >
              <div className="flex items-center justify-between">
                <item.icon className={`h-4 w-4 ${cfg.dot}`} />
                <span
                  className={`text-2xl font-extrabold tabular-nums ${cfg.countText}`}
                >
                  {item.count}
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
