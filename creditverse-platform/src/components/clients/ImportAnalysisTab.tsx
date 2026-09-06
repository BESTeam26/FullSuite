import { useState } from "react";
import {
  UploadCloud,
  FileText,
  Download,
  History,
  CheckCircle2,
  TrendingUp,
  Calendar,
  ChevronRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ReportImportFlow } from "./ReportImportFlow";
import { CreditAnalysisReport } from "./CreditAnalysisReport";
import { useClientWorkspace } from "@/lib/client-workspace-context";
import type { ClassifiedItem } from "@/lib/credit-classification";

interface ReportHistoryEntry {
  id: string;
  date: string;
  type: "Initial Analysis" | "Re-Import" | "Progress Report";
  provider: string;
  scoreEQ: number;
  scoreEX: number;
  scoreTU: number;
  changes?: string;
}

const REPORT_HISTORY: ReportHistoryEntry[] = [
  {
    id: "rpt-5",
    date: "Aug 29, 2026",
    type: "Re-Import",
    provider: "IdentityIQ",
    scoreEQ: 654,
    scoreEX: 660,
    scoreTU: 635,
    changes: "7 deletions · 3 corrections · +28 EQ / +4 EX / +22 TU",
  },
  {
    id: "rpt-4",
    date: "Jul 28, 2026",
    type: "Progress Report",
    provider: "IdentityIQ",
    scoreEQ: 642,
    scoreEX: 651,
    scoreTU: 624,
    changes: "5 deletions · 2 late payments removed",
  },
  {
    id: "rpt-3",
    date: "Jun 15, 2026",
    type: "Re-Import",
    provider: "IdentityIQ",
    scoreEQ: 620,
    scoreEX: 640,
    scoreTU: 610,
    changes: "3 deletions · 1 balance correction",
  },
  {
    id: "rpt-1",
    date: "Jan 12, 2026",
    type: "Initial Analysis",
    provider: "IdentityIQ",
    scoreEQ: 588,
    scoreEX: 601,
    scoreTU: 590,
    changes: "Initial 3-bureau import · 43 negatives detected",
  },
];

export const ImportAnalysisTab = ({ clientId }: { clientId: string }) => {
  const { items, setItems, setHasImported, setTab } = useClientWorkspace();
  const [showImport, setShowImport] = useState(false);

  const handleClassified = (newItems: ClassifiedItem[]) => {
    setItems(newItems);
    setHasImported(true);
    setShowImport(false);
  };

  const handleSaveToDispute = (savedItems: ClassifiedItem[]) => {
    setItems(savedItems);
    setHasImported(true);
    setTab("disputes");
  };

  return (
    <div className="space-y-6">
      {/* Import action header */}
      <div className="rounded-2xl border border-border bg-card p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <UploadCloud className="h-5 w-5 text-status-success" />
            <div>
              <h2 className="font-semibold">Credit report import & analysis</h2>
              <p className="text-xs text-muted-foreground">
                Import a 3-bureau report, run auto-analysis, and save to the
                dispute dashboard
              </p>
            </div>
          </div>
          <Button
            onClick={() => setShowImport((s) => !s)}
            className="bg-gradient-emerald text-white hover:opacity-90"
          >
            <UploadCloud className="h-4 w-4" />
            {showImport ? "Close import" : "Import new report"}
          </Button>
        </div>
      </div>

      {/* Import flow (collapsible) */}
      {showImport && (
        <ReportImportFlow
          clientId={clientId}
          onClassified={handleClassified}
          onSaveToDispute={handleSaveToDispute}
        />
      )}

      {/* Latest analysis report */}
      {items.length > 0 && (
        <div>
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <FileText className="h-4 w-4 text-status-success" />
              <h2 className="font-semibold">Latest credit analysis</h2>
              <Badge className="bg-emerald-500/10 text-status-success">
                Aug 29, 2026
              </Badge>
            </div>
            <Button variant="outline" size="sm" onClick={() => window.print()} title="Opens the print dialog — choose Save as PDF"><Download className="h-3.5 w-3.5" /> Download PDF</Button>
          </div>
          <CreditAnalysisReport items={items} />
        </div>
      )}

      {/* Report history */}
      <div className="rounded-2xl border border-border bg-card p-6">
        <div className="flex items-center gap-2">
          <History className="h-4 w-4 text-status-success" />
          <h2 className="font-semibold">Report & analysis history</h2>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          Every import, re-import, and progress report is saved here as an
          immutable snapshot.
        </p>

        <div className="mt-4 space-y-2">
          {REPORT_HISTORY.map((r) => (
            <div
              key={r.id}
              className="flex flex-col gap-3 rounded-xl border border-border bg-muted/20 p-4 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="flex items-start gap-3">
                <span
                  className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${
                    r.type === "Initial Analysis"
                      ? "bg-blue-500/10 text-status-info"
                      : r.type === "Re-Import"
                        ? "bg-emerald-500/10 text-status-success"
                        : "bg-amber-500/10 text-status-warning"
                  }`}
                >
                  {r.type === "Initial Analysis" ? (
                    <FileText className="h-4 w-4" />
                  ) : r.type === "Re-Import" ? (
                    <TrendingUp className="h-4 w-4" />
                  ) : (
                    <CheckCircle2 className="h-4 w-4" />
                  )}
                </span>
                <div>
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium">{r.type}</p>
                    <span className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Calendar className="h-3 w-3" /> {r.date}
                    </span>
                    <Badge variant="outline" className="text-[10px]">
                      {r.provider}
                    </Badge>
                  </div>
                  {r.changes && (
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {r.changes}
                    </p>
                  )}
                  <div className="mt-1 flex gap-3 text-xs">
                    <span className="text-status-danger">EQ {r.scoreEQ}</span>
                    <span className="text-status-info">EX {r.scoreEX}</span>
                    <span className="text-status-success">TU {r.scoreTU}</span>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="ghost" size="sm" onClick={() => window.print()} title="Opens the print dialog — choose Save as PDF"><Download className="h-3.5 w-3.5" /> PDF</Button>
                <Button variant="ghost" size="sm" disabled title="Past analyses open with the report history build">
                  View <ChevronRight className="h-3 w-3" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Continue to dispute dashboard */}
      <div className="flex items-center justify-between rounded-2xl border border-emerald-500/20 bg-emerald-950/80 p-5 text-emerald-50 shadow-sm">
        <div className="flex items-center gap-3">
          <CheckCircle2 className="h-5 w-5 text-emerald-400" />
          <div>
            <p className="text-sm font-semibold text-emerald-200">
              Analysis complete
            </p>
            <p className="text-xs text-emerald-100/90 leading-relaxed">
              Review categorized items and select disputes
            </p>
          </div>
        </div>
        <Button
          onClick={() => setTab("disputes")}
          className="bg-gradient-emerald text-white hover:opacity-90"
        >
          Go to Dispute Dashboard <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
};
