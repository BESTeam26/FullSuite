/** Horizontal bars for a short categorical list (lenders, bureaus). Integer axis; empty state text. */
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { TONE_FILL, type KpiTone } from "./KpiTile";

export function HorizontalBars({ data, tone = "blue", emptyText = "Nothing yet", unit = "Files" }: { data: { label: string; value: number }[]; tone?: KpiTone; emptyText?: string; unit?: string }) {
  if (data.length === 0) return <p className="py-8 text-center text-xs text-muted-foreground">{emptyText}</p>;
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <div style={{ height: Math.max(120, 44 * data.length + 30) }} className="w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ top: 4, right: 16, left: 8, bottom: 0 }}>
          <CartesianGrid horizontal={false} stroke="hsl(var(--border))" strokeOpacity={0.6} />
          <XAxis type="number" allowDecimals={false} domain={[0, Math.max(4, max)]} tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={{ stroke: "hsl(var(--border))" }} />
          <YAxis type="category" dataKey="label" width={110} tick={{ fontSize: 11, fill: "hsl(var(--foreground))" }} tickLine={false} axisLine={false} />
          <Tooltip cursor={{ fill: "hsl(var(--muted))", opacity: 0.5 }} contentStyle={{ borderRadius: 12, border: "1px solid hsl(var(--border))", background: "hsl(var(--card))", fontSize: 12, color: "hsl(var(--foreground))" }} formatter={(v: number) => [v, unit]} />
          <Bar dataKey="value" fill={TONE_FILL[tone]} radius={[0, 4, 4, 0]} maxBarSize={22} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
