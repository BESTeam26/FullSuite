/**
 * Credit report on the real client workspace: import history, the bureaus'
 * stated scores, the CSV import, and — once a report exists — the factor
 * analysis (Score Simulator). Everything shown comes from the client's own
 * imported reports; with none imported the section says so and offers the
 * import. Nothing here is sample content.
 */
import { useState } from "react";
import { formatDate } from "@/lib/format-date";
import { ChevronDown, ChevronRight, FileText } from "lucide-react";
import { useClientWorkspace } from "@/lib/client-workspace-context";
import { useClientReports } from "@/lib/data/use-credit-reports";
import { CreditReportCsvImport } from "@/components/clients/CreditReportCsvImport";
import { CreditReportPdfImport } from "@/components/clients/CreditReportPdfImport";
import ScoreSimulator from "@/components/clients/ScoreSimulator";
import { cn } from "@/lib/utils";

interface Props {
  clientId: string;
  organizationId: string | null;
  outsourcingGroupId: string | null;
}

export function ClientCreditReportSection({ clientId, organizationId, outsourcingGroupId }: Props) {
  const workspace = useClientWorkspace();
  const { reports } = useClientReports(clientId);
  const [showImport, setShowImport] = useState(false);
  const [importKind, setImportKind] = useState<"pdf" | "csv">("pdf");
  const [showAnalysis, setShowAnalysis] = useState(false);
  const latest = reports[0] ?? null;

  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/50 pb-2">
          <h3 className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
            <FileText className="h-4 w-4 text-primary" /> Credit report
          </h3>
          <button
            type="button"
            onClick={() => setShowImport((v) => !v)}
            className="rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-semibold text-foreground transition-colors hover:bg-muted"
          >
            {showImport ? "Hide import" : latest ? "Import new report" : "Import report"}
          </button>
        </div>

        {workspace.reportsLoading ? (
          <p className="mt-3 text-xs text-muted-foreground">Loading reports…</p>
        ) : latest ? (
          <div className="mt-3 space-y-2">
            <p className="text-xs text-foreground">
              Latest report pulled <strong>{formatDate(latest.pulledAt)}</strong> · bureaus {latest.bureaus.join(", ")} ·{" "}
              {workspace.items.length} items · source {latest.source.replace("_", " ")}
            </p>
            {latest.scores.length > 0 && (
              <div className="grid grid-cols-3 gap-2">
                {latest.scores.map((s) => (
                  <div key={`${s.bureau}-${s.model}`} className="rounded-lg border border-border bg-muted/20 p-2 text-center">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{s.bureau}</p>
                    <p className="text-lg font-black text-foreground">{s.score}</p>
                    <p className="text-[10px] text-muted-foreground">{s.model}</p>
                  </div>
                ))}
              </div>
            )}
            {reports.length > 1 && (
              <p className="text-[11px] text-muted-foreground">
                {reports.length} reports on file — earliest {formatDate(reports[reports.length - 1].pulledAt)}. Each import is kept; nothing is overwritten.
              </p>
            )}
          </div>
        ) : (
          <p className="mt-3 text-xs text-muted-foreground">
            No credit report imported for this client yet. Import one to see the items and the factor analysis — nothing is estimated until a report exists.
          </p>
        )}

        {showImport && (
          <div className="mt-3 space-y-2">
            <div role="tablist" aria-label="Import format" className="inline-flex rounded-lg border border-border bg-muted/30 p-0.5 text-xs">
              {(["pdf", "csv"] as const).map((k) => (
                <button
                  key={k}
                  type="button"
                  role="tab"
                  aria-selected={importKind === k}
                  onClick={() => setImportKind(k)}
                  className={cn(
                    "rounded-md px-3 py-1 font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
                    importKind === k ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {k === "pdf" ? "PDF report" : "CSV file"}
                </button>
              ))}
            </div>
            {importKind === "pdf" ? (
              <CreditReportPdfImport
                fulfillmentClientId={clientId}
                organizationId={organizationId}
                outsourcingGroupId={outsourcingGroupId}
                onImported={() => setShowImport(false)}
              />
            ) : (
              <CreditReportCsvImport
                fulfillmentClientId={clientId}
                organizationId={organizationId}
                outsourcingGroupId={outsourcingGroupId}
                onImported={() => setShowImport(false)}
              />
            )}
          </div>
        )}
      </div>

      {workspace.reportSource === "live" && workspace.items.length > 0 && (
        <div className="rounded-xl border border-border bg-card shadow-sm">
          <button
            type="button"
            onClick={() => setShowAnalysis((v) => !v)}
            aria-expanded={showAnalysis}
            className="flex w-full items-center justify-between px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-muted-foreground transition-colors hover:bg-muted/30"
          >
            <span>Factor analysis & what-if guide</span>
            {showAnalysis ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          </button>
          <div className={cn("border-t border-border/50 p-4", !showAnalysis && "hidden")}>
            {showAnalysis && <ScoreSimulator />}
          </div>
        </div>
      )}
    </div>
  );
}
