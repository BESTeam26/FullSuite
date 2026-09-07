/**
 * The documents that belong to THIS deal.
 *
 * Two kinds, in one list because a lender does not care which is which: the
 * uploads that answer this deal's own stipulations, and the file's documents
 * that somebody cleared as shareable with a lender.
 *
 * What is deliberately absent is everything else on the funding file. A
 * document nobody marked shareable does not become a lender's business by
 * being on the same file, and an internal note certainly does not.
 */
import { useQuery } from "@tanstack/react-query";
import { FileCheck2, FileText, Loader2, Share2 } from "lucide-react";
import { formatDate } from "@/lib/format-date";
import { documentTypeLabel } from "@/lib/funding/document-vocabulary";
import { fetchDealDocuments } from "@/lib/data/funding-domain";

const DISPOSITION_TONE: Record<string, string> = {
  accepted: "border-emerald-600/30 bg-emerald-500/10 text-status-success",
  pending_review: "border-border bg-muted text-muted-foreground",
  rejected: "border-red-500/30 bg-red-500/10 text-status-danger",
  superseded: "border-border bg-muted text-muted-foreground",
};

const sizeLabel = (bytes: number | null) =>
  bytes === null ? "" : bytes < 1024 * 1024 ? `${Math.round(bytes / 1024)} KB` : `${(bytes / 1048576).toFixed(1)} MB`;

export function DealDocumentsPanel({ dealId, fileId }: { dealId: string; fileId: string }) {
  const docs = useQuery({
    queryKey: ["funding", "deal-documents", dealId],
    queryFn: () => fetchDealDocuments(dealId, fileId),
    staleTime: 30_000,
  });

  if (docs.isLoading) {
    return (
      <p className="inline-flex items-center gap-1 text-xs text-muted-foreground">
        <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading documents…
      </p>
    );
  }
  if (docs.error) {
    return <p role="alert" className="text-xs text-status-danger">Could not load the documents.</p>;
  }
  const rows = docs.data ?? [];
  if (rows.length === 0) {
    return (
      <p className="text-xs text-muted-foreground">
        Nothing for this lender yet. A document appears here when it answers one of this deal&apos;s
        stipulations, or when it is marked shareable with a lender on the file&apos;s Documents tab.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      <ul className="space-y-2">
        {rows.map((d) => (
          <li key={d.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-border bg-background p-3">
            {d.requestId ? (
              <FileCheck2 className="h-4 w-4 shrink-0 text-primary" />
            ) : (
              <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
            )}
            <div className="min-w-0">
              <p className="text-xs font-bold text-foreground">{d.name}</p>
              <p className="text-[10px] text-muted-foreground">
                {documentTypeLabel(d.documentType)}
                {d.period ? ` · ${d.period}` : ""}
                {d.requestId ? " · answers a stipulation on this deal" : " · shared from the file"}
              </p>
            </div>
            <span className="ml-auto flex items-center gap-2">
              {d.shareableWithLender && (
                <span className="inline-flex items-center gap-1 rounded-full border border-blue-500/30 bg-blue-500/10 px-2 py-0.5 text-[10px] font-semibold text-status-info">
                  <Share2 className="h-3 w-3" /> Shareable
                </span>
              )}
              <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${DISPOSITION_TONE[d.disposition] ?? "border-border bg-muted text-muted-foreground"}`}>
                {d.disposition.replace(/_/g, " ")}
              </span>
              <span className="text-[10px] text-muted-foreground">
                {sizeLabel(d.sizeBytes)} · {formatDate(d.createdAt)}
              </span>
            </span>
          </li>
        ))}
      </ul>
      <p className="text-[10px] text-muted-foreground">
        Only stipulation answers and documents explicitly marked shareable appear here. Everything else
        on the funding file stays on the funding file.
      </p>
    </div>
  );
}
