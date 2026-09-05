/**
 * Shapes report_pivot() output for a table: rows come back as jsonb objects
 * ({ row, "<kpi>": value }); this orders columns by the catalogue, resolves row
 * labels (employee names, organization names, month labels), totals each KPI,
 * and formats values by aggregation. Pure; the numbers are the database's.
 */
export interface PivotRowJson { row: string | null; [kpi: string]: unknown }
export interface KpiColumn { key: string; label: string; aggregation: "count" | "sum_quantity" | "sum_minutes" | "sum_amount" | "count_distinct_client" }
export interface PivotTable { columns: KpiColumn[]; rows: { key: string; label: string; values: (number | null)[] }[]; totals: (number | null)[] }

export function shapePivot(rows: PivotRowJson[], columns: KpiColumn[], labelOf: (rowKey: string) => string = (k) => k): PivotTable {
  const shaped = rows.map((r) => {
    const key = r.row === null || r.row === undefined ? "—" : String(r.row);
    return { key, label: labelOf(key), values: columns.map((c) => toNumber(r[c.key])) };
  });
  const totals = columns.map((c, i) => c.aggregation === "count_distinct_client" ? null : shaped.reduce((s, r) => s + (r.values[i] ?? 0), 0));
  return { columns, rows: shaped, totals };
}
const toNumber = (v: unknown): number | null => (v === null || v === undefined ? null : Number.isFinite(Number(v)) ? Number(v) : null);

export function formatKpiValue(value: number | null, aggregation: KpiColumn["aggregation"]): string {
  if (value === null) return "—";
  if (aggregation === "sum_amount") return `$${Math.round(value).toLocaleString("en-US")}`;
  if (aggregation === "sum_minutes") { const h = Math.floor(value / 60), m = Math.round(value % 60); return h > 0 ? `${h}h ${m}m` : `${m}m`; }
  return value.toLocaleString("en-US");
}

/** "2026-09" → "Sep 2026" for month rows; anything else passes through. */
export function monthLabel(key: string): string {
  const m = /^(\d{4})-(\d{2})$/.exec(key);
  if (!m) return key;
  return `${["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][Number(m[2]) - 1]} ${m[1]}`;
}
