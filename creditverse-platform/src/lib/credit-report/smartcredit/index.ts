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
  SUMMARY_METRICS, comparable as comparableCheck, notComparable,
  type SectionTotal,
} from "./reconciliation-scope";
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
  /** Totals a section states about itself, with the window it covers. */
  sectionTotals: SectionTotal[];
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
      sectionTotals: parsed.sectionTotals ?? [],
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
      reconciliation: reconcilePdf(parsed.summary, parsed.items, parsed.bureaus, parsed.sectionTotals),
      facts: parsed.facts,
      history: parsed.history,
      sectionTotals: parsed.sectionTotals,
      warnings: parsed.warnings,
    };
  },
  async parseFile(file: File): Promise<CanonicalSmartCreditReport> {
    return this.parse(await extractPdfGeometry(file));
  },
};

/**
 * The source's own counts against what was parsed — like-for-like only.
 *
 * A mismatch is `partial / review required`. It is NEVER read as "the missing
 * items were deleted": an item we did not parse is an item we did not parse.
 * That is the whole reason the check exists — an unread account and a removed
 * account look identical to a comparison and mean opposite things.
 *
 * And a comparison only happens where the two figures count the same period
 * over the same population. The summary's "Inquiries (2 Years)" is per bureau
 * over two years; the inquiry listing covers three years across all three.
 * Checking one against the other would report a shortfall nobody measured, so
 * both figures are kept and the pair is marked not comparable — which grades
 * the import review_required, honestly, rather than partial by arithmetic that
 * was never valid.
 */
function reconcilePdf(
  summary: Record<Bureau, Record<string, string>>,
  items: ParsedReportItem[],
  bureaus: Bureau[],
  sectionTotals: SectionTotal[],
): ReconciliationCheck[] {
  const checks: ReconciliationCheck[] = [];
  const KIND: Record<string, ParsedReportItem["kind"]> = {
    accounts: "Account", public_records: "Public Record", inquiries: "Inquiry",
  };
  const num = (printed: string | undefined) => {
    const digits = (printed ?? "").replace(/[^\d]/g, "");
    return digits === "" ? undefined : Number(digits);
  };

  for (const bureau of bureaus) {
    for (const metric of SUMMARY_METRICS) {
      const kind = KIND[metric.metric];
      /* Attribute metrics — open, closed, delinquent, derogatory, balances,
         payments — are not item counts. They are captured in `summary` and
         left unchecked rather than compared against a count of items, which
         would compare two different things. */
      if (!kind) continue;
      const stated = num(summary[bureau]?.[metric.label ?? ""]);
      const parsed = items.filter((i) => i.kind === kind && i.bureaus.includes(bureau)).length;

      if (stated !== undefined && !metric.comparableToSection) {
        /* The section this would be checked against covers a different
           period. Where the section states its own window, say so; otherwise
           the period we read is simply unstated. */
        const section = sectionTotals.find((t) => t.metric === metric.metric);
        checks.push(notComparable({
          bureau, metric, stated, parsed,
          parsedWindow: section?.window ?? "unstated",
        }));
        continue;
      }
      checks.push(comparableCheck({
        bureau, metric: metric.metric, window: metric.window,
        section: metric.section, definition: metric.definition,
        stated, parsed, noun: metric.metric.replace(/_/g, " "),
      }));
    }
  }

  /* The section's own total, which IS the population the section lists — the
     one inquiry figure that can legitimately be reconciled. All bureaus, so
     no bureau is named. */
  for (const total of sectionTotals) {
    const kind = KIND[total.metric];
    if (!kind) continue;
    checks.push(comparableCheck({
      metric: total.metric, window: total.window,
      section: `${total.metric.replace(/_/g, " ")} listing`,
      definition: total.definition,
      stated: total.stated,
      parsed: items.filter((i) => i.kind === kind).length,
      noun: total.metric.replace(/_/g, " "),
    }));
  }

  return checks;
}

export function adapterFor(format: SmartCreditFormat) {
  return format === "html" ? SmartCreditHtmlAdapter : SmartCreditPdfAdapter;
}
