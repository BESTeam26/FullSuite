// Per-bureau factor radar charts — visually compare EQ vs EX vs TU factor
// strengths at a glance. Hardcoded FICO factor logic, not a guarantee.

import { useMemo } from "react";
import { Radar as RadarIcon } from "lucide-react";
import {
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { useClientWorkspace } from "@/lib/client-workspace-context";
import { analyzeScorePotential } from "@/lib/score-potential";

const factorLabels: Record<string, string> = {
  payment: "Payment",
  utilization: "Utilization",
  history: "History",
  mix: "Mix",
  inquiries: "Inquiries",
};

const bureauColor: Record<string, string> = {
  EQ: "#ef4444",
  EX: "#3b82f6",
  TU: "#10b981",
};

const BureauRadarCharts = () => {
  const { items } = useClientWorkspace();
  const analysis = useMemo(() => analyzeScorePotential(items), [items]);

  // Build radar data: each factor has EQ/EX/TU current values
  const radarData = [
    "payment",
    "utilization",
    "history",
    "mix",
    "inquiries",
  ].map((key) => {
    const row: Record<string, number | string> = {
      factor: factorLabels[key],
    };
    analysis.bureaus.forEach((b) => {
      const f = b.factors.find((f) => f.key === key);
      row[b.bureau] = f ? f.current : 0;
    });
    return row;
  });

  return (
    <div className="rounded-2xl border border-border bg-card p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <RadarIcon className="h-4 w-4 text-emerald-600" />
          <h2 className="font-semibold">Per-Bureau Factor Comparison</h2>
          <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-emerald-600">
            Smart Logic
          </span>
        </div>
        <div className="flex flex-wrap gap-3">
          {analysis.bureaus.map((b) => (
            <div key={b.bureau} className="flex items-center gap-1.5">
              <span
                className="h-2.5 w-2.5 rounded-full"
                style={{ backgroundColor: bureauColor[b.bureau] }}
              />
              <span className="text-xs font-medium text-muted-foreground">
                {b.label}
              </span>
            </div>
          ))}
        </div>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        Compare factor strengths across all three bureaus at a glance — each
        bureau scores independently based on what it reports.
      </p>

      <div className="mt-4 h-[340px]">
        <ResponsiveContainer width="100%" height="100%">
          <RadarChart data={radarData} outerRadius="72%">
            <PolarGrid stroke="hsl(var(--border))" />
            <PolarAngleAxis
              dataKey="factor"
              tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }}
            />
            <PolarRadiusAxis
              domain={[0, 100]}
              tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }}
              angle={90}
            />
            {analysis.bureaus.map((b) => (
              <Radar
                key={b.bureau}
                name={b.label}
                dataKey={b.bureau}
                stroke={bureauColor[b.bureau]}
                fill={bureauColor[b.bureau]}
                fillOpacity={0.12}
                strokeWidth={2}
              />
            ))}
            <Legend wrapperStyle={{ fontSize: 11 }} iconType="circle" />
          </RadarChart>
        </ResponsiveContainer>
      </div>

      {/* Per-bureau summary chips */}
      <div className="mt-4 grid grid-cols-3 gap-3">
        {analysis.bureaus.map((b) => (
          <div
            key={b.bureau}
            className="rounded-xl border border-border bg-muted/30 p-3"
          >
            <p className="text-xs font-medium text-muted-foreground">
              {b.label}
            </p>
            <p className="mt-1 text-lg font-bold">
              {b.currentEstimate}
              <span className="text-xs font-normal text-emerald-600">
                {" "}
                → {b.ceilingEstimate}
              </span>
            </p>
            <p className="text-[10px] text-muted-foreground">
              +{b.gap} pts headroom
            </p>
          </div>
        ))}
      </div>
    </div>
  );
};

export default BureauRadarCharts;
