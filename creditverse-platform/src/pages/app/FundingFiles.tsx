/**
 * Funding Files — the FundingOps engine surface (Dee's FundingOS design), in
 * frame and separate from the FundingOps Workspace, exactly as Clients sits
 * apart from the CreditOps Workspace. One row per funding attempt; opening a
 * row is the Funding File page with its tabs. Reads are RLS-scoped to the
 * active organization's own files.
 */
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { FolderOpen, Loader2, Search } from "lucide-react";
import { FundingPipelineBoard } from "@/components/dashboard/fulfillment/funding-domain/FundingPipelineBoard";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth/auth-context";
import { moveFundingFile } from "@/lib/data/funding-domain";
import { useAllFundingFiles } from "@/lib/data/use-funding";
import { useFundingOpsAccess } from "@/lib/fulfillment/fundingops-access";
import { FUNDING_STATUS_TONE, formatCurrency, type FundingFileStage } from "@/lib/fulfillment/fundingops-domain";
import { cn } from "@/lib/utils";
import { usePermission } from "@/lib/auth/use-permission";

export default function FundingFiles() {
  const files = useAllFundingFiles();
  const auth = useAuth();
  const access = useFundingOpsAccess();
  const qc = useQueryClient();
  const mayEdit = usePermission("fundingops.files.edit").allowed;
  const canMove = auth.mode === "live" && access.canEditStageProgress && mayEdit;
  /** Drop on the board = the same move_funding_file() call as the file page's Move control; the lists reading funding files refresh after. */
  const onMove = async (fileId: string, stage: FundingFileStage) => {
    await moveFundingFile({ fileId, stage });
    await Promise.all([qc.invalidateQueries({ queryKey: ["funding", "files"] }), qc.invalidateQueries({ queryKey: ["fundingops"] }), qc.invalidateQueries({ queryKey: ["activity"] })]);
  };
  const [query, setQuery] = useState("");
  const [view, setView] = useState<"list" | "pipeline">("pipeline");
  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = q ? files.data.filter((f) => `${f.clientName ?? ""} ${f.businessName} ${f.purpose} ${f.stage} ${f.publicId ?? ""}`.toLowerCase().includes(q)) : files.data;
    return [...list].sort((a, b) => (a.clientName ?? a.businessName).localeCompare(b.clientName ?? b.businessName));
  }, [files.data, query]);

  return (
    <div className="space-y-4 p-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold text-foreground"><FolderOpen className="h-5 w-5 text-primary" /> Funding Files</h1>
          <p className="text-sm text-muted-foreground">
            One file per funding attempt, on the 17-stage pipeline. Verified data → deterministic Program Fit → human decision → recorded outcome. Production and fulfillment tracking lives in the Workspace.
          </p>
        </div>
        {files.source === "demo" && <span className="rounded bg-muted px-2 py-0.5 text-[11px] font-bold text-muted-foreground">Sample data</span>}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative w-full max-w-md">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search by client, business, purpose, stage or FND- id"
            className="w-full rounded-lg border border-border bg-background py-2 pl-9 pr-3 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary" />
        </div>
        {/* Same records, two views — never two lists. */}
        <div role="tablist" aria-label="View" className="inline-flex rounded-lg border border-border bg-muted/50 p-0.5 text-xs font-semibold">
          {(["list", "pipeline"] as const).map((v) => (
            <button key={v} type="button" role="tab" aria-selected={view === v} onClick={() => setView(v)}
              className={cn("rounded-md px-3 py-1.5 capitalize transition-colors", view === v ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}>
              {v === "list" ? "List" : "Pipeline"}
            </button>
          ))}
        </div>
      </div>

      {view === "pipeline" && (files.isLoading ? <p className="inline-flex items-center gap-1 text-xs text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading funding files…</p> : <FundingPipelineBoard files={rows} canMove={canMove} onMove={onMove} />)}

      {view === "list" && (
      <div className="overflow-x-auto rounded-xl border border-border bg-card shadow-sm">
        <table className="w-full text-left text-xs">
          <thead className="bg-muted/50 text-[11px] uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="px-4 py-2 font-bold">Client · business · purpose</th>
              <th className="px-4 py-2 font-bold">Requested</th>
              <th className="px-4 py-2 font-bold">Stage</th>
              <th className="px-4 py-2 font-bold">Submissions</th>
              <th className="px-4 py-2 font-bold">Last activity</th>
            </tr>
          </thead>
          <tbody>
            {files.isLoading && (
              <tr><td colSpan={5} className="px-4 py-6 text-center text-muted-foreground"><Loader2 className="mr-1 inline h-4 w-4 animate-spin" /> Loading funding files…</td></tr>
            )}
            {!files.isLoading && rows.length === 0 && (
              <tr><td colSpan={5} className="px-4 py-6 text-center text-muted-foreground">No funding files yet. Files are created from a funding client in the Workspace.</td></tr>
            )}
            {rows.map((f) => (
              <tr key={f.id} className="border-t border-border/60 hover:bg-muted/30">
                <td className="px-4 py-2">
                  <Link to={`/app/funding-files/${f.id}`} className="font-semibold text-primary hover:underline">{f.clientName ?? f.businessName}</Link>
                  <p className="text-[11px] text-muted-foreground">{f.clientName ? `${f.businessName} · ` : ""}{f.purpose}{f.publicId && <span className="ml-1 font-mono text-[10px]">{f.publicId}</span>}</p>
                </td>
                <td className="px-4 py-2 font-bold text-foreground">{formatCurrency(f.requestedAmount)}</td>
                <td className="px-4 py-2">
                  <span className={cn("inline-flex rounded-full border px-2 py-0.5 text-[10px] font-medium", FUNDING_STATUS_TONE[f.stage] ?? "border-border bg-muted text-muted-foreground")}>{f.stage}</span>
                </td>
                <td className="px-4 py-2 text-foreground">{f.dealCount}</td>
                <td className="px-4 py-2 text-muted-foreground">{f.lastActivity || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      )}
      {files.error && <p role="alert" className="text-xs text-status-danger">Could not load funding files.</p>}
    </div>
  );
}
