import {
  Receipt,
  Zap,
  ArrowRight,
  CreditCard,
  Gauge,
  Wallet,
  PiggyBank,
  TrendingUp,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";

const revenueStreams = [
  {
    label: "Platform SaaS",
    value: 8495,
    icon: CreditCard,
    colorBar: "bg-emerald-500",
    colorDot: "bg-emerald-500",
    colorText: "text-status-success",
  },
  {
    label: "Usage / Metering",
    value: 6624,
    icon: Gauge,
    colorBar: "bg-amber-500",
    colorDot: "bg-amber-500",
    colorText: "text-status-warning",
  },
  {
    label: "DFY Fulfillment",
    value: 11250,
    icon: Wallet,
    colorBar: "bg-blue-500",
    colorDot: "bg-blue-500",
    colorText: "text-status-info",
  },
  {
    label: "DIY / Other",
    value: 5281,
    icon: PiggyBank,
    colorBar: "bg-purple-500",
    colorDot: "bg-purple-500",
    colorText: "text-purple-600 dark:text-purple-400",
  },
];

const diyStats = [
  {
    label: "Active Consumers",
    value: "418",
    sub: "Total enrolled users",
    tone: "emerald" as const,
  },
  {
    label: "Partner Referrals",
    value: "264",
    sub: "From 5 active partners",
    tone: "blue" as const,
  },
  {
    label: "Direct Signups",
    value: "154",
    sub: "Non-attributed organic",
    tone: "amber" as const,
  },
  {
    label: "Managed Credit Requests",
    value: "24",
    sub: "Routed to partners",
    tone: "purple" as const,
  },
  {
    label: "Funding Requests",
    value: "18",
    sub: "Passed to FundingOps",
    tone: "emerald" as const,
  },
  {
    label: "Conversion Rate",
    value: "11.5%",
    sub: "DIY → Paid service",
    tone: "blue" as const,
  },
];

const diyToneStyle: Record<
  string,
  { value: string; bg: string; border: string }
> = {
  emerald: {
    value: "text-status-success",
    bg: "bg-emerald-500/5",
    border: "border-emerald-500/20",
  },
  blue: {
    value: "text-blue-700 dark:text-blue-400",
    bg: "bg-blue-500/5",
    border: "border-blue-500/20",
  },
  amber: {
    value: "text-status-warning",
    bg: "bg-amber-500/5",
    border: "border-amber-500/20",
  },
  purple: {
    value: "text-purple-700 dark:text-purple-400",
    bg: "bg-purple-500/5",
    border: "border-purple-500/20",
  },
};

export const RevenueAndDiyPanels = () => {
  const navigate = useNavigate();
  const totalRevenue = revenueStreams.reduce((acc, r) => acc + r.value, 0);

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card className="p-5 border-border shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Receipt className="h-5 w-5 text-status-success" />
            <h2 className="text-base font-bold tracking-tight text-foreground">
              Revenue Mix
            </h2>
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={() => navigate("/app/subaccounts")}
            className="shrink-0"
          >
            View Billing <ArrowRight className="h-3.5 w-3.5 ml-1" />
          </Button>
        </div>

        <div className="mb-5 pb-4 border-b border-border">
          <p className="text-3xl font-extrabold text-foreground tabular-nums leading-tight">
            ${totalRevenue.toLocaleString()}
          </p>
          <div className="flex items-center gap-2 mt-1">
            <TrendingUp className="h-3.5 w-3.5 text-status-success" />
            <span className="text-sm font-semibold text-status-success">
              +14.2% vs last month
            </span>
            <span className="text-[10px] text-muted-foreground">
              Total monthly recurring revenue
            </span>
          </div>
        </div>

        <div className="space-y-3.5">
          {revenueStreams.map((r) => {
            const pct = ((r.value / totalRevenue) * 100).toFixed(1);
            return (
              <div key={r.label}>
                <div className="flex items-center justify-between text-sm mb-1">
                  <div className="flex items-center gap-2">
                    <div className={`h-2.5 w-2.5 rounded-full ${r.colorDot}`} />
                    <r.icon className="h-4 w-4 text-muted-foreground" />
                    <span className="font-semibold text-foreground">
                      {r.label}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`font-bold tabular-nums ${r.colorText}`}>
                      ${r.value.toLocaleString()}
                    </span>
                    <span className="text-[11px] text-muted-foreground tabular-nums w-10 text-right">
                      {pct}%
                    </span>
                  </div>
                </div>

                <div className="h-2.5 rounded-full bg-muted overflow-hidden">
                  <div
                    className={`h-full rounded-full ${r.colorBar} transition-all duration-500`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      <Card className="p-5 border-amber-500/30 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-500/10 text-status-warning">
              <Zap className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-bold tracking-tight text-foreground">
                BES DIY Credit
              </h2>
              <p className="text-[11px] text-muted-foreground">
                Program performance & referral analytics
              </p>
            </div>
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={() => navigate("/app/diy-management")}
            className="shrink-0 border-amber-500/30 text-status-warning hover:bg-amber-500/10"
          >
            Manage DIY <ArrowRight className="h-3.5 w-3.5 ml-1" />
          </Button>
        </div>

        <div className="grid gap-3 grid-cols-2 sm:grid-cols-3">
          {diyStats.map((d) => {
            const ts = diyToneStyle[d.tone];
            return (
              <div
                key={d.label}
                className={`rounded-xl border ${ts.border} ${ts.bg} p-3.5`}
              >
                <p
                  className={`text-xl font-extrabold tabular-nums leading-tight ${ts.value}`}
                >
                  {d.value}
                </p>
                <p className="text-[11px] font-bold text-foreground mt-1 leading-snug">
                  {d.label}
                </p>
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  {d.sub}
                </p>
              </div>
            );
          })}
        </div>
      </Card>
    </div>
  );
};
