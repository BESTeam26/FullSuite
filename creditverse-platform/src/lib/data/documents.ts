/**
 * Document builder data — folders, templates, and signature requests.
 *
 * Templates are agency configuration; a request is one frozen document sent
 * to one person. Every write that matters is a database function (send,
 * sign, void), so the rules live once, on the server, and this layer only
 * carries what a screen needs (rule 5).
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { requireSupabase } from "@/lib/supabase/client";
import { useAuth } from "@/lib/auth/auth-context";

export type DocumentAudience = "member" | "partner" | "client" | "any";
export type TemplateStatus = "draft" | "active" | "archived";
export type SignatureStatus = "sent" | "viewed" | "signed" | "declined" | "voided" | "expired";

export interface DocumentFolder { id: string; name: string; kind: string; sort: number }

export interface DocumentTemplate {
  id: string;
  folderId: string | null;
  name: string;
  audience: DocumentAudience;
  body: string;
  version: number;
  status: TemplateStatus;
  updatedAt: string;
}

export interface SignatureRequest {
  id: string;
  templateId: string | null;
  templateVersion: number | null;
  title: string;
  signerKind: string;
  signerUserId: string | null;
  signerName: string;
  signerEmail: string;
  token: string;
  status: SignatureStatus;
  sentAt: string;
  viewedAt: string | null;
  signedAt: string | null;
  expiresAt: string;
  signatureName: string | null;
}

export async function fetchDocumentFolders(): Promise<DocumentFolder[]> {
  const sb = requireSupabase();
  const { data, error } = await sb.from("document_folders").select("id, name, kind, sort").order("sort").order("name");
  if (error) throw error;
  return (data ?? []) as DocumentFolder[];
}

export async function fetchDocumentTemplates(): Promise<DocumentTemplate[]> {
  const sb = requireSupabase();
  const { data, error } = await sb
    .from("document_templates")
    .select("id, folder_id, name, audience, body, version, status, updated_at")
    .neq("status", "archived")
    .order("name");
  if (error) throw error;
  return (data ?? []).map((r) => ({
    id: r.id, folderId: r.folder_id, name: r.name, audience: r.audience as DocumentAudience,
    body: r.body, version: r.version, status: r.status as TemplateStatus, updatedAt: r.updated_at,
  }));
}

export async function saveDocumentTemplate(input: {
  id?: string; agencyId: string; folderId: string | null; name: string;
  audience: DocumentAudience; body: string; status: TemplateStatus;
}): Promise<string> {
  const sb = requireSupabase();
  const { data: me } = await sb.auth.getUser();
  if (input.id) {
    const { error } = await sb.from("document_templates").update({
      folder_id: input.folderId, name: input.name.trim(), audience: input.audience,
      body: input.body, status: input.status, updated_by: me.user?.id ?? null,
    }).eq("id", input.id);
    if (error) throw error;
    return input.id;
  }
  const { data, error } = await sb.from("document_templates").insert({
    agency_id: input.agencyId, folder_id: input.folderId, name: input.name.trim(),
    audience: input.audience, body: input.body, status: input.status,
    created_by: me.user?.id ?? null, updated_by: me.user?.id ?? null,
  }).select("id").single();
  if (error) throw error;
  return data.id as string;
}

export async function addDocumentFolder(agencyId: string, name: string, kind: string): Promise<void> {
  const sb = requireSupabase();
  const { data: me } = await sb.auth.getUser();
  const { error } = await sb.from("document_folders").insert({
    agency_id: agencyId, name: name.trim(), kind, created_by: me.user?.id ?? null,
  });
  if (error) throw error;
}

/** Signature requests — all of them for a manager, or one person's. */
export async function fetchSignatureRequests(filter?: { signerUserId?: string; limit?: number }): Promise<SignatureRequest[]> {
  const sb = requireSupabase();
  let q = sb
    .from("signature_requests")
    .select("id, template_id, template_version, title, signer_kind, signer_user_id, signer_name, signer_email, token, status, sent_at, viewed_at, signed_at, expires_at, signature_name")
    .order("sent_at", { ascending: false })
    .limit(filter?.limit ?? 50);
  if (filter?.signerUserId) q = q.eq("signer_user_id", filter.signerUserId);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []).map((r) => ({
    id: r.id, templateId: r.template_id, templateVersion: r.template_version, title: r.title,
    signerKind: r.signer_kind, signerUserId: r.signer_user_id, signerName: r.signer_name,
    signerEmail: String(r.signer_email), token: r.token, status: r.status as SignatureStatus,
    sentAt: r.sent_at, viewedAt: r.viewed_at, signedAt: r.signed_at, expiresAt: r.expires_at,
    signatureName: r.signature_name,
  }));
}

/**
 * Send: the database renders and freezes the snapshot (refusing an unfilled
 * field), then the mailer carries the link. Two steps, so a mail outage never
 * loses the request — the link is still there to copy.
 */
export async function sendForSignature(input: {
  templateId: string;
  signer: { kind: "member"; userId: string } | { kind: "partner_contact"; contactId: string } | { kind: "external"; email: string; name: string };
}): Promise<{ id: string; emailed: boolean; emailError?: string }> {
  const sb = requireSupabase();
  const { data, error } = await sb.rpc("create_signature_request", {
    p_template: input.templateId,
    p_signer_kind: input.signer.kind,
    p_user: input.signer.kind === "member" ? input.signer.userId : undefined,
    p_contact: input.signer.kind === "partner_contact" ? input.signer.contactId : undefined,
    p_email: input.signer.kind === "external" ? input.signer.email : undefined,
    p_name: input.signer.kind === "external" ? input.signer.name : undefined,
  });
  if (error) throw error;
  const id = data as unknown as string;
  const mail = await sb.functions.invoke("send-signature-request", {
    body: { requestId: id, appOrigin: window.location.origin },
  });
  if (mail.error) {
    const detail = (mail.error as { message?: string }).message ?? "The email did not go.";
    return { id, emailed: false, emailError: detail };
  }
  return { id, emailed: true };
}

export async function voidSignatureRequest(id: string): Promise<void> {
  const sb = requireSupabase();
  const { error } = await sb.rpc("void_signature_request", { p_id: id });
  if (error) throw error;
}

export const signingLink = (token: string) => `${window.location.origin}/sign/${token}`;

/* ── The signer's side, no account required ───────────────────────────── */

export interface SignaturePreview {
  title: string;
  signerName: string;
  signerEmail: string;
  renderedHtml: string;
  signedHtml: string | null;
  status: SignatureStatus;
  expiresAt: string;
  signedAt: string | null;
  agencyName: string;
  agencyBranding: { logoUrl?: string | null; primaryColor?: string | null } | null;
}

export async function fetchSignaturePreview(token: string): Promise<SignaturePreview | null> {
  const sb = requireSupabase();
  const { data, error } = await sb.rpc("signature_request_preview", { p_token: token });
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : null;
  if (!row) return null;
  const r = row as Record<string, unknown>;
  return {
    title: r.title as string, signerName: r.signer_name as string, signerEmail: r.signer_email as string,
    renderedHtml: r.rendered_html as string, signedHtml: (r.signed_html as string) ?? null,
    status: r.status as SignatureStatus, expiresAt: r.expires_at as string, signedAt: (r.signed_at as string) ?? null,
    agencyName: r.agency_name as string,
    agencyBranding: (r.agency_branding as SignaturePreview["agencyBranding"]) ?? null,
  };
}

export async function signDocument(token: string, typedName: string, consent: boolean): Promise<void> {
  const sb = requireSupabase();
  const { error } = await sb.rpc("sign_document", {
    p_token: token, p_typed_name: typedName, p_consent: consent,
    p_ip: undefined, p_user_agent: navigator.userAgent.slice(0, 200),
  });
  if (error) throw error;
}

/* ── Hooks ────────────────────────────────────────────────────────────── */

const live = (auth: ReturnType<typeof useAuth>) => auth.mode === "live" && auth.status === "signed-in" && !!auth.isAgencyStaff;

export function useDocumentFolders() {
  const auth = useAuth();
  return useQuery({ queryKey: ["documents", "folders"], queryFn: fetchDocumentFolders, enabled: live(auth), staleTime: 60_000 });
}

export function useDocumentTemplates() {
  const auth = useAuth();
  return useQuery({ queryKey: ["documents", "templates"], queryFn: fetchDocumentTemplates, enabled: live(auth), staleTime: 30_000 });
}

export function useSignatureRequests(signerUserId?: string) {
  const auth = useAuth();
  return useQuery({
    queryKey: ["documents", "requests", signerUserId ?? "all"],
    queryFn: () => fetchSignatureRequests(signerUserId ? { signerUserId } : undefined),
    enabled: live(auth), staleTime: 15_000,
  });
}

export function useDocumentActions() {
  const qc = useQueryClient();
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ["documents"] });
    void qc.invalidateQueries({ queryKey: ["agency", "member-documents"] });
    void qc.invalidateQueries({ queryKey: ["agency", "member-activity"] });
  };
  return {
    saveTemplate: useMutation({ mutationFn: saveDocumentTemplate, onSuccess: refresh }),
    addFolder: useMutation({
      mutationFn: (v: { agencyId: string; name: string; kind: string }) => addDocumentFolder(v.agencyId, v.name, v.kind),
      onSuccess: refresh,
    }),
    send: useMutation({ mutationFn: sendForSignature, onSuccess: refresh }),
    void: useMutation({ mutationFn: voidSignatureRequest, onSuccess: refresh }),
  };
}
