/**
 * SmartCredit's PDF export, read as a grid.
 *
 * The PDF is a browser print of the same page the HTML export saves, so it
 * carries the same 22 fields in the same three-column layout — and it carries
 * them as positioned text, not as prose. This adapter reads that layout:
 * fragments become rows by baseline, rows become columns by left edge, and a
 * column is attributed to a bureau ONLY because the document prints that
 * bureau's name over it.
 *
 * Three rules shape everything here, and each one exists because the obvious
 * shortcut is wrong:
 *
 *   Columns are never assigned by order. A row where one bureau printed a
 *   dash and another printed nothing has fewer fragments than columns, and
 *   taking "the second value" as Experian shifts every figure one bureau
 *   left. Attribution comes from the header's own position; a column with no
 *   header keeps its values under `sourceColumns` with nobody's name on them.
 *
 *   Page breaks are not record boundaries. An account's fields routinely end
 *   on one page and its payment history begins on the next — in the real
 *   36-page export, most of them do. Rows are ordered by (page, y) and a
 *   block runs from its header to the next account heading, so a page break
 *   inside an account is invisible to the result. One tradeline, one item.
 *
 *   A colour is not a payment status. The print DOES render the history
 *   marks — they are filled rectangles, and their colours are recoverable —
 *   but it carries no machine-readable status label for them and no embedded
 *   key saying what a colour means. The months are read and dated from the
 *   source's own year markers, and each status is left undetermined with the
 *   observed fill attached as provenance. Translating the colour would mean
 *   printing our own inference about a delinquency to a consumer.
 */
import type { Bureau } from "@/lib/credit-classification";
import { normalizeAccountRef, type BureauValueInput, type ParsedReportItem } from "@/lib/credit-report/import-parser";
import type { CompletenessFact } from "@/lib/credit-report/completeness";
import {
  BUREAU_BY_NAME, DERIVED_LABELS, MONEY_FIELDS, MONTH_ABBREVIATIONS,
  SOURCE_FIELD_MAP, classifyCell, encodeHistoryMark, normaliseLabel,
} from "./source-fields";
import { SUMMARY_LABELS as SHARED_SUMMARY_LABELS, readSectionTotal, type SectionTotal } from "./reconciliation-scope";
import {
  COLUMN_TOLERANCE, cellAt, textInBand, toRows,
  type PdfFragment, type PdfGeometry, type PdfRect,
} from "./pdf-geometry";

export const SMARTCREDIT_PDF_PARSER_VERSION = "smartcredit-pdf-1";

/** One dated month, with what the format could establish about its status. */
export interface PdfHistoryEntry {
  bureau: Bureau;
  year: number;
  month: number;
  /** The provider's code where the format prints it; null where it does not. */
  status: string | null;
  /** Why the status is null, and what was seen instead. */
  unreadable?: { reason: "status_not_in_text_layer"; fill: string | null };
}

export interface SmartCreditPdfResult {
  items: ParsedReportItem[];
  summary: Record<Bureau, Record<string, string>>;
  bureaus: Bureau[];
  publicRecords: ParsedReportItem[];
  inquiries: ParsedReportItem[];
  scores: { bureau: Bureau }[];
  sections: Record<string, boolean>;
  warnings: string[];
  /** Per-field states: a zero, a dash and a "NONE REPORTED" stay distinct. */
  facts: CompletenessFact[];
  history: Record<string, PdfHistoryEntry[]>;
  /**
   * Figures the PROVIDER derived rather than a bureau furnished — Utilization
   * is the one the export prints. Kept, because the instruction is to lose
   * nothing the source exposes, but kept HERE rather than among the reported
   * values: storing it as a furnished field would make arithmetic look like
   * something a bureau said, and a later balance correction would leave a
   * stale percentage sitting beside it.
   *
   *   accountRef -> bureau -> label -> value as printed
   */
  derived: Record<string, Record<string, Record<string, string>>>;
  /**
   * Totals a SECTION states about itself, e.g. "We found 49 inquiries in the
   * past 3 years". Kept apart from `summary` because they cover different
   * periods and different bureaus — the summary's figures are per bureau over
   * two years, these are all bureaus over three.
   */
  sectionTotals: SectionTotal[];
  pageCount: number;
}

const BUREAU_NAME_RE = /^(TransUnion|Experian|Equifax)$/i;
const LABEL_COLUMN_MAX_X = 100;
const MONEY_RE = /-?\$\s?\d[\d,]*(\.\d{2})?/;
const DATE_RE = /^\d{1,2}\/\d{1,2}\/\d{4}$/;

/* ── Column attribution ────────────────────────────────────────────────── */

export interface ColumnBand {
  from: number;
  to: number;
  bureau: Bureau | null;
  /** Why a band has no bureau, so a reviewer can see it was refused. */
  reason?: "no_header" | "duplicate_bureau";
}

/**
 * The value columns of a block, and which bureau each belongs to.
 *
 * Value edges are found from where values actually sit — they cluster hard,
 * three points wide, across every row of a block. Bureau names are then
 * matched to bands by the CENTRE of the header text, because the export
 * centres its headers over columns whose values are left-aligned; using the
 * header's left edge would drift by the width of the bureau's name.
 *
 * A band with two headers, or none, is returned unattributed. There is
 * deliberately no branch that falls back to left-to-right order.
 */
export function attributeColumns(
  rows: PdfFragment[][],
  headerRow: PdfFragment[],
  isGridRow: (row: PdfFragment[]) => boolean = (row) => mappedField(labelOf(row)) !== undefined,
): ColumnBand[] {
  const counts = new Map<number, number>();
  /* ONLY the rows of THIS grid contribute column edges.
     An account block contains three grids, not one: the field table, the
     two-year payment history, and the seven-year late tally — and the last
     two have their own, different x positions. Letting a month row vote
     splits the field columns into a dozen slivers, and a bureau header then
     lands over a slice of the payment grid instead of over its own values.
     A grid row is identified by carrying one of THIS grid's labels, which is
     the document's own structure rather than a guess about spacing. */
  for (const row of rows.filter(isGridRow)) {
    for (const f of row) {
      if (f.x <= LABEL_COLUMN_MAX_X) continue;
      const key = [...counts.keys()].find((k) => Math.abs(k - f.x) <= COLUMN_TOLERANCE);
      if (key === undefined) counts.set(f.x, 1);
      else counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }
  /* A column edge shows up on many rows; a one-off wide value does not. */
  const edges = [...counts.entries()].filter(([, n]) => n >= 3).map(([x]) => x).sort((a, b) => a - b);
  if (!edges.length) return [];

  const bands: ColumnBand[] = edges.map((from, i) => ({
    from,
    to: i + 1 < edges.length ? edges[i + 1] : Number.POSITIVE_INFINITY,
    bureau: null,
    reason: "no_header" as const,
  }));

  const claimed = new Map<number, Bureau[]>();
  for (const f of headerRow) {
    if (!BUREAU_NAME_RE.test(f.text.trim())) continue;
    const bureau = BUREAU_BY_NAME[f.text.trim().toLowerCase()];
    const centre = f.x + f.width / 2;
    /* The band this header sits over. A header whose centre falls left of the
       first value edge still belongs to the first band. */
    let index = bands.findIndex((b) => centre >= b.from && centre < b.to);
    if (index < 0 && centre < bands[0].from) index = 0;
    if (index < 0) continue;
    claimed.set(index, [...(claimed.get(index) ?? []), bureau]);
  }
  for (const [index, list] of claimed) {
    if (list.length === 1) {
      bands[index].bureau = list[0];
      delete bands[index].reason;
    } else {
      bands[index].reason = "duplicate_bureau";
    }
  }
  return bands;
}

/* ── Blocks ────────────────────────────────────────────────────────────── */

interface Block {
  heading: string;
  headerRow: PdfFragment[];
  rows: PdfFragment[][];
}

/**
 * Split the document into account blocks.
 *
 * A block starts at a row carrying bureau names to the right of the label
 * column; its heading is the nearest preceding row in the label column. The
 * block then runs to the row before the next such header — across page
 * breaks, which is the point.
 */
export function findBlocks(rows: PdfFragment[][]): Block[] {
  /* Anchored on the account-number row, which every account block opens with,
     rather than on the bureau header. A block whose header is missing is
     still an account — it is the case that must not be silently attributed —
     and anchoring on the header would fold it into its neighbour. */
  const anchors: number[] = [];
  rows.forEach((row, i) => {
    if (mappedField(labelOf(row)) === "account_number_masked") anchors.push(i);
  });
  const blocks: Block[] = [];
  anchors.forEach((anchor, n) => {
    /* The heading first, then the header STRICTLY between it and the first
       field row.
       Searching backwards for the nearest bureau-name row instead would
       reach past the heading into the previous account's seven-year late
       tally, whose sub-headers also sit right of the label column — and this
       block would then be attributed by another account's headers. The real
       export puts those two rows exactly that close together. */
    const headingIndex = nearestHeadingBefore(rows, anchor);
    let headerIndex = -1;
    for (let i = anchor - 1; i > headingIndex; i--) {
      if (rows[i].some((f) => f.x > LABEL_COLUMN_MAX_X && BUREAU_NAME_RE.test(f.text.trim()))) {
        headerIndex = i;
        break;
      }
    }
    const end = n + 1 < anchors.length ? nearestHeadingBefore(rows, anchors[n + 1]) : rows.length;
    const body = rows.slice(anchor, end);
    const labelled = body.filter((r) => mappedField(labelOf(r)) !== undefined).length;
    if (labelled < 3) return;
    blocks.push({
      heading: textInBand(rows[headingIndex] ?? [], 0, LABEL_COLUMN_MAX_X + 200).trim(),
      headerRow: headerIndex >= 0 ? rows[headerIndex] : [],
      rows: body,
    });
  });
  return blocks;
}

/** Where the next account's heading starts, so this block stops before it. */
function nearestHeadingBefore(rows: PdfFragment[][], anchor: number): number {
  for (let i = anchor - 1; i >= 0 && i >= anchor - 4; i--) {
    const text = textInBand(rows[i], 0, LABEL_COLUMN_MAX_X + 200).trim();
    if (text && !BUREAU_NAME_RE.test(text) && !mappedField(normaliseLabel(textInBand(rows[i], 0, LABEL_COLUMN_MAX_X)))) {
      return i;
    }
  }
  return anchor;
}

function headingBefore(rows: PdfFragment[][], headerIndex: number): string {
  for (let i = headerIndex - 1; i >= 0 && i >= headerIndex - 3; i--) {
    const text = textInBand(rows[i], 0, LABEL_COLUMN_MAX_X + 200).trim();
    if (text && !BUREAU_NAME_RE.test(text) && !/^[®\s]+$/.test(text)) return text;
  }
  return "";
}

const labelOf = (row: PdfFragment[]) => normaliseLabel(textInBand(row, 0, LABEL_COLUMN_MAX_X));
const mappedField = (label: string) => SOURCE_FIELD_MAP[label];

/* ── Values ────────────────────────────────────────────────────────────── */

const centsFrom = (text: string): number | undefined => {
  const m = MONEY_RE.exec(text);
  if (!m) return undefined;
  const n = Number(m[0].replace(/[$\s,]/g, ""));
  return Number.isFinite(n) ? Math.round(n * 100) : undefined;
};

function assign(target: BureauValueInput, field: keyof BureauValueInput, text: string): void {
  if (MONEY_FIELDS.has(field)) {
    const cents = centsFrom(text);
    if (cents !== undefined) (target as unknown as Record<string, unknown>)[field] = cents;
    return;
  }
  if (field === "term_months") {
    const n = Number(text.replace(/[^\d]/g, ""));
    if (Number.isFinite(n)) target.term_months = n;
    return;
  }
  (target as unknown as Record<string, unknown>)[field] = text;
}

/* ── Payment history ───────────────────────────────────────────────────── */

/**
 * The dated months of one history row.
 *
 * The export prints a year marker — `'25` — in place of January, which is the
 * only statement of year the row makes. So the year comes from the source's
 * own markers: a marker sets the year and stands for that January, months
 * after it belong to it, and months before the first marker belong to the year
 * before. Nothing is derived from the fragment's index, which would put every
 * month in the wrong year the moment a bureau's row started in a different
 * month — and in the real export TransUnion's row starts in August while
 * Experian's starts in September.
 */
export function datedMonths(row: PdfFragment[]): { month: number; year: number; x: number }[] {
  const cells = row
    .filter((f) => {
      const t = f.text.trim();
      return MONTH_ABBREVIATIONS.includes(t.slice(0, 3).toLowerCase()) || YEAR_MARKER.test(t);
    })
    .sort((a, b) => a.x - b.x);
  const markers = cells
    .map((f, i) => ({ i, year: yearFrom(f.text) }))
    .filter((m): m is { i: number; year: number } => m.year !== null);
  if (!markers.length) return [];

  const out: { month: number; year: number; x: number }[] = [];
  for (let i = 0; i < cells.length; i++) {
    const text = cells[i].text.trim();
    const marker = markers.find((m) => m.i === i);
    if (marker) {
      out.push({ month: 1, year: marker.year, x: cells[i].x });
      continue;
    }
    const month = MONTH_ABBREVIATIONS.indexOf(text.slice(0, 3).toLowerCase()) + 1;
    if (!month) continue;
    const preceding = [...markers].reverse().find((m) => m.i < i);
    const year = preceding ? preceding.year : markers[0].year - 1;
    out.push({ month, year, x: cells[i].x });
  }
  return out;
}

/**
 * A year marker: two or four digits, optionally behind an apostrophe of any
 * shape. The export's own glyph depends on the font it was printed with —
 * a plain PDF print of the same page yields U+2019, not an ASCII quote — so
 * all the usual forms are accepted rather than the one seen first.
 */
const YEAR_MARKER = /^['\u2018\u2019\u00b4\u02bc]?\d{2,4}$/;

function yearFrom(text: string): number | null {
  const t = text.trim();
  if (!YEAR_MARKER.test(t)) return null;
  const digits = t.replace(/\D/g, "");
  if (digits.length === 2) return 2000 + Number(digits);
  if (digits.length === 4) return Number(digits);
  return null;
}

/**
 * The colour of the cell a month's label sits in, if the page drew one.
 *
 * The TIGHTEST containing rectangle, not the first. A print nests containers,
 * panels and clip boxes, and a page-wide background contains every month on
 * the page — taking the first match records one colour for the whole grid and
 * calls it each cell's own. A cell is the smallest box around its label.
 *
 * A box larger than a plausible cell yields nothing rather than a guess: the
 * point of recording the fill is to let a person check WHICH cell was
 * unreadable, and provenance pointing at a container is worse than none.
 */
const MAX_CELL_AREA = 2_000;
const MAX_CELL_SIDE = 60;

function fillAt(rects: PdfRect[], page: number, x: number, y: number): string | null {
  let best: PdfRect | null = null;
  for (const r of rects) {
    if (r.page !== page) continue;
    if (r.width > MAX_CELL_SIDE || r.height > MAX_CELL_SIDE) continue;
    if (r.width * r.height > MAX_CELL_AREA) continue;
    if (x < r.x - COLUMN_TOLERANCE || x > r.x + r.width + COLUMN_TOLERANCE) continue;
    if (y < r.y - 24 || y > r.y + r.height + 24) continue;
    if (!best || r.width * r.height < best.width * best.height) best = r;
  }
  return best?.fill ?? null;
}

/* ── The adapter ───────────────────────────────────────────────────────── */

export function parseSmartCreditPdf(geometry: PdfGeometry): SmartCreditPdfResult {
  const warnings: string[] = [];
  const facts: CompletenessFact[] = [];
  const rows = toRows(geometry.fragments);

  if (!geometry.hasTextLayer) {
    warnings.push("This PDF has no text layer. It is a scan, and this adapter does not read scans.");
    return {
      items: [], summary: emptySummary(), bureaus: [], publicRecords: [], inquiries: [],
      scores: [], sections: {}, warnings, facts, history: {}, derived: {},
      sectionTotals: [], pageCount: geometry.pageCount,
    };
  }

  const declared = declaredBureaus(rows);
  const blocks = findBlocks(rows);
  const items: ParsedReportItem[] = [];
  const history: Record<string, PdfHistoryEntry[]> = {};
  const derived: Record<string, Record<string, Record<string, string>>> = {};

  for (const block of blocks) {
    const bands = attributeColumns(block.rows, block.headerRow);
    if (!bands.length) {
      warnings.push(`"${block.heading}": no value columns found; nothing read from this block.`);
      continue;
    }
    const accountRef = refFor(block.heading, block, bands);
    const byBureau = new Map<Bureau, BureauValueInput>();
    const unattributed: Record<string, string[]> = {};

    for (const row of block.rows) {
      const label = labelOf(row);
      if (!label) continue;
      if (DERIVED_LABELS.has(label)) {
        for (const band of bands) {
          if (!band.bureau) continue;
          const text = textInBand(row, band.from, band.to);
          if (classifyCell(text) !== "value") continue;
          derived[accountRef] ??= {};
          derived[accountRef][band.bureau] ??= {};
          derived[accountRef][band.bureau][label] = text;
        }
        continue;
      }
      const field = mappedField(label);
      if (!field) continue;

      for (const band of bands) {
        const text = textInBand(row, band.from, band.to);
        const state = classifyCell(text);
        if (!band.bureau) {
          /* The values survive; nobody's name is attached to them. */
          if (state === "value") unattributed[field] = [...(unattributed[field] ?? []), text];
          continue;
        }
        if (state === "value") {
          /* Created only once a value actually lands. A column of em-dashes
             is a bureau that reported nothing, and an empty record for it
             would read as "this bureau reports the account". */
          const target = byBureau.get(band.bureau) ?? { bureau: band.bureau };
          byBureau.set(band.bureau, target);
          assign(target, field, text);
          facts.push({ bureau: band.bureau, fieldKey: `${accountRef}.${field}`, state: "present" });
        } else {
          facts.push({
            bureau: band.bureau,
            fieldKey: `${accountRef}.${field}`,
            state: state === "explicit_none_reported" ? "explicit_not_reported"
              : state === "not_reported_by_bureau" ? "bureau_not_present"
              : "blank_in_source",
            reason: state === "explicit_none_reported"
              ? "The report states none reported for this field."
              : state === "not_reported_by_bureau"
                ? "This bureau's column is a dash for this field."
                : "The cell rendered nothing.",
          });
        }
      }
    }

    for (const band of bands.filter((b) => !b.bureau)) {
      warnings.push(
        `"${block.heading}": a value column at x=${band.from} carries no bureau header` +
        `${band.reason === "duplicate_bureau" ? " (two headers claim it)" : ""}; its values are kept unattributed.`,
      );
    }

    const entries = readHistory(rows, block, geometry.rects, facts, accountRef);
    if (entries.length) history[accountRef] = entries;

    /* Written into the canonical field in the same `YYYY-MM:status` form the
       HTML adapter uses, with `?` where the print did not carry the mark. So
       a caller reading `payment_history` gets the same shape either way, and
       the months line up with the months rather than with an index. */
    for (const entry of entries) {
      const target = byBureau.get(entry.bureau) ?? { bureau: entry.bureau };
      byBureau.set(entry.bureau, target);
      target.payment_history = [
        ...(target.payment_history ?? []),
        encodeHistoryMark(entry.year, entry.month, entry.status),
      ];
    }

    const values = [...byBureau.values()];
    const primary = values[0];
    items.push({
      id: accountRef,
      name: block.heading,
      kind: "Account",
      status: primary?.status ?? "",
      bureaus: values.map((v) => v.bureau as Bureau),
      accountRef,
      balanceCents: primary?.balance_cents ?? null,
      creditLimitCents: primary?.credit_limit_cents ?? null,
      bureauValues: values.length ? values : undefined,
      sourceColumns: Object.keys(unattributed).length ? unattributed : undefined,
    });
  }

  const summary = readSummary(rows, declared);
  /* A section describing itself is the only figure that can be checked
     against a parse of that section. Read from the sentence, so a report
     saying two years is never checked as three. */
  const sectionTotals: SectionTotal[] = [];
  {
    /* Scanned per PAGE, not per row. The sentence is one row in the export
       seen so far, but a narrower layout wraps it — and a total split over
       two lines is still the source stating its total. */
    const byPage = new Map<number, string[]>();
    for (const row of rows) {
      const page = row[0]?.page ?? 1;
      byPage.set(page, [...(byPage.get(page) ?? []), textInBand(row, 0, Number.POSITIVE_INFINITY)]);
    }
    for (const lines of byPage.values()) {
      for (const total of [readSectionTotal(lines.join(" ")), ...lines.map(readSectionTotal)]) {
        if (total && !sectionTotals.some((t) => t.metric === total.metric)) sectionTotals.push(total);
      }
    }
  }
  const sections = {
    personal_information: hasHeading(rows, /^personal information$/i),
    summary: hasHeading(rows, /^summary$/i),
    accounts: blocks.length > 0,
    public_records: hasHeading(rows, /public record/i),
    inquiries: hasHeading(rows, /inquir/i),
    scores: hasHeading(rows, /credit scores?/i),
  };

  /* Recorded once for the whole report, not per account: the format omits the
     status, so no individual bureau or account is at fault. */
  facts.push({
    fieldKey: "payment_history_status",
    state: "not_exposed_by_provider",
    reason:
      "This provider's PDF export renders the payment-history marks visually but carries no machine-readable status " +
      "label for them, and no embedded colour-to-status key. The months are read and dated and the observed fill is " +
      "kept; each status is left undetermined rather than inferred from a cell colour.",
  });

  return {
    items, summary, bureaus: declared,
    publicRecords: [], inquiries: [],
    scores: declared.map((bureau) => ({ bureau })),
    sections, warnings, facts, history, derived, sectionTotals,
    pageCount: geometry.pageCount,
  };
}

function readHistory(
  allRows: PdfFragment[][], block: Block, rects: PdfRect[],
  facts: CompletenessFact[], accountRef: string,
): PdfHistoryEntry[] {
  const out: PdfHistoryEntry[] = [];
  for (const row of block.rows) {
    const label = row.find((f) => f.x <= LABEL_COLUMN_MAX_X && BUREAU_NAME_RE.test(f.text.trim()));
    if (!label) continue;
    const bureau = BUREAU_BY_NAME[label.text.trim().toLowerCase()];
    const rest = textInBand(row, LABEL_COLUMN_MAX_X, Number.POSITIVE_INFINITY);
    if (classifyCell(rest) === "explicit_none_reported") {
      facts.push({
        bureau, fieldKey: `${accountRef}.payment_history`, state: "explicit_not_reported",
        reason: "The report states none reported for this bureau's payment history.",
      });
      continue;
    }
    /* The month row is the next row down, on whichever page it fell. */
    const index = allRows.indexOf(row);
    for (const candidate of allRows.slice(index, index + 3)) {
      const months = datedMonths(candidate);
      if (months.length < 6) continue;
      const y = candidate[0]?.y ?? 0;
      const page = candidate[0]?.page ?? 1;
      for (const m of months) {
        out.push({
          bureau, year: m.year, month: m.month, status: null,
          unreadable: { reason: "status_not_in_text_layer", fill: fillAt(rects, page, m.x, y) },
        });
      }
      break;
    }
  }
  return out;
}

function declaredBureaus(rows: PdfFragment[][]): Bureau[] {
  const seen = new Set<Bureau>();
  for (const row of rows)
    for (const f of row)
      if (BUREAU_NAME_RE.test(f.text.trim())) seen.add(BUREAU_BY_NAME[f.text.trim().toLowerCase()]);
  return [...seen];
}

/* The summary's labels, with their scopes, from the shared table. The real
   export writes "Inquiries (2 Years)", not "Inquiries" — the two-year window
   is part of the label, and reading it without the window is how a two-year
   figure comes to be checked against a three-year listing. */
const SUMMARY_LABELS = SHARED_SUMMARY_LABELS;

function readSummary(rows: PdfFragment[][], declared: Bureau[]): Record<Bureau, Record<string, string>> {
  const out = emptySummary();
  const start = rows.findIndex((r) => /^summary$/i.test(textInBand(r, 0, 200)));
  if (start < 0) return out;
  const headerIndex = rows.findIndex((r, i) =>
    i > start && r.filter((f) => f.x > LABEL_COLUMN_MAX_X && BUREAU_NAME_RE.test(f.text.trim())).length >= 1);
  if (headerIndex < 0) return out;
  const body = rows.slice(headerIndex + 1, headerIndex + 24);
  const bands = attributeColumns(body, rows[headerIndex], (row) => SUMMARY_LABELS.includes(labelOf(row)));
  for (const row of body) {
    const label = labelOf(row);
    if (!SUMMARY_LABELS.includes(label)) continue;
    for (const band of bands) {
      if (!band.bureau) continue;
      const text = textInBand(row, band.from, band.to);
      if (classifyCell(text) === "value") out[band.bureau][label] = text;
    }
  }
  for (const b of declared) out[b] = out[b] ?? {};
  return out;
}

const emptySummary = (): Record<Bureau, Record<string, string>> => ({ EQ: {}, EX: {}, TU: {} });

const hasHeading = (rows: PdfFragment[][], re: RegExp) =>
  rows.some((r) => re.test(textInBand(r, 0, 260).trim()));

/**
 * A stable handle for the same tradeline across imports.
 *
 * Built with `normalizeAccountRef` and `accountNumberSuffixes` — the same two
 * functions the HTML path uses — so a report imported as a PDF and the same
 * report imported as HTML land on the SAME handle and match each other across
 * rounds. A second ref scheme here would silently create two histories for
 * one account, which is the failure the whole shared-vocabulary design exists
 * to prevent.
 *
 * The suffix is withheld when the bureaus disagree, so a disagreement cannot
 * split one account into two.
 */
function refFor(heading: string, block: Block, bands: ColumnBand[]): string {
  const suffixes = new Set<string>();
  for (const row of block.rows) {
    if (mappedField(labelOf(row)) !== "account_number_masked") continue;
    for (const band of bands) {
      /* Only an ATTRIBUTED column contributes. A block with no header has no
         bureau-agreed suffix, and taking one from an unattributed column
         would build the matching handle out of a value nobody claimed. */
      if (!band.bureau) continue;
      const text = textInBand(row, band.from, band.to);
      if (classifyCell(text) !== "value") continue;
      /* The visible digits AS PRINTED, whole. Which end a format masks is
         the format's business — the HTML export writes ****4417 and the PDF
         writes 441700**** — so taking "the last four" reads the wrong end of
         one of them. Both formats of the same report print the same masked
         number, so the printed digits match while a guessed slice would not. */
      const digits = text.replace(/[^\d]/g, "");
      if (digits) suffixes.add(digits);
    }
  }
  const accountType = typeOf(block, bands);
  const base = normalizeAccountRef(heading, accountType);
  return suffixes.size === 1 ? `${base} ${[...suffixes][0]}` : base;
}

/** The account type as the first attributed column reports it, for the handle. */
function typeOf(block: Block, bands: ColumnBand[]): string | undefined {
  for (const row of block.rows) {
    if (mappedField(labelOf(row)) !== "account_type") continue;
    for (const band of bands) {
      if (!band.bureau) continue;
      const text = textInBand(row, band.from, band.to);
      if (classifyCell(text) === "value") return text;
    }
  }
  return undefined;
}

/** Every date the format prints, for callers that want to check a value's shape. */
export const looksLikeDate = (text: string) => DATE_RE.test(text.trim());
