import { FileText } from "lucide-react";
import type { UseQueryResult } from "@tanstack/react-query";
import { formatDate } from "@/lib/format-date";
import type { ClientDocument } from "@/lib/data/clients";

const SOURCE_LABEL: Record<string, string> = {
  fulfillment_client: "CreditOps",
  funding_client: "FundingOps",
};

const sizeLabel = (bytes: number | null) => {
  if (bytes === null) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

/**
 * Documents held against this client's service records, in one list.
 *
 * There is no client-level document store yet — files are keyed to the engine
 * record that received them, and `entity_visible()` knows those types. Adding
 * an `entity_type = 'client'` would create files whose visibility nothing
 * checks, so this panel reads what exists instead of inventing a new bucket.
 */
export const DocumentsPanel = ({
  documents,
  hasLinks,
}: {
  documents: UseQueryResult<ClientDocument[]>;
  hasLinks: boolean;
}) => {
  if (!hasLinks) {
    return (
      <div className="rounded-2xl border border-border bg-card p-6">
        <p className="text-sm text-muted-foreground">
          No documents. Files are attached to the work — a credit case or a funding file — and this
          client has neither yet.
        </p>
      </div>
    );
  }
  if (documents.isLoading) return <p className="p-6 text-sm text-muted-foreground">Loading documents…</p>;
  if (documents.error) {
    return (
      <p className="p-6 text-sm text-status-danger">
        Could not load documents: {(documents.error as Error).message}
      </p>
    );
  }
  const rows = documents.data ?? [];
  return (
    <div className="rounded-2xl border border-border bg-card">
      <h2 className="flex items-center gap-2 border-b border-border px-5 py-3.5 text-sm font-bold text-foreground">
        <FileText className="h-4 w-4 text-primary" /> Documents
      </h2>
      {rows.length === 0 ? (
        <p className="p-5 text-sm text-muted-foreground">No documents visible to you.</p>
      ) : (
        <ul className="divide-y divide-border/60">
          {rows.map((d) => (
            <li key={d.id} className="flex flex-wrap items-center gap-x-2 gap-y-1 px-5 py-3">
              <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
              <span className="text-sm font-medium text-foreground">{d.name}</span>
              <span className="rounded-full border border-border bg-muted px-2 py-0.5 text-[10px] font-semibold text-foreground">
                {SOURCE_LABEL[d.entityType] ?? d.entityType}
              </span>
              <span className="ml-auto text-xs text-muted-foreground">
                {sizeLabel(d.sizeBytes)} · {formatDate(d.createdAt)}
              </span>
            </li>
          ))}
        </ul>
      )}
      <p className="border-t border-border px-5 py-3 text-xs text-muted-foreground">
        A client-level document store — identity documents that belong to the person rather than to
        one piece of work — is not built yet.
      </p>
    </div>
  );
};
