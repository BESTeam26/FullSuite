/**
 * Documents that belong to the PERSON, not to a piece of work.
 *
 * A driving licence, a proof of address, a signed agreement — these follow the
 * client between CreditOps, FundingOps and DIY, which is the whole reason the
 * canonical client record exists (rule 2).
 *
 * Same `files` table, same private bucket, same shape as company documents
 * (rule 6: no second document engine). What differs is the folder and who may
 * write: the client themself through their portal, or somebody who may write
 * the client record. `uploadedBy` is what the screen reads to say which.
 */
import { requireSupabase } from "@/lib/supabase/client";
import { MAX_DOCUMENT_BYTES, documentProblem, signDocumentUrl } from "@/lib/data/company-documents";

export { MAX_DOCUMENT_BYTES, documentProblem, signDocumentUrl };

export interface ClientDocumentRow {
  id: string;
  name: string;
  path: string;
  mimeType: string | null;
  sizeBytes: number | null;
  uploadedBy: string | null;
  uploadedByName: string | null;
  /** True when the client added it themself through the portal. */
  byClient: boolean;
  createdAt: string;
}

export async function fetchClientDocuments(clientId: string): Promise<ClientDocumentRow[]> {
  const sb = requireSupabase();
  const [{ data, error }, client] = await Promise.all([
    sb
      .from("files")
      .select("id, name, path, mime_type, size_bytes, uploaded_by, created_at, profiles:uploaded_by(full_name, email)")
      .eq("entity_type", "client")
      .eq("entity_id", clientId)
      .order("created_at", { ascending: false }),
    sb.from("clients").select("portal_user_id").eq("id", clientId).maybeSingle(),
  ]);
  if (error) throw error;
  const portalUserId = client.data?.portal_user_id ?? null;
  return (data ?? []).map((r) => {
    const p = r.profiles as { full_name: string | null; email: string } | null;
    return {
      id: r.id,
      name: r.name,
      path: r.path,
      mimeType: r.mime_type,
      sizeBytes: r.size_bytes,
      uploadedBy: r.uploaded_by,
      uploadedByName: p?.full_name?.trim() || p?.email || null,
      byClient: !!portalUserId && r.uploaded_by === portalUserId,
      createdAt: r.created_at,
    };
  });
}

/**
 * Upload, then record.
 *
 * The object goes up first and the row second, so a failed record leaves an
 * orphan we delete rather than a row pointing at nothing. The database derives
 * the folder from the client and refuses a path outside it, so the path built
 * here is checked rather than trusted.
 */
export async function uploadClientDocument(params: {
  clientId: string;
  partnerScopeId: string;
  file: File;
}): Promise<string> {
  const sb = requireSupabase();
  const extension = params.file.name.includes(".") ? params.file.name.split(".").pop()!.slice(0, 12) : "bin";
  const path = `${params.partnerScopeId}/clients/${params.clientId}/${crypto.randomUUID()}.${extension}`;
  const { error: uploadError } = await sb.storage.from("bes-files").upload(path, params.file, {
    contentType: params.file.type || "application/octet-stream",
    upsert: false,
  });
  if (uploadError) throw uploadError;
  const { data, error } = await sb.rpc("save_client_document", {
    p_client: params.clientId,
    p_path: path,
    p_name: params.file.name,
    p_mime: params.file.type || "",
    p_size: params.file.size,
  });
  if (error) {
    await sb.storage.from("bes-files").remove([path]);
    throw error;
  }
  return data as unknown as string;
}

/**
 * Remove one. Staff only — a document a client produced is part of the record
 * from the moment it arrives (rule 11), and the database refuses a portal user
 * here regardless of what this screen offers.
 */
export async function deleteClientDocument(id: string): Promise<void> {
  const sb = requireSupabase();
  const { data, error } = await sb.rpc("delete_client_document", { p_id: id });
  if (error) throw error;
  const path = data as unknown as string | null;
  if (path) await sb.storage.from("bes-files").remove([path]);
}
