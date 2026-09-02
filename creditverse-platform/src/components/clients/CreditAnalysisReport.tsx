import {
  Trophy,
  CheckCircle2,
  Wallet,
  TrendingUp,
  Save,
  ArrowRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { ClassifiedItem } from "@/lib/credit-classification";

interface CreditAnalysisReportProps {
  items: ClassifiedItem[];
}

export const CreditAnalysisReport = ({ items }: CreditAnalysisReportProps) => {
  if (items.length === 0) return null;

  const negatives = items.filter((i) => i.isNegative);
  const disputeItems = items.filter((i) => i.disposition === "dispute");
  const totalNegBalance = negatives.reduce((sum, i) => {
    const n = parseFloat((i.balance || "$0").replace(/[^0-9.]/g, ""));
    return sum + (isNaN(n) ? 0 : n);
  }, 0);

  const categoryBreakdown = negatives.reduce<Record<string, number>>(
    (acc, i) => {
      acc[i.category] = (acc[i.category] ?? 0) + 1;
      return acc;
    },
    {},
  );

  const results = [
    {
      label: "Negatives to dispute",
      value: String(disputeItems.length),
      icon: Trophy,
    },
    {
      label: "Protected items",
      value: String(items.filter((i) => i.disposition === "never").length),
      icon: CheckCircle2,
    },
    {
      label: "Negative balance",
      value: `$${totalNegBalance.toLocaleString()}`,
      icon: Wallet,
    },
    {
      label: "Positive accounts",
      value: String(
        items.filter((i) => i.category.includes("Positive")).length,
      ),
      icon: TrendingUp,
    },
  ];

  return (
    <div className="rounded-2xl border border-border bg-card p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-semibold">Credit Analysis & Progress report</h2>
          <p className="text-xs text-muted-foreground">
            Auto-generated from the latest import — snapshot Aug 29, 2026
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge className="bg-emerald-500/10 text-emerald-600">
            Saved to dashboard
          </Badge>
          <Button variant="outline" size="sm">
            <Save className="h-3.5 w-3.5" /> Save report
          </Button>
        </div>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-4">
        {results.map((r) => (
          <div
            key={r.label}
            className="rounded-xl border border-border bg-muted/30 p-4"
          >
            <r.icon className="h-4 w-4 text-emerald-600" />
            <p className="mt-2 text-xl font-bold">{r.value}</p>
            <p className="text-xs text-muted-foreground">{r.label}</p>
          </div>
        ))}
      </div>

      <div className="mt-5">
        <p className="mb-2 text-xs font-medium uppercase text-muted-foreground">
          Negative breakdown by category
        </p>
        <div className="flex flex-wrap gap-2">
          {Object.entries(categoryBreakdown).map(([cat, count]) => (
            <span
              key={cat}
              className="flex items-center gap-1.5 rounded-full bg-red-500/10 px-3 py-1.5 text-xs font-medium text-red-600"
            >
              {cat}{" "}
              <span className="rounded-full bg-white/40 px-1.5">{count}</span>
            </span>
          ))}
        </div>
      </div>

      <div className="mt-5 flex items-center gap-2 rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4 text-sm">
        <ArrowRight className="h-4 w-4 text-emerald-600" />
        <span className="text-muted-foreground">
          Import complete. Review the categorized items below in the Dispute
          Dashboard, then build factual letters for the{" "}
          <span className="font-semibold text-emerald-600">
            {disputeItems.length} selected items
          </span>
          .
        </span>
      </div>
    </div>
  );
};
