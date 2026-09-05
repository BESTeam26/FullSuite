import { useState } from "react";
import {
  UploadCloud,
  Sparkles,
  Loader2,
  ShieldCheck,
  ArrowRight,
  CheckCircle2,
  AlertTriangle,
  RotateCcw,
  X,
  Pencil,
  FileText,
  ScanLine,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  classifyReport,
  type ClassifiedItem,
} from "@/lib/credit-classification";
import { sampleRaw } from "@/lib/sample-credit-report";
import {
  useMonitoringStatus,
  statusLabel,
  type MonitoringStatus,
} from "@/lib/monitoring-status";
import { ReImportProgressReport } from "./ReImportProgressReport";
import { SideBySideCompareView } from "./reimport/SideBySideCompareView";
import { PdfDropZone, type PdfFile } from "./PdfDropZone";
import { useClientWorkspace } from "@/lib/client-workspace-context";

const providers = [
  "IdentityIQ",
  "MyScoreIQ",
  "SmartCredit",
  "MyFreeScoreNow",
  "3Scores",
  "PrivacyGuard",
];

const BLOCK_REASONS = [
  "Login credentials could not be verified with the monitoring provider",
  "3-bureau report unavailable — trial plan only shows scores",
  "Monitoring subscription payment failed or is inactive",
  "Security question (last 4 of SSN) did not match provider records",
];

type Phase =
  | "idle"
  | "importing"
  | "blocked"
  | "analyzing"
  | "done"
  | "report"
  | "sidebyside"
  | "pdf-upload"
  | "pdf-ocr";

interface ReportImportFlowProps {
  clientId: string;
  onClassified: (items: ClassifiedItem[]) => void;
  onSaveToDispute: (items: ClassifiedItem[]) => void;
}

export const ReportImportFlow = ({
  clientId,
  onClassified,
  onSaveToDispute,
}: ReportImportFlowProps) => {
  const workspace = useClientWorkspace();
  const [phase, setPhase] = useState<Phase>("idle");
  const [provider, setProvider] = useState(providers[0]);
  const [classified, setClassified] = useState<ClassifiedItem[]>([]);
  const [blockReason, setBlockReason] = useState("");
  const [pdfFiles, setPdfFiles] = useState<
    Record<"EQ" | "EX" | "TU", PdfFile | null>
  >({
    EQ: null,
    EX: null,
    TU: null,
  });
  const { getState, recordFailedAttempt, recordSuccess, setManualStatus } =
    useMonitoringStatus();

  const monitoring = getState(clientId);

  const runImport = () => {
    setPhase("importing");
    setTimeout(() => {
      const willBlock = monitoring.attempts % 2 === 0;
      if (willBlock) {
        const reason =
          BLOCK_REASONS[monitoring.attempts % BLOCK_REASONS.length];
        setBlockReason(reason);
        setPhase("blocked");
        recordFailedAttempt(clientId, reason);
        return;
      }
      setPhase("analyzing");
      setTimeout(() => {
        const result = classifyReport(sampleRaw);
        setClassified(result);
        setPhase("report");
        recordSuccess(clientId);
        onClassified(result);
      }, 1400);
    }, 1100);
  };

  const retry = () => setPhase("idle");
  const startOver = () => {
    setClassified([]);
    setPhase("idle");
  };

  const handlePdfSelect = (bureau: "EQ" | "EX" | "TU", file: File | null) => {
    if (!file) return;
    setPdfFiles((prev) => ({
      ...prev,
      [bureau]: { bureau, name: file.name, size: file.size },
    }));
  };

  const allThreeUploaded = pdfFiles.EQ && pdfFiles.EX && pdfFiles.TU;

  const runPdfOcr = () => {
    setPhase("pdf-ocr");
    setTimeout(() => {
      setPhase("analyzing");
      setTimeout(() => {
        const result = classifyReport(sampleRaw);
        setClassified(result);
        setPhase("report");
        recordSuccess(clientId);
        onClassified(result);
      }, 1400);
    }, 2200);
  };

  /* The simulated provider login and OCR below are DEMO content. In a live
     session the sample-client page has no real report behind it; real imports
     happen on the client's CreditOps workspace (Credit report section). */
  if (workspace.reportSource !== "sample") {
    return (
      <div className="rounded-xl border border-border bg-card p-6 text-sm text-foreground">
        <p className="font-semibold">Report import lives on the client's CreditOps workspace.</p>
        <p className="mt-1 text-xs text-muted-foreground">
          This page shows the bundled sample analysis for demonstration only. Open the client in CreditOps → Workspace → Main Client List to import their credit report (CSV) and run the analysis on their own data.
        </p>
      </div>
    );
  }

  if (phase === "report") {
    return (
      <ReImportProgressReport
        items={classified}
        onSave={(updatedItems) => {
          setClassified(updatedItems);
          onClassified(updatedItems);
          onSaveToDispute(updatedItems);
        }}
        onDiscardSideBySide={() => setPhase("sidebyside")}
        onDiscardReimport={startOver}
      />
    );
  }

  if (phase === "sidebyside") {
    return (
      <SideBySideCompareView
        classified={classified}
        onBackToReport={() => setPhase("report")}
        onStartOver={startOver}
      />
    );
  }

  const negatives = classified.filter((i) => i.isNegative).length;
  const positives = classified.filter(
    (i) =>
      i.category === "Open Positive Account" ||
      i.category === "Closed Positive Account",
  ).length;
  const protectedInquiries = classified.filter(
    (i) => i.disposition === "never" && i.kind === "Inquiry",
  ).length;

  return (
    <div className="rounded-2xl border border-border bg-card p-6">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <UploadCloud className="h-5 w-5 text-status-success" />
          <h2 className="font-semibold">
            Credit report import & auto-analysis
          </h2>
        </div>
        <MonitoringStatusBadge
          status={monitoring.status}
          attempts={monitoring.attempts}
          manuallySet={monitoring.manuallySet}
          onCorrect={(s) => setManualStatus(clientId, s)}
        />
      </div>
      <p className="mt-1 text-sm text-muted-foreground">
        Import a three-bureau report. The Credit Intelligence Engine normalizes
        tradelines, auto-marks negatives, and protects inquiries linked to open
        accounts — before anything reaches the dispute dashboard.
      </p>

      {monitoring.attempts > 0 && (
        <div className="mt-4 flex items-start gap-2 rounded-xl border border-amber-500/20 bg-amber-500/5 p-3 text-xs text-status-warning">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>
            <strong>{monitoring.attempts}</strong> blocked import attempt
            {monitoring.attempts === 1 ? "" : "s"} on record for this client.
            The system auto-updates status so nothing gets missed — correct it
            manually anytime if the connection is actually fine.
          </span>
        </div>
      )}

      {phase === "idle" && (
        <div className="mt-5 space-y-4">
          <div>
            <p className="mb-2 text-xs font-medium uppercase text-muted-foreground">
              Monitoring provider
            </p>
            <div className="flex flex-wrap gap-2">
              {providers.map((p) => (
                <button
                  key={p}
                  onClick={() => setProvider(p)}
                  className={`rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors ${
                    provider === p
                      ? "border-emerald-500/50 bg-emerald-500/10 text-status-success"
                      : "border-border bg-muted/30 text-muted-foreground hover:bg-muted"
                  }`}
                >
                  {p}
                </button>
              ))}
            </div>
          </div>
          <Button
            onClick={runImport}
            className="bg-gradient-emerald text-white hover:opacity-90"
          >
            <UploadCloud className="h-4 w-4" /> Import from {provider}
          </Button>
          <div className="flex items-center gap-3 pt-2">
            <div className="h-px flex-1 bg-border" />
            <span className="text-xs text-muted-foreground">
              or if automatic import is unavailable
            </span>
            <div className="h-px flex-1 bg-border" />
          </div>
          <Button variant="outline" onClick={() => setPhase("pdf-upload")}>
            <FileText className="h-4 w-4" /> Upload 3-bureau PDF report
          </Button>
        </div>
      )}

      {phase === "pdf-upload" && (
        <div className="mt-5 space-y-4">
          <div className="flex items-start gap-3 rounded-xl border border-blue-500/20 bg-blue-500/5 p-4">
            <ScanLine className="mt-0.5 h-4 w-4 shrink-0 text-status-info" />
            <div className="text-sm">
              <p className="font-medium text-blue-700">
                Manual PDF upload — OCR &amp; data extraction
              </p>
              <p className="mt-0.5 text-muted-foreground">
                Upload all three bureau PDF reports for accuracy review. The
                engine reads and scrapes tradeline data via OCR, then updates
                items on the dispute dashboard.
              </p>
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            {(["EQ", "EX", "TU"] as const).map((b) => (
              <PdfDropZone
                key={b}
                bureau={b}
                file={pdfFiles[b]}
                onSelect={(f) => handlePdfSelect(b, f)}
              />
            ))}
          </div>
          <div className="flex items-center gap-2">
            <Button
              onClick={runPdfOcr}
              disabled={!allThreeUploaded}
              className="bg-gradient-emerald text-white hover:opacity-90"
            >
              <ScanLine className="h-4 w-4" /> Run OCR &amp; extract data
            </Button>
            <Button variant="outline" onClick={() => setPhase("idle")}>
              <X className="h-3.5 w-3.5" /> Cancel
            </Button>
            {!allThreeUploaded && (
              <span className="text-xs text-muted-foreground">
                Upload all 3 bureau PDFs to continue
              </span>
            )}
          </div>
        </div>
      )}

      {phase === "pdf-ocr" && (
        <div className="mt-6 space-y-3">
          <div className="flex items-center gap-3 text-sm">
            <Loader2 className="h-4 w-4 animate-spin text-status-success" />
            Running OCR on {pdfFiles.EQ?.name}, {pdfFiles.EX?.name},{" "}
            {pdfFiles.TU?.name}…
          </div>
          <div className="flex items-center gap-3 text-sm">
            <Loader2 className="h-4 w-4 animate-spin text-status-success" />
            Extracting tradelines, balances, dates &amp; payment history…
          </div>
          <div className="flex items-center gap-3 text-sm">
            <Loader2 className="h-4 w-4 animate-spin text-status-success" />
            Cross-referencing 3 bureaus for accuracy…
          </div>
        </div>
      )}

      {phase === "importing" && (
        <div className="mt-6 space-y-3">
          <div className="flex items-center gap-3 text-sm">
            <Loader2 className="h-4 w-4 animate-spin text-status-success" />
            Connecting to {provider} and pulling three-bureau report…
          </div>
        </div>
      )}

      {phase === "blocked" && (
        <div className="mt-6 rounded-xl border border-red-500/20 bg-red-500/5 p-5">
          <div className="flex items-start gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-red-500/10 text-status-danger">
              <AlertTriangle className="h-4 w-4" />
            </span>
            <div className="flex-1">
              <p className="font-semibold text-red-700">
                Unable to retrieve the report from {provider}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                {blockReason}.
              </p>
              <div className="mt-3 flex items-center gap-2 rounded-lg bg-card px-3 py-2 text-xs">
                <ShieldCheck className="h-3.5 w-3.5 shrink-0 text-status-success" />
                <span>
                  Status automatically set to{" "}
                  <strong className="text-status-danger">
                    Monitoring Issue
                  </strong>{" "}
                  and this attempt was logged (attempt #{monitoring.attempts}) —
                  no manual tracking needed.
                </span>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <Button
                  size="sm"
                  onClick={retry}
                  className="bg-gradient-emerald text-white hover:opacity-90"
                >
                  <RotateCcw className="h-3.5 w-3.5" /> Retry import
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setPhase("idle")}
                >
                  <X className="h-3.5 w-3.5" /> Close window
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {phase === "analyzing" && (
        <div className="mt-6 space-y-3">
          <div className="flex items-center gap-3 text-sm">
            <CheckCircle2 className="h-4 w-4 text-status-success" />
            Report imported — {sampleRaw.length} items detected
          </div>
          <div className="flex items-center gap-3 text-sm">
            <Loader2 className="h-4 w-4 animate-spin text-status-success" />
            AI engine normalizing tradelines & marking negatives…
          </div>
        </div>
      )}

      {phase === "done" && (
        <div className="mt-5 space-y-4">
          <div className="grid grid-cols-3 gap-3">
            <Stat
              label="Negatives flagged"
              value={negatives}
              tone="text-status-danger"
            />
            <Stat
              label="Positive accounts"
              value={positives}
              tone="text-status-info"
            />
            <Stat
              label="Inquiries protected"
              value={protectedInquiries}
              tone="text-slate-600"
            />
          </div>
          <div className="flex items-start gap-3 rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-status-success" />
            <div className="text-sm">
              <p className="font-medium text-status-success">
                Auto-analysis complete — status set to Connected
              </p>
              <p className="mt-0.5 text-muted-foreground">
                {negatives} negatives auto-selected for factual dispute,{" "}
                {protectedInquiries} inquiries protected (linked to open
                accounts), and {positives} positive accounts shielded from
                dispute.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-status-success" />
            <span className="text-sm font-medium">
              Credit Analysis & Progress report ready
            </span>
            <Badge className="bg-muted text-muted-foreground">
              Saved to dashboard
            </Badge>
          </div>
        </div>
      )}
    </div>
  );
};

function MonitoringStatusBadge({
  status,
  attempts,
  manuallySet,
  onCorrect,
}: {
  status: MonitoringStatus;
  attempts: number;
  manuallySet: boolean;
  onCorrect: (s: MonitoringStatus) => void;
}) {
  const tone: Record<MonitoringStatus, string> = {
    connected: "bg-emerald-500/10 text-status-success",
    "monitoring-issue": "bg-red-500/10 text-status-danger",
    "needs-review": "bg-amber-500/10 text-status-warning",
  };
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${tone[status]}`}
        >
          {status === "monitoring-issue" && (
            <AlertTriangle className="h-3 w-3" />
          )}
          {statusLabel(status)}
          {attempts > 0 && (
            <span className="rounded-full bg-black/10 px-1.5 text-[10px]">
              {attempts}
            </span>
          )}
          {manuallySet && <Pencil className="h-2.5 w-2.5 opacity-60" />}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => onCorrect("connected")}>
          Mark as Connected
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => onCorrect("monitoring-issue")}>
          Mark as Monitoring Issue
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => onCorrect("needs-review")}>
          Mark as Needs Review
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-muted/30 p-4">
      <p className={`text-2xl font-bold ${tone}`}>{value}</p>
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
  );
}

export { ArrowRight };
