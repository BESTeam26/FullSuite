/** Donut with a legend of label · count rows underneath. Empty data shows a quiet ring, never a blank. */
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";

export interface DonutSlice { label: string; value: number; color: string }
export function DonutLegend({ data, emptyText = "Nothing yet", height = 200 }: { data: DonutSlice[]; emptyText?: string; height?: number }) {
  const total = data.reduce((s, d) => s + d.value, 0);
  const slices = total > 0 ? data.filter((d) => d.value > 0) : [{ label: emptyText, value: 1, color: "hsl(var(--muted))" }];
  return (
    <div>
      <div style={{ height }} className="relative w-full">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={slices} dataKey="value" nameKey="label" innerRadius="55%" outerRadius="85%" paddingAngle={total > 0 ? 2 : 0} stroke="none" isAnimationActive={false}>
              {slices.map((s) => <Cell key={s.label} fill={s.color} />)}
            </Pie>
            {total > 0 && <Tooltip contentStyle={{ borderRadius: 12, border: "1px solid hsl(var(--border))", background: "hsl(var(--card))", fontSize: 12, color: "hsl(var(--foreground))" }} />}
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-2xl font-bold text-foreground">{total}</span>
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground">total</span>
        </div>
      </div>
      <ul className="mt-2 space-y-1.5">
        {data.map((d) => (
          <li key={d.label} className="flex items-center justify-between text-xs">
            <span className="inline-flex items-center gap-2 text-foreground"><span className="h-2.5 w-2.5 rounded-full" style={{ background: d.color }} />{d.label}</span>
            <span className="font-bold text-foreground">{d.value}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
