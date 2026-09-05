import { describe, expect, it } from "vitest";
import { formatKpiValue, monthLabel, shapePivot, type KpiColumn } from "./pivot-shape";

const cols: KpiColumn[] = [
  { key: "letters.mailed", label: "Letters mailed", aggregation: "count" },
  { key: "funding.funded_gross", label: "Funded volume", aggregation: "sum_amount" },
  { key: "letters.clients_mailed", label: "Clients", aggregation: "count_distinct_client" },
];

describe("pivot shaping", () => {
  it("orders values by the catalogue columns, labels rows, and totals only what can be totalled", () => {
    const t = shapePivot([{ row: "2026-08", "letters.mailed": 3, "funding.funded_gross": "45000", "letters.clients_mailed": 2 }, { row: "2026-09", "letters.mailed": 1, "funding.funded_gross": 0, "letters.clients_mailed": 1 }], cols, monthLabel);
    expect(t.rows.map((r) => r.label)).toEqual(["Aug 2026", "Sep 2026"]);
    expect(t.rows[0].values).toEqual([3, 45000, 2]);
    expect(t.totals).toEqual([4, 45000, null]);   // distinct clients across rows cannot be summed
  });
  it("keeps a null row key readable and treats missing cells as null", () => {
    const t = shapePivot([{ row: null, "letters.mailed": 2 }], cols);
    expect(t.rows[0].label).toBe("—");
    expect(t.rows[0].values).toEqual([2, null, null]);
  });
  it("formats by aggregation", () => {
    expect(formatKpiValue(45000, "sum_amount")).toBe("$45,000");
    expect(formatKpiValue(135, "sum_minutes")).toBe("2h 15m");
    expect(formatKpiValue(1234, "count")).toBe("1,234");
    expect(formatKpiValue(null, "count")).toBe("—");
  });
});
