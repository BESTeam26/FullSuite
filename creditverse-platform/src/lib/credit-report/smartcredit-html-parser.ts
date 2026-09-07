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
import { bureausInOrder, normalizeStatus } from "./pdf-report-parser";
import { reasonFor, type CompletenessFact, type ReconciliationCheck } from "./completeness";
import { BADGE_TO_CODE, classifyCell } from "./smartcredit/source-fields";

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

/**
 * A year label: digits behind an apostrophe of any shape, or none. Which
 * glyph the export uses depends on the font it rendered with, so all the
 * usual forms are accepted rather than the one seen first.
 */
const YEAR_LABEL = /^['\u2018\u2019\u00b4\u02bc]?\d{2,4}$/;

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
  /** Public records and inquiries, as canonical items (S-15, S-16). They are
   *  also in `items`; these are the same objects, kept for reconciliation. */
  publicRecords: ParsedReportItem[];
  inquiries: ParsedReportItem[];
  /** Which bureaus the document shows a score for. */
  scores: { bureau: Bureau }[];
  /** Which required sections were found. A missing one is review_required. */
  sections: Record<string, boolean>;
  /** Anything a reviewer must be told. Never silently swallowed. */
  warnings: string[];
}

/** Money as the source prints it, so a stated figure is read and a blank is not. */
const AMOUNT_RE = /-?\$\s?\d[\d,]*(\.\d{2})?/;
const norm = (s: string) => s.trim().replace(/\s+/g, " ");

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
  /* A dash and a "NONE REPORTED" are the source saying this bureau reported
     nothing for the field. Storing the glyph made an em-dash look like a
     value — and an account every bureau left blank then read as an account
     every bureau reports. `classifyCell` is shared with the PDF adapter so
     the two formats cannot drift on what an empty cell means. */
  if (classifyCell(value) !== "value") return;
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
  /* The grid for THIS column, or nothing.
     There used to be a fallback to the first history grid in the block. It
     had to go: when a bureau reports no history the block has no grid for
     its column, and the fallback handed it the FIRST bureau's twenty-four
     months — publishing one bureau's payment record under another's name.
     A missing grid is a missing grid. */
  const grid = blockHtml.match(
    new RegExp(`<div[^>]*class="[^"]*\\bhistory\\b[^"]*"[^>]*data-bureau-col="${column}"[^>]*>[\\s\\S]*?<\\/div>\\s*<\\/div>`, "i"),
  );
  const region = grid?.[0] ?? "";
  /* The status comes from the CLASS, not the badge glyph.
     Two reasons, both learned from the real export. The provider's own
     legend declares `status-U` with an EMPTY badge, meaning the bureau
     reported nothing that month — real information, and reading the glyph
     drops the month entirely rather than recording the silence. And the code
     is the provider's own vocabulary, so a restyled glyph cannot change what
     a month means. The badge is kept as a fallback for a format that prints
     the glyph without the class. */
  const cellRe = /<div[^>]*class="([^"]*status-([A-Za-z0-9]*)[^"]*)"[^>]*>([\s\S]*?)<\/div>/g;
  for (let m = cellRe.exec(region); m; m = cellRe.exec(region)) {
    const code = m[2];
    const body = m[3];
    const badge = /class="month-badge"[^>]*>([\s\S]*?)</.exec(body);
    /* `month-label` is a class TOKEN: the real export writes
       `class="month-label text-center"` on 696 of its 706 cells, and an
       exact-string match reads none of them. */
    const labels = [...body.matchAll(/class="[^"]*\bmonth-label\b[^"]*"[^>]*>([\s\S]*?)</g)].map((x) => strip(x[1]));
    const status = code || (badge ? BADGE_TO_CODE[strip(badge[1]).toLowerCase()] ?? strip(badge[1]) : "");
    const monthLabel = labels.find((l) => MONTHS.includes(l.slice(0, 3).toLowerCase()));
    const yearLabel = labels.find((l) => YEAR_LABEL.test(l));
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
function parseAccount(
  blockHtml: string,
  index: number,
  warnings: string[],
  /** The bureaus the DOCUMENT names, for a block that declares no header. */
  documentBureaus: Bureau[],
): ParsedReportItem | null {
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
    /* Where attribution failed, the item still needs a non-empty bureau list —
       `report_items.bureaus` is NOT NULL. The DOCUMENT's own bureau set is the
       honest answer to "who reports this account", which is a different
       question from "which column is whose". Hardcoding all three would infer
       that all three report it, and a completeness fact records the ambiguity
       either way. */
    bureaus: reporting.length > 0 ? reporting : documentBureaus,
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

/** Source label → canonical field, for a PUBLIC RECORD's three columns. */
const PUBLIC_RECORD_MAP: Record<string, keyof BureauValueInput> = {
  type: "account_type",
  status: "status",
  "date filed/reported": "filed_on",
  "date filed": "filed_on",
  "reference#": "reference_number",
  "reference #": "reference_number",
  "closing date": "date_closed",
  court: "court",
  liability: "liability_cents",
  "asset amount": "asset_cents",
  "exempt amount": "exempt_cents",
};

const RECORD_MONEY = new Set<keyof BureauValueInput>(["liability_cents", "asset_cents", "exempt_cents"]);

/**
 * Public records: ONE record is ONE item, with per-bureau values where the
 * source's own header proves which column belongs to which bureau.
 *
 * Not a tradeline, and nothing here reads meaning into it. A record whose Type
 * says "Chapter 7 Bankruptcy" and whose Status says "Discharged" is stored as
 * those two strings — what the discharge covered, whether anything was
 * reaffirmed, and which tradelines it should have touched are legal readings,
 * and this parser makes none of them.
 */
function parsePublicRecords(doc: string, warnings: string[]): ParsedReportItem[] {
  const at = doc.indexOf('id="public-information"');
  if (at < 0) return [];
  const end = doc.indexOf('id="inquiries"');
  const region = doc.slice(at, end > at ? end : doc.length);

  const columns = declaredBureauColumns(region);
  const cells = gridCells(region);
  const rows = labelRows(cells);
  if (rows.length === 0) return [];

  const byBureau = new Map<Bureau, BureauValueInput>();
  const unattributed: Record<string, string[]> = {};

  for (const { row, label } of rows) {
    const field = PUBLIC_RECORD_MAP[label];
    const values = ["2", "3", "4"]
      .map((col) => ({ col, value: cells.get(`${row}:${col}`) }))
      .filter((v): v is { col: string; value: string } => v.value !== undefined);
    if (values.length === 0) continue;

    if (columns.size === 0) {
      const raw = values.map((v) => v.value);
      if (raw.some(Boolean)) unattributed[field ?? label] = raw;
      continue;
    }
    if (!field) continue;

    for (const { col, value } of values) {
      const bureau = columns.get(col);
      if (!bureau || !value.trim()) continue;
      const target = byBureau.get(bureau) ?? { bureau };
      if (RECORD_MONEY.has(field)) {
        const cents = parseBalanceCents(value.match(AMOUNT_RE)?.[0] ?? value);
        if (!Number.isNaN(cents)) (target[field] as number) = cents;
      } else {
        (target[field] as string) = norm(value);
      }
      byBureau.set(bureau, target);
    }
  }

  if (columns.size === 0) {
    warnings.push("The public records section declares no bureau header — its values are preserved unattributed.");
  }

  const values = [...byBureau.values()].filter((v) => Object.keys(v).length > 1);
  if (values.length === 0 && Object.keys(unattributed).length === 0) return [];

  const first = values[0];
  /* Named for what the source says it is. Nothing is inferred about it. */
  const name = first?.account_type ?? "Public record";
  const reference = values.map((v) => v.reference_number).find(Boolean);

  return [{
    id: "sc-pr-1",
    name,
    kind: "Public Record",
    subtype: first?.account_type,
    status: first?.status ?? "Unknown",
    bureaus: values.length > 0 ? values.map((v) => v.bureau as Bureau) : (["EQ", "EX", "TU"] as Bureau[]),
    balance: undefined,
    balanceCents: null,
    creditLimit: undefined,
    creditLimitCents: null,
    dofd: undefined,
    openDate: undefined,
    remarks: undefined,
    accountRef: `public record ${normalizeAccountRef(name)}${reference ? ` ${reference}` : ""}`,
    bureauValues: values.length > 0 ? values : undefined,
    sourceColumns: Object.keys(unattributed).length > 0 ? unattributed : undefined,
  }];
}

/**
 * Inquiries: ONE enquiry is ONE item.
 *
 * The bureau is stated PER ENQUIRY here rather than as three columns, so
 * attribution is direct and needs no header rule.
 *
 * `inquiry_type` is deliberately never set. SmartCredit does not state whether
 * an enquiry is hard, soft, promotional or an account review, so it stays
 * absent — which reads as UNKNOWN. Guessing it from the subscriber's name or
 * from how recent it is would put a whole healthy file's enquiries into a
 * retention rule written for hard ones.
 */
function parseInquiries(doc: string): ParsedReportItem[] {
  const at = doc.indexOf('id="inquiries"');
  if (at < 0) return [];
  const end = doc.indexOf('id="creditor-contacts"');
  const region = doc.slice(at, end > at ? end : doc.length);

  const items: ParsedReportItem[] = [];
  for (const [index, block] of region.split(/<div[^>]*class="inquiry"/).slice(1).entries()) {
    const fields = [...block.matchAll(/<p[^>]*class="[^"]*fw-bold[^"]*"[^>]*>([\s\S]*?)<\/p>\s*<p[^>]*>([\s\S]*?)<\/p>/g)]
      .map(([, label, value]) => [lower(strip(label)), strip(value)] as const);
    const read = (key: string) => fields.find(([l]) => l === key)?.[1];

    const subscriber = read("creditor name") ?? read("subscriber");
    const date = read("date of inquiry") ?? read("inquiry date");
    const bureauText = read("credit bureau") ?? "";
    const bureaus = bureausInOrder(bureauText).map((b) => b);
    if (!subscriber || bureaus.length === 0) continue;

    items.push({
      id: `sc-inq-${index + 1}`,
      name: subscriber,
      kind: "Inquiry",
      status: "Inquiry",
      bureaus,
      balanceCents: null,
      creditLimitCents: null,
      openDate: date,
      accountRef: `inquiry ${normalizeAccountRef(subscriber)}${date ? ` ${date}` : ""}`,
      bureauValues: bureaus.map((bureau) => ({
        bureau,
        inquiry_date: date,
        /* inquiry_type is NOT set. The source does not state it. */
      })),
    });
  }
  return items;
}

export function parseSmartCreditHtml(html: string): SmartCreditParseResult {
  const doc = inert(html);
  const warnings: string[] = [];
  const items: ParsedReportItem[] = [];

  const accountRegion = doc.slice(
    Math.max(0, doc.indexOf('id="account-history"')),
    doc.indexOf('id="public-information"') > 0 ? doc.indexOf('id="public-information"') : doc.length,
  );
  /* The document's own bureau set, read from the sections that DO declare a
     header. Resolved before any account block, so a block with no header has
     something honest to fall back on. */
  const documentBureaus: Bureau[] = [];
  for (const id of ["personal-information", "summary", "scores"]) {
    const at = doc.indexOf(`id="${id}"`);
    if (at < 0) continue;
    for (const bureau of declaredBureauColumns(doc.slice(at, at + 4000)).values()) {
      if (!documentBureaus.includes(bureau)) documentBureaus.push(bureau);
    }
    if (documentBureaus.length > 0) break;
  }

  const blocks = accountRegion.split(/<div[^>]*class="account"/).slice(1);
  blocks.forEach((block, i) => {
    const item = parseAccount(block, i, warnings, documentBureaus);
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

  /* Sections, records, inquiries and scores — counted for reconciliation.
     CR-14 needs the counts; mapping their fields is a later step. */
  const sections: Record<string, boolean> = {
    personal_information: doc.includes('id="personal-information"'),
    summary: doc.includes('id="summary"'),
    account_history: doc.includes('id="account-history"'),
    public_information: doc.includes('id="public-information"'),
    inquiries: doc.includes('id="inquiries"'),
  };

  /* S-15 and S-16: real items, not counts. One record is one item; one
     enquiry is one item. They join `items` so the writer stores them like any
     other, and `report_items.kind` keeps them apart. */
  const publicRecords = parsePublicRecords(doc, warnings);
  const inquiries = parseInquiries(doc);
  items.push(...publicRecords, ...inquiries);

  const scores: { bureau: Bureau }[] = [];
  const scoreRegion = doc.indexOf('id="scores"') >= 0
    ? doc.slice(doc.indexOf('id="scores"'), doc.indexOf('id="summary"') > doc.indexOf('id="scores"') ? doc.indexOf('id="summary"') : undefined)
    : "";
  for (const [col, bureau] of declaredBureauColumns(scoreRegion)) {
    if (new RegExp(`col-start-${col}"[^>]*>\\s*<h5[^>]*>\\s*\\d`, "i").test(scoreRegion)
        || new RegExp(`col-start-${col}"[^>]*>[\\s\\S]{0,120}?\\d{3}`, "i").test(scoreRegion)) {
      scores.push({ bureau });
    }
  }

  if (items.length === 0) warnings.push("No account blocks were found. The layout may have changed.");
  return { items, summary, bureaus: [...named], publicRecords, inquiries, scores, sections, warnings };
}

/**
 * Reconcile the parse against the source's own summary counts.
 *
 * A mismatch means the snapshot is PARTIAL. It never means the rows we failed
 * to read are deleted, absent, or non-reporting — six unparsed accounts look
 * exactly like six accounts the consumer does not have, and that confusion is
 * the whole reason this function exists.
 *
 * Every check the source makes possible is produced, including the ones that
 * pass: an operator seeing "27 expected / 27 parsed" learns something an
 * absent row does not tell them.
 */
export function reconcile(result: SmartCreditParseResult): ReconciliationCheck[] {
  const checks: ReconciliationCheck[] = [];
  const num = (s: string | undefined) => {
    if (s === undefined) return undefined;
    const digits = s.replace(/[^0-9]/g, "");
    return digits === "" ? undefined : Number(digits);
  };
  const push = (bureau: Bureau | undefined, checkKey: string, stated: number | undefined, parsed: number) => {
    checks.push({
      bureau,
      checkKey,
      stated,
      parsed,
      /* A check with no stated count has NOT passed — it could not be made.
         `deriveQuality` reads that as review_required rather than partial,
         because "we could not verify" is a worse position than "we are six
         short". */
      ok: stated !== undefined && stated === parsed,
      reason: stated === undefined ? "The source states no count for this." : undefined,
    });
  };

  for (const bureau of result.bureaus) {
    const stated = result.summary[bureau] ?? {};
    /* Accounts only. A public record or an enquiry is neither open nor closed
       and must never land in an account count. */
    const reported = result.items.filter((i) => i.kind === "Account" && i.bureaus.includes(bureau));
    const valueFor = (i: ParsedReportItem) => i.bureauValues?.find((v) => v.bureau === bureau);

    /* Accounts: the source states open and closed separately, so the total it
       vouches for is their sum. */
    const open = num(stated["open accounts"]);
    const closed = num(stated["closed accounts"]);
    const statedAccounts = open === undefined && closed === undefined ? undefined : (open ?? 0) + (closed ?? 0);
    push(bureau, "accounts", statedAccounts, reported.filter((i) => {
      const status = valueFor(i)?.status ?? "";
      return /^(open|closed|paid)$/i.test(status);
    }).length);

    push(bureau, "derogatory", num(stated["derogatory"]),
      reported.filter((i) => /collection/i.test(valueFor(i)?.account_type ?? "")).length);

    push(bureau, "public_records", num(stated["public records"]),
      result.publicRecords.filter((r) => r.bureaus.includes(bureau)).length);

    push(bureau, "inquiries", num(stated["inquiries (2 years)"]),
      result.inquiries.filter((r) => r.bureaus.includes(bureau)).length);

    /* Score PRESENCE, not value or count.
       The expectation of 1 comes from the report's own structure — it named
       this bureau in its headers — not from a count the source printed. Said
       out loud in the reason, because "1 expected" with no explanation would
       be exactly the invented figure this module refuses elsewhere. */
    const hasScore = result.scores.some((s) => s.bureau === bureau);
    checks.push({
      bureau,
      checkKey: "scores",
      stated: 1,
      parsed: hasScore ? 1 : 0,
      ok: hasScore,
      reason: hasScore
        ? undefined
        : "The report names this bureau but shows no score for it. The expectation of one comes from the report's own structure, not from a figure it printed.",
    });
  }

  /* Required sections. A missing section is `review_required`, not partial:
     the comparison could not be made at all. */
  for (const [name, present] of Object.entries(result.sections)) {
    checks.push({
      checkKey: `section:${name}`,
      stated: 1,
      parsed: present ? 1 : 0,
      ok: present,
      reason: present ? undefined : `The ${name.replace(/_/g, " ")} section was not found. The layout may have changed.`,
    });
  }

  return checks;
}

/**
 * What the format does not expose, stated once per report.
 *
 * These are facts about SMARTCREDIT, asserted from its field inventory — not
 * inferred from one report having no value. Recorded so a rule that needs one
 * of these fields can say "this provider does not report it" instead of the
 * vaguer "not reported", and so nobody ever reads the absence as a bureau's
 * omission.
 */
export const SMARTCREDIT_NOT_EXPOSED: readonly string[] = [
  "dofd",
  "score_model",
  "inquiry_type",
  "account_type_detail",
];

export function completenessFacts(result: SmartCreditParseResult): CompletenessFact[] {
  const facts: CompletenessFact[] = SMARTCREDIT_NOT_EXPOSED.map((fieldKey) => ({
    fieldKey,
    state: "not_exposed_by_provider" as const,
    reason: reasonFor("not_exposed_by_provider", fieldKey, "SmartCredit"),
  }));

  /* A bureau the document never names reported nothing here — which is
     different from the provider not exposing the field. */
  for (const bureau of ["EQ", "EX", "TU"] as Bureau[]) {
    if (!result.bureaus.includes(bureau)) {
      facts.push({
        bureau,
        fieldKey: "tradelines",
        state: "bureau_not_present",
        reason: reasonFor("bureau_not_present", "tradelines", "SmartCredit"),
      });
    }
  }

  /* Values the source printed in columns it did not attribute. Read, kept,
     and assigned to nobody. */
  const ambiguous = new Set<string>();
  for (const item of result.items) {
    for (const field of Object.keys(item.sourceColumns ?? {})) ambiguous.add(field);
    /* An item with no attributed values has a bureau list that came from the
       DOCUMENT, not from its own header. Say so rather than let it read as
       three bureaus confirming the account. */
    if (!item.bureauValues || item.bureauValues.length === 0) ambiguous.add("tradeline_bureaus");
  }
  for (const fieldKey of ambiguous) {
    facts.push({
      fieldKey,
      state: "ambiguous",
      reason: reasonFor("ambiguous", fieldKey, "SmartCredit"),
    });
  }

  /* An account block we could not name is our failure, and it is recorded as
     ours rather than as anybody's silence. */
  const unread = result.warnings.filter((w) => /not imported|no readable name/i.test(w));
  for (const [i, warning] of unread.entries()) {
    facts.push({
      fieldKey: `tradeline_block_${i + 1}`,
      state: "parse_failed",
      reason: warning,
    });
  }

  return facts;
}
