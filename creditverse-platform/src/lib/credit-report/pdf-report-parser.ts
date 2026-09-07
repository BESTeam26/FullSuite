/**
 * Deterministic credit-report parser for text extracted from a PDF (v1).
 *
 * Reads the lines a monitoring service lays out — section headers, then one
 * block per tradeline made of "Label: value" pairs — into candidate items in
 * the shape the classifier consumes. It is generic on purpose: it recognises
 * the vocabulary every bureau report shares (balance, status, date opened,
 * account type, inquiries, public records) rather than one vendor's template.
 *
 * Nothing it produces is imported on its own. Every candidate carries a
 * confidence and the source lines it was read from, and the person confirms
 * or corrects each row before the append-only import records
 * `parser_version = pdf-text-1`. Extraction is data entry, not a decision.
 */
import type { Bureau, ItemKind } from "@/lib/credit-classification";
import { normalizeAccountRef, parseBalanceCents, type BureauValueInput, type ParsedReportItem } from "./import-parser";
import { attributeColumns } from "./column-attribution";
import type { ScoreRow } from "./report-scores";

export const PDF_PARSER_VERSION = "pdf-text-1";

export type Confidence = "high" | "review";

export interface PdfCandidate extends ParsedReportItem {
  confidence: Confidence;
  /** The lines this candidate was read from, for the reviewer. */
  evidence: string[];
}

export interface PdfParseResult {
  candidates: PdfCandidate[];
  /** Bureaus named anywhere in the document. Empty when none was found. */
  bureaus: Bureau[];
  scores: ScoreRow[];
  /** Section headers recognised, in order — tells the reviewer what was read. */
  sections: string[];
  totalLines: number;
  /** Lines that fed a candidate; the rest were headings, summaries or noise. */
  consumedLines: number;
}

type Section = "personal" | "accounts" | "collections" | "inquiries" | "public" | "scores" | "summary" | "other";

const SECTION_HEADERS: [RegExp, Section][] = [
  [/^(personal (information|info|profile|details)|identification|consumer (information|statement)|about you)\b/i, "personal"],
  [/^(credit )?scores?\b/i, "scores"],
  [/^((credit|account|report) )?summary\b/i, "summary"],
  [/^(hard |soft |credit |recent )?inquir(y|ies)\b/i, "inquiries"],
  [/^public records?\b/i, "public"],
  [/^(collections?( accounts)?|third[- ]party collections?|collection agencies)\b/i, "collections"],
  [/^((open|closed|negative|derogatory|positive|revolving|installment|mortgage|real estate|auto|student|all|potentially negative|satisfactory) )?(accounts?|tradelines?|account (history|information|details))\b/i, "accounts"],
];

const BUREAU_WORDS: [RegExp, Bureau][] = [
  [/\bequifax\b/i, "EQ"],
  [/\bexperian\b/i, "EX"],
  [/\btrans ?union\b/i, "TU"],
];

type Field =
  | "accountNumber" | "balance" | "payStatus" | "status" | "opened" | "type" | "dofd" | "remarks"
  | "highBalance" | "limit" | "lastReported" | "closed" | "pastDue" | "payment" | "responsibility"
  | "bureau" | "creditor" | "date" | "term" | "worst" | "filed" | "court" | "reference";

/* Order matters: "Payment Status" must win over "Status", "High Balance" over "Balance". */
const LABELS: [RegExp, Field][] = [
  [/^(payment|pay) status\b/i, "payStatus"],
  [/^(account |current |overall )?status\b/i, "status"],
  [/^(account ?(number|no\.?|#)|acct\.? ?(number|no\.?|#))(?![a-z])/i, "accountNumber"],
  [/^(high(est)? (balance|credit)|original (amount|balance|loan amount))\b/i, "highBalance"],
  [/^(credit limit|limit)\b/i, "limit"],
  [/^(current |recent )?balance( owed| amount)?\b/i, "balance"],
  [/^(past due( amount)?|amount past due)\b/i, "pastDue"],
  [/^(monthly payment|payment amount|scheduled payment)\b/i, "payment"],
  [/^(date opened|opened|open date|date open)\b/i, "opened"],
  [/^(date closed|closed date|closed)\b/i, "closed"],
  [/^(date of first delinquency|first delinquency|dofd|date of 1st delinquency|delinquency first reported)\b/i, "dofd"],
  [/^(last reported|date reported|reported (on|date)|date updated|last updated|date of last activity|last activity)\b/i, "lastReported"],
  [/^(account type|type of account|loan type|type|account kind|portfolio type)\b/i, "type"],
  [/^(terms?|term length|term duration)\b/i, "term"],
  [/^(worst (payment )?status|worst delinquency|highest delinquency)\b/i, "worst"],
  [/^(comments?|remarks?|creditor remarks?|account remarks?|notes?)\b/i, "remarks"],
  [/^(responsibility|ownership|account (holder|designator)|ecoa)\b/i, "responsibility"],
  [/^(bureau|reported by|source)\b/i, "bureau"],
  [/^(creditor( name)?|company|lender|inquired by|requested by|business name|subscriber|furnisher)\b/i, "creditor"],
  [/^(inquiry date|date of inquiry|date of request|date)\b/i, "date"],
  [/^(date filed|filed|filing date)\b/i, "filed"],
  [/^(court|court name|filed at)\b/i, "court"],
  [/^(reference( number| #)?|case (number|#)|docket)\b/i, "reference"],
];

const PERSONAL_LABELS: [RegExp, string][] = [
  [/^(name|consumer name|full name)\b/i, "Name"],
  [/^(also known as|aka|other names?|alias(es)?)\b/i, "Also known as"],
  [/^((current|present|mailing) address|address)\b/i, "Address"],
  [/^(previous|former|prior) address(es)?\b/i, "Previous address"],
  [/^(employer|current employer|employment|employers?)\b/i, "Employer"],
  [/^(previous|former|prior) employer\b/i, "Previous employer"],
];

/** Never extracted: identifiers that must not live in an operational record. */
const NEVER_EXTRACT = /^(ssn|social security|date of birth|dob|birth ?date|driver'?s licen[cs]e|phone|telephone)\b/i;

const DATE_RE = /\b(\d{1,2}\/\d{1,2}\/\d{2,4}|\d{1,2}\/\d{4}|\d{4}-\d{2}-\d{2}|[A-Z][a-z]{2}\.? \d{1,2},? \d{4}|[A-Z][a-z]{2,8} \d{4})\b/;
const AMOUNT_RE = /-?\$\s?\d[\d,]*(\.\d{2})?/;

const norm = (s: string) => s.trim().replace(/\s+/g, " ");

function detectSection(line: string): Section | null {
  const text = norm(line).replace(/[:\-–—]+$/, "").trim();
  if (text.length === 0 || text.length > 56) return null;
  if (/[:$]/.test(text) && !/^(credit )?scores?\b/i.test(text)) return null;
  for (const [re, section] of SECTION_HEADERS) if (re.test(text)) return section;
  return null;
}

function bureausIn(text: string): Bureau[] {
  const out: Bureau[] = [];
  for (const [re, b] of BUREAU_WORDS) if (re.test(text)) out.push(b);
  return out;
}

/**
 * Bureaus named in the text, IN THE ORDER THE TEXT NAMES THEM.
 *
 * `bureausIn` walks BUREAU_WORDS, so it always answers EQ, EX, TU regardless
 * of what the header said — fine for "who reports this account", useless for
 * "which column is whose". Attribution needs the header's own order, and
 * reading it from a fixed list instead is how a TransUnion figure ends up
 * labelled Equifax.
 */
export function bureausInOrder(text: string): Bureau[] {
  const found: { at: number; bureau: Bureau }[] = [];
  for (const [re, bureau] of BUREAU_WORDS) {
    const m = new RegExp(re.source, re.flags.replace("g", "")).exec(text);
    if (m) found.push({ at: m.index, bureau });
  }
  return found.sort((a, b) => a.at - b.at).map((f) => f.bureau);
}

function matchLabel(line: string): { field: Field; value: string } | null {
  /* Internal spacing is kept: two or more spaces separate one bureau column
     from the next in tri-merge layouts, and firstColumn() relies on them. */
  const text = line.trim();
  for (const [re, field] of LABELS) {
    const m = re.exec(text);
    if (!m) continue;
    const rest = text.slice(m[0].length).replace(/^\s*[:\-–—#]?\s*/, "");
    return { field, value: rest };
  }
  return null;
}

/**
 * "$500  $500  $520" (one column per bureau) → "$500", flagged when the
 * columns differ — AND the columns themselves, kept rather than discarded.
 *
 * CR-2: this function used to return `columns[0]` and throw the rest away, so
 * the platform knew the bureaus disagreed and could not say what any of them
 * said. `columns` is now returned so attribution can be attempted against the
 * header, and so the raw values survive even when it cannot be.
 */
function firstColumn(value: string): { value: string; differs: boolean; columns: string[] } {
  const columns = value.split(/\s{2,}|\s\|\s|\t/).map((c) => c.trim()).filter(Boolean);
  if (columns.length <= 1) return { value: value.trim(), differs: false, columns };
  const distinct = new Set(columns.map((c) => c.toLowerCase()));
  return { value: columns[0], differs: distinct.size > 1, columns };
}

/**
 * Map the many ways a report states a status onto the vocabulary the
 * classifier reads. Returns null when the wording is not recognised so the
 * reviewer decides.
 */
export function normalizeStatus(raw: string): string | null {
  const s = raw.toLowerCase();
  if (!s.trim()) return null;
  if (/charge[- ]?off|charged off|written off|profit and loss/.test(s)) return "Charge-Off";
  if (/collection/.test(s)) return "Collection";
  if (/repossess/.test(s)) return "Repossession";
  if (/foreclos/.test(s)) return "Foreclosure";
  if (/bankrupt|chapter (7|11|13)|discharged in bankruptcy/.test(s)) return "Included in Bankruptcy";
  if (/settled|paid for less|settlement/.test(s)) return "Settled";
  if (/late|past due|delinquen|\b(30|60|90|120|150|180)\b ?days?|derogatory/.test(s)) return "Late Payment";
  if (/paid/.test(s) && /closed/.test(s)) return "Paid / Closed";
  if (/paid|paid in full|paid as agreed/.test(s)) return "Paid";
  if (/transferred|sold/.test(s)) return "Closed";
  if (/closed/.test(s)) return "Closed";
  if (/open|current|pays as agreed|paying as agreed|good standing|never late|as agreed|up to date|ok\b/.test(s)) return "Open";
  return null;
}

function titleCase(s: string): string {
  return s.toLowerCase().replace(/\b[a-z]/g, (c) => c.toUpperCase());
}

const BUREAU_WORD_RE = /equifax|experian|trans ?union/gi;

function bureauOf(word: string): Bureau {
  return bureausIn(word)[0];
}

function scoreIn(segment: string): number | null {
  const m = /\b([2-8]\d{2})\b/.exec(segment);
  if (!m) return null;
  const n = Number(m[1]);
  return n >= 250 && n <= 900 ? n : null;
}

/**
 * Reports print scores next to the bureau name — "Experian 684", "684
 * TransUnion", or all three on one line. Each bureau word owns the text up to
 * the next bureau word; the number there is its score. A number before the
 * first bureau word belongs to it only when nothing follows it.
 */
export function findScores(lines: string[], model: string): ScoreRow[] {
  const found = new Map<Bureau, number>();
  for (const raw of lines) {
    const line = raw.replace(/\d{1,2}\/\d{1,2}\/\d{2,4}|\d{4}-\d{2}-\d{2}/g, " ");
    const words = [...line.matchAll(BUREAU_WORD_RE)];
    if (!words.length) continue;
    words.forEach((w, i) => {
      const bureau = bureauOf(w[0]);
      if (found.has(bureau)) return;
      const start = w.index! + w[0].length;
      const end = i + 1 < words.length ? words[i + 1].index! : line.length;
      const after = scoreIn(line.slice(start, end));
      const before = i === 0 ? scoreIn(line.slice(0, w.index!)) : null;
      const score = after ?? before;
      if (score !== null) found.set(bureau, score);
    });
  }
  return [...found.entries()].map(([bureau, score]) => ({ bureau, model, score }));
}

function detectModel(lines: string[]): string {
  for (const line of lines) {
    const m = /\b(FICO(?:®)?\s*(?:score)?\s*\d*|VantageScore\s*\d(?:\.\d)?)\b/i.exec(line);
    if (m) return norm(m[1].replace(/®/g, ""));
  }
  return "as stated on report";
}

interface Block {
  title: string;
  lines: string[];
  fields: Partial<Record<Field, { value: string; differs: boolean; columns: string[] }>>;
  section: Section;
}

function looksLikeTitle(line: string): boolean {
  const text = norm(line);
  if (text.length < 2 || text.length > 60) return false;
  if (!/[A-Za-z]{2}/.test(text)) return false;
  if (text.includes(":")) return false;
  if (matchLabel(text)) return false;
  if (detectSection(text)) return false;
  if (AMOUNT_RE.test(text) && !/[A-Za-z]{3}/.test(text.replace(AMOUNT_RE, ""))) return false;
  if (/^(page \d|continued|\d+ of \d+)/i.test(text)) return false;
  if (bureausIn(text).length && text.replace(/equifax|experian|trans ?union|[\s|/,]/gi, "").length < 3) return false;
  return true;
}

/**
 * Cut a section into blocks: a title line followed by its label/value lines.
 * A label whose value is empty takes the next line as its value.
 */
function collectBlocks(lines: string[], section: Section): Block[] {
  const blocks: Block[] = [];
  let current: Block | null = null;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!norm(line)) continue;
    const label = matchLabel(line);
    if (label) {
      if (!current) current = { title: "", lines: [], fields: {}, section };
      let value = label.value;
      if (!value && i + 1 < lines.length && !matchLabel(lines[i + 1]) && !detectSection(lines[i + 1])) {
        value = norm(lines[i + 1]);
        current.lines.push(line, lines[i + 1]);
        i++;
      } else current.lines.push(line);
      if (!current.fields[label.field]) current.fields[label.field] = firstColumn(value);
      continue;
    }
    if (looksLikeTitle(line)) {
      if (current && (current.title || Object.keys(current.fields).length)) blocks.push(current);
      current = { title: norm(line), lines: [line], fields: {}, section };
      continue;
    }
    if (current) current.lines.push(line);
  }
  if (current && (current.title || Object.keys(current.fields).length)) blocks.push(current);
  return blocks.filter((b) => Object.keys(b.fields).length > 0 || (b.section === "inquiries" && b.title));
}

function blockBureaus(block: Block, documentBureaus: Bureau[]): Bureau[] {
  const named = new Set<Bureau>();
  if (block.fields.bureau) for (const b of bureausIn(block.fields.bureau.value)) named.add(b);
  for (const line of block.lines) if (/^(reported by|bureau|source)\b/i.test(norm(line))) for (const b of bureausIn(line)) named.add(b);
  if (named.size) return [...named];
  return documentBureaus;
}

/**
 * The bureaus this block's OWN header names, in the order it names them.
 *
 * Deliberately different from `blockBureaus`, which falls back to the
 * document's bureau list. That fallback is right for "who reports this
 * account" and fatal for attribution: a document-level list has no order the
 * source vouched for, so using it here would attribute by position while
 * appearing not to.
 */
function headerBureausInOrder(block: Block): Bureau[] {
  if (block.fields.bureau?.value) {
    const named = bureausInOrder(block.fields.bureau.value);
    if (named.length > 0) return named;
  }
  for (const line of block.lines) {
    if (/^(reported by|bureau|source)\b/i.test(norm(line))) {
      const named = bureausInOrder(line);
      if (named.length > 0) return named;
    }
  }
  return [];
}

/* Parser field → `report_item_bureau_values` column. Fields absent from this
   map are not per-bureau facts (creditor, court, reference) and are skipped
   rather than guessed at. */
const BUREAU_FIELD_COLUMN: Partial<Record<Field, keyof BureauValueInput>> = {
  status: "status",
  payStatus: "payment_status",
  type: "account_type",
  accountNumber: "account_number_masked",
  balance: "balance_cents",
  highBalance: "high_balance_cents",
  limit: "credit_limit_cents",
  pastDue: "past_due_cents",
  payment: "monthly_payment_cents",
  term: "term_months",
  opened: "open_date",
  closed: "date_closed",
  lastReported: "date_last_active",
  dofd: "dofd",
  remarks: "remarks",
};

const MONEY_COLUMNS = new Set<keyof BureauValueInput>([
  "balance_cents", "high_balance_cents", "credit_limit_cents",
  "past_due_cents", "monthly_payment_cents",
]);

/**
 * Turn one bureau's attributed columns into the row the writer stores.
 *
 * Money is parsed to cents and DROPPED when unreadable rather than stored as
 * zero: a figure we could not read is not a figure of nothing. Dates keep the
 * source's own text — normalising them here would lose what the report said.
 */
function toBureauValue(bureau: Bureau, fields: Record<string, string>): BureauValueInput {
  const row: BureauValueInput = { bureau };
  for (const [field, raw] of Object.entries(fields)) {
    const column = BUREAU_FIELD_COLUMN[field as Field];
    if (!column || !raw.trim()) continue;
    if (MONEY_COLUMNS.has(column)) {
      const cents = parseBalanceCents(raw.match(AMOUNT_RE)?.[0] ?? raw);
      if (!Number.isNaN(cents)) (row[column] as number) = cents;
    } else if (column === "term_months") {
      const months = Number.parseInt(raw.replace(/[^0-9]/g, ""), 10);
      if (Number.isFinite(months)) row.term_months = months;
    } else {
      (row[column] as string) = norm(raw);
    }
  }
  return row;
}

let counter = 0;
const nextId = () => `pdf-${++counter}`;

function accountCandidate(block: Block, documentBureaus: Bureau[]): PdfCandidate | null {
  const name = block.title || block.fields.creditor?.value;
  if (!name) return null;
  const rawStatus = block.fields.payStatus?.value || block.fields.status?.value || block.fields.worst?.value || "";
  const normalized = normalizeStatus(rawStatus);
  const isCollectionSection = block.section === "collections";
  const status = normalized ?? (isCollectionSection ? "Collection" : rawStatus ? titleCase(rawStatus) : "Unknown");
  const typeText = block.fields.type?.value;
  const subtype = isCollectionSection && (!typeText || /collection/i.test(typeText)) ? "Collection" : typeText ? titleCase(norm(typeText)) : undefined;
  const balanceText = block.fields.balance?.value.match(AMOUNT_RE)?.[0] ?? block.fields.balance?.value;
  const balanceCents = parseBalanceCents(balanceText);
  /* The limit is read when the report prints one, and left alone when it does
     not: utilization is computed only from stated limits. */
  const limitText = block.fields.limit?.value.match(AMOUNT_RE)?.[0] ?? block.fields.limit?.value;
  const limitCents = parseBalanceCents(limitText);
  const balance = Number.isNaN(balanceCents) ? undefined : balanceText || undefined;
  const opened = block.fields.opened?.value.match(DATE_RE)?.[0];
  const dofd = block.fields.dofd?.value.match(DATE_RE)?.[0];
  const remarks = [block.fields.remarks?.value, block.fields.pastDue?.value ? `Past due ${block.fields.pastDue.value}` : null]
    .filter(Boolean).join(" · ") || undefined;
  const tail = block.fields.accountNumber?.value.replace(/\D/g, "").slice(-4);
  const differs = Object.values(block.fields).some((f) => f?.differs);
  const confidence: Confidence = normalized && (balance || opened) && !differs ? "high" : "review";

  /* CR-2. Attribution decided by the block's own header, per field. What it
     cannot resolve is preserved rather than summarised away. */
  const attribution = attributeColumns(block.fields, headerBureausInOrder(block));
  const bureauValues = [...attribution.attributed.entries()]
    .map(([bureau, fields]) => toBureauValue(bureau, fields))
    .filter((row) => Object.keys(row).length > 1);
  const unattributedCount = Object.keys(attribution.unattributed).length;
  return {
    id: nextId(),
    name: name === name.toUpperCase() ? titleCase(name) : name,
    kind: "Account",
    subtype,
    status,
    bureaus: blockBureaus(block, documentBureaus),
    balance,
    balanceCents: Number.isNaN(balanceCents) ? null : balanceCents,
    creditLimit: Number.isNaN(limitCents) ? undefined : limitText,
    creditLimitCents: Number.isNaN(limitCents) ? null : limitCents,
    dofd,
    openDate: opened,
    /* The remark says which of the two things happened, because "columns
       differ" alone left a reviewer with no idea whether the figures survived. */
    remarks: differs
      ? [
          remarks,
          bureauValues.length > 0
            ? "Bureau columns differ; each bureau's value is recorded separately."
            : "Bureau columns differ and the header did not say which column is whose — the values are preserved unattributed.",
        ].filter(Boolean).join(" · ")
      : remarks,
    bureauValues: bureauValues.length > 0 ? bureauValues : undefined,
    sourceColumns: unattributedCount > 0 ? attribution.unattributed : undefined,
    accountRef: `${normalizeAccountRef(name, subtype)}${tail ? ` ${tail}` : ""}`,
    confidence,
    evidence: block.lines.map(norm),
  };
}

const INQUIRY_LINE = new RegExp(`^(.{2,60}?)\\s{1,}${DATE_RE.source}(?:\\s+(.*))?$`);

function inquiryCandidates(lines: string[], documentBureaus: Bureau[]): PdfCandidate[] {
  const out: PdfCandidate[] = [];
  // One-line layout: "CAPITAL ONE   03/14/2025   Experian"
  const consumed = new Set<number>();
  lines.forEach((line, i) => {
    const text = norm(line);
    const m = INQUIRY_LINE.exec(text);
    if (!m || matchLabel(text) || detectSection(text)) return;
    const name = m[1].trim();
    if (!/[A-Za-z]{2}/.test(name) || /^(date|creditor|company|inquir)/i.test(name)) return;
    const bureaus = bureausIn(text);
    consumed.add(i);
    out.push({
      id: nextId(), name: name === name.toUpperCase() ? titleCase(name) : name, kind: "Inquiry", status: "Inquiry",
      bureaus: bureaus.length ? bureaus : documentBureaus, openDate: m[2], balanceCents: null, creditLimitCents: null,
      accountRef: normalizeAccountRef(name, `inquiry ${m[2]}`), confidence: "high", evidence: [text],
    });
  });
  // Block layout: "Creditor: …" / "Inquiry date: …" / "Bureau: …"
  for (const block of collectBlocks(lines.filter((_, i) => !consumed.has(i)), "inquiries")) {
    const name = block.fields.creditor?.value || block.title;
    if (!name) continue;
    const date = block.fields.date?.value.match(DATE_RE)?.[0];
    out.push({
      id: nextId(), name, kind: "Inquiry", status: "Inquiry", bureaus: blockBureaus(block, documentBureaus), openDate: date,
      balanceCents: null,
      creditLimitCents: null, accountRef: normalizeAccountRef(name, `inquiry ${date ?? ""}`), confidence: date ? "high" : "review",
      evidence: block.lines.map(norm),
    });
  }
  return out;
}

function publicRecordCandidates(lines: string[], documentBureaus: Bureau[]): PdfCandidate[] {
  return collectBlocks(lines, "public").map((block) => {
    const typeText = block.fields.type?.value || block.title;
    const name = block.title || typeText || "Public record";
    const status = normalizeStatus(block.fields.status?.value ?? "") ?? (block.fields.status?.value ? titleCase(block.fields.status.value) : "Public Record");
    const filed = block.fields.filed?.value.match(DATE_RE)?.[0] ?? block.fields.date?.value.match(DATE_RE)?.[0];
    const remarks = [block.fields.court?.value ? `Court ${block.fields.court.value}` : null, block.fields.reference?.value ? `Ref ${block.fields.reference.value}` : null, block.fields.remarks?.value]
      .filter(Boolean).join(" · ") || undefined;
    return {
      id: nextId(), name, kind: "Public Record" as ItemKind, subtype: typeText ? titleCase(norm(typeText)) : undefined, status,
      bureaus: blockBureaus(block, documentBureaus), openDate: filed, balanceCents: null, creditLimitCents: null, remarks,
      accountRef: normalizeAccountRef(name, filed), confidence: "review" as Confidence, evidence: block.lines.map(norm),
    };
  });
}

function personalCandidates(lines: string[], documentBureaus: Bureau[]): PdfCandidate[] {
  const out: PdfCandidate[] = [];
  for (let i = 0; i < lines.length; i++) {
    const text = norm(lines[i]);
    if (!text || NEVER_EXTRACT.test(text)) continue;
    for (const [re, label] of PERSONAL_LABELS) {
      const m = re.exec(text);
      if (!m) continue;
      let value = text.slice(m[0].length).replace(/^\s*[:\-–—]?\s*/, "");
      const evidence = [text];
      if (!value && i + 1 < lines.length && !PERSONAL_LABELS.some(([r]) => r.test(norm(lines[i + 1])))) {
        value = norm(lines[i + 1]);
        evidence.push(value);
        i++;
      }
      if (!value) break;
      const { value: first, differs } = firstColumn(value);
      out.push({
        id: nextId(), name: first, kind: "Personal", subtype: label, status: "Reported",
        bureaus: bureausIn(text).length ? bureausIn(text) : documentBureaus, balanceCents: null, creditLimitCents: null,
        remarks: differs ? "Bureaus report different values." : undefined,
        accountRef: normalizeAccountRef(first, label), confidence: "review", evidence,
      });
      break;
    }
  }
  return out;
}

export function parseCreditReportPdfText(allLines: string[]): PdfParseResult {
  counter = 0;
  const lines = allLines.map((l) => l.replace(/\u00a0/g, " "));
  const documentBureaus = [...new Set(lines.flatMap(bureausIn))].sort() as Bureau[];
  const sections: string[] = [];
  const buckets = new Map<Section, string[]>();
  let section: Section = "other";
  for (const line of lines) {
    const header = detectSection(line);
    if (header) {
      section = header;
      sections.push(norm(line));
      continue;
    }
    if (!buckets.has(section)) buckets.set(section, []);
    buckets.get(section)!.push(line);
  }
  const model = detectModel(lines);
  const scores = findScores([...(buckets.get("scores") ?? []), ...(buckets.get("summary") ?? []), ...(buckets.get("other") ?? [])].slice(0, 400), model);

  const candidates: PdfCandidate[] = [];
  for (const sec of ["accounts", "collections"] as const) {
    for (const block of collectBlocks(buckets.get(sec) ?? [], sec)) {
      const c = accountCandidate(block, documentBureaus);
      if (c) candidates.push(c);
    }
  }
  candidates.push(...inquiryCandidates(buckets.get("inquiries") ?? [], documentBureaus));
  candidates.push(...publicRecordCandidates(buckets.get("public") ?? [], documentBureaus));
  candidates.push(...personalCandidates(buckets.get("personal") ?? [], documentBureaus));

  /* No section headers at all (a flat export): read the whole text as account blocks. */
  if (candidates.length === 0 && sections.length === 0) {
    for (const block of collectBlocks(lines, "accounts")) {
      const c = accountCandidate(block, documentBureaus);
      if (c) candidates.push({ ...c, confidence: "review" });
    }
  }

  const consumedLines = candidates.reduce((n, c) => n + c.evidence.length, 0);
  return { candidates, bureaus: documentBureaus, scores, sections, totalLines: lines.filter((l) => norm(l)).length, consumedLines };
}
