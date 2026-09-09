/**
 * Settings › Documents — the document builder (D-005).
 *
 * Folders organise; templates hold the words with {{merge fields}} and a
 * {{signature}} / {{signed_date}} block; a template is SENT from the person or
 * partner it is for (their profile), never from here — sending needs a signer.
 *
 * The editor is a plain text area with an insert-field picker and a live
 * preview rendered with SAMPLE values, so a template can be checked without
 * anybody receiving anything. Merge fields come from ONE registry
 * (lib/documents/merge-fields), the same namespaces the database resolves at
 * send; a token the registry does not know is flagged before save because the
 * database would refuse to send it unfilled.
 */
import { useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { FileSignature, FolderPlus, Loader2, Plus, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { OpsSelect } from "@/components/ui/ops-select";
import { SectionCard } from "@/components/settings/shared";
import { Pill } from "@/components/agency/partner/partner-ui";
import { useAuth } from "@/lib/auth/auth-context";
import { useAgencyPermissions } from "@/lib/data/agency-permissions";
import {
  useDocumentActions, useDocumentFolders, useDocumentTemplates, useSignatureRequests,
  type DocumentAudience, type DocumentTemplate, type TemplateStatus,
} from "@/lib/data/documents";
import {
  MERGE_FIELDS, SAMPLE_AGREEMENT, renderPreview, sampleValues, unknownTokens, type MergeCategory,
} from "@/lib/documents/merge-fields";
import { formatDate, formatDateTime } from "@/lib/format-date";
import { useToast } from "@/hooks/use-toast";

const NONE = "__none";
const AUDIENCES: { value: DocumentAudience; label: string }[] = [
  { value: "member", label: "Team member (agent / staff)" },
  { value: "partner", label: "Partner contact" },
  { value: "client", label: "Client" },
  { value: "any", label: "Anyone" },
];
const FOLDER_KINDS = ["agent", "partner", "credit_repair", "proposal", "agreement", "policy", "other"];

const blank = (folderId: string | null): Omit<DocumentTemplate, "id" | "version" | "updatedAt"> & { id?: string } => ({
  folderId, name: "", audience: "member", body: SAMPLE_AGREEMENT, status: "draft",
});

export function DocumentsSection() {
  const auth = useAuth();
  const perms = useAgencyPermissions();
  const canManage = perms.can("documents.manage");
  const folders = useDocumentFolders();
  const templates = useDocumentTemplates();
  const requests = useSignatureRequests();
  const actions = useDocumentActions();
  const { toast } = useToast();
  const qc = useQueryClient();

  const [folderId, setFolderId] = useState<string>(NONE);
  const [draft, setDraft] = useState<ReturnType<typeof blank> | null>(null);
  const [newFolder, setNewFolder] = useState("");
  const [newFolderKind, setNewFolderKind] = useState("other");
  const bodyRef = useRef<HTMLTextAreaElement>(null);

  const visible = (templates.data ?? []).filter((t) => folderId === NONE || t.folderId === folderId);
  const unknown = draft ? unknownTokens(draft.body) : [];
  const preview = useMemo(
    () => (draft ? renderPreview(draft.body, sampleValues(draft.audience)) : ""),
    [draft],
  );

  /* Insert at the cursor, the way a person expects a picker to behave (§9). */
  const insertToken = (token: string) => {
    if (!draft) return;
    const el = bodyRef.current;
    const text = `{{${token}}}`;
    if (!el) { setDraft({ ...draft, body: draft.body + text }); return; }
    const start = el.selectionStart ?? draft.body.length;
    const end = el.selectionEnd ?? start;
    const body = draft.body.slice(0, start) + text + draft.body.slice(end);
    setDraft({ ...draft, body });
    requestAnimationFrame(() => { el.focus(); el.setSelectionRange(start + text.length, start + text.length); });
  };

  const save = (status: TemplateStatus) => {
    if (!draft) return;
    if (!draft.name.trim()) { toast({ title: "Give the document a name", variant: "destructive" }); return; }
    if (unknown.length > 0) {
      toast({ title: "Unknown fields", description: `These are not merge fields: ${unknown.join(", ")}. Insert from the picker.`, variant: "destructive" });
      return;
    }
    actions.saveTemplate.mutate(
      { id: draft.id, agencyId: auth.agencyId ?? "", folderId: draft.folderId, name: draft.name, audience: draft.audience, body: draft.body, status },
      {
        onSuccess: () => { setDraft(null); toast({ title: status === "active" ? "Template active — it can be sent" : "Draft saved" }); },
        onError: (e) => toast({ title: "Could not save", description: (e as Error).message, variant: "destructive" }),
      },
    );
  };

  const categories = [...new Set(MERGE_FIELDS.map((f) => f.category))] as MergeCategory[];
  const fieldsFor = (audience: DocumentAudience) =>
    MERGE_FIELDS.filter((f) => audience === "any" || f.audiences.includes(audience));

  if (!canManage) {
    return (
      <SectionCard icon={FileSignature} title="Documents" description="Templates and signature requests.">
        <p className="text-xs text-muted-foreground">Building documents needs the document builder permission.</p>
      </SectionCard>
    );
  }

  return (
    <div className="space-y-4">
      <SectionCard
        icon={FileSignature}
        title="Documents"
        description="Agreements, NDAs, proposals and policies with merge fields and a signature block. Send one from the person or partner it is for — their profile has the button."
      >
        <div className="grid gap-4 lg:grid-cols-[14rem_1fr]">
          {/* Folders */}
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Folders</p>
            <ul className="mt-1 space-y-0.5">
              <li>
                <button type="button" onClick={() => setFolderId(NONE)}
                  className={`w-full rounded-lg px-2.5 py-1.5 text-left text-sm ${folderId === NONE ? "bg-primary text-primary-foreground" : "text-foreground hover:bg-muted"}`}>
                  All documents
                </button>
              </li>
              {(folders.data ?? []).map((f) => (
                <li key={f.id}>
                  <button type="button" onClick={() => setFolderId(f.id)}
                    className={`w-full rounded-lg px-2.5 py-1.5 text-left text-sm ${folderId === f.id ? "bg-primary text-primary-foreground" : "text-foreground hover:bg-muted"}`}>
                    {f.name}
                    <span className={`block text-[10px] ${folderId === f.id ? "text-primary-foreground/80" : "text-muted-foreground"}`}>
                      {(templates.data ?? []).filter((t) => t.folderId === f.id).length} document{(templates.data ?? []).filter((t) => t.folderId === f.id).length === 1 ? "" : "s"}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
            <div className="mt-3 space-y-1.5 rounded-lg border border-border p-2">
              <Input value={newFolder} onChange={(e) => setNewFolder(e.target.value)} placeholder="New folder" className="h-7 text-xs" />
              <OpsSelect size="sm" value={newFolderKind} onValueChange={setNewFolderKind}
                options={FOLDER_KINDS.map((k) => ({ value: k, label: k.replace(/_/g, " ") }))} />
              <Button size="sm" variant="outline" className="h-7 w-full text-[11px]"
                disabled={!newFolder.trim() || actions.addFolder.isPending}
                onClick={() => actions.addFolder.mutate(
                  { agencyId: auth.agencyId ?? "", name: newFolder, kind: newFolderKind },
                  { onSuccess: () => setNewFolder(""), onError: (e) => toast({ title: "Could not add folder", description: (e as Error).message, variant: "destructive" }) },
                )}>
                <FolderPlus className="mr-1 h-3 w-3" /> Add folder
              </Button>
            </div>
          </div>

          {/* Templates, or the editor */}
          <div>
            {!draft ? (
              <>
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                    {folderId === NONE ? "All documents" : (folders.data ?? []).find((f) => f.id === folderId)?.name}
                  </p>
                  <Button size="sm" onClick={() => setDraft(blank(folderId === NONE ? null : folderId))}>
                    <Plus className="mr-1 h-3.5 w-3.5" /> New document
                  </Button>
                </div>
                {templates.isLoading ? (
                  <p className="py-4 text-xs text-muted-foreground"><Loader2 className="mr-1.5 inline h-3 w-3 animate-spin" /> Loading…</p>
                ) : visible.length === 0 ? (
                  <p className="rounded-lg border border-dashed border-border py-8 text-center text-xs text-muted-foreground">
                    No documents here yet. New document starts you from a sample agreement.
                  </p>
                ) : (
                  <ul className="divide-y divide-border/50 rounded-lg border border-border">
                    {visible.map((t) => (
                      <li key={t.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-xs">
                        <span>
                          <span className="block font-medium text-foreground">{t.name}</span>
                          <span className="block text-muted-foreground">
                            {AUDIENCES.find((a) => a.value === t.audience)?.label} · v{t.version} · updated {formatDate(t.updatedAt)}
                          </span>
                        </span>
                        <span className="flex items-center gap-2">
                          <Pill tone={t.status === "active" ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700" : "border-border bg-muted text-muted-foreground"}>
                            {t.status}
                          </Pill>
                          <Button size="sm" variant="outline" className="h-7 text-[11px]" onClick={() => setDraft({ ...t })}>Edit</Button>
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </>
            ) : (
              <div className="space-y-3">
                <div className="grid gap-2 sm:grid-cols-3">
                  <label className="text-xs sm:col-span-1">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Name</span>
                    <Input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} className="mt-0.5 h-8 text-xs" placeholder="e.g. Contractor Agreement" />
                  </label>
                  <label className="text-xs">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Folder</span>
                    <div className="mt-0.5">
                      <OpsSelect size="field" value={draft.folderId ?? NONE}
                        onValueChange={(v) => setDraft({ ...draft, folderId: v === NONE ? null : v })}
                        options={[{ value: NONE, label: "No folder" }, ...(folders.data ?? []).map((f) => ({ value: f.id, label: f.name }))]} />
                    </div>
                  </label>
                  <label className="text-xs">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Written for</span>
                    <div className="mt-0.5">
                      <OpsSelect size="field" value={draft.audience}
                        onValueChange={(v) => setDraft({ ...draft, audience: v as DocumentAudience })}
                        options={AUDIENCES} />
                    </div>
                  </label>
                </div>

                <div className="grid gap-3 lg:grid-cols-[1fr_15rem]">
                  <label className="text-xs">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Document (HTML allowed)</span>
                    <textarea ref={bodyRef} value={draft.body} onChange={(e) => setDraft({ ...draft, body: e.target.value })}
                      rows={16} spellCheck
                      className="mt-0.5 block w-full rounded-lg border border-border bg-background px-3 py-2 font-mono text-[12px] text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" />
                    {unknown.length > 0 && (
                      <span className="mt-1 block text-[11px] text-status-danger">
                        Not merge fields: {unknown.join(", ")} — the database would refuse to send these unfilled.
                      </span>
                    )}
                  </label>
                  <div className="text-xs">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Insert a field</p>
                    <div className="mt-0.5 max-h-[26rem] space-y-2 overflow-y-auto rounded-lg border border-border p-2">
                      {categories.map((cat) => {
                        const fields = fieldsFor(draft.audience).filter((f) => f.category === cat);
                        if (fields.length === 0) return null;
                        return (
                          <div key={cat}>
                            <p className="text-[10px] font-semibold text-muted-foreground">{cat}</p>
                            {fields.map((f) => (
                              <button key={f.token} type="button" onClick={() => insertToken(f.token)}
                                className="block w-full rounded px-1.5 py-1 text-left text-[11px] text-foreground hover:bg-muted"
                                title={`{{${f.token}}} · e.g. ${f.sample}`}>
                                {f.label}
                              </button>
                            ))}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>

                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Preview with sample values</p>
                  {/* Our own template HTML; every merge value is escaped by the renderer. */}
                  <div className="document-body mt-0.5 rounded-lg border border-border bg-card p-4 text-foreground"
                    dangerouslySetInnerHTML={{ __html: preview }} />
                </div>

                <div className="flex flex-wrap gap-2">
                  <Button size="sm" disabled={actions.saveTemplate.isPending} onClick={() => save("active")}>
                    {actions.saveTemplate.isPending && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}
                    <Save className="mr-1 h-3.5 w-3.5" /> Save &amp; activate
                  </Button>
                  <Button size="sm" variant="outline" disabled={actions.saveTemplate.isPending} onClick={() => save("draft")}>Save as draft</Button>
                  {draft.id && (
                    <Button size="sm" variant="ghost" className="text-destructive" onClick={() => save("archived")}>Archive</Button>
                  )}
                  <Button size="sm" variant="ghost" onClick={() => setDraft(null)}>Cancel</Button>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  Editing the words of an active document makes a new version. Anything already sent keeps the
                  version it was sent with, and a signed document never changes.
                </p>
              </div>
            )}
          </div>
        </div>
      </SectionCard>

      <SectionCard icon={FileSignature} title="Signature requests" description="Everything sent for signature, newest first, with where it stands.">
        {requests.isLoading ? (
          <p className="py-3 text-xs text-muted-foreground"><Loader2 className="mr-1.5 inline h-3 w-3 animate-spin" /> Loading…</p>
        ) : (requests.data ?? []).length === 0 ? (
          <p className="text-xs text-muted-foreground">Nothing sent yet. Open a person&apos;s profile → Documents → Send for signature.</p>
        ) : (
          <ul className="divide-y divide-border/50 text-xs">
            {(requests.data ?? []).map((r) => (
              <li key={r.id} className="flex flex-wrap items-center gap-2 py-2">
                <Pill tone={r.status === "signed" ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700"
                  : r.status === "viewed" ? "border-blue-500/30 bg-blue-500/10 text-blue-800"
                  : r.status === "sent" ? "border-border bg-muted text-foreground"
                  : "border-border bg-muted text-muted-foreground"}>{r.status}</Pill>
                <span className="font-medium text-foreground">{r.title}</span>
                <span className="text-muted-foreground">→ {r.signerName} · {r.signerEmail}</span>
                <span className="ml-auto text-muted-foreground">
                  {r.signedAt ? `signed ${formatDateTime(r.signedAt)}` : `sent ${formatDateTime(r.sentAt)}`}
                </span>
                {(r.status === "sent" || r.status === "viewed") && (
                  <Button size="sm" variant="ghost" className="h-6 text-[11px]"
                    onClick={() => actions.void.mutate(r.id, {
                      onSuccess: () => { toast({ title: "Request voided" }); void qc.invalidateQueries({ queryKey: ["documents"] }); },
                      onError: (e) => toast({ title: "Could not void", description: (e as Error).message, variant: "destructive" }),
                    })}>Void</Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </SectionCard>
    </div>
  );
}
