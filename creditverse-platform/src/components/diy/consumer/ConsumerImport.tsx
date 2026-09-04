import { useState } from "react";
import {
  UploadCloud,
  CheckCircle2,
  ShieldCheck,
  FileText,
  Loader2,
  AlertCircle,
} from "lucide-react";
import {
  IMPORT_PROVIDERS,
  type ImportProvider,
  type ImportState,
} from "@/lib/diy/diy-domain";
import { useDiyManagement } from "@/lib/diy/diy-management-context";
import { Button } from "@/components/ui/button";

const stateMeta: Record<ImportState, { label: string; tone: string }> = {
  "not-connected": { label: "Not connected", tone: "text-slate-400" },
  connected: { label: "Connected", tone: "text-status-success" },
  importing: { label: "Importing…", tone: "text-status-warning" },
  processing: { label: "Processing…", tone: "text-status-warning" },
  "analysis-complete": { label: "Analysis complete", tone: "text-status-success" },
  "needs-review": { label: "Needs review", tone: "text-status-warning" },
  failed: { label: "Failed", tone: "text-red-400" },
};

export const ConsumerImport = () => {
  const { logActivity } = useDiyManagement();
  const [provider, setProvider] = useState<ImportProvider>("SmartCredit");
  const [state, setState] = useState<ImportState>("not-connected");
  const [pdfs, setPdfs] = useState<string[]>([]);

  const isManual = provider === "Manual PDF Upload";

  const run = () => {
    if (isManual) {
      if (pdfs.length < 3) return;
      setState("importing");
      setTimeout(() => setState("processing"), 900);
      setTimeout(() => {
        setState("analysis-complete");
        logActivity("per-1", "import", `Report imported (${provider})`);
      }, 2200);
      return;
    }
    setState("importing");
    setTimeout(() => setState("processing"), 1000);
    setTimeout(() => {
      setState("analysis-complete");
      logActivity("per-1", "import", `Report imported (${provider})`);
    }, 2400);
  };

  const addPdf = () => setPdfs((p) => [...p, `report_${p.length + 1}.pdf`]);

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">
          Connect or upload your report
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Import your three-bureau credit report. The engine auto-labels
          negatives and positives accounts and flags items tied to open
          accounts.
        </p>
      </div>

      <div className="rounded-2xl border border-border bg-card p-5">
        <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Monitoring provider
        </p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {IMPORT_PROVIDERS.map((p) => (
            <button
              key={p}
              onClick={() => {
                setProvider(p);
                setState("not-connected");
                setPdfs([]);
              }}
              className={`rounded-xl border px-3 py-2.5 text-xs font-medium transition-colors ${
                provider === p
                  ? "border-emerald-400/40 bg-emerald-500/15 text-status-success"
                  : "border-border bg-card text-muted-foreground hover:bg-muted"
              }`}
            >
              {p}
            </button>
          ))}
        </div>

        {isManual ? (
          <div className="mt-5 rounded-xl bg-navy-deep/60 p-4">
            <p className="text-xs font-semibold text-muted-foreground">
              Upload all 3 bureau PDFs for review accuracy
            </p>
            <p className="mt-1 text-[11px] text-muted-foreground">
              Equifax, Experian, and TransUnion reports required.
            </p>
            <div className="mt-3 space-y-2">
              {["Equifax", "Experian", "TransUnion"].map((b, i) => (
                <div
                  key={b}
                  className="flex items-center justify-between rounded-lg border border-border bg-card px-3 py-2"
                >
                  <span className="flex items-center gap-2 text-xs text-muted-foreground">
                    <FileText className="h-3.5 w-3.5" /> {b}
                  </span>
                  {pdfs[i] ? (
                    <span className="flex items-center gap-1 text-[11px] text-status-success">
                      <CheckCircle2 className="h-3.5 w-3.5" /> Uploaded
                    </span>
                  ) : (
                    <button
                      onClick={addPdf}
                      className="text-[11px] font-semibold text-status-warning hover:underline"
                    >
                      Upload PDF
                    </button>
                  )}
                </div>
              ))}
            </div>
            <p className="mt-2 text-[10px] text-muted-foreground">
              {pdfs.length}/3 uploaded. PDF OCR & data extraction is
              backend-required in this shell.
            </p>
          </div>
        ) : (
          <div className="mt-5 rounded-xl bg-navy-deep/60 p-4">
            <p className="text-xs text-muted-foreground">
              Connecting to <span className="text-foreground">{provider}</span>…
            </p>
            <div className="mt-2 flex items-center gap-2 text-[11px] text-muted-foreground">
              <ShieldCheck className="h-3.5 w-3.5 text-status-success" />
              Your credentials stay between you and {provider}. The platform
              receives the report data only.
            </div>
          </div>
        )}

        <div className="mt-4 flex items-center gap-2">
          <span className="text-[11px] text-muted-foreground">Status:</span>
          <span
            className={`text-[11px] font-semibold ${stateMeta[state].tone}`}
          >
            {state === "importing" || state === "processing" ? (
              <Loader2 className="mr-1 inline h-3 w-3 animate-spin" />
            ) : null}
            {stateMeta[state].label}
          </span>
        </div>

        <Button
          onClick={run}
          disabled={
            state === "importing" ||
            state === "processing" ||
            state === "analysis-complete" ||
            (isManual && pdfs.length < 3)
          }
          className="mt-5 w-full bg-gradient-green text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <UploadCloud className="h-4 w-4" />
          {state === "analysis-complete"
            ? "Report analyzed"
            : isManual
              ? `Import ${pdfs.length}/3 PDFs`
              : `Import ${provider} report`}
        </Button>
      </div>

      {state === "analysis-complete" && (
        <div className="rounded-xl border border-emerald-400/30 bg-emerald-500/5 p-4 text-sm text-status-success">
          <CheckCircle2 className="mr-1.5 inline h-4 w-4" />
          Report analyzed. The engine classified negatives, protected
          open-account inquiries, and prepared potential issues for your review.
        </div>
      )}

      {state === "failed" && (
        <div className="rounded-xl border border-red-400/30 bg-red-500/5 p-4 text-sm text-red-300">
          <AlertCircle className="mr-1.5 inline h-4 w-4" />
          Import failed. Check your monitoring credentials or upload PDFs
          manually.
        </div>
      )}
    </div>
  );
};
