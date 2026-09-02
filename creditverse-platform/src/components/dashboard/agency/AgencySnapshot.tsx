import {
  DollarSign,
  Building2,
  Users,
  Inbox,
  Zap,
  AlertTriangle,
  TrendingUp,
  Activity,
} from "lucide-react";
import { Card } from "@/components/ui/card";

/* Semantic tone tokens (WCAG AA compliant) */
const toneMap: Record<string, { bg: string; text: string; icon: string }> = {
  emerald: {
    bg: "bg-emerald-500/10",
    text: "text-emerald-700 dark:text-emerald-400",
    icon: "text-emerald-600 dark:text-emerald-400",
  },
  amber: {
    bg: "bg-amber-500/10",
    text: "text-amber-700 dark:text-amber-400",
    icon: "text-amber-600 dark:text-amber-400",
  },
  blue: {
    bg: "bg-blue-500/10",
    text: "text-blue-700 dark:text-blue-400",
    icon: "text-blue-600 dark:text-blue-400",
  },
  purple: {
    bg: "bg-purple-500/10",
    text: "text-purple-700 dark:text-purple-400",
    icon: "text-purple-600 dark:text-purple-400",
  },
  red: {
    bg: "bg-red-500/10",
    text: "text-red-700 dark:text-red-400",
    icon: "text-red-600 dark:text-red-400",
  },
};

function SnapshotCard({
  icon: Icon,
  label,
  value,
  trend,
  trendLabel,
  tone,
  unit = "",
  pending = false,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  trend?: string;
  trendLabel?: string;
  tone: keyof typeof toneMap;
  unit?: string;
  /** Not yet backed by data — render a dash rather than an invented number. */
  pending?: boolean;
}) {
  const t = toneMap[tone];
  return (
    <Card className="p-4 border-border shadow-sm hover:shadow-md transition-shadow">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          {label}
        </span>
        <div
          className={`flex h-8 w-8 items-center justify-center rounded-lg ${t.bg}`}
        >
          <Icon className={`h-4 w-4 ${t.icon}`} />
        </div>
      </div>

      <p className="text-2xl font-extrabold text-foreground leading-tight">
        {pending ? (
          <span className="text-muted-foreground" title="Not yet connected to a data source">
            —
          </span>
        ) : (
          <>
            {unit}
            {value}
          </>
        )}
      </p>

      {trend && (
        <div className="mt-1.5 flex items-center gap-1.5">
          {trend.startsWith("+") || trend.startsWith("↑") ? (
            <TrendingUp className={`h-3.5 w-3.5 ${toneMap.emerald.icon}`} />
          ) : trend.startsWith("-") ? (
            <TrendingUp
              className={`h-3.5 w-3.5 ${toneMap.red.icon} rotate-180`}
            />
          ) : null}

          <span
            className={`text-xs font-semibold ${
              trend.startsWith("+") || trend.startsWith("↑")
                ? toneMap.emerald.text
                : trend.startsWith("-")
                  ? toneMap.red.text
                  : "text-muted-foreground"
            }`}
          >
            {trend}
          </span>

          {trendLabel && (
            <span className="text-[10px] text-muted-foreground ml-0.5">
              {trendLabel}
            </span>
          )}
        </div>
      )}

      <div className="mt-3 h-px bg-border/60" />
    </Card>
  );
}

export const AgencySnapshot = ({
  totalMrr,
  subAccountsCount,
  totalClients,
  dfyCount,
  needsAttention,
}: {
  totalMrr: number;
  subAccountsCount: number;
  totalClients: number;
  dfyCount: number;
  needsAttention: number;
}) => (
  <div>
    <div className="flex items-center gap-2 mb-3">
      <Activity className="h-4 w-4 text-amber-500" />
      <h2 className="text-sm font-bold uppercase tracking-wider text-foreground">
        Executive Snapshot
      </h2>
      <span className="text-[10px] text-muted-foreground font-medium ml-1">
        Last 30 days
      </span>
    </div>

    <div className="grid gap-4 grid-cols-2 md:grid-cols-3 lg:grid-cols-6">
      <SnapshotCard
        icon={DollarSign}
        label="Platform MRR"
        value={totalMrr.toLocaleString()}
        unit="$"
        tone="emerald"
      />
      <SnapshotCard
        icon={Building2}
        label="Sub-Accounts"
        value={String(subAccountsCount)}
        tone="amber"
      />
      <SnapshotCard
        icon={Users}
        label="End Clients"
        value={String(totalClients)}
        tone="blue"
        pending={totalClients === 0}
      />
      <SnapshotCard
        icon={Inbox}
        label="DFY Subscribers"
        value={String(dfyCount)}
        tone="purple"
      />
      <SnapshotCard
        icon={Zap}
        label="DIY Users"
        value="0"
        tone="amber"
        pending
      />
      <SnapshotCard
        icon={AlertTriangle}
        label="Needs Attention"
        value={String(needsAttention)}
        tone="red"
      />
    </div>
  </div>
);
