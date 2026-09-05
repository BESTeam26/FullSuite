/** Stacked horizontal bars: one row per category, segments per outcome. Descriptive counts with a legend; no ordering implies preference. */
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

export interface StackSegment { key: string; label: string; color: string }
export function StackedOutcomeBars({ data, segments, emptyText = "Nothing yet" }: { data: Record<string, string | number>[]; segments: StackSegment[]; emptyText?: string }) {
  if (data.length === 0) return <p className="py-8 text-center text-xs text-muted-foreground">{emptyText}</p>;
  return (
    <div style={{ height: Math.max(140, 44 * data.length + 50) }} className="w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ top: 4, right: 16, left: 8, bottom: 0 }}>
          <CartesianGrid horizontal={false} stroke="hsl(var(--border))" strokeOpacity={0.6} />
          <XAxis type="number" allowDecimals={false} tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={{ stroke: "hsl(var(--border))" }} />
          <YAxis type="category" dataKey="label" width={120} tick={{ fontSize: 11, fill: "hsl(var(--foreground))" }} tickLine={false} axisLine={false} />
          <Tooltip cursor={{ fill: "hsl(var(--muted))", opacity: 0.5 }} contentStyle={{ borderRadius: 12, border: "1px solid hsl(var(--border))", background: "hsl(var(--card))", fontSize: 12, color: "hsl(var(--foreground))" }} />
          <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11 }} />
          {segments.map((s, i) => <Bar key={s.key} dataKey={s.key} name={s.label} stackId="outcome" fill={s.color} maxBarSize={22} radius={i === segments.length - 1 ? [0, 4, 4, 0] : 0} />)}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
