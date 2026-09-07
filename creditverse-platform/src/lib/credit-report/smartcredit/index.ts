/**
 * SmartCredit, in either format it publishes.
 *
 * Two adapters, one canonical result. A caller asks for the adapter matching
 * the file it holds and gets back the same shape either way — the same
 * `ParsedReportItem`s, the same per-bureau values, the same reconciliation
 * counts. What differs is only what a format genuinely carries, and that
 * difference is recorded as a fact rather than smoothed over: the PDF export
 * prints the payment-history months but not the marks, so its statuses come
 * back undetermined instead of guessed.
 *
 * The canonical model is unchanged. There is no `SmartCreditReport` type here
 * competing with `ParsedReportItem`; an adapter's job is to arrive at the
 * model the rest of the platform already uses, not to introduce a second one.
 */
import type { Bureau } from "@/lib/credit-classification";
import type { ParsedReportItem } from "@/lib/credit-report/import-parser";
import type { CompletenessFact, ReconciliationCheck } from "@/lib/credit-report/completeness";
import {
  SMARTCREDIT_PARSER_VERSION, completenessFacts, parseSmartCreditHtml, reconcile,
} from "@/lib/credit-report/smartcredit-html-parser";
import {
  SMARTCREDIT_PDF_PARSER_VERSION, parseSmartCreditPdf, type PdfHistoryEntry,
} from "./pdf-adapter";
import { extractPdfGeometry, type PdfGeometry } from "./pdf-geometry";
import { decodeHistoryMark } from "./source-fields";

export type SmartCreditFormat = "html" | "pdf";

/** What every adapter returns, whatever it read. */
export interface CanonicalSmartCreditReport {
  format: SmartCreditFormat;
  parserVersion: string;
  items: ParsedReportItem[];
  bureaus: Bureau[];
  summary: Record<Bureau, Record<string, string>>;
  publicRecords: ParsedReportItem[];
  inquiries: ParsedReportItem[];
  sections: Record<string, boolean>;
  /** The source's counts against ours — CR-14, identical for both formats. */
  reconciliation: ReconciliationCheck[];
  /** Per-field states. A zero, a dash and a "NONE REPORTED" stay distinct. */
  facts: CompletenessFact[];
  /** Dated months per account. `status: null` where the format omits it. */
  history: Record<string, PdfHistoryEntry[]>;
  warnings: string[];
}

export const SmartCreditHtmlAdapter = {
  format: "html" as const,
  parserVersion: SMARTCREDIT_PARSER_VERSION,
  parse(html: string): CanonicalSmartCreditReport {
    const parsed = parseSmartCreditHtml(html);
    const history: Record<string, PdfHistoryEntry[]> = {};
    for (const item of parsed.items) {
      const entries: PdfHistoryEntry[] = [];
      for (const values of item.bureauValues ?? []) {
        for (const encoded of values.payment_history ?? []) {
          const dated = decodeHistoryMark(encoded);
          if (!dated) continue;
          entries.push({
            bureau: values.bureau as Bureau,
            year: dated.year, month: dated.month, status: dated.status,
          });
        }
      }
      if (entries.length) history[item.accountRef] = entries;
    }
    return {
      format: "html",
      parserVersion: SMARTCREDIT_PARSER_VERSION,
      items: parsed.items,
      bureaus: parsed.bureaus,
      summary: parsed.summary,
      publicRecords: parsed.publicRecords,
      inquiries: parsed.inquiries,
      sections: parsed.sections,
      reconciliation: reconcile(parsed),
      facts: completenessFacts(parsed),
      history,
      warnings: parsed.warnings,
    };
  },
};

export const SmartCreditPdfAdapter = {
  format: "pdf" as const,
  parserVersion: SMARTCREDIT_PDF_PARSER_VERSION,
  /** Takes geometry, not a file, so the grid logic is testable without pdf.js. */
  parse(geometry: PdfGeometry): CanonicalSmartCreditReport {
    const parsed = parseSmartCreditPdf(geometry);
    return {
      format: "pdf",
      parserVersion: SMARTCREDIT_PDF_PARSER_VERSION,
      items: parsed.items,
      bureaus: parsed.bureaus,
      summary: parsed.summary,
      publicRecords: parsed.publicRecords,
      inquiries: parsed.inquiries,
      sections: parsed.sections,
      reconciliation: reconcilePdf(parsed.summary, parsed.items, parsed.bureaus),
      facts: parsed.facts,
      history: parsed.history,
      warnings: parsed.warnings,
    };
  },
  async parseFile(file: File): Promise<CanonicalSmartCreditReport> {
    return this.parse(await extractPdfGeometry(file));
  },
};

/**
 * The source's own summary counts against what was parsed — the same check
 * CR-14 applies to the HTML, run on the PDF's summary table.
 *
 * A mismatch is `partial / review required`. It is never read as "the missing
 * accounts were deleted": an account we did not parse is an account we did not
 * parse.
 */
function reconcilePdf(
  summary: Record<Bureau, Record<string, string>>,
  items: ParsedReportItem[],
  bureaus: Bureau[],
): ReconciliationCheck[] {
  const checks: ReconciliationCheck[] = [];
  for (const bureau of bureaus) {
    const stated = Number((summary[bureau]?.["total accounts"] ?? "").replace(/[^\d]/g, ""));
    const parsed = items.filter((i) => i.bureaus.includes(bureau)).length;
    if (!Number.isFinite(stated) || !(summary[bureau]?.["total accounts"] ?? "")) {
      checks.push({
        bureau, checkKey: "accounts", parsed, ok: false,
        reason: "The report states no account total for this bureau, so the parse cannot be reconciled.",
      });
      continue;
    }
    checks.push({
      bureau, checkKey: "accounts", stated, parsed, ok: stated === parsed,
      reason: stated === parsed ? undefined
        : `The report states ${stated} accounts for this bureau and ${parsed} were read. ` +
          `The ${Math.abs(stated - parsed)} not read are unread, not absent from the file.`,
    });
  }
  return checks;
}

export function adapterFor(format: SmartCreditFormat) {
  return format === "html" ? SmartCreditHtmlAdapter : SmartCreditPdfAdapter;
}
