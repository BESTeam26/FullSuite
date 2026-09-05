/** Vertical bars, one per stage in pipeline order — counts, integer axis, angled labels. */
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { TONE_FILL, type KpiTone } from "./KpiTile";

export function StageBarChart({ data, tone = "emerald", height = 260 }: { data: { label: string; count: number }[]; tone?: KpiTone; height?: number }) {
  const max = Math.max(1, ...data.map((d) => d.count));
  return (
    <div style={{ height }} className="w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, left: -20, bottom: 56 }}>
          <CartesianGrid vertical={false} stroke="hsl(var(--border))" strokeOpacity={0.6} />
          <XAxis dataKey="label" interval={0} angle={-35} textAnchor="end" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={{ stroke: "hsl(var(--border))" }} />
          <YAxis allowDecimals={false} domain={[0, Math.max(4, max)]} tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} />
          <Tooltip cursor={{ fill: "hsl(var(--muted))", opacity: 0.5 }} contentStyle={{ borderRadius: 12, border: "1px solid hsl(var(--border))", background: "hsl(var(--card))", fontSize: 12, color: "hsl(var(--foreground))" }} formatter={(v: number) => [v, "Files"]} />
          <Bar dataKey="count" fill={TONE_FILL[tone]} radius={[4, 4, 0, 0]} maxBarSize={36} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
