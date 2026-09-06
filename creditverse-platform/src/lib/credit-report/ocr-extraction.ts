/**
 * Reading a scanned credit report with the model (OCR tier 2).
 *
 * Dee approved this path on 2026-09-05: when a PDF has no text layer — a scan
 * or a photograph — the file goes through the existing AI gateway, which holds
 * the key, checks the organization's entitlement and balance, and meters the
 * charge as AI credits.
 *
 * The doctrine that matters (rule 9): **this is data entry, not a decision.**
 * The model transcribes what it can see into the same candidate shape the
 * deterministic PDF parser produces; every row then passes the same review
 * grid, and every candidate is marked "review" no matter how sure the model
 * sounds. The import records `parser_version = pdf-ocr-claude-1`, so a report
 * read this way is distinguishable from one read from a text layer forever.
 *
 * This module is pure: the prompt, and the strict reading of the answer.
 */
import type { Bureau, ItemKind } from "@/lib/credit-classification";
import { normalizeAccountRef, parseBalanceCents } from "./import-parser";
import { normalizeStatus, type PdfCandidate } from "./pdf-report-parser";
import type { ScoreRow } from "./report-scores";

export const OCR_PARSER_VERSION = "pdf-ocr-claude-1";

export const OCR_SYSTEM_PROMPT = [
  "You transcribe consumer credit reports. You are a careful data-entry clerk, not an analyst.",
  "Copy only what is printed. Never infer, complete, correct or estimate a value.",
  "If a value is unreadable or absent, omit the field. An omitted field is always better than a guess.",
  "Never state an opinion about accuracy, legality or what should be disputed.",
  "Never transcribe a Social Security number, a date of birth, a driver's licence number or a telephone number, even if it is printed. Skip those fields entirely.",
  "Answer with JSON only. No explanation, no markdown fence.",
].join(" ");

export const OCR_PROMPT = [
  "Transcribe every item in this credit report into JSON of exactly this shape:",
  '{"items":[{"name":"","kind":"Account|Inquiry|Personal|Public Record","subtype":"","status":"","balance":"","creditLimit":"","bureaus":["EQ","EX","TU"],"dofd":"","openDate":"","remarks":"","accountRef":""}],',
  '"scores":[{"bureau":"EQ|EX|TU","model":"","score":0}]}',
  "",
  "Rules:",
  "- name: the creditor, collection agency, court or personal item exactly as printed.",
  "- kind: Account for tradelines and collections, Inquiry for credit inquiries, Public Record for bankruptcies, judgments and liens, Personal for names, addresses and employers.",
  "- status: copy the payment or account status text as printed.",
  "- balance: copy the amount with its currency symbol, e.g. \"$1,240.50\". Omit if none is printed.",
  "- creditLimit: the credit limit or high credit as printed, for revolving accounts. Omit it entirely if the report does not print one — never estimate a limit.",
  "- bureaus: only the bureaus that actually report this item. If the report covers one bureau, use that one.",
  "- dofd: date of first delinquency, openDate: date opened, both exactly as printed.",
  "- accountRef: the last four digits of the account number when printed, otherwise omit.",
  "- scores: only scores actually printed, with the model name if stated.",
  "- Skip Social Security numbers, dates of birth, driver's licence numbers and telephone numbers entirely.",
  "",
  "Return the JSON object and nothing else.",
].join("\n");

interface RawItem {
  name?: unknown; kind?: unknown; subtype?: unknown; status?: unknown; balance?: unknown; creditLimit?: unknown;
  bureaus?: unknown; dofd?: unknown; openDate?: unknown; remarks?: unknown; accountRef?: unknown;
}

const KINDS: readonly ItemKind[] = ["Account", "Inquiry", "Personal", "Public Record"];
const BUREAUS: readonly Bureau[] = ["EQ", "EX", "TU"];
/** Anything that looks like an identifier is dropped even if the model sent it. */
const IDENTIFIER = /\b(\d{3}-?\d{2}-?\d{4}|\(?\d{3}\)?[ .-]?\d{3}[ .-]?\d{4})\b/;

const text = (v: unknown): string | undefined => {
  if (typeof v !== "string") return undefined;
  const t = v.trim();
  return t && t !== "null" && t !== "N/A" ? t : undefined;
};

export interface OcrParseResult {
  candidates: PdfCandidate[];
  scores: ScoreRow[];
  /** Items the answer contained but that could not be used, with the reason. */
  skipped: string[];
}

/** Reads the model's answer strictly. Anything malformed is skipped, never guessed. */
export function parseOcrAnswer(answer: string): OcrParseResult {
  const skipped: string[] = [];
  const start = answer.indexOf("{");
  const end = answer.lastIndexOf("}");
  if (start === -1 || end <= start) return { candidates: [], scores: [], skipped: ["The reading came back in a form we could not use."] };
  let parsed: { items?: unknown; scores?: unknown };
  try {
    parsed = JSON.parse(answer.slice(start, end + 1));
  } catch {
    return { candidates: [], scores: [], skipped: ["The reading came back in a form we could not use."] };
  }

  const candidates: PdfCandidate[] = [];
  const rawItems = Array.isArray(parsed.items) ? parsed.items : [];
  rawItems.forEach((raw: RawItem, i) => {
    const name = text(raw.name);
    const kind = text(raw.kind) as ItemKind | undefined;
    if (!name) { skipped.push(`Item ${i + 1}: no name was read.`); return; }
    if (!kind || !KINDS.includes(kind)) { skipped.push(`${name}: the kind "${String(raw.kind)}" was not recognised.`); return; }
    if (IDENTIFIER.test(name)) { skipped.push(`Item ${i + 1}: dropped because it looked like a personal identifier.`); return; }
    const bureaus = (Array.isArray(raw.bureaus) ? raw.bureaus : [])
      .map((b) => String(b).toUpperCase())
      .filter((b): b is Bureau => (BUREAUS as readonly string[]).includes(b));
    const balance = text(raw.balance);
    const cents = parseBalanceCents(balance);
    const limit = text(raw.creditLimit);
    const limitCents = parseBalanceCents(limit);
    const statusText = text(raw.status);
    const subtype = text(raw.subtype);
    const accountRef = text(raw.accountRef);
    candidates.push({
      id: `ocr-${i + 1}`,
      name,
      kind,
      subtype,
      /* The classifier's vocabulary when the wording is recognised, the
         printed words when it is not — never an invented status. */
      status: (statusText ? normalizeStatus(statusText) ?? statusText : undefined) ?? (kind === "Inquiry" ? "Inquiry" : "Unknown"),
      bureaus,
      balance: Number.isNaN(cents) ? undefined : balance,
      balanceCents: Number.isNaN(cents) ? null : cents,
      creditLimit: Number.isNaN(limitCents) ? undefined : limit,
      creditLimitCents: Number.isNaN(limitCents) ? null : limitCents,
      dofd: text(raw.dofd),
      openDate: text(raw.openDate),
      remarks: text(raw.remarks),
      accountRef: accountRef ? `${normalizeAccountRef(name, subtype)} ${accountRef}` : normalizeAccountRef(name, subtype),
      /* Always "review": a transcription is never taken on trust. */
      confidence: "review",
      evidence: ["Read from a scanned document by the reading assistant. Check it against the report."],
    });
  });

  const scores: ScoreRow[] = [];
  const rawScores = Array.isArray(parsed.scores) ? parsed.scores : [];
  for (const s of rawScores as { bureau?: unknown; model?: unknown; score?: unknown }[]) {
    const bureau = String(s.bureau ?? "").toUpperCase();
    const score = Number(s.score);
    if (!(BUREAUS as readonly string[]).includes(bureau)) continue;
    if (!Number.isInteger(score) || score < 250 || score > 900) continue;
    scores.push({ bureau: bureau as Bureau, model: text(s.model) ?? "as stated on report", score });
  }

  if (candidates.length === 0 && skipped.length === 0) skipped.push("No credit report items were found in that file.");
  return { candidates, scores, skipped };
}

/** Base64 for the gateway, without the data: prefix. */
export async function fileToBase64(file: File): Promise<string> {
  const buffer = new Uint8Array(await file.arrayBuffer());
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < buffer.length; i += chunk) {
    binary += String.fromCharCode(...buffer.subarray(i, i + chunk));
  }
  return btoa(binary);
}

/** Files larger than this are refused before they reach the gateway. */
export const MAX_OCR_BYTES = 7 * 1024 * 1024;

export function ocrFileProblem(file: File): string | null {
  const allowed = ["application/pdf", "image/png", "image/jpeg", "image/webp"];
  if (!allowed.includes(file.type)) return "Reading works on a PDF or a photo (PNG, JPG or WEBP).";
  if (file.size > MAX_OCR_BYTES) return "That file is larger than 7 MB. Save a smaller export, or split it into parts.";
  return null;
}
