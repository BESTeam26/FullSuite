/**
 * ChartLegend — a recharts `<Legend>` whose labels are readable.
 *
 * Recharts paints each legend label in its series colour. That is fine for the
 * line or bar itself, which is a thick graphic held to a 3:1 floor, but the
 * label is small text held to 4.5:1 — and the series colours measured
 * 2.15–3.68:1 on the light card. The label was effectively unreadable while the
 * chart beside it looked correct (rule 15).
 *
 * The swatch keeps the series colour, so the mapping from label to line is
 * unchanged; only the text switches to the foreground token, which is defined
 * in both themes.
 */
import { Legend } from "recharts";

/** The subset callers actually pass; recharts' own props type carries a `ref` that conflicts. */
interface ChartLegendProps {
  wrapperStyle?: React.CSSProperties;
  verticalAlign?: "top" | "middle" | "bottom";
  align?: "left" | "center" | "right";
}

export function ChartLegend({ wrapperStyle, ...rest }: ChartLegendProps) {
  return (
    <Legend
      iconType="circle"
      wrapperStyle={{ fontSize: 11, ...wrapperStyle }}
      formatter={(value) => (
        <span style={{ color: "hsl(var(--foreground))" }}>{value}</span>
      )}
      {...rest}
    />
  );
}
