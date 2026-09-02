import { Gauge, Building2, CircleDot, ArrowRight } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";

const platformHealth = [
  {
    module: "CreditOps",
    metric: "4 orgs",
    status: "Healthy" as const,
    uptime: "99.9%",
  },
  {
    module: "FundingOps",
    metric: "3 orgs",
    status: "Attention" as const,
    uptime: "97.2%",
  },
  {
    module: "DIY Credit",
    metric: "418 users",
    status: "Healthy" as const,
    uptime: "99.8%",
  },
  {
    module: "DFY Fulfillment",
    metric: "3 orgs",
    status: "Attention" as const,
    uptime: "94.1%",
  },
  {
    module: "BES CRM",
    metric: "5 orgs",
    status: "Healthy" as const,
    uptime: "99.5%",
  },
];

const subAccountHealth: {
  name: string;
  plan: string;
  status: "Healthy" | "Attention" | "Billing";
  attention: number;
  clients: number;
  sla: string;
}[] = [
  {
    name: "Apex Credit Co.",
    plan: "Full Suite",
    status: "Healthy",
    attention: 3,
    clients: 127,
    sla: "98%",
  },
  {
    name: "Pioneer Credit",
    plan: "CreditOps",
    status: "Healthy",
    attention: 1,
    clients: 64,
    sla: "96%",
  },
  {
    name: "Vantage Funding",
    plan: "FundingOps",
    status: "Attention",
    attention: 4,
    clients: 89,
    sla: "88%",
  },
  {
    name: "CreditFix Solutions",
    plan: "Full Suite",
    status: "Healthy",
    attention: 2,
    clients: 156,
    sla: "97%",
  },
  {
    name: "Empire Capital",
    plan: "CreditOps",
    status: "Billing",
    attention: 2,
    clients: 42,
    sla: "—",
  },
];

const statusConfig: Record<string, { dot: string; badge: string }> = {
  Healthy: {
    dot: "text-emerald-500",
    badge:
      "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/30 font-semibold",
  },
  Attention: {
    dot: "text-amber-500",
    badge:
      "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/30 font-semibold",
  },
  Billing: {
    dot: "text-red-500",
    badge:
      "bg-red-500/10 text-red-700 dark:text-red-400 border-red-500/30 font-semibold",
  },
};

function MiniBar({ value, color }: { value: string; color: string }) {
  const numVal = parseFloat(value);
  const pct = Math.min(100, isNaN(numVal) ? 0 : numVal);
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
        <div
          className={`h-full rounded-full ${color} transition-all`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-[10px] font-semibold text-muted-foreground tabular-nums w-9 text-right shrink-0">
        {value}
      </span>
    </div>
  );
}

export const HealthPanels = () => {
  const navigate = useNavigate();

  return (
    <div className="grid gap-6 lg:grid-cols-5">
      <Card className="p-5 border-border shadow-sm lg:col-span-2">
        <div className="flex items-center gap-2 mb-4">
          <Gauge className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
          <h2 className="text-base font-bold tracking-tight text-foreground">
            Platform Health
          </h2>
        </div>

        <div className="space-y-3">
          {platformHealth.map((p) => {
            const isHealthy = p.status === "Healthy";
            const cfg = statusConfig[p.status] ?? statusConfig.Healthy;
            return (
              <div
                key={p.module}
                className="rounded-lg border border-border bg-muted/20 px-4 py-3"
              >
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex items-center gap-2.5">
                    <CircleDot className={`h-2.5 w-2.5 ${cfg.dot}`} />
                    <span className="text-sm font-bold text-foreground">
                      {p.module}
                    </span>
                  </div>
                  <Badge variant="outline" className={cfg.badge}>
                    {p.status}
                  </Badge>
                </div>

                <div className="flex items-center gap-3 pl-4.5">
                  <span className="text-xs text-muted-foreground font-medium min-w-[72px]">
                    {p.metric}
                  </span>
                  <MiniBar
                    value={p.uptime}
                    color={isHealthy ? "bg-emerald-500" : "bg-amber-500"}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      <Card className="p-5 border-border shadow-sm lg:col-span-3">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Building2 className="h-5 w-5 text-amber-500" />
            <h2 className="text-base font-bold tracking-tight text-foreground">
              Sub-Account Health
            </h2>
            <span className="text-[10px] text-muted-foreground font-medium">
              {subAccountHealth.length} companies
            </span>
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={() => navigate("/app/subaccounts")}
            className="shrink-0"
          >
            View All <ArrowRight className="h-3.5 w-3.5 ml-1" />
          </Button>
        </div>

        <div className="overflow-hidden rounded-xl border border-border">
          <table className="w-full text-sm text-left">
            <thead>
              <tr className="bg-muted/50 text-[11px] uppercase text-muted-foreground">
                <th className="px-4 py-2.5 font-semibold">Company</th>
                <th className="px-4 py-2.5 font-semibold">Plan</th>
                <th className="px-4 py-2.5 font-semibold">Status</th>
                <th className="px-4 py-2.5 font-semibold text-right">
                  Clients
                </th>
                <th className="px-4 py-2.5 font-semibold text-right">SLA</th>
                <th className="px-4 py-2.5 font-semibold text-right">Flags</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {subAccountHealth.map((s) => {
                const cfg = statusConfig[s.status] ?? statusConfig.Healthy;
                return (
                  <tr
                    key={s.name}
                    className="hover:bg-muted/30 transition-colors"
                  >
                    <td className="px-4 py-3 font-semibold text-foreground">
                      {s.name}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground text-xs font-medium">
                      {s.plan}
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant="outline" className={cfg.badge}>
                        {s.status}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className="text-sm font-semibold text-foreground tabular-nums">
                        {s.clients}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span
                        className={`text-sm font-semibold tabular-nums ${
                          s.sla === "—"
                            ? "text-muted-foreground"
                            : parseFloat(s.sla) >= 95
                              ? "text-emerald-600 dark:text-emerald-400"
                              : parseFloat(s.sla) >= 90
                                ? "text-amber-600 dark:text-amber-400"
                                : "text-red-600 dark:text-red-400"
                        }`}
                      >
                        {s.sla}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span
                        className={`text-xs font-bold tabular-nums ${
                          s.attention > 0
                            ? "text-amber-600 dark:text-amber-400"
                            : "text-emerald-600 dark:text-emerald-400"
                        }`}
                      >
                        {s.attention > 0 ? `${s.attention} flags` : "Clear"}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
};
