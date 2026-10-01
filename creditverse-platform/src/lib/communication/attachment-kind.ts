/**
 * What an attachment IS, for deciding how to show it.
 *
 * Dee, 2026-10-01: "sending and downloading all types of attachments and
 * previews on messages." Every file can be sent and downloaded; this decides
 * which ones can also be looked at without leaving the conversation. The
 * answer comes from the MIME type the browser reported at upload, and from
 * the name when the type is missing — a file called `mock.html` uploaded as
 * `application/octet-stream` is still a web page.
 *
 * Pure, so it is tested as a table rather than noticed in review.
 */
export type AttachmentKind = "image" | "pdf" | "html" | "text" | "video" | "audio" | "other";

const byExtension: [RegExp, AttachmentKind][] = [
  [/\.(png|jpe?g|gif|webp|avif|bmp|svg)$/i, "image"],
  [/\.pdf$/i, "pdf"],
  [/\.html?$/i, "html"],
  [/\.(txt|md|markdown|csv|tsv|json|log|xml|yaml|yml)$/i, "text"],
  [/\.(mp4|webm|mov|m4v)$/i, "video"],
  [/\.(mp3|wav|m4a|ogg|aac|flac)$/i, "audio"],
];

export function attachmentKind(mime: string | null | undefined, name: string): AttachmentKind {
  const m = (mime ?? "").toLowerCase();
  if (m.startsWith("image/")) return "image";
  if (m === "application/pdf") return "pdf";
  if (m === "text/html" || m === "application/xhtml+xml") return "html";
  if (m.startsWith("text/") || m === "application/json" || m === "application/xml") return "text";
  if (m.startsWith("video/")) return "video";
  if (m.startsWith("audio/")) return "audio";
  for (const [re, kind] of byExtension) if (re.test(name)) return kind;
  return "other";
}

/** Whether the viewer can show it in the app; everything else is a download. */
export const canPreview = (kind: AttachmentKind): boolean => kind !== "other";

/** "2.1 MB", "348 KB" — sizes as somebody would say them. */
export function formatBytes(bytes: number | null | undefined): string | null {
  if (bytes === null || bytes === undefined || !Number.isFinite(bytes)) return null;
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1).replace(/\.0$/, "")} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}
