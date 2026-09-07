/**
 * Import a credit report from a PDF.
 *
 * Two readers, one review grid:
 *   • a PDF with a text layer is read in the browser and parsed
 *     deterministically (`pdf-text-1`) — nothing leaves the machine;
 *   • a scan or a photo is read by the assistant through the AI gateway
 *     (`pdf-ocr-claude-1`), which meters the charge as AI credits.
 *
 * Either way the person reviews and corrects every row before one append-only
 * import records which reader produced it. Extraction is data entry; the
 * human decides (rule 9).
 */
import { useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, FileText, Loader2, ScanText, Sparkles, Trash2, UploadCloud,
  ChevronDown,
  ChevronRight} from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Bureau, ItemKind } from "@/lib/credit-classification";
import { errorMessage } from "@/lib/data/error-message";
import { useImportCreditReport } from "@/lib/data/use-credit-reports";
import { extractPdfLines } from "@/lib/credit-report/pdf-text";
import { PDF_PARSER_VERSION, parseCreditReportPdfText, type PdfCandidate } from "@/lib/credit-report/pdf-report-parser";
import { accountHeading, describeAccountNumber } from "@/lib/credit-report/account-heading";
import { SMARTCREDIT_PARSER_VERSION, completenessFacts, parseSmartCreditHtml, reconcile } from "@/lib/credit-report/smartcredit-html-parser";
import type { CompletenessFact, ReconciliationCheck } from "@/lib/credit-report/completeness";
import { ImportQualityPanel } from "@/components/clients/ImportQualityPanel";
import { BureauComparisonGrid } from "@/components/clients/BureauComparisonGrid";
import {
  MAX_OCR_BYTES,
  OCR_PARSER_VERSION,
  OCR_PROMPT,
  OCR_SYSTEM_PROMPT,
  fileToBase64,
  ocrFileProblem,
  parseOcrAnswer,
} from "@/lib/credit-report/ocr-extraction";
import { requestAiDraft, type AiAttachment } from "@/lib/data/ai-gateway";
import { parseBalanceCents } from "@/lib/credit-report/import-parser";
import { EMPTY_SCORE_INPUTS, REPORT_BUREAUS, buildScoreRows, hasInvalidScore, type ScoreInputs } from "@/lib/credit-report/report-scores";
import { ReportMetaFields } from "./import/ReportMetaFields";
import { cn } from "@/lib/utils";

interface Props {
  fulfillmentClientId: string;
  organizationId: string | null;
  outsourcingGroupId: string | null;
  onImported?: (reportId: string) => void;
}

type ReviewRow = PdfCandidate & { include: boolean };
/** Which reader produced the rows in front of the person; recorded on import. */
type Reader = "text" | "ocr";

const KINDS: ItemKind[] = ["Account", "Inquiry", "Personal", "Public Record"];
/* Sections, in the order a reviewer reads a report (S-15, S-16). One row per
   ITEM inside each — never one row per field. */
const SECTION_ORDER = ["Account", "Public Record", "Inquiry", "Personal"] as const;
const SECTION_LABEL: Record<string, string> = {
  Account: "Accounts",
  "Public Record": "Public records",
  Inquiry: "Inquiries",
  Personal: "Personal information",
};

const cell = "w-full rounded border border-border bg-background px-1.5 py-1 text-xs text-foreground";

export function CreditReportPdfImport({ fulfillmentClientId, organizationId, outsourcingGroupId, onImported }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [fileNames, setFileNames] = useState<string[]>([]);
  const [reading, setReading] = useState(false);
  const [rows, setRows] = useState<ReviewRow[] | null>(null);
  /** Which account's bureau comparison is open. One at a time. */
  const [expanded, setExpanded] = useState<string | null>(null);
  const [readSummary, setReadSummary] = useState<{ sections: string[]; total: number; consumed: number; pages: number } | null>(null);
  const [pulledAt, setPulledAt] = useState(() => new Date().toISOString().slice(0, 10));
  const [scores, setScores] = useState<ScoreInputs>(EMPTY_SCORE_INPUTS);
  const [model, setModel] = useState("");
  const [problem, setProblem] = useState<string | null>(null);
  const [reader, setReader] = useState<Reader>("text");
  /* Files kept aside when a PDF turns out to be a scan, so the person can ask
     for it to be read without choosing the file again. */
  const [scanned, setScanned] = useState<File[]>([]);
  const [readingScan, setReadingScan] = useState(false);
  const [scanNotes, setScanNotes] = useState<string[]>([]);
  const [charge, setCharge] = useState<{ credits: number | null; balance: number | null } | null>(null);
  /* CR-14. Empty for a source that states no counts of its own — which reads
     as UNKNOWN completeness, not as complete. */
  const [checks, setChecks] = useState<ReconciliationCheck[]>([]);
  const [facts, setFacts] = useState<CompletenessFact[]>([]);
  const importMutation = useImportCreditReport(fulfillmentClientId);

  const onFiles = async (files: File[]) => {
    setProblem(null);
    setRows(null);
    setScanned([]);
    setScanNotes([]);
    setCharge(null);
    setChecks([]);
    setFacts([]);
    setReading(true);
    setFileNames(files.map((f) => f.name));
    try {
      /* An HTML report is already text, and a SmartCredit export states its
         own counts — so it is the one source that can check the parse against
         itself (CR-14). Read as inert text: no script runs, no URL is
         fetched, no DOM is built from it. */
      const htmls = files.filter((f) => /\.html?$/i.test(f.name) || f.type === "text/html");
      if (htmls.length > 0) {
        const parsedHtml = parseSmartCreditHtml((await Promise.all(htmls.map((f) => f.text()))).join("\n"));
        if (parsedHtml.items.length === 0) {
          setProblem(parsedHtml.warnings.join(" ") || "No accounts were recognised in that HTML report.");
          return;
        }
        setReader("text");
        setRows(parsedHtml.items.map((c) => ({ ...c, include: true, confidence: "high", evidence: [] })));
        setChecks(reconcile(parsedHtml));
        setFacts(completenessFacts(parsedHtml));
        if (parsedHtml.warnings.length > 0) setScanNotes(parsedHtml.warnings);
        return;
      }

      /* A photo has no text layer to look for; only PDFs go through the
         reader. Images go straight to the assistant path below. */
      const pdfs = files.filter((f) => f.type === "application/pdf");
      const images = files.filter((f) => f.type !== "application/pdf");
      if (pdfs.length === 0) {
        setScanned(images);
        setProblem(`${images.map((f) => f.name).join(", ")} ${images.length === 1 ? "is a photo" : "are photos"}, so there is no text to read directly. Have ${images.length === 1 ? "it" : "them"} read below, or import a PDF saved from the monitoring service.`);
        return;
      }
      const results = await Promise.all(pdfs.map((f) => extractPdfLines(f)));
      const noText = [...pdfs.filter((_, i) => !results[i].hasTextLayer), ...images];
      if (noText.length > 0) {
        /* A scan has no text to parse. Offer the reading assistant instead of
           refusing outright — the person still reviews every row. */
        setScanned(noText);
        setProblem(
          `${noText.map((f) => f.name).join(", ")} ${noText.length === 1 ? "has" : "have"} no readable text — ${noText.length === 1 ? "it is a scan or a photo" : "they are scans or photos"}. You can have ${noText.length === 1 ? "it" : "them"} read below, or save the report as a PDF from the monitoring service and try again.`,
        );
        return;
      }
      const parsed = parseCreditReportPdfText(results.flatMap((r) => r.lines));
      if (parsed.candidates.length === 0) {
        setScanned(pdfs);
        setProblem("The text was read but no credit report items were recognised in it. You can have the file read below, or check that this is a credit report.");
        return;
      }
      setReader("text");
      setRows(parsed.candidates.map((c) => ({ ...c, include: true })));
      setReadSummary({ sections: parsed.sections, total: parsed.totalLines, consumed: parsed.consumedLines, pages: results.reduce((n, r) => n + r.pageCount, 0) });
      applyScores(parsed.scores);
    } catch (e) {
      setProblem(errorMessage(e, "The PDF could not be read."));
    } finally {
      setReading(false);
    }
  };

  const applyScores = (found: { bureau: Bureau; model: string; score: number }[]) => {
    if (found.length === 0) return;
    const next = { ...EMPTY_SCORE_INPUTS };
    for (const s of found) next[s.bureau] = String(s.score);
    setScores(next);
    setModel(found[0].model === "as stated on report" ? "" : found[0].model);
  };

  /**
   * Reading a scan with the assistant. The gateway holds the key, checks the
   * organization's entitlement and balance, and meters the charge; the rows
   * that come back are transcription, and every one of them is marked for
   * review before anything is saved.
   */
  const readWithAssistant = async () => {
    if (!organizationId) { setProblem("Reading a scan needs an organization; open this client from their organization."); return; }
    const files = scanned.length ? scanned : [];
    if (files.length === 0) return;
    for (const f of files) {
      const bad = ocrFileProblem(f);
      if (bad) { setProblem(bad); return; }
    }
    setReadingScan(true);
    setProblem(null);
    setScanNotes([]);
    try {
      const attachments: AiAttachment[] = await Promise.all(
        files.map(async (f) => ({ mediaType: f.type as AiAttachment["mediaType"], data: await fileToBase64(f) })),
      );
      const result = await requestAiDraft({
        organizationId,
        feature: "credit.report_read",
        product: "creditOps",
        system: OCR_SYSTEM_PROMPT,
        prompt: OCR_PROMPT,
        maxTokens: 8000,
        attachments,
      });
      if (result.status !== "ok") { setProblem(result.message); return; }
      const parsed = parseOcrAnswer(result.text);
      setCharge({ credits: result.creditsCharged, balance: result.balance });
      setScanNotes(parsed.skipped);
      if (parsed.candidates.length === 0) { setProblem(parsed.skipped[0] ?? "Nothing could be read from that file."); return; }
      setReader("ocr");
      setRows(parsed.candidates.map((c) => ({ ...c, include: true })));
      setReadSummary({ sections: [], total: parsed.candidates.length, consumed: parsed.candidates.length, pages: files.length });
      applyScores(parsed.scores);
      setScanned([]);
    } catch (e) {
      setProblem(errorMessage(e, "The file could not be read."));
    } finally {
      setReadingScan(false);
    }
  };

  const update = (id: string, patch: Partial<ReviewRow>) => setRows((prev) => prev?.map((r) => (r.id === id ? { ...r, ...patch } : r)) ?? prev);
  const toggleBureau = (row: ReviewRow, b: Bureau) =>
    update(row.id, { bureaus: row.bureaus.includes(b) ? row.bureaus.filter((x) => x !== b) : [...row.bureaus, b].sort() as Bureau[] });

  const included = rows?.filter((r) => r.include) ?? [];
  const blocking = included.filter((r) => !r.name.trim() || !r.status.trim() || r.bureaus.length === 0 || Number.isNaN(parseBalanceCents(r.balance)));
  const bureausPresent = REPORT_BUREAUS.filter((b) => included.some((r) => r.bureaus.includes(b)));
  const reviewCount = included.filter((r) => r.confidence === "review").length;

  const runImport = () => {
    if (!rows || blocking.length || !included.length) return;
    setProblem(null);
    importMutation.mutate(
      {
        organizationId,
        outsourcingGroupId,
        fulfillmentClientId,
        consumerUserId: null,
        bureaus: bureausPresent,
        pulledAt,
        source: "manual_upload",
        fileId: null,
        parserVersion: checks.length > 0 ? SMARTCREDIT_PARSER_VERSION : reader === "ocr" ? OCR_PARSER_VERSION : PDF_PARSER_VERSION,
        items: included.map((r) => ({ ...r, balanceCents: parseBalanceCents(r.balance) })),
        scores: buildScoreRows(scores, model),
        /* The verdict is derived in SQL from these; the client never sends it. */
        completeness: facts,
        reconciliation: checks,
      },
      {
        onSuccess: (id) => { setRows(null); setFileNames([]); onImported?.(id); },
        onError: (e) => setProblem(errorMessage(e, "The report could not be imported.")),
      },
    );
  };

  const reset = () => { setExpanded(null); setChecks([]); setFacts([]); setRows(null); setFileNames([]); setProblem(null); setReadSummary(null); setScanned([]); setScanNotes([]); setCharge(null); };

  return (
    <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-sm font-bold text-foreground">
          <UploadCloud className="h-4 w-4 text-primary" /> Import credit report (PDF)
        </h3>
        <input
          ref={fileRef}
          type="file"
          accept="application/pdf,.pdf,text/html,.html,.htm,image/png,image/jpeg,image/webp"
          multiple
          className="hidden"
          onChange={(e) => { const files = Array.from(e.target.files ?? []).slice(0, 3); if (files.length) void onFiles(files); e.target.value = ""; }}
        />
        <Button type="button" size="sm" variant="outline" onClick={() => fileRef.current?.click()} disabled={reading}>
          {reading ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <FileText className="mr-1 h-3.5 w-3.5" />} {reading ? "Reading…" : "Choose files"}
        </Button>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        Up to three files: PDFs or HTML reports saved from the monitoring service, or photos and scans. Anything with real text is read here in your browser; a scan is read by the assistant if you ask. An HTML report states its own counts, so the parse is checked against them. Either way, every account is shown for review before anything is saved.
      </p>

      {fileNames.length > 0 && <p className="mt-2 text-xs text-foreground">Files: <span className="font-mono">{fileNames.join(", ")}</span></p>}

      {problem && (
        <div role="alert" className="mt-3 flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/5 p-3 text-xs text-foreground">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-status-warning" /> <p>{problem}</p>
        </div>
      )}

      {scanned.length > 0 && (
        <div className="mt-3 rounded-lg border border-primary/30 bg-primary/5 p-3">
          <p className="flex items-center gap-2 text-xs font-bold text-foreground">
            <ScanText className="h-4 w-4 text-primary" /> Have this read for you
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            The assistant reads the pages and types the items out for you. It copies what it sees and never fills in a
            blank — you check every row before anything is saved, exactly as with a text report. This uses your
            organization's AI credits.
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Button type="button" size="sm" onClick={() => void readWithAssistant()} disabled={readingScan}>
              {readingScan ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Sparkles className="mr-1 h-3.5 w-3.5" />}
              {readingScan ? "Reading…" : `Read ${scanned.length === 1 ? "this file" : `these ${scanned.length} files`}`}
            </Button>
            <span className="text-[11px] text-muted-foreground">Up to {Math.round(MAX_OCR_BYTES / (1024 * 1024))} MB per file.</span>
          </div>
        </div>
      )}

      {rows && readSummary && (
        <div className="mt-3 space-y-3">
          {reader === "ocr" && (
            <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 text-xs text-foreground">
              <p className="flex items-center gap-1.5 font-bold"><ScanText className="h-3.5 w-3.5 text-primary" /> Read from a scan by the assistant</p>
              <p className="mt-0.5 text-muted-foreground">
                Every row is marked for review because it was transcribed, not parsed. Check each one against the
                report before importing — especially balances, dates and which bureaus report the item.
                {charge?.credits !== null && charge?.credits !== undefined && <> This reading used {charge.credits} credit{charge.credits === 1 ? "" : "s"}{charge.balance !== null && <>; {charge.balance} left</>}.</>}
              </p>
              {scanNotes.length > 0 && (
                <ul className="mt-1.5 list-disc space-y-0.5 pl-5 text-status-warning">
                  {scanNotes.slice(0, 6).map((n) => <li key={n}>{n}</li>)}
                </ul>
              )}
            </div>
          )}
          <p className="flex flex-wrap items-center gap-1.5 text-xs text-foreground">
            <CheckCircle2 className="h-3.5 w-3.5 text-status-success" /> {rows.length} items found across {readSummary.pages} {reader === "ocr" ? (readSummary.pages === 1 ? "file" : "files") : `page${readSummary.pages === 1 ? "" : "s"}`}
            {reader === "text" && (readSummary.sections.length ? <> · sections read: {readSummary.sections.join(", ")}</> : <> · no section headings found, read as a flat list</>)}.
            {reviewCount > 0 && <span className="text-status-warning">{reviewCount} need a closer look (marked Review).</span>}
          </p>
          <div className="max-h-[28rem] overflow-auto rounded-lg border border-border">
            <table className="w-full min-w-[54rem] text-left text-xs">
              <thead className="sticky top-0 bg-muted/60 text-[10px] uppercase tracking-wider text-muted-foreground backdrop-blur">
                <tr>
                  <th className="px-2 py-1.5">Import</th><th className="px-2 py-1.5">Account</th><th className="px-2 py-1.5">Kind</th><th className="px-2 py-1.5">Type</th>
                  <th className="px-2 py-1.5">Status</th><th className="px-2 py-1.5">Balance</th><th className="px-2 py-1.5">Bureaus</th><th className="px-2 py-1.5">Review</th>
                </tr>
              </thead>
              <tbody>
                {SECTION_ORDER.flatMap((section) => {
                  const inSection = rows.filter((r) => (r.kind ?? "Account") === section);
                  if (inSection.length === 0) return [];
                  return [
                    <tr key={`section-${section}`} className="bg-muted/50">
                      <td colSpan={8} className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                        {SECTION_LABEL[section]} ({inSection.length})
                      </td>
                    </tr>,
                    ...inSection.map((r) => {
                  const bad = r.include && blocking.includes(r);
                  return (
                    <tr key={r.id} className={cn("border-t border-border/60 align-top", !r.include && "opacity-50", bad && "bg-red-500/5")} title={r.evidence.join("\n")}>
                      <td className="px-2 py-1.5">
                        <input type="checkbox" checked={r.include} onChange={(e) => update(r.id, { include: e.target.checked })} aria-label={`Import ${r.name}`} className="h-3.5 w-3.5 accent-primary" />
                      </td>
                      <td className="px-2 py-1.5 min-w-[14rem]">
                        <div className="flex items-start gap-1.5">
                          {r.bureauValues && r.bureauValues.length > 0 && (
                            <button
                              type="button"
                              onClick={() => setExpanded((prev) => (prev === r.id ? null : r.id))}
                              aria-expanded={expanded === r.id}
                              aria-label={expanded === r.id ? `Hide bureau detail for ${r.name}` : `Show bureau detail for ${r.name}`}
                              className="mt-1 rounded text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
                            >
                              {expanded === r.id ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                            </button>
                          )}
                          <div className="min-w-0 flex-1">
                            <input value={r.name} onChange={(e) => update(r.id, { name: e.target.value })} className={cell} aria-label="Account name" />
                            {/* The masked number, as the source gave it. Never a
                                master number, and never reconstructed. */}
                            <p className="mt-0.5 truncate font-mono text-[10px] text-muted-foreground">
                              {describeAccountNumber(
                                (r.bureauValues ?? []).map((v) => ({ bureau: v.bureau as Bureau, masked: v.account_number_masked })),
                              ).text}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="px-2 py-1.5">
                        <select value={r.kind} onChange={(e) => update(r.id, { kind: e.target.value as ItemKind })} className={cell} aria-label="Kind">
                          {KINDS.map((k) => <option key={k} value={k}>{k}</option>)}
                        </select>
                      </td>
                      <td className="px-2 py-1.5"><input value={r.subtype ?? ""} onChange={(e) => update(r.id, { subtype: e.target.value || undefined })} className={cell} aria-label="Type" /></td>
                      <td className="px-2 py-1.5"><input value={r.status} onChange={(e) => update(r.id, { status: e.target.value })} className={cell} aria-label="Status" /></td>
                      <td className="px-2 py-1.5 w-24"><input value={r.balance ?? ""} onChange={(e) => update(r.id, { balance: e.target.value || undefined })} placeholder="—" className={cell} aria-label="Balance" /></td>
                      <td className="px-2 py-1.5">
                        <div className="flex gap-1">
                          {REPORT_BUREAUS.map((b) => (
                            <button
                              key={b}
                              type="button"
                              onClick={() => toggleBureau(r, b)}
                              aria-pressed={r.bureaus.includes(b)}
                              className={cn(
                                "rounded px-1.5 py-0.5 text-[10px] font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
                                r.bureaus.includes(b) ? "bg-primary text-primary-foreground" : "border border-border text-muted-foreground hover:bg-muted",
                              )}
                            >
                              {b}
                            </button>
                          ))}
                        </div>
                      </td>
                      <td className="px-2 py-1.5">
                        <span className={cn("rounded-full px-1.5 py-0.5 text-[10px] font-bold", r.confidence === "high" ? "bg-emerald-500/10 text-emerald-700" : "bg-amber-500/10 text-amber-700")}>
                          {r.confidence === "high" ? "Clear" : "Review"}
                        </span>
                      </td>
                      </tr>
                      );
                    }),
                  ];
                })}
                {rows.map((r) =>
                  expanded === r.id && r.bureauValues && r.bureauValues.length > 0 ? (
                    <tr key={`${r.id}-detail`} className="bg-muted/20">
                      <td colSpan={8} className="px-3 py-3">
                        <p className="mb-2 text-xs font-bold text-foreground">
                          {accountHeading(r.name, r.bureauValues.map((v) => ({ bureau: v.bureau as Bureau, masked: v.account_number_masked })))}
                        </p>
                        <BureauComparisonGrid values={r.bureauValues} sourceColumns={r.sourceColumns} kind={r.kind ?? "Account"} />
                      </td>
                    </tr>
                  ) : null,
                )}
              </tbody>
            </table>
          </div>
          <p className="text-[11px] text-muted-foreground">
            One row per account. Expand an account to see what each bureau reported, field by field.
            {reviewCount > 0 && <> <span className="font-semibold text-foreground">{reviewCount} account{reviewCount === 1 ? "" : "s"} need a look</span> before import.</>}
            {" "}Rows shaded red are missing a name, a status, a bureau, or have a balance that is not an amount.
          </p>

          {(checks.length > 0 || facts.length > 0) && (
            <ImportQualityPanel quality={null} checks={checks} facts={facts} />
          )}

          <ReportMetaFields pulledAt={pulledAt} onPulledAt={setPulledAt} scores={scores} onScores={setScores} model={model} onModel={setModel} />

          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" size="sm" onClick={runImport} disabled={importMutation.isPending || hasInvalidScore(scores) || blocking.length > 0 || included.length === 0}>
              {importMutation.isPending ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : null} Import {included.length} account{included.length === 1 ? "" : "s"}
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={reset} disabled={importMutation.isPending}>
              <Trash2 className="mr-1 h-3.5 w-3.5" /> Discard
            </Button>
            {blocking.length > 0 && <span className="text-xs text-status-danger">{blocking.length} row{blocking.length === 1 ? "" : "s"} need fixing or unticking first.</span>}
          </div>
        </div>
      )}
    </div>
  );
}
