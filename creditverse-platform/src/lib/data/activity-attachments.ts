/**
 * Attachments on activity notes.
 *
 * Reuses the existing private `bes-files` bucket and `public.files` table — no
 * second file system (rule 2). What is specific to notes is only the object
 * path and the `entity_type`.
 *
 * **Audience.** An attachment is readable exactly when its note is readable.
 * That rule lives in the database (migration 0020): the `files` policy defers
 * to the parent `activity_events` row, and the storage policy defers to the
 * `files` row. Nothing here re-implements it — this module chooses a tenancy
 * folder and then relies on those policies, so a caller who bypasses this file
 * gains nothing.
 *
 * Object layout:
 *
 *     <organization_id | 'agency'>/activity/<entity_type>/<entity_id>/<uuid>.<ext>
 *      ^ tenancy key, per the storage policies
 *                     ^ carves these objects out of the general tenancy rule
 */
import { requireSupabase } from "@/lib/supabase/client";
import type { ActivityVisibility } from "@/lib/fulfillment/ops-activity-domain";

const BUCKET = "bes-files";

/** Ten megabytes. Large enough for a screenshot or a scanned PDF. */
export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;

/**
 * What may be attached.
 *
 * An allow-list, not a block-list: the browser renders some of these inline,
 * and "everything except the dangerous ones" is a list nobody keeps current.
 */
export const ALLOWED_ATTACHMENT_TYPES = [
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
  "image/heic",
  "application/pdf",
  "text/plain",
  "text/csv",
] as const;

export interface ActivityAttachment {
  id: string;
  name: string;
  mimeType: string;
  sizeBytes: number;
  /** Storage object path. Not a URL — reads go through a signed URL. */
  path: string;
}

export const isImageAttachment = (a: { mimeType: string }) =>
  a.mimeType.startsWith("image/");

export const isPdfAttachment = (a: { mimeType: string }) =>
  a.mimeType === "application/pdf";

export function formatBytes(n: number): string {
  if (n >= 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(n / 1024))} KB`;
}

/**
 * Whether this file may be attached at all.
 *
 * Returns the reason rather than a boolean so the composer can say why, which
 * is the difference between a rejected upload and a mysterious one.
 */
export function rejectionReason(file: File): string | null {
  if (file.size > MAX_ATTACHMENT_BYTES)
    return `${file.name} is ${formatBytes(file.size)} — the limit is ${formatBytes(MAX_ATTACHMENT_BYTES)}.`;
  if (!ALLOWED_ATTACHMENT_TYPES.includes(file.type as never))
    return `${file.name} is a ${file.type || "unknown"} file, which cannot be attached.`;
  return null;
}

/**
 * The tenancy folder an attachment belongs in.
 *
 * BES-internal material never goes under a customer's folder, even when the
 * note hangs off that customer's record. The storage policy keys on this first
 * segment, so putting it in the wrong folder would be the leak itself.
 */
function tenancyFolder(
  visibility: ActivityVisibility,
  organizationId: string | undefined,
): string {
  if (visibility === "bes_internal" || !organizationId) return "agency";
  return organizationId;
}

const extensionOf = (file: File): string => {
  const fromName = file.name.includes(".")
    ? file.name.split(".").pop()!.toLowerCase()
    : "";
  if (/^[a-z0-9]{1,5}$/.test(fromName)) return fromName;
  return file.type.split("/")[1]?.replace(/[^a-z0-9]/g, "") || "bin";
};

export interface UploadedObject {
  path: string;
  name: string;
  mimeType: string;
  sizeBytes: number;
}

/**
 * Put one file in the bucket, before the note exists.
 *
 * Uploads happen while the author is still composing, so the note has no id
 * yet and the object is filed under the entity instead. Until a `files` row
 * points at it the object is readable by nobody — the storage policy for this
 * sub-path requires that row — so an upload that never becomes a note is inert
 * rather than exposed.
 */
export async function uploadAttachment(input: {
  file: File;
  entityType: string;
  entityId: string;
  organizationId?: string;
  visibility: ActivityVisibility;
}): Promise<UploadedObject> {
  const reason = rejectionReason(input.file);
  if (reason) throw new Error(reason);

  const sb = requireSupabase();
  const folder = tenancyFolder(input.visibility, input.organizationId);
  // The stored name is generated, never the user's. A filename is attacker
  // input: path separators, control characters and lookalike extensions all
  // arrive through it. The original is kept in `files.name` for display only.
  const path = `${folder}/activity/${input.entityType}/${input.entityId}/${crypto.randomUUID()}.${extensionOf(input.file)}`;

  const { error } = await sb.storage.from(BUCKET).upload(path, input.file, {
    contentType: input.file.type,
    upsert: false,
  });
  if (error) throw error;

  return {
    path,
    name: input.file.name,
    mimeType: input.file.type,
    sizeBytes: input.file.size,
  };
}

/** Remove an object that never became a note. Best effort. */
export async function discardUpload(path: string): Promise<void> {
  const sb = requireSupabase();
  await sb.storage
    .from(BUCKET)
    .remove([path])
    .catch(() => {});
}

/**
 * Attach uploaded objects to a note that now exists.
 *
 * One row per file, all in one insert — never a round trip per attachment
 * (rule 14).
 */
export async function linkAttachments(input: {
  activityId: string;
  agencyId: string;
  organizationId?: string;
  uploaderId: string;
  objects: UploadedObject[];
}): Promise<ActivityAttachment[]> {
  if (input.objects.length === 0) return [];
  const sb = requireSupabase();
  const { data, error } = await sb
    .from("files")
    .insert(
      input.objects.map((o) => ({
        agency_id: input.agencyId,
        organization_id: input.organizationId ?? null,
        entity_type: "activity_event",
        entity_id: input.activityId,
        bucket: BUCKET,
        path: o.path,
        name: o.name,
        mime_type: o.mimeType,
        size_bytes: o.sizeBytes,
        uploaded_by: input.uploaderId,
      })),
    )
    .select("id,name,mime_type,size_bytes,path");
  if (error) throw error;
  return (data ?? []).map((r) => ({
    id: String(r.id),
    name: r.name,
    mimeType: r.mime_type ?? "application/octet-stream",
    sizeBytes: Number(r.size_bytes ?? 0),
    path: r.path,
  }));
}

/**
 * Attachments for a whole timeline, in ONE query.
 *
 * Keyed by activity id so the timeline renders from a map rather than asking
 * per note — the N+1 this would otherwise be (rule 14).
 */
export async function fetchAttachmentsFor(
  activityIds: string[],
): Promise<Record<string, ActivityAttachment[]>> {
  if (activityIds.length === 0) return {};
  const sb = requireSupabase();
  const { data, error } = await sb
    .from("files")
    .select("id,entity_id,name,mime_type,size_bytes,path")
    .eq("entity_type", "activity_event")
    .in("entity_id", activityIds);
  if (error) throw error;

  const out: Record<string, ActivityAttachment[]> = {};
  for (const r of data ?? []) {
    (out[r.entity_id!] ??= []).push({
      id: String(r.id),
      name: r.name,
      mimeType: r.mime_type ?? "application/octet-stream",
      sizeBytes: Number(r.size_bytes ?? 0),
      path: r.path,
    });
  }
  return out;
}

/** A file as the organization search lists it: where it hangs, what it is. */
export interface OrganizationFile {
  id: string;
  name: string;
  entityType: string | null;
  entityId: string | null;
  mimeType: string;
}

/**
 * Every file the caller may see for one organization, newest first, bounded.
 * RLS scopes the rows; the organization id only narrows (rule 16).
 */
export async function fetchOrganizationFiles(organizationId: string): Promise<OrganizationFile[]> {
  const sb = requireSupabase();
  const { data, error } = await sb
    .from("files")
    .select("id,name,entity_type,entity_id,mime_type")
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: false })
    .limit(300);
  if (error) throw error;
  return (data ?? []).map((r) => ({
    id: String(r.id),
    name: r.name,
    entityType: r.entity_type,
    entityId: r.entity_id,
    mimeType: r.mime_type ?? "application/octet-stream",
  }));
}

/** How long a viewing link stays good. Long enough to read, not to share. */
const SIGNED_URL_TTL_SECONDS = 60 * 10;

/**
 * Time-limited URLs for a set of attachments, in one request.
 *
 * The bucket is private, so there is no permanent URL to leak. Signing is
 * itself authorized — storage RLS runs on the caller — so a user who cannot
 * read the note cannot obtain a link to its attachment either.
 */
export async function signAttachments(
  paths: string[],
): Promise<Record<string, string>> {
  if (paths.length === 0) return {};
  const sb = requireSupabase();
  const { data, error } = await sb.storage
    .from(BUCKET)
    .createSignedUrls(paths, SIGNED_URL_TTL_SECONDS);
  if (error) throw error;
  const out: Record<string, string> = {};
  for (const row of data ?? []) {
    if (row.signedUrl && row.path) out[row.path] = row.signedUrl;
  }
  return out;
}
