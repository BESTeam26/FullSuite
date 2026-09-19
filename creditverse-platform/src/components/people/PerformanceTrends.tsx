/**
 * Performance Trends — five monthly series on one chart. Recharts, as the
 * rest of the app's charts are; colours follow the metric everywhere on the
 * page so the legend and the tiles read the same.
 */
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

export const METRIC_COLOR = {
  overall: "#059669",
  quality: "#7c3aed",
  output: "#d97706",
  compliance: "#dc2626",
  attendance: "#2563eb",
} as const;
export const METRIC_LABEL = {
  overall: "Overall", quality: "Quality", output: "Productivity & Output", compliance: "Compliance", attendance: "Attendance & Reliability",
} as const;

export interface TrendPoint {
  month: string;
  overall: number | null; quality: number | null; output: number | null; compliance: number | null; attendance: number | null;
}

export function PerformanceTrends({ points }: { points: TrendPoint[] }) {
  return (
    <div className="h-56 w-full" role="img" aria-label="Performance trends by month">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={points} margin={{ top: 8, right: 12, bottom: 0, left: -12 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
          <XAxis dataKey="month" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
          <YAxis domain={[0, 100]} ticks={[0, 25, 50, 75, 100]} tickFormatter={(v) => `${v}%`} tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
          <Tooltip formatter={(v: number | null) => (v === null ? "—" : `${v}%`)}
            contentStyle={{ fontSize: 12, borderRadius: 8, borderColor: "hsl(var(--border))" }} />
          <Legend iconType="circle" wrapperStyle={{ fontSize: 11 }} />
          {(Object.keys(METRIC_COLOR) as (keyof typeof METRIC_COLOR)[]).map((k) => (
            <Line key={k} type="monotone" dataKey={k} name={METRIC_LABEL[k]} stroke={METRIC_COLOR[k]} strokeWidth={2}
              dot={{ r: 3 }} connectNulls={false} isAnimationActive={false} />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
