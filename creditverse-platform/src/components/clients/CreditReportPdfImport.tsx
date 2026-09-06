/**
 * Import a credit report from PDF files that carry a text layer.
 *
 * Choose up to three PDFs (one per bureau, or one tri-merge) → the text is read
 * in the browser → the deterministic parser proposes items → the person reviews
 * every row (edit, untick, fix bureaus) → one append-only import records
 * `parser_version = pdf-text-1`. A scanned PDF is refused with a plain reason:
 * reading images needs the OCR step, which is not connected yet.
 */
import { useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, FileText, Loader2, Trash2, UploadCloud } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Bureau, ItemKind } from "@/lib/credit-classification";
import { errorMessage } from "@/lib/data/error-message";
import { useImportCreditReport } from "@/lib/data/use-credit-reports";
import { extractPdfLines } from "@/lib/credit-report/pdf-text";
import { PDF_PARSER_VERSION, parseCreditReportPdfText, type PdfCandidate } from "@/lib/credit-report/pdf-report-parser";
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

const KINDS: ItemKind[] = ["Account", "Inquiry", "Personal", "Public Record"];
const cell = "w-full rounded border border-border bg-background px-1.5 py-1 text-xs text-foreground";

export function CreditReportPdfImport({ fulfillmentClientId, organizationId, outsourcingGroupId, onImported }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [fileNames, setFileNames] = useState<string[]>([]);
  const [reading, setReading] = useState(false);
  const [rows, setRows] = useState<ReviewRow[] | null>(null);
  const [readSummary, setReadSummary] = useState<{ sections: string[]; total: number; consumed: number; pages: number } | null>(null);
  const [pulledAt, setPulledAt] = useState(() => new Date().toISOString().slice(0, 10));
  const [scores, setScores] = useState<ScoreInputs>(EMPTY_SCORE_INPUTS);
  const [model, setModel] = useState("");
  const [problem, setProblem] = useState<string | null>(null);
  const importMutation = useImportCreditReport(fulfillmentClientId);

  const onFiles = async (files: File[]) => {
    setProblem(null);
    setRows(null);
    setReading(true);
    setFileNames(files.map((f) => f.name));
    try {
      const results = await Promise.all(files.map((f) => extractPdfLines(f)));
      const scanned = results.map((r, i) => (r.hasTextLayer ? null : files[i].name)).filter(Boolean);
      if (scanned.length) {
        setProblem(
          `${scanned.join(", ")} has no readable text — it is a scanned image or a photo. Reading scanned reports needs the OCR step, which is not connected yet. Save the report as a PDF from the monitoring service instead, or import a CSV.`,
        );
        return;
      }
      const parsed = parseCreditReportPdfText(results.flatMap((r) => r.lines));
      if (parsed.candidates.length === 0) {
        setProblem("The text was read but no credit report items were recognised in it. Check that this is a credit report; if it is, send this layout to support so the parser learns it.");
        return;
      }
      setRows(parsed.candidates.map((c) => ({ ...c, include: true })));
      setReadSummary({ sections: parsed.sections, total: parsed.totalLines, consumed: parsed.consumedLines, pages: results.reduce((n, r) => n + r.pageCount, 0) });
      if (parsed.scores.length) {
        const next = { ...EMPTY_SCORE_INPUTS };
        for (const s of parsed.scores) next[s.bureau] = String(s.score);
        setScores(next);
        setModel(parsed.scores[0].model === "as stated on report" ? "" : parsed.scores[0].model);
      }
    } catch (e) {
      setProblem(errorMessage(e, "The PDF could not be read."));
    } finally {
      setReading(false);
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
        parserVersion: PDF_PARSER_VERSION,
        items: included.map((r) => ({ ...r, balanceCents: parseBalanceCents(r.balance) })),
        scores: buildScoreRows(scores, model),
      },
      {
        onSuccess: (id) => { setRows(null); setFileNames([]); onImported?.(id); },
        onError: (e) => setProblem(errorMessage(e, "The report could not be imported.")),
      },
    );
  };

  const reset = () => { setRows(null); setFileNames([]); setProblem(null); setReadSummary(null); };

  return (
    <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-sm font-bold text-foreground">
          <UploadCloud className="h-4 w-4 text-primary" /> Import credit report (PDF)
        </h3>
        <input
          ref={fileRef}
          type="file"
          accept="application/pdf,.pdf"
          multiple
          className="hidden"
          onChange={(e) => { const files = Array.from(e.target.files ?? []).slice(0, 3); if (files.length) void onFiles(files); e.target.value = ""; }}
        />
        <Button type="button" size="sm" variant="outline" onClick={() => fileRef.current?.click()} disabled={reading}>
          {reading ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <FileText className="mr-1 h-3.5 w-3.5" />} {reading ? "Reading…" : "Choose PDF files"}
        </Button>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        Up to three PDFs saved from the monitoring service (one per bureau, or a single 3-bureau report). The text is read here in your browser and every item is shown for review before anything is saved. Scanned images cannot be read yet.
      </p>

      {fileNames.length > 0 && <p className="mt-2 text-xs text-foreground">Files: <span className="font-mono">{fileNames.join(", ")}</span></p>}

      {problem && (
        <div role="alert" className="mt-3 flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/5 p-3 text-xs text-foreground">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-status-warning" /> <p>{problem}</p>
        </div>
      )}

      {rows && readSummary && (
        <div className="mt-3 space-y-3">
          <p className="flex flex-wrap items-center gap-1.5 text-xs text-foreground">
            <CheckCircle2 className="h-3.5 w-3.5 text-status-success" /> {rows.length} items found across {readSummary.pages} page{readSummary.pages === 1 ? "" : "s"}
            {readSummary.sections.length ? <> · sections read: {readSummary.sections.join(", ")}</> : <> · no section headings found, read as a flat list</>}.
            {reviewCount > 0 && <span className="text-status-warning">{reviewCount} need a closer look (marked Review).</span>}
          </p>
          <div className="max-h-[28rem] overflow-auto rounded-lg border border-border">
            <table className="w-full min-w-[54rem] text-left text-xs">
              <thead className="sticky top-0 bg-muted/60 text-[10px] uppercase tracking-wider text-muted-foreground backdrop-blur">
                <tr>
                  <th className="px-2 py-1.5">Import</th><th className="px-2 py-1.5">Item</th><th className="px-2 py-1.5">Kind</th><th className="px-2 py-1.5">Type</th>
                  <th className="px-2 py-1.5">Status</th><th className="px-2 py-1.5">Balance</th><th className="px-2 py-1.5">Bureaus</th><th className="px-2 py-1.5">Read as</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const bad = r.include && blocking.includes(r);
                  return (
                    <tr key={r.id} className={cn("border-t border-border/60 align-top", !r.include && "opacity-50", bad && "bg-red-500/5")} title={r.evidence.join("\n")}>
                      <td className="px-2 py-1.5">
                        <input type="checkbox" checked={r.include} onChange={(e) => update(r.id, { include: e.target.checked })} aria-label={`Import ${r.name}`} className="h-3.5 w-3.5 accent-primary" />
                      </td>
                      <td className="px-2 py-1.5 min-w-[12rem]"><input value={r.name} onChange={(e) => update(r.id, { name: e.target.value })} className={cell} aria-label="Item name" /></td>
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
                })}
              </tbody>
            </table>
          </div>
          <p className="text-[11px] text-muted-foreground">Hover a row to see the lines it was read from. Rows shaded red are missing a name, a status, a bureau, or have a balance that is not an amount.</p>

          <ReportMetaFields pulledAt={pulledAt} onPulledAt={setPulledAt} scores={scores} onScores={setScores} model={model} onModel={setModel} />

          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" size="sm" onClick={runImport} disabled={importMutation.isPending || hasInvalidScore(scores) || blocking.length > 0 || included.length === 0}>
              {importMutation.isPending ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : null} Import {included.length} item{included.length === 1 ? "" : "s"}
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
