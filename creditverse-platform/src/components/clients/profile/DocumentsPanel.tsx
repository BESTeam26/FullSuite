/**
 * The client's documents — theirs, and their work's, kept apart.
 *
 * CLIENT-LEVEL documents belong to the person: a licence, a proof of address,
 * a signed agreement. They follow the client between CreditOps, FundingOps and
 * DIY, which is why they hang off the canonical client rather than off
 * whichever service happened to collect them first.
 *
 * WORK documents belong to a credit case or a funding file, and stay there.
 * Showing them together in one undifferentiated list would suggest a bank
 * statement collected for one funding application is a general fact about the
 * person, which it is not.
 */
import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FileText, Loader2, Trash2, Upload, UserRound, Briefcase } from "lucide-react";
import type { UseQueryResult } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { formatDate } from "@/lib/format-date";
import { FilePreviewCard, FilePreviewGrid } from "@/components/common/FilePreviewCard";
import { useFilePreviews, sizeLabel } from "@/lib/data/use-file-previews";
import { errorMessage } from "@/lib/data/error-message";
import type { ClientDocument } from "@/lib/data/clients";
import {
  deleteClientDocument,
  documentProblem,
  fetchClientDocuments,
  signDocumentUrl,
  uploadClientDocument,
  type ClientDocumentRow,
} from "@/lib/data/client-documents";

const SOURCE_LABEL: Record<string, string> = {
  fulfillment_client: "CreditOps",
  funding_client: "FundingOps",
};

export const DocumentsPanel = ({
  clientId,
  partnerScopeId,
  canEdit,
  documents,
  hasLinks,
}: {
  clientId: string;
  partnerScopeId: string | null;
  canEdit: boolean;
  documents: UseQueryResult<ClientDocument[]>;
  hasLinks: boolean;
}) => {
  const qc = useQueryClient();
  const fileInput = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);

  const own = useQuery({
    queryKey: ["clients", "own-documents", clientId],
    queryFn: () => fetchClientDocuments(clientId),
    staleTime: 30_000,
  });
  const refresh = () => void qc.invalidateQueries({ queryKey: ["clients", "own-documents", clientId] });

  const upload = useMutation({
    mutationFn: (file: File) => uploadClientDocument({ clientId, partnerScopeId: partnerScopeId as string, file }),
    onSuccess: refresh,
    onError: (e) => setError(errorMessage(e, "That document was not saved.")),
  });
  const remove = useMutation({
    mutationFn: deleteClientDocument,
    onSuccess: refresh,
    onError: (e) => setError(errorMessage(e, "That document was not removed.")),
  });

  const pick = (file: File | undefined) => {
    if (!file) return;
    const problem = documentProblem(file);
    if (problem) {
      setError(problem);
      return;
    }
    setError(null);
    upload.mutate(file);
  };

  const clientDocs: ClientDocumentRow[] = own.data ?? [];
  const workDocs = documents.data ?? [];
  /* The bucket is private, so a link is minted rather than the path exposed —
     once for the whole grid instead of once per thumbnail. */
  const previews = useFilePreviews(clientDocs.map((d) => ({ bucket: "bes-files", path: d.path })));

  const openDocument = async (path: string) => {
    try {
      window.open(await signDocumentUrl(path), "_blank", "noopener");
    } catch (e) {
      setError(errorMessage(e, "That document could not be opened."));
    }
  };

  return (
    <div className="space-y-4">
      {/* ── The person's own documents ─────────────────────────────── */}
      <div className="rounded-2xl border border-border bg-card">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-5 py-3.5">
          <h2 className="flex items-center gap-2 text-sm font-bold text-foreground">
            <UserRound className="h-4 w-4 text-primary" /> This client&apos;s documents
          </h2>
          {canEdit && partnerScopeId && (
            <>
              <input
                ref={fileInput}
                type="file"
                className="hidden"
                onChange={(e) => {
                  pick(e.target.files?.[0]);
                  e.target.value = "";
                }}
              />
              <Button type="button" size="sm" variant="outline" disabled={upload.isPending} onClick={() => fileInput.current?.click()}>
                {upload.isPending ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Upload className="mr-1 h-3.5 w-3.5" />}
                Add a document
              </Button>
            </>
          )}
        </div>
        {error && (
          <p role="alert" className="border-b border-border px-5 py-2 text-xs text-status-danger">
            {error}
          </p>
        )}
        {own.isLoading ? (
          <p className="p-5 text-sm text-muted-foreground">Loading…</p>
        ) : own.error ? (
          <p className="p-5 text-sm text-status-danger">Could not load: {(own.error as Error).message}</p>
        ) : clientDocs.length === 0 ? (
          <p className="p-5 text-sm text-muted-foreground">
            Nothing yet. These are the documents that belong to the person — identification, proof of
            address, signed agreements — and they follow them between services.
          </p>
        ) : (
          <FilePreviewGrid className="p-5">
            {clientDocs.map((d) => (
              <FilePreviewCard
                key={d.id}
                file={{
                  id: d.id, name: d.name, mimeType: d.mimeType, sizeBytes: d.sizeBytes,
                  caption: [
                    d.byClient ? "Sent by the client" : d.uploadedByName,
                    formatDate(d.createdAt),
                  ].filter(Boolean).join(" · "),
                }}
                url={previews.data?.[`bes-files/${d.path}`]}
                onOpen={() => void openDocument(d.path)}
                actions={
                  <span className="flex items-center justify-between gap-2">
                    <button
                      type="button"
                      onClick={() => void openDocument(d.path)}
                      className="text-[11px] font-medium text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      Open
                    </button>
                    {canEdit && (
                      <button
                        type="button"
                        disabled={remove.isPending}
                        onClick={() => remove.mutate(d.id)}
                        title="Remove this document"
                        className="rounded p-1 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-destructive disabled:opacity-60"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </span>
                }
              />
            ))}
          </FilePreviewGrid>
        )}
      </div>

      {/* ── Documents held by the work ─────────────────────────────── */}
      <div className="rounded-2xl border border-border bg-card">
        <h2 className="flex items-center gap-2 border-b border-border px-5 py-3.5 text-sm font-bold text-foreground">
          <Briefcase className="h-4 w-4 text-primary" /> Held by the work
        </h2>
        {!hasLinks ? (
          <p className="p-5 text-sm text-muted-foreground">
            No credit case and no funding file, so there is no work holding documents yet.
          </p>
        ) : documents.isLoading ? (
          <p className="p-5 text-sm text-muted-foreground">Loading…</p>
        ) : documents.error ? (
          <p className="p-5 text-sm text-status-danger">Could not load: {(documents.error as Error).message}</p>
        ) : workDocs.length === 0 ? (
          <p className="p-5 text-sm text-muted-foreground">Nothing visible to you.</p>
        ) : (
          <ul className="divide-y divide-border/60">
            {workDocs.map((d) => (
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
          These belong to a credit case or a funding file and stay with it. A bank statement collected
          for one funding application is not a general fact about the person.
        </p>
      </div>
    </div>
  );
};
