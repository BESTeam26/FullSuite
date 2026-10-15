/**
 * Tables in a plain-text note.
 *
 * Dee, 2026-10-15: "Activity should allow copy-and-pasted table format of
 * information, just like ClickUp, from GHL forms. It's more accurate and
 * easier to read." A GHL form copied from the browser arrives as an HTML
 * table; pasted into a plain textarea it collapsed into one cell per line
 * (label, blank, value, label, blank, value…).
 *
 * The note stays plain text — a year of ClickUp comments is plain text and
 * the rail renders them as such — so a table is kept as lines of cells
 * separated by " | ", one line per row. Rendering recognises a run of such
 * lines and draws a table; everything else stays a paragraph. No HTML is
 * stored, nothing is ever injected into the page (rule 1).
 */

export const CELL_SEPARATOR = " | ";

/**
 * The first table in pasted HTML as " | "-separated lines, or null when the
 * clipboard holds no table. Cells are text only; nested markup is dropped.
 */
export function htmlTableToText(html: string): string | null {
  if (!/<table[\s>]/i.test(html)) return null;
  const doc = new DOMParser().parseFromString(html, "text/html");
  const table = doc.querySelector("table");
  if (!table) return null;
  const rows: string[] = [];
  for (const tr of Array.from(table.querySelectorAll("tr"))) {
    const cells = Array.from(tr.querySelectorAll("th, td"))
      .map((c) => (c.textContent ?? "").replace(/\s+/g, " ").trim());
    if (cells.some((c) => c.length > 0)) rows.push(cells.join(CELL_SEPARATOR));
  }
  return rows.length > 0 ? rows.join("\n") : null;
}

export type DetailBlock =
  | { kind: "text"; text: string }
  | { kind: "table"; rows: string[][] };

/** A pasted line is a table row when it has at least one " | " separator. */
const isRowLine = (line: string): boolean => line.includes(CELL_SEPARATOR);

/**
 * Split a note into paragraphs and tables: a run of two or more consecutive
 * row lines is a table; a single row line is just text with a pipe in it.
 */
export function detailBlocks(detail: string): DetailBlock[] {
  const lines = detail.split("\n");
  const blocks: DetailBlock[] = [];
  let text: string[] = [];
  let rows: string[][] = [];
  const flushText = () => { if (text.length) { blocks.push({ kind: "text", text: text.join("\n") }); text = []; } };
  const flushRows = () => {
    if (rows.length >= 2) { flushText(); blocks.push({ kind: "table", rows }); }
    else if (rows.length === 1) text.push(rows[0].join(CELL_SEPARATOR));
    rows = [];
  };
  for (const line of lines) {
    if (isRowLine(line)) rows.push(line.split(CELL_SEPARATOR).map((c) => c.trim()));
    else { flushRows(); text.push(line); }
  }
  flushRows();
  flushText();
  return blocks;
}
