/**
 * A team member's employment documents — agreements, NDAs, policies,
 * acknowledgments (People Hub §15). The rows are `member_documents`, the
 * bytes are canonical `files` objects under agency/member/<user>/…, and every
 * layer is gated by `people.documents.manage` — never by being staff. The
 * person themselves reads their own rows marked visible to them.
 *
 * Statuses are the signature lifecycle (§16): draft → pending_signature →
 * signed / acknowledged, with expired, superseded and archived as endings.
 * Nothing here deletes; history keeps itself.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { requireSupabase } from "@/lib/supabase/client";
import type { Enums } from "@/lib/supabase/database.types";

export type MemberDocumentStatus = Enums<"member_document_status">;

export const MEMBER_DOCUMENT_KINDS = [
  { value: "agreement", label: "Employment / contractor agreement" },
  { value: "nda", label: "NDA" },
  { value: "confidentiality", label: "Confidentiality agreement" },
  { value: "policy", label: "Policy" },
  { value: "acknowledgment", label: "Acknowledgment" },
  { value: "training", label: "Training document" },
  { value: "other", label: "Other" },
] as const;

export const MEMBER_DOCUMENT_STATUSES: { value: MemberDocumentStatus; label: string }[] = [
  { value: "draft", label: "Draft" },
  { value: "pending_signature", label: "Pending signature" },
  { value: "signed", label: "Signed" },
  { value: "acknowledged", label: "Acknowledged" },
  { value: "expired", label: "Expired" },
  { value: "superseded", label: "Superseded" },
  { value: "archived", label: "Archived" },
];

export interface MemberDocument {
  id: string;
  userId: string;
  kind: string;
  name: string;
  status: MemberDocumentStatus;
  fileId: string | null;
  filePath: string | null;
  sentAt: string | null;
  signedAt: string | null;
  expiresOn: string | null;
  version: number;
  visibleToMember: boolean;
  notes: string | null;
  createdAt: string;
}

export async function fetchMemberDocuments(userId: string): Promise<MemberDocument[]> {
  const sb = requireSupabase();
  const { data, error } = await sb
    .from("member_documents")
    .select("id, user_id, kind, name, status, file_id, sent_at, signed_at, expires_on, version, visible_to_member, notes, created_at, files(path)")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((row) => {
    const r = row as Record<string, unknown>;
    const f = r.files as { path?: string } | null;
    return {
      id: r.id as string,
      userId: r.user_id as string,
      kind: r.kind as string,
      name: r.name as string,
      status: r.status as MemberDocumentStatus,
      fileId: (r.file_id as string) ?? null,
      filePath: f?.path ?? null,
      sentAt: (r.sent_at as string) ?? null,
      signedAt: (r.signed_at as string) ?? null,
      expiresOn: (r.expires_on as string) ?? null,
      version: Number(r.version ?? 1),
      visibleToMember: Boolean(r.visible_to_member),
      notes: (r.notes as string) ?? null,
      createdAt: r.created_at as string,
    };
  });
}

/**
 * Upload the file and create the tracked document — object first, rows
 * second, and a refused row removes the orphaned object (the partner-file
 * shape). The path carries the person's id, which is what the storage policy
 * routes on.
 */
export async function addMemberDocument(input: {
  agencyId: string;
  userId: string;
  kind: string;
  name: string;
  status: MemberDocumentStatus;
  visibleToMember: boolean;
  file?: File;
  signedAt?: string | null;
  expiresOn?: string | null;
  notes?: string;
}): Promise<void> {
  const sb = requireSupabase();
  const { data: me } = await sb.auth.getUser();
  let fileId: string | null = null;
  let path: string | null = null;

  if (input.file) {
    const extension = input.file.name.includes(".") ? input.file.name.split(".").pop()!.slice(0, 12) : "bin";
    path = `agency/member/${input.userId}/${crypto.randomUUID()}.${extension}`;
    const { error: uploadError } = await sb.storage.from("bes-files").upload(path, input.file, {
      contentType: input.file.type || "application/octet-stream",
      upsert: false,
    });
    if (uploadError) throw uploadError;
    const { data: fileRow, error: fileError } = await sb.from("files").insert({
      agency_id: input.agencyId,
      entity_type: "agency_member",
      entity_id: input.userId,
      bucket: "bes-files",
      path,
      name: input.file.name,
      mime_type: input.file.type || null,
      size_bytes: input.file.size,
      uploaded_by: me.user?.id ?? null,
    }).select("id").single();
    if (fileError) {
      await sb.storage.from("bes-files").remove([path]);
      throw fileError;
    }
    fileId = fileRow.id as string;
  }

  const { error } = await sb.from("member_documents").insert({
    agency_id: input.agencyId,
    user_id: input.userId,
    kind: input.kind,
    name: input.name.trim(),
    status: input.status,
    file_id: fileId,
    visible_to_member: input.visibleToMember,
    sent_at: input.status === "pending_signature" ? new Date().toISOString() : null,
    signed_at: input.signedAt || null,
    expires_on: input.expiresOn || null,
    notes: input.notes?.trim() || null,
    created_by: me.user?.id ?? null,
  });
  if (error) {
    if (path) await sb.storage.from("bes-files").remove([path]);
    throw error;
  }
}

export async function setMemberDocumentStatus(id: string, status: MemberDocumentStatus): Promise<void> {
  const sb = requireSupabase();
  const patch: Record<string, unknown> = { status };
  if (status === "signed" || status === "acknowledged") patch.signed_at = new Date().toISOString();
  if (status === "pending_signature") patch.sent_at = new Date().toISOString();
  const { error } = await sb.from("member_documents").update(patch as never).eq("id", id);
  if (error) throw error;
}

export async function memberDocumentUrl(path: string): Promise<string> {
  const sb = requireSupabase();
  const { data, error } = await sb.storage.from("bes-files").createSignedUrl(path, 5 * 60);
  if (error) throw error;
  return data.signedUrl;
}

export function useMemberDocuments(userId: string | null, enabled: boolean) {
  return useQuery({
    queryKey: ["agency", "member-documents", userId ?? ""],
    queryFn: () => fetchMemberDocuments(userId!),
    enabled: !!userId && enabled,
    staleTime: 30_000,
  });
}

export function useMemberDocumentActions(userId: string) {
  const qc = useQueryClient();
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ["agency", "member-documents", userId] });
    void qc.invalidateQueries({ queryKey: ["agency", "member-activity", userId] });
  };
  return {
    add: useMutation({ mutationFn: addMemberDocument, onSuccess: refresh }),
    setStatus: useMutation({
      mutationFn: (v: { id: string; status: MemberDocumentStatus }) => setMemberDocumentStatus(v.id, v.status),
      onSuccess: refresh,
    }),
  };
}
