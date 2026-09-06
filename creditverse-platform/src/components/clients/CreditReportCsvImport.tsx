/**
 * Import a credit report from a structured CSV (v1). Parse → show every
 * problem by line, or a preview → import atomically → the workspace re-reads
 * the client's latest report. The file itself is also kept (files row) when
 * the upload succeeds, so the source is auditable; the import proceeds on the
 * parsed rows regardless, and says so if the file could not be stored.
 */
import { useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, FileText, Loader2, UploadCloud } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth/auth-context";
import { errorMessage } from "@/lib/data/error-message";
import { useImportCreditReport } from "@/lib/data/use-credit-reports";
import { EMPTY_SCORE_INPUTS, REPORT_BUREAUS, buildScoreRows, hasInvalidScore, type ScoreInputs } from "@/lib/credit-report/report-scores";
import { ReportMetaFields } from "./import/ReportMetaFields";
import {
  IMPORT_PARSER_VERSION,
  OPTIONAL_COLUMNS,
  REQUIRED_COLUMNS,
  parseCreditReportCsv,
  type ParseResult,
} from "@/lib/credit-report/import-parser";
import type { Bureau } from "@/lib/credit-classification";

interface Props {
  fulfillmentClientId: string;
  organizationId: string | null;
  outsourcingGroupId: string | null;
  onImported?: (reportId: string) => void;
}


export function CreditReportCsvImport({ fulfillmentClientId, organizationId, outsourcingGroupId, onImported }: Props) {
  const auth = useAuth();
  const fileRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [parsed, setParsed] = useState<ParseResult | null>(null);
  const [pulledAt, setPulledAt] = useState(() => new Date().toISOString().slice(0, 10));
  const [scores, setScores] = useState<ScoreInputs>(EMPTY_SCORE_INPUTS);
  const [model, setModel] = useState("");
  const [error, setError] = useState<string | null>(null);
  const importMutation = useImportCreditReport(fulfillmentClientId);

  const onFile = async (file: File) => {
    setFileName(file.name);
    setError(null);
    const text = await file.text();
    setParsed(parseCreditReportCsv(text));
  };

  const bureausPresent = parsed?.ok
    ? REPORT_BUREAUS.filter((b) => parsed.items.some((i) => i.bureaus.includes(b)))
    : [];
  const scoreRows = buildScoreRows(scores, model);
  const scoresInvalid = hasInvalidScore(scores);

  const runImport = () => {
    if (!parsed?.ok || !auth.user) return;
    setError(null);
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
        parserVersion: IMPORT_PARSER_VERSION,
        items: parsed.items,
        scores: scoreRows,
      },
      {
        onSuccess: (id) => { setParsed(null); setFileName(null); onImported?.(id); },
        onError: (e) => setError(errorMessage(e, "The report could not be imported.")),
      },
    );
  };

  return (
    <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-sm font-bold text-foreground">
          <UploadCloud className="h-4 w-4 text-primary" /> Import credit report (CSV)
        </h3>
        <input
          ref={fileRef}
          type="file"
          accept=".csv,text/csv"
          className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) void onFile(f); e.target.value = ""; }}
        />
        <Button type="button" size="sm" variant="outline" onClick={() => fileRef.current?.click()}>
          <FileText className="mr-1 h-3.5 w-3.5" /> Choose file
        </Button>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        One row per tradeline, inquiry, public record or personal item. Columns: {REQUIRED_COLUMNS.join(", ")} (required); {OPTIONAL_COLUMNS.join(", ")} (optional). Bureaus as EQ, EX, TU separated by ";". Rows the parser cannot read are listed — nothing is guessed. Have a PDF instead? Switch to the PDF import.
      </p>

      {fileName && <p className="mt-2 text-xs text-foreground">File: <span className="font-mono">{fileName}</span></p>}

      {parsed && "failures" in parsed && (
        <div role="alert" className="mt-3 rounded-lg border border-red-500/30 bg-red-500/5 p-3 text-xs text-foreground">
          <p className="flex items-center gap-1.5 font-bold"><AlertTriangle className="h-3.5 w-3.5 text-status-danger" /> The file was not imported. Fix these rows and choose the file again:</p>
          <ul className="mt-1.5 list-disc space-y-0.5 pl-5">
            {parsed.failures.slice(0, 20).map((f, i) => <li key={i}>Line {f.line}: {f.problem}</li>)}
            {parsed.failures.length > 20 && <li>…and {parsed.failures.length - 20} more.</li>}
          </ul>
        </div>
      )}

      {parsed?.ok && (
        <div className="mt-3 space-y-3">
          <p className="flex items-center gap-1.5 text-xs text-foreground">
            <CheckCircle2 className="h-3.5 w-3.5 text-status-success" /> {parsed.items.length} items parsed
            {bureausPresent.length ? ` · bureaus ${bureausPresent.join(", ")}` : ""}.
            {parsed.warnings.map((w) => <span key={w} className="text-status-warning"> {w}</span>)}
          </p>
          <div className="max-h-48 overflow-auto rounded-lg border border-border">
            <table className="w-full text-left text-xs">
              <thead className="bg-muted/40 text-[10px] uppercase tracking-wider text-muted-foreground">
                <tr><th className="px-2 py-1.5">Item</th><th className="px-2 py-1.5">Kind</th><th className="px-2 py-1.5">Status</th><th className="px-2 py-1.5">Balance</th><th className="px-2 py-1.5">Bureaus</th></tr>
              </thead>
              <tbody>
                {parsed.items.map((i) => (
                  <tr key={i.id} className="border-t border-border/60">
                    <td className="px-2 py-1 text-foreground">{i.name}{i.subtype ? <span className="text-muted-foreground"> · {i.subtype}</span> : null}</td>
                    <td className="px-2 py-1">{i.kind}</td><td className="px-2 py-1">{i.status}</td>
                    <td className="px-2 py-1">{i.balance ?? "—"}</td><td className="px-2 py-1">{i.bureaus.join(" ")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <ReportMetaFields pulledAt={pulledAt} onPulledAt={setPulledAt} scores={scores} onScores={setScores} model={model} onModel={setModel} />
          <div className="flex items-center gap-2">
            <Button type="button" size="sm" onClick={runImport} disabled={importMutation.isPending || scoresInvalid || bureausPresent.length === 0}>
              {importMutation.isPending ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : null} Import {parsed.items.length} items
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => { setParsed(null); setFileName(null); }} disabled={importMutation.isPending}>Discard</Button>
          </div>
        </div>
      )}
      {error && <p role="alert" className="mt-2 text-xs text-status-danger">{error}</p>}
    </div>
  );
}
