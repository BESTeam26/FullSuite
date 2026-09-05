/**
 * Deterministic credit-report import (v1: structured CSV).
 *
 * Reads the export a monitoring service or an agent prepares — one row per
 * tradeline / inquiry / public record / personal item — into the item shape
 * the classifier and the analysis engines already consume. Nothing is
 * inferred: a row missing a required field, an unknown kind or bureau, is
 * reported back by line number and the import does not proceed. PDF/OCR
 * extraction is deliberately out of scope until a server-side parser exists;
 * this parser never guesses.
 */
import type { Bureau, ItemKind, RawReportItem } from "@/lib/credit-classification";

export const IMPORT_PARSER_VERSION = "csv-1";

export const REQUIRED_COLUMNS = ["name", "kind", "status", "bureaus"] as const;
export const OPTIONAL_COLUMNS = ["subtype", "balance", "dofd", "open_date", "linked_creditor", "remarks", "account_ref"] as const;

const KINDS: readonly ItemKind[] = ["Account", "Inquiry", "Personal", "Public Record"];
const BUREAUS: readonly Bureau[] = ["EQ", "EX", "TU"];

export interface ParsedReportItem extends RawReportItem {
  /** Stable handle for matching the same tradeline across imports. */
  accountRef: string;
  balanceCents: number | null;
}

export interface ParseFailure {
  line: number;
  problem: string;
}

export type ParseResult =
  | { ok: true; items: ParsedReportItem[]; warnings: string[] }
  | { ok: false; failures: ParseFailure[] };

/** RFC-4180-ish line splitter: quoted fields, doubled quotes, commas inside quotes. */
export function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (ch === '"') quoted = false;
      else cur += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") { out.push(cur); cur = ""; }
    else cur += ch;
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

/** "$1,240.50" → 124050; "" → null; anything non-numeric → NaN (reported). */
export function parseBalanceCents(text: string | undefined): number | null {
  if (!text || !text.trim()) return null;
  const cleaned = text.replace(/[$,\s]/g, "");
  if (!/^-?\d+(\.\d{1,2})?$/.test(cleaned)) return Number.NaN;
  return Math.round(Number(cleaned) * 100);
}

export const normalizeAccountRef = (name: string, subtype?: string) =>
  `${name} ${subtype ?? ""}`.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

export function parseCreditReportCsv(text: string): ParseResult {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) return { ok: false, failures: [{ line: 1, problem: "The file needs a header row and at least one item row." }] };

  const header = splitCsvLine(lines[0]).map((h) => h.toLowerCase().replace(/\s+/g, "_"));
  const failures: ParseFailure[] = [];
  for (const col of REQUIRED_COLUMNS) {
    if (!header.includes(col)) failures.push({ line: 1, problem: `Missing required column "${col}".` });
  }
  if (failures.length) return { ok: false, failures };
  const idx = (col: string) => header.indexOf(col);
  const cell = (row: string[], col: string) => (idx(col) >= 0 ? (row[idx(col)] ?? "") : "");

  const items: ParsedReportItem[] = [];
  const warnings: string[] = [];
  lines.slice(1).forEach((raw, i) => {
    const line = i + 2;
    const row = splitCsvLine(raw);
    const name = cell(row, "name");
    const kind = cell(row, "kind") as ItemKind;
    const status = cell(row, "status");
    const bureaus = cell(row, "bureaus").split(/[;|/ ]+/).filter(Boolean).map((b) => b.toUpperCase()) as Bureau[];
    if (!name) failures.push({ line, problem: "name is empty." });
    if (!KINDS.includes(kind)) failures.push({ line, problem: `kind "${kind}" is not one of ${KINDS.join(", ")}.` });
    if (!status) failures.push({ line, problem: "status is empty." });
    if (bureaus.length === 0 || bureaus.some((b) => !BUREAUS.includes(b))) failures.push({ line, problem: `bureaus "${cell(row, "bureaus")}" must be EQ, EX and/or TU.` });
    const balanceText = cell(row, "balance") || undefined;
    const balanceCents = parseBalanceCents(balanceText);
    if (Number.isNaN(balanceCents)) failures.push({ line, problem: `balance "${balanceText}" is not an amount.` });
    if (failures.some((f) => f.line === line)) return;
    const subtype = cell(row, "subtype") || undefined;
    items.push({
      id: `imp-${line}`,
      name,
      kind,
      subtype,
      status,
      bureaus,
      balance: balanceText,
      balanceCents: balanceCents as number | null,
      dofd: cell(row, "dofd") || undefined,
      openDate: cell(row, "open_date") || undefined,
      linkedCreditor: cell(row, "linked_creditor") || undefined,
      remarks: cell(row, "remarks") || undefined,
      accountRef: cell(row, "account_ref") || normalizeAccountRef(name, subtype),
    });
  });
  if (failures.length) return { ok: false, failures };
  if (items.every((it) => it.kind !== "Account")) warnings.push("No accounts found — only inquiries, personal or public-record items.");
  return { ok: true, items, warnings };
}
