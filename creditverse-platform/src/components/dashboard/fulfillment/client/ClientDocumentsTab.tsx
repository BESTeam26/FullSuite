/**
 * Every document on this client — one place, canonical records.
 *
 * The old attachments panel started from an empty array on every visit and
 * kept whatever you dropped on it in React state until you reloaded. It sat
 * beside 56 REAL documents the ClickUp import had written to `files` under
 * `entity_type = 'client'`, and showed none of them.
 *
 * So there is no local list here at all: the canonical rows are the list.
 * Uploads write the same row the import wrote, which is why an imported file
 * and an uploaded one need no code to tell them apart.
 */
import { useRef, useState } from "react";
import { Loader2, Upload } from "lucide-react";
import { FilePreviewCard, FilePreviewGrid } from "@/components/common/FilePreviewCard";
import { useFilePreviews } from "@/lib/data/use-file-previews";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { formatDate } from "@/lib/format-date";
import { cn } from "@/lib/utils";
import { useClientDocuments } from "@/lib/data/use-client-work-detail";
import { requireSupabase } from "@/lib/supabase/client";
import { useAuth } from "@/lib/auth/auth-context";

/** What kind of thing this is, for somebody scanning a long list. */
const categoryOf = (name: string, mime: string | null) => {
  const n = name.toLowerCase();
  if (/\.pdf$/.test(n) || mime === "application/pdf") return "PDF";
  if (/\.(png|jpe?g|gif|webp|heic)$/.test(n) || mime?.startsWith("image/")) return "Image";
  if (/\.(docx?|rtf|txt)$/.test(n)) return "Document";
  if (/\.(xlsx?|csv)$/.test(n)) return "Spreadsheet";
  return "File";
};

export function ClientDocumentsTab({ clientId }: { clientId: string }) {
  const auth = useAuth();
  const userId = auth.user?.id ?? null;
  const agencyId = auth.agencyId ?? null;
  const docs = useClientDocuments(clientId);
  const { toast } = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);

  const open = async (bucket: string, path: string) => {
    try {
      const sb = requireSupabase();
      const { data, error } = await sb.storage.from(bucket).createSignedUrl(path, 60);
      if (error) throw error;
      window.open(data.signedUrl, "_blank", "noopener,noreferrer");
    } catch (e) {
      toast({ title: "Could not open that file", description: (e as Error).message, variant: "destructive" });
    }
  };

  const upload = async (files: FileList | null) => {
    if (!files?.length) return;
    setBusy(true);
    try {
      const sb = requireSupabase();
      for (const file of Array.from(files)) {
        const path = `clients/${clientId}/${Date.now()}-${file.name.replace(/[^\w.-]+/g, "_")}`;
        const up = await sb.storage.from("bes-files").upload(path, file, { upsert: false });
        if (up.error) throw up.error;
        /* The SAME canonical row the import writes. An uploaded file and an
           imported one are the same kind of thing and need no code to tell
           them apart. */
        /* `uploaded_by` and `agency_id` are required by the insert policy —
           a file with no author is a file nobody can be asked about. */
        const { error } = await sb.from("files").insert({
          entity_type: "fulfillment_client", entity_id: clientId, bucket: "bes-files",
          path, name: file.name, mime_type: file.type || null, size_bytes: file.size,
          uploaded_by: userId, agency_id: agencyId,
        } as never);
        if (error) throw error;
      }
      await docs.refetch();
      toast({ title: files.length === 1 ? "File added" : `${files.length} files added` });
    } catch (e) {
      toast({ title: "Upload failed", description: (e as Error).message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const rows = docs.data ?? [];
  /* One request for every thumbnail on the page, not one per document. */
  const previews = useFilePreviews(
    rows.map((d) => ({ bucket: d.bucket, path: d.path })),
  );

  return (
    <div className="space-y-3">
      <div
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => { e.preventDefault(); setDragging(false); void upload(e.dataTransfer.files); }}
        className={cn(
          "flex items-center justify-between gap-3 rounded-xl border border-dashed px-4 py-3 transition-colors",
          dragging ? "border-primary bg-primary/5" : "border-border bg-muted/20",
        )}
      >
        <p className="text-xs text-muted-foreground">
          {/* Dee, 2026-09-16: "No blank Documents 0 when canonical files
              exist." `rows` is `data ?? []`, so a failed fetch used to say a
              client had no documents — which is a claim about the client, and
              the sort of thing somebody re-uploads a file over. */}
          {docs.isError
            ? "Documents could not be loaded. This is a problem reaching BES, not a change to this client."
            : docs.isPending
              ? "Loading documents…"
              : rows.length === 0
                ? "No documents on this client yet."
                : `${rows.length} ${rows.length === 1 ? "document" : "documents"} · drop files here to add more`}
        </p>
        <input
          ref={inputRef}
          type="file"
          multiple
          hidden
          onChange={(e) => { void upload(e.target.files); e.target.value = ""; }}
        />
        <Button size="sm" variant="outline" disabled={busy} onClick={() => inputRef.current?.click()}>
          {busy ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : <Upload className="mr-2 h-3.5 w-3.5" />}
          Upload
        </Button>
      </div>

      {docs.isLoading ? (
        <p className="py-8 text-center text-xs text-muted-foreground">Loading…</p>
      ) : rows.length > 0 && (
        /* Previews, not filenames. Dee, 2026-09-13: "I wanna see exactly what
           that document w/o clicking the file" — and five rows all called
           `Screenshot 2026-09-08 at 3.42.02 AM.png` are five rows nobody can
           tell apart. */
        <FilePreviewGrid>
          {rows.map((d) => (
            <FilePreviewCard
              key={d.id}
              file={{
                id: d.id, name: d.name, mimeType: d.mimeType, sizeBytes: d.sizeBytes,
                caption: [categoryOf(d.name, d.mimeType), formatDate(d.createdAt),
                  d.sharedWithPartner ? "shared with the partner" : null]
                  .filter(Boolean).join(" · "),
              }}
              url={previews.data?.[`${d.bucket}/${d.path}`]}
              onOpen={() => void open(d.bucket, d.path)}
            />
          ))}
        </FilePreviewGrid>
      )}
    </div>
  );
}
