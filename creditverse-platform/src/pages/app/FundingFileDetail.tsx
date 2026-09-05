/**
 * Funding File page — the engine's view of one funding attempt (Overview ·
 * Application · Documents · Lenders & Offers today; the rest of the design's
 * tabs arrive with their tables). The operational work file for the same
 * client stays in the Workspace; this page links to it and back.
 */
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, Briefcase, Loader2 } from "lucide-react";
import { FundingFileDomainPanel } from "@/components/dashboard/fulfillment/funding-domain/FundingFileDomainPanel";
import { useAgency } from "@/lib/agency-context";
import { useAllFundingFiles } from "@/lib/data/use-funding";

export default function FundingFileDetail() {
  const { fileId = "" } = useParams();
  const files = useAllFundingFiles();
  const agency = useAgency();
  const file = files.data.find((f) => f.id === fileId);

  return (
    <div className="space-y-4 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link to="/app/funding-files" className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"><ArrowLeft className="h-3.5 w-3.5" /> All funding files</Link>
        {file && (
          <Link to={`/app/metro2?client=${file.clientId}`} className="inline-flex items-center gap-1 rounded-lg border border-border px-3 py-1.5 text-xs font-bold text-foreground hover:bg-muted">
            <Briefcase className="h-3.5 w-3.5" /> Open the work file in the Workspace
          </Link>
        )}
      </div>

      {files.isLoading && <p className="inline-flex items-center gap-1 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</p>}
      {!files.isLoading && !file && (
        <div className="rounded-xl border border-border bg-card p-6 text-center">
          <p className="text-sm font-semibold text-foreground">Funding file not found</p>
          <p className="mt-1 text-xs text-muted-foreground">It may belong to another organization or no longer be visible to you.</p>
        </div>
      )}
      {file && (
        <>
          <div>
            <h1 className="text-xl font-bold text-foreground">{file.clientName ?? file.businessName}</h1>
            <p className="text-sm text-muted-foreground">
              {file.clientName && <>{file.businessName} · </>}{file.purpose} · ${file.requestedAmount.toLocaleString()} requested · stage {file.stage}
              {file.secondaryStatus && file.secondaryStatus !== "Active Funding" && <> · {file.secondaryStatus}</>}
              {file.waitingOn && <> · waiting on {file.waitingOn}</>}
              {file.publicId && <span className="ml-2 font-mono text-xs">{file.publicId}</span>}
            </p>
          </div>
          <FundingFileDomainPanel file={file} clientId={file.clientId} organizationId={agency.activeOrganization?.id ?? null} />
        </>
      )}
    </div>
  );
}
