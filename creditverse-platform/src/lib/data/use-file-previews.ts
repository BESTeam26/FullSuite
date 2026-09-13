/**
 * Signed URLs for a set of stored files, in ONE request per bucket.
 *
 * Dee, 2026-09-13: "I want all documents as preview and not just names. I
 * wanna see exactly what that document w/o clicking the file."
 *
 * A thumbnail needs a URL, and a URL for a private object needs signing. Doing
 * that per file would be one round trip per row — twelve documents, twelve
 * requests, and a list that fills in raggedly. `createSignedUrls` takes the
 * whole batch, so a page of documents costs one call however many there are
 * (rule 14).
 *
 * The URLs expire. That is the point of signing them, and it is why they are
 * fetched when the list is shown rather than stored anywhere.
 */
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth/auth-context";
import { requireSupabase } from "@/lib/supabase/client";

/** Long enough to read a page of documents, short enough that a copied link dies. */
const TTL_SECONDS = 60 * 30;

export interface PreviewTarget {
  bucket: string;
  path: string;
}

export function useFilePreviews(targets: PreviewTarget[]) {
  const auth = useAuth();
  /* Keyed on the paths themselves, so opening a different client's documents
     is a different query rather than a stale reuse. */
  const key = targets.map((t) => `${t.bucket}/${t.path}`).sort().join("|");

  return useQuery({
    queryKey: ["file-previews", key],
    enabled: auth.mode === "live" && auth.status === "signed-in" && targets.length > 0,
    staleTime: (TTL_SECONDS - 60) * 1000,
    queryFn: async (): Promise<Record<string, string>> => {
      const sb = requireSupabase();
      const byBucket = new Map<string, string[]>();
      for (const t of targets) {
        const list = byBucket.get(t.bucket);
        if (list) list.push(t.path);
        else byBucket.set(t.bucket, [t.path]);
      }

      const out: Record<string, string> = {};
      await Promise.all([...byBucket.entries()].map(async ([bucket, paths]) => {
        const { data, error } = await sb.storage.from(bucket).createSignedUrls(paths, TTL_SECONDS);
        /* One unreadable bucket must not blank every other preview on the
           page — the row falls back to its icon and the rest still render. */
        if (error) return;
        for (const row of data ?? []) {
          if (row.path && row.signedUrl) out[`${bucket}/${row.path}`] = row.signedUrl;
        }
      }));
      return out;
    },
  });
}

/** What a file can be shown as, decided from its name and type together. */
export type PreviewKind = "image" | "pdf" | "text" | "other";

export function previewKindOf(name: string, mime: string | null | undefined): PreviewKind {
  const n = (name ?? "").toLowerCase();
  if (mime?.startsWith("image/") || /\.(png|jpe?g|gif|webp|avif|bmp|svg)$/.test(n)) return "image";
  if (mime === "application/pdf" || /\.pdf$/.test(n)) return "pdf";
  if (mime?.startsWith("text/") || /\.(txt|csv|md|log)$/.test(n)) return "text";
  return "other";
}

/**
 * A file size a person reads, not a byte count. One implementation, because
 * three document panels each rounding differently is three answers to the
 * same question.
 */
export const sizeLabel = (bytes: number | null | undefined): string => {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
};
