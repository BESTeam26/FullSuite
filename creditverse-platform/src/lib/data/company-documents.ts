/**
 * Company documents — the Hub Core "Files" module, for BOTH tenancies.
 *
 * One engine, two owners (rule 18): a customer's documents are `files` rows
 * with its `organization_id` and objects at `<org>/company/…`; BES's own are
 * rows with `organization_id` NULL and objects at `agency/company/…`. Passing
 * `organizationId: null` everywhere below means "BES's hub".
 *
 * Reading is every member (or every BES staff member, for the agency's);
 * publishing and removing need `settings.manage` in an organization and
 * `hub.files.manage` at BES — enforced by the policies and the writer
 * (0232), not by this layer.
 */
import { requireSupabase } from "@/lib/supabase/client";

export interface CompanyDocument {
  id: string;
  name: string;
  path: string;
  mimeType: string | null;
  sizeBytes: number | null;
  uploadedBy: string | null;
  uploadedByName: string | null;
  createdAt: string;
}

export const MAX_DOCUMENT_BYTES = 25 * 1024 * 1024;

export function documentProblem(file: File): string | null {
  if (file.size > MAX_DOCUMENT_BYTES) return "That file is larger than 25 MB.";
  if (file.size === 0) return "That file is empty.";
  return null;
}

export async function fetchCompanyDocuments(organizationId: string | null): Promise<CompanyDocument[]> {
  const sb = requireSupabase();
  let q = sb
    .from("files")
    .select("id, name, path, mime_type, size_bytes, uploaded_by, created_at, profiles:uploaded_by(full_name, email)");
  /* NULL narrows to the agency's own documents. It never widens: the select
     policy still decides what comes back (rule 16). */
  q = organizationId ? q.eq("organization_id", organizationId) : q.is("organization_id", null);
  const { data, error } = await q
    .eq("entity_type", "company_document")
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) throw error;
  return (data ?? []).map((f) => {
    const p = f.profiles as { full_name: string | null; email: string } | null;
    return {
      id: f.id,
      name: f.name,
      path: f.path,
      mimeType: f.mime_type,
      sizeBytes: f.size_bytes === null ? null : Number(f.size_bytes),
      uploadedBy: f.uploaded_by,
      uploadedByName: p?.full_name?.trim() || p?.email || null,
      createdAt: f.created_at,
    };
  });
}

/**
 * Upload, then record through the database function (it fills the agency from
 * the organization — the browser never supplies a tenancy). If the row fails
 * the object is removed again, so a half-finished upload never lingers.
 */
export async function uploadCompanyDocument(params: {
  organizationId: string | null;
  file: File;
}): Promise<string> {
  const sb = requireSupabase();
  const extension = params.file.name.includes(".") ? params.file.name.split(".").pop()!.slice(0, 12) : "bin";
  const path = `${params.organizationId ?? "agency"}/company/${crypto.randomUUID()}.${extension}`;
  const { error: uploadError } = await sb.storage.from("bes-files").upload(path, params.file, {
    contentType: params.file.type || "application/octet-stream",
    upsert: false,
  });
  if (uploadError) throw uploadError;
  const { data, error } = await sb.rpc("save_company_document", {
    p_org: params.organizationId as string,
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

export async function deleteCompanyDocument(doc: { id: string }): Promise<void> {
  const sb = requireSupabase();
  /* The function returns the object path so the file and its record go
     together; the row is gone first, so nothing points at a missing object. */
  const { data, error } = await sb.rpc("delete_company_document", { p_id: doc.id });
  if (error) throw error;
  const path = data as unknown as string | null;
  if (path) await sb.storage.from("bes-files").remove([path]);
}

/** A short-lived link for one download; the bucket is private. */
export async function signDocumentUrl(path: string): Promise<string> {
  const sb = requireSupabase();
  const { data, error } = await sb.storage.from("bes-files").createSignedUrl(path, 5 * 60);
  if (error) throw error;
  return data.signedUrl;
}
