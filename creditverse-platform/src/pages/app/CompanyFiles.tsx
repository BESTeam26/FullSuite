/**
 * Files — the company's shared documents. Everyone in the organization reads
 * and downloads; an administrator adds and removes. Links are signed for a
 * few minutes when someone opens one, because the store is private.
 */
import { useRef, useState } from "react";
import { Download, FileText, FolderOpen, Loader2, Trash2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAgency } from "@/lib/agency-context";
import { useAuth } from "@/lib/auth/auth-context";
import { usePermissions } from "@/lib/auth/use-permission";
import { useAgencyPermissions } from "@/lib/data/agency-permissions";
import { useCompanyDocuments } from "@/lib/data/use-company-documents";
import { useOrganizationHub } from "@/lib/data/use-hub";
import { documentProblem, signDocumentUrl, type CompanyDocument } from "@/lib/data/company-documents";
import { formatBytes } from "@/lib/data/activity-attachments";
import { formatDate } from "@/lib/format-date";
import { errorMessage } from "@/lib/data/error-message";

export default function CompanyFiles() {
  /* One screen, two owners (rule 18). On the agency view this is BES's own
     hub: organizationId null, managed by `hub.files.manage`, no entitlement
     gate — BES does not buy modules from itself. Through a customer's lens it
     is that organization's hub, exactly as before. */
  const { activeOrganization, viewMode } = useAgency();
  const auth = useAuth();
  const isAgencyHub = viewMode === "agency" && auth.isAgencyStaff;
  const organizationId = isAgencyHub ? null : activeOrganization?.id ?? null;
  const hub = useOrganizationHub(organizationId);
  const docs = useCompanyDocuments(
    organizationId,
    isAgencyHub || (!!organizationId && hub.isActive("files")),
  );
  const permissions = usePermissions();
  const agencyPerms = useAgencyPermissions();
  const canManage = isAgencyHub
    ? agencyPerms.can("hub.files.manage")
    : permissions.canAsMember("settings.manage");
  const fileRef = useRef<HTMLInputElement>(null);
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);
  const [opening, setOpening] = useState<string | null>(null);

  const pick = (file: File | undefined) => {
    if (!file) return;
    const bad = documentProblem(file);
    if (bad) { setMessage({ text: bad, error: true }); return; }
    setMessage(null);
    docs.upload.mutate(file, {
      onSuccess: () => setMessage({ text: `${file.name} added.`, error: false }),
      onError: (e) => setMessage({ text: errorMessage(e, "The file could not be added."), error: true }),
    });
  };

  const open = async (doc: CompanyDocument) => {
    setOpening(doc.id);
    setMessage(null);
    try {
      const url = await signDocumentUrl(doc.path);
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (e) {
      setMessage({ text: errorMessage(e, "That file could not be opened."), error: true });
    } finally {
      setOpening(null);
    }
  };

  return (
    <div className="p-6 md:p-8">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight text-foreground">
            <FolderOpen className="h-6 w-6 text-primary" /> Files
          </h1>
          <p className="text-sm text-muted-foreground">
            {isAgencyHub
              ? "BES's own shared documents: handbooks, price lists, forms. Customer organizations never see these."
              : "Documents everyone at your company can open: handbooks, price lists, forms."}
          </p>
        </div>
        {canManage && (
          <>
            <input ref={fileRef} type="file" className="hidden" onChange={(e) => { pick(e.target.files?.[0]); e.target.value = ""; }} />
            <Button type="button" size="sm" onClick={() => fileRef.current?.click()} disabled={docs.upload.isPending}>
              {docs.upload.isPending ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Upload className="mr-1 h-4 w-4" />} Add a file
            </Button>
          </>
        )}
      </div>

      {message && <p role="status" className={`mb-3 text-xs ${message.error ? "text-status-danger" : "text-status-success"}`}>{message.text}</p>}

      {docs.isLoading ? (
        <div className="space-y-2" aria-busy="true">
          {[0, 1, 2].map((i) => <div key={i} className="h-14 animate-pulse rounded-xl border border-border bg-card" />)}
        </div>
      ) : docs.error ? (
        <p role="alert" className="text-sm text-status-danger">Could not load the files: {docs.error}</p>
      ) : docs.documents.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-card p-8 text-center">
          <FolderOpen className="mx-auto h-6 w-6 text-muted-foreground" />
          <p className="mt-2 text-sm font-semibold text-foreground">No files yet</p>
          <p className="text-xs text-muted-foreground">{canManage ? "Add the documents your team asks for most." : "Your administrator has not added any yet."}</p>
        </div>
      ) : (
        <ul className="divide-y divide-border/60 overflow-hidden rounded-xl border border-border bg-card">
          {docs.documents.map((d) => (
            <li key={d.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
              <FileText className="h-4 w-4 shrink-0 text-primary" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-foreground">{d.name}</p>
                <p className="text-[11px] text-muted-foreground">
                  {d.sizeBytes !== null ? `${formatBytes(d.sizeBytes)} · ` : ""}added {formatDate(d.createdAt)}{d.uploadedByName ? ` by ${d.uploadedByName}` : ""}
                </p>
              </div>
              <Button type="button" size="sm" variant="outline" onClick={() => void open(d)} disabled={opening === d.id}>
                {opening === d.id ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Download className="mr-1 h-3.5 w-3.5" />} Open
              </Button>
              {canManage && (
                <Button
                  type="button" size="sm" variant="ghost" title="Remove this file for everyone"
                  disabled={docs.remove.isPending}
                  onClick={() => docs.remove.mutate(d, { onError: (e) => setMessage({ text: errorMessage(e, "It could not be removed."), error: true }) })}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
