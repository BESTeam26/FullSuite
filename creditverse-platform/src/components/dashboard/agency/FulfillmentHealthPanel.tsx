import { Inbox, Clock, ArrowRight } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import type { FulfillmentWorkOrder } from "@/lib/agency-context";

interface MetricDef {
  label: string;
  value: string;
  tone: "neutral" | "warn" | "danger" | "info" | "good";
  sub?: string;
}

const fulfillmentMetrics: MetricDef[] = [
  { label: "Open Work", value: "126", tone: "neutral" },
  { label: "Due Today", value: "18", tone: "warn", sub: "requires action" },
  { label: "SLA Risk", value: "5", tone: "danger", sub: "breach imminent" },
  { label: "Ready for QA", value: "7", tone: "info" },
  { label: "Blocked", value: "3", tone: "danger", sub: "waiting on client" },
  { label: "On-Time SLA", value: "94%", tone: "good", sub: "target ≥ 95%" },
];

const toneStyle: Record<string, { value: string; label: string; bg: string }> =
  {
    neutral: {
      value: "text-foreground",
      label: "text-muted-foreground",
      bg: "bg-muted/30",
    },
    warn: {
      value: "text-status-warning",
      label: "text-status-warning/70/50",
      bg: "bg-amber-500/5",
    },
    danger: {
      value: "text-red-700 dark:text-red-400",
      label: "text-status-danger/70/50",
      bg: "bg-red-500/5",
    },
    info: {
      value: "text-blue-700 dark:text-blue-400",
      label: "text-status-info/70/50",
      bg: "bg-blue-500/5",
    },
    good: {
      value: "text-status-success",
      label: "text-status-success/70/50",
      bg: "bg-emerald-500/5",
    },
  };

const statusBadgeConfig: Record<string, string> = {
  "In Processing":
    "bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/20 font-semibold",
  "Ready for QA":
    "bg-purple-500/10 text-purple-700 dark:text-purple-400 border-purple-500/20 font-semibold",
  Pending:
    "bg-amber-500/10 text-status-warning border-amber-500/20 font-semibold",
  Blocked:
    "bg-red-500/10 text-red-700 dark:text-red-400 border-red-500/20 font-semibold",
};

export const FulfillmentHealthPanel = ({
  pendingWorkOrders,
}: {
  pendingWorkOrders: FulfillmentWorkOrder[];
}) => {
  const navigate = useNavigate();

  return (
    <Card className="p-5 border-border shadow-sm">
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-2">
          <Inbox className="h-5 w-5 text-status-warning" />
          <h2 className="text-base font-bold tracking-tight text-foreground">
            Fulfillment Health
          </h2>
          <span className="text-[10px] text-muted-foreground font-medium">
            Live queue status
          </span>
        </div>
        <Button
          size="sm"
          onClick={() => navigate("/app/fulfillment")}
          className="bg-gradient-to-r from-amber-500 to-amber-600 text-charcoal font-bold shadow-sm hover:shadow-md transition-shadow"
        >
          Open Fulfillment Desk <ArrowRight className="h-3.5 w-3.5 ml-1" />
        </Button>
      </div>

      <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 mb-5">
        {fulfillmentMetrics.map((m) => {
          const ts = toneStyle[m.tone];
          return (
            <div
              key={m.label}
              className={`rounded-xl border border-border ${ts.bg} p-4 text-center`}
            >
              <p
                className={`text-2xl font-extrabold tabular-nums leading-tight ${ts.value}`}
              >
                {m.value}
              </p>
              <p className="mt-1 text-[11px] font-bold uppercase tracking-wider text-foreground">
                {m.label}
              </p>
              {m.sub && (
                <p className="mt-0.5 text-[10px] italic text-muted-foreground">
                  {m.sub}
                </p>
              )}
            </div>
          );
        })}
      </div>

      <div>
        <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2.5 flex items-center gap-1.5">
          <Clock className="h-3.5 w-3.5" />
          Urgent Work Queue
          <span className="font-normal normal-case text-muted-foreground">
            — sorted by SLA proximity
          </span>
        </p>
        <div className="overflow-hidden rounded-xl border border-border">
          <table className="w-full text-sm text-left">
            <thead>
              <tr className="bg-muted/50 text-[11px] uppercase text-muted-foreground">
                <th className="px-4 py-2.5 font-semibold">Order ID</th>
                <th className="px-4 py-2.5 font-semibold">Organization</th>
                <th className="px-4 py-2.5 font-semibold">Client</th>
                <th className="px-4 py-2.5 font-semibold">Type</th>
                <th className="px-4 py-2.5 font-semibold text-right">
                  SLA Left
                </th>
                <th className="px-4 py-2.5 font-semibold text-center">
                  Status
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {pendingWorkOrders.slice(0, 5).map((wo) => (
                <tr key={wo.id} className="hover:bg-muted/30 transition-colors">
                  <td className="px-4 py-3 font-mono text-xs font-bold text-status-warning">
                    {wo.id}
                  </td>
                  <td className="px-4 py-3 text-xs font-semibold text-foreground">
                    {wo.subAccountName}
                  </td>
                  <td className="px-4 py-3 text-xs text-foreground/80">
                    {wo.clientName}
                  </td>
                  <td className="px-4 py-3">
                    <Badge
                      variant="outline"
                      className="text-[10px] font-semibold border-border"
                    >
                      {wo.type}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <span
                      className={`text-xs font-bold tabular-nums flex items-center justify-end gap-1 ${
                        wo.slaHoursRemaining <= 24
                          ? "text-status-danger"
                          : wo.slaHoursRemaining <= 48
                            ? "text-status-warning"
                            : "text-status-success"
                      }`}
                    >
                      <Clock className="h-3 w-3" /> {wo.slaHoursRemaining}h
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <Badge
                      className={
                        statusBadgeConfig[wo.status] ??
                        statusBadgeConfig.Pending
                      }
                    >
                      {wo.status}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {pendingWorkOrders.length > 5 && (
          <p className="mt-2 text-[11px] text-muted-foreground text-right">
            Showing 5 of {pendingWorkOrders.length} open orders
          </p>
        )}
      </div>
    </Card>
  );
};
