/**
 * Client-side CSV export of what a table shows — the rows the person can
 * already see, nothing more (rule 1: no export widens access). Values are
 * quoted; the file downloads through a temporary link.
 */
export function toCsv(headers: string[], rows: (string | number | null | undefined)[][]): string {
  const cell = (v: string | number | null | undefined) => { const s = v === null || v === undefined ? "" : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  return [headers.map(cell).join(","), ...rows.map((r) => r.map(cell).join(","))].join("\n");
}
export function downloadCsv(filename: string, headers: string[], rows: (string | number | null | undefined)[][]): void {
  const blob = new Blob([toCsv(headers, rows)], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a"); a.href = url; a.download = filename.endsWith(".csv") ? filename : `${filename}.csv`; a.click();
  URL.revokeObjectURL(url);
}
