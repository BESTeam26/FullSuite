/**
 * Tables in an email, rendered once for every function that sends one.
 *
 * Dee, 2026-10-01: the End of Day email must carry a table of what the agent
 * did, and a lead's email a table of their people. A section is a title with
 * either a table (columns, rows of plain strings) or lines; every cell is
 * escaped here, so a caller only ever supplies text.
 *
 * Column widths are left to the mail client; numeric columns are
 * right-aligned so totals line up. The plain-text alternative lays the same
 * rows out as "Col: value" lines, which is what a phone's preview shows.
 */
import { escapeHtml } from "./email-template.ts";

export interface EmailTable {
  columns: string[];
  rows: string[][];
  /** Which columns hold numbers (right-aligned). Defaults to none. */
  numeric?: boolean[];
}

export interface EmailSection {
  title: string;
  table?: EmailTable;
  lines?: string[];
}

export function renderSectionsHtml(sections: EmailSection[], colour: string): string {
  return sections.map((s) => {
    const heading = `<p style="margin:0 0 8px;font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:${colour}">${escapeHtml(s.title)}</p>`;
    let body = "";
    if (s.table && s.table.rows.length > 0) {
      const numeric = s.table.numeric ?? [];
      const th = s.table.columns.map((c, i) =>
        `<th align="${numeric[i] ? "right" : "left"}" style="padding:6px 8px;font-size:11px;font-weight:700;color:#475569;border-bottom:1px solid #e2e8f0;text-align:${numeric[i] ? "right" : "left"}">${escapeHtml(c)}</th>`).join("");
      const trs = s.table.rows.map((r) => `<tr>${r.map((cell, i) =>
        `<td align="${numeric[i] ? "right" : "left"}" style="padding:6px 8px;font-size:13px;line-height:1.45;color:#0f172a;border-bottom:1px solid #f1f5f9;vertical-align:top;text-align:${numeric[i] ? "right" : "left"}${numeric[i] ? ";font-weight:600;white-space:nowrap" : ""}">${escapeHtml(cell)}</td>`).join("")}</tr>`).join("");
      body = `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="width:100%;border-collapse:collapse"><thead><tr>${th}</tr></thead><tbody>${trs}</tbody></table>`;
    } else if (s.lines && s.lines.length > 0) {
      body = s.lines.map((l) => `<p style="margin:0 0 4px;font-size:14px;line-height:1.6;color:#334155">${escapeHtml(l)}</p>`).join("");
    } else {
      return "";
    }
    return `<div style="margin:0 0 20px">${heading}${body}</div>`;
  }).join("");
}

/** The same sections as text: a heading, then one line per row. */
export function sectionsText(sections: EmailSection[]): string[] {
  return sections.flatMap((s) => {
    if (s.table && s.table.rows.length > 0) {
      const cols = s.table.columns;
      return [s.title, ...s.table.rows.map((r) => r.map((cell, i) => (i === 0 ? cell : `${cols[i]}: ${cell}`)).filter(Boolean).join(" · "))].join("\n");
    }
    if (s.lines && s.lines.length > 0) return [s.title, ...s.lines].join("\n");
    return [];
  });
}
