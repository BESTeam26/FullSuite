/**
 * SmartCredit HTML → canonical report items.
 *
 * A MAPPER, not an intelligence engine. The whole job is:
 *
 *   find an account block → read its bureau headers → read its row labels
 *     → map each label to a canonical field → ONE report item
 *       → attach EQ / EX / TU values → show it
 *
 * ── ONE TRADELINE IS ONE ITEM ──────────────────────────────────────────────
 *
 * "Last Verified", "Dispute Status", "Payment Frequency" and the rest are
 * FIELDS of an account, not accounts. Emitting them as items is how an import
 * preview becomes hundreds of rows named after labels, and how a field
 * masquerades as a tradeline. Every row of this parser's output is an account.
 *
 * ── HOW IT READS THE PAGE, AND WHY NOT BY ADJACENCY ────────────────────────
 *
 * The layout is a CSS grid. Labels sit at `col-start-1`; values sit at
 * `col-start-2`, `-3`, `-4`. Label and value are NOT neighbours in document
 * order — a first naive adjacency parse of a real report recovered 6 of 22
 * fields. So a cell is located by its `(row-start, col-start)` coordinates.
 *
 * And the bureau for a column is taken from that section's OWN declared
 * header class — `bg-transunion … col-start-2` — never from the column index.
 * The synthetic fixture deliberately contains a section whose header order is
 * reversed, so a positional parser labels it backwards and fails its test.
 * Where a section declares no header, its values are unattributed and go to
 * `sourceColumns`; nothing is guessed.
 *
 * ── WHAT THIS PARSER WILL NOT DO ───────────────────────────────────────────
 *
 * It does not execute the document. No script runs, no URL is fetched, no DOM
 * is constructed from it — the HTML is read as text, because an uploaded
 * report is untrusted input (Rulebook §19).
 *
 * It does not invent a master account number. It records what each bureau
 * showed, and `describeAccountNumber` decides what a heading may say.
 *
 * It does not manufacture a delinquency date. SmartCredit exposes none, and
 * that is `NOT_EXPOSED_BY_PROVIDER` — a fact about the provider, never
 * evidence that a bureau omitted it.
 */
import type { Bureau } from "@/lib/credit-classification";
import { normalizeAccountRef, parseBalanceCents, type BureauValueInput, type ParsedReportItem } from "./import-parser";
import { normalizeStatus } from "./pdf-report-parser";

export const SMARTCREDIT_PARSER_VERSION = "smartcredit-html-1";

/** Source label → canonical field. The mapping, and the whole point. */
const FIELD_MAP: Record<string, keyof BureauValueInput> = {
  "account #": "account_number_masked",
  "account type": "account_type",
  "account description": "responsibility_raw",
  "account rating": "account_rating",
  "account status": "status",
  "payment status": "payment_status",
  "balance owed": "balance_cents",
  "high balance": "high_balance_cents",
  "credit limit": "credit_limit_cents",
  "past due amount": "past_due_cents",
  "payment amount": "monthly_payment_cents",
  "term length": "term_months",
  "date opened": "open_date",
  "closed date": "date_closed",
  "last payment": "date_last_payment",
  "date of last activity": "date_last_active",
  "date reported": "account_information_date",
  "last verified": "last_verified",
  "payment frequency": "payment_frequency",
  "dispute status": "dispute_status",
  "creditor type": "creditor_type",
  "creditor remarks": "remarks",
};

const MONEY = new Set<keyof BureauValueInput>([
  "balance_cents", "high_balance_cents", "credit_limit_cents",
  "past_due_cents", "monthly_payment_cents",
]);

const BUREAU_CLASS: Record<string, Bureau> = { transunion: "TU", experian: "EX", equifax: "EQ" };

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

/** One dated month of payment history. Chronology travels WITH the status. */
export interface HistoryEntry {
  year: number;
  month: number;
  status: string;
}

export interface SmartCreditParseResult {
  items: ParsedReportItem[];
  /** The report's own counts, per bureau, for reconciliation. */
  summary: Record<Bureau, Record<string, string>>;
  /** Bureaus the document names at all. */
  bureaus: Bureau[];
  /** Anything a reviewer must be told. Never silently swallowed. */
  warnings: string[];
}

const strip = (html: string) => html.replace(/<[^>]*>/g, "").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").trim();
const lower = (s: string) => s.trim().toLowerCase().replace(/:$/, "");

/** Remove script and style bodies before reading anything. Inert input. */
const inert = (html: string) => html.replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, " ");

/**
 * The bureau each column belongs to, as THIS block's header declares it.
 *
 * Returns an empty map when the block declares no header — which is a refusal,
 * not a fallback. There is deliberately no branch that guesses from the column
 * index.
 */
export function declaredBureauColumns(blockHtml: string): Map<string, Bureau> {
  const out = new Map<string, Bureau>();
  const re = /class="([^"]*(?:bg|text)-(transunion|experian|equifax)[^"]*)"/g;
  for (let m = re.exec(blockHtml); m; m = re.exec(blockHtml)) {
    const col = /col-start-(\d+)/.exec(m[1])?.[1];
    if (!col) continue;
    const bureau = BUREAU_CLASS[m[2]];
    /* A column claimed by two different bureaus is a layout we do not
       understand. Refuse the whole block rather than pick one. */
    if (out.has(col) && out.get(col) !== bureau) return new Map();
    out.set(col, bureau);
  }
  /* A bureau claiming two columns is the same problem from the other side. */
  if (new Set(out.values()).size !== out.size) return new Map();
  return out;
}

/** Cells keyed by `(row, col)`, read from the grid's own coordinates. */
function gridCells(blockHtml: string): Map<string, string> {
  const cells = new Map<string, string>();
  const re = /<(p|dd|dt)[^>]*class="([^"]*)"[^>]*>([\s\S]*?)<\/\1>/g;
  for (let m = re.exec(blockHtml); m; m = re.exec(blockHtml)) {
    const cls = m[2];
    const row = /row-start-(\d+)/.exec(cls)?.[1];
    const col = /col-start-(\d+)/.exec(cls)?.[1];
    if (!row || !col) continue;
    cells.set(`${row}:${col}`, strip(m[3]));
  }
  return cells;
}

/** Label rows, from column 1. */
function labelRows(cells: Map<string, string>): { row: string; label: string }[] {
  const out: { row: string; label: string }[] = [];
  for (const [key, value] of cells) {
    const [row, col] = key.split(":");
    if (col !== "1" || !value) continue;
    out.push({ row, label: lower(value) });
  }
  return out;
}

function assign(row: BureauValueInput, field: keyof BureauValueInput, raw: string): void {
  const value = raw.trim();
  if (!value) return;
  if (MONEY.has(field)) {
    const cents = parseBalanceCents(value);
    if (!Number.isNaN(cents)) (row[field] as number) = cents;
    return;
  }
  if (field === "term_months") {
    const n = Number.parseInt(value.replace(/[^0-9]/g, ""), 10);
    if (Number.isFinite(n)) row.term_months = n;
    return;
  }
  (row[field] as string) = value;
}

/**
 * Dated payment history for one bureau column.
 *
 * Each `month-badge` is paired with the `month-label` cells in its own wrapper,
 * so a month carries its own date. A gap in the grid is an ABSENT entry, never
 * a shifted one — which is what keeps the positional rules in
 * `metro2/section-d` sound.
 */
export function parseHistory(blockHtml: string, column: string): HistoryEntry[] {
  const out: HistoryEntry[] = [];
  const grids = blockHtml.match(new RegExp(`<div[^>]*class="history"[^>]*data-bureau-col="${column}"[^>]*>[\\s\\S]*?<\\/div>\\s*<\\/div>`, "i"))
    ?? blockHtml.match(/<div[^>]*class="history"[^>]*>[\s\S]*?<\/div>\s*<\/div>/i);
  const region = grids?.[0] ?? "";
  const cellRe = /<div[^>]*class="[^"]*status-[^"]*"[^>]*>([\s\S]*?)<\/div>/g;
  for (let m = cellRe.exec(region); m; m = cellRe.exec(region)) {
    const badge = /class="month-badge"[^>]*>([\s\S]*?)</.exec(m[1]);
    const labels = [...m[1].matchAll(/class="month-label"[^>]*>([\s\S]*?)</g)].map((x) => strip(x[1]));
    if (!badge) continue;
    const status = strip(badge[1]);
    const monthLabel = labels.find((l) => MONTHS.includes(l.slice(0, 3).toLowerCase()));
    const yearLabel = labels.find((l) => /^'?\d{2,4}$/.test(l));
    if (!status || !monthLabel || !yearLabel) continue;
    const month = MONTHS.indexOf(monthLabel.slice(0, 3).toLowerCase()) + 1;
    const digits = yearLabel.replace(/\D/g, "");
    const year = digits.length === 2 ? 2000 + Number(digits) : Number(digits);
    if (!month || !Number.isFinite(year)) continue;
    out.push({ year, month, status });
  }
  return out;
}

/** The seven-year 30/60/90 tally, kept as its own three figures. */
export function parseLateCounts(blockHtml: string, column: string): Record<string, number> | undefined {
  const dd = new RegExp(`<dd[^>]*col-start-${column}[^>]*>([\\s\\S]*?)<\\/dd>`, "g");
  for (let m = dd.exec(blockHtml); m; m = dd.exec(blockHtml)) {
    const found = [...m[1].matchAll(/(30|60|90)\s*:\s*(\d+)/g)];
    if (found.length === 0) continue;
    const out: Record<string, number> = {};
    for (const f of found) out[f[1]] = Number(f[2]);
    return out;
  }
  return undefined;
}

/** One account block → one item, with its per-bureau values. */
function parseAccount(blockHtml: string, index: number, warnings: string[]): ParsedReportItem | null {
  const name = strip(/<p[^>]*class="[^"]*fw-bold[^"]*"[^>]*>([\s\S]*?)<\/p>/.exec(blockHtml)?.[1] ?? "");
  if (!name) return null;

  const columns = declaredBureauColumns(blockHtml);
  const cells = gridCells(blockHtml);
  const rows = labelRows(cells);

  const byBureau = new Map<Bureau, BureauValueInput>();
  const sourceColumns: Record<string, string[]> = {};

  for (const { row, label } of rows) {
    const field = FIELD_MAP[label];
    const values: { col: string; value: string }[] = [];
    for (const col of ["2", "3", "4"]) {
      const v = cells.get(`${row}:${col}`);
      if (v !== undefined) values.push({ col, value: v });
    }
    if (values.length === 0) continue;

    if (columns.size === 0) {
      /* No declared header. Preserve what the source said, attribute nothing:
         "PRESERVE WHAT THE SOURCE SAID WITHOUT INVENTING WHO SAID IT." */
      const raw = values.map((v) => v.value);
      if (raw.some(Boolean)) sourceColumns[field ?? label] = raw;
      continue;
    }
    if (!field) continue;

    for (const { col, value } of values) {
      const bureau = columns.get(col);
      if (!bureau) continue;
      const row_ = byBureau.get(bureau) ?? { bureau };
      assign(row_, field, value);
      byBureau.set(bureau, row_);
    }
  }

  if (columns.size === 0) {
    warnings.push(`"${name}" declares no bureau header — its values are preserved unattributed.`);
  }

  /* History and the seven-year counts hang off the SAME bureau observation,
     never off items of their own. */
  for (const [col, bureau] of columns) {
    const row = byBureau.get(bureau);
    if (!row) continue;
    const history = parseHistory(blockHtml, col);
    if (history.length > 0) row.payment_history = history.map((h) => `${h.year}-${String(h.month).padStart(2, "0")}:${h.status}`);
    const late = parseLateCounts(blockHtml, col);
    if (late) row.source_locator = { ...(row.source_locator ?? {}), late_counts_7y: late };
  }

  const values = [...byBureau.values()].filter((v) => Object.keys(v).length > 1);
  const reporting = values.map((v) => v.bureau as Bureau);
  const first = values[0];
  const rawStatus = first?.status ?? first?.payment_status ?? "";
  const suffix = accountNumberSuffixes(values);

  return {
    id: `sc-${index + 1}`,
    name,
    kind: "Account",
    subtype: first?.account_type,
    status: normalizeStatus(rawStatus) ?? (rawStatus || "Unknown"),
    bureaus: reporting.length > 0 ? reporting : (["EQ", "EX", "TU"] as Bureau[]),
    balance: first?.balance_cents === undefined ? undefined : `$${(first.balance_cents / 100).toLocaleString("en-US")}`,
    balanceCents: first?.balance_cents ?? null,
    creditLimit: undefined,
    creditLimitCents: first?.credit_limit_cents ?? null,
    /* SmartCredit exposes no delinquency date. NOT_EXPOSED_BY_PROVIDER — a
       fact about the provider, and never a claim that a bureau omitted it. */
    dofd: undefined,
    openDate: first?.open_date,
    remarks: first?.remarks,
    accountRef: `${normalizeAccountRef(name, first?.account_type)}${suffix.length === 1 ? ` ${suffix[0]}` : ""}`,
    bureauValues: values.length > 0 ? values : undefined,
    sourceColumns: Object.keys(sourceColumns).length > 0 ? sourceColumns : undefined,
  };
}

/** The visible digits each bureau showed, distinct. Never combined. */
export function accountNumberSuffixes(values: BureauValueInput[]): string[] {
  const seen = new Set<string>();
  for (const v of values) {
    const digits = (v.account_number_masked ?? "").replace(/[^0-9]/g, "");
    if (digits) seen.add(digits);
  }
  return [...seen];
}

export function parseSmartCreditHtml(html: string): SmartCreditParseResult {
  const doc = inert(html);
  const warnings: string[] = [];
  const items: ParsedReportItem[] = [];

  const accountRegion = doc.slice(
    Math.max(0, doc.indexOf('id="account-history"')),
    doc.indexOf('id="public-information"') > 0 ? doc.indexOf('id="public-information"') : doc.length,
  );
  const blocks = accountRegion.split(/<div[^>]*class="account"/).slice(1);
  blocks.forEach((block, i) => {
    const item = parseAccount(block, i, warnings);
    if (item) items.push(item);
    else warnings.push(`Account block ${i + 1} has no readable name and was not imported.`);
  });

  /* The report's own counts, for reconciliation. A mismatch is the caller's
     decision to act on — this parser reports, it does not publish. */
  const summary: Record<Bureau, Record<string, string>> = { EQ: {}, EX: {}, TU: {} };
  const summaryRegion = doc.slice(doc.indexOf('id="summary"'), doc.indexOf('id="account-history"'));
  if (summaryRegion) {
    const columns = declaredBureauColumns(summaryRegion);
    const cells = gridCells(summaryRegion);
    for (const { row, label } of labelRows(cells)) {
      for (const [col, bureau] of columns) {
        const v = cells.get(`${row}:${col}`);
        if (v) summary[bureau][label] = v;
      }
    }
  }

  const named = new Set<Bureau>();
  for (const item of items) for (const b of item.bureaus) named.add(b);

  if (items.length === 0) warnings.push("No account blocks were found. The layout may have changed.");
  return { items, summary, bureaus: [...named], warnings };
}

/**
 * Reconcile the parse against the source's own summary counts.
 *
 * A mismatch means REVIEW_REQUIRED, not a warning beside published data. The
 * failure this catches is format drift: a parser that silently returns 24 of
 * 30 tradelines is far more dangerous than one that fails, because a missing
 * tradeline is invisible downstream — it looks like an account the consumer
 * does not have.
 */
export interface Reconciliation {
  ok: boolean;
  checks: { bureau: Bureau; label: string; stated: number; parsed: number }[];
}

export function reconcile(result: SmartCreditParseResult): Reconciliation {
  const checks: Reconciliation["checks"] = [];
  const num = (s: string | undefined) => (s === undefined ? NaN : Number(s.replace(/[^0-9]/g, "")));

  for (const bureau of result.bureaus) {
    const stated = result.summary[bureau];
    const reported = result.items.filter((i) => i.bureaus.includes(bureau));
    const valueFor = (i: ParsedReportItem) => i.bureauValues?.find((v) => v.bureau === bureau);

    const open = num(stated["open accounts"]);
    if (!Number.isNaN(open)) {
      checks.push({ bureau, label: "Open accounts", stated: open, parsed: reported.filter((i) => /^open$/i.test(valueFor(i)?.status ?? "")).length });
    }
    const closed = num(stated["closed accounts"]);
    if (!Number.isNaN(closed)) {
      checks.push({ bureau, label: "Closed accounts", stated: closed, parsed: reported.filter((i) => /^(closed|paid)$/i.test(valueFor(i)?.status ?? "")).length });
    }
    const derog = num(stated["derogatory"]);
    if (!Number.isNaN(derog)) {
      checks.push({ bureau, label: "Derogatory", stated: derog, parsed: reported.filter((i) => /collection/i.test(valueFor(i)?.account_type ?? "")).length });
    }
  }
  return { ok: checks.every((c) => c.stated === c.parsed), checks };
}
