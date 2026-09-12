/**
 * Post an update while working: a note, a pasted screenshot, an attachment.
 *
 * Dee, 2026-09-12: "An agent should be able to paste a screenshot directly
 * from their clipboard and post it with a note… One action, two projections."
 *
 * I removed this in the consolidation and should not have. Simplifying the
 * page meant removing nineteen stacked sections, not removing the tools
 * somebody uses fifty times a day.
 *
 * ── ONE ACTION, TWO PROJECTIONS ────────────────────────────────────────────
 *
 * The note goes to `activity_events` through `postNote` — the canonical
 * writer, with the author and time the database records rather than the ones
 * the screen claims. Files go to the canonical `files` rows. So the update
 * appears in History and the screenshot appears in Documents from the SAME
 * write; nobody uploads anything twice, and there is no in-memory array to
 * lose on reload.
 *
 * ── VISIBILITY IS A DECISION ───────────────────────────────────────────────
 *
 * Internal note or an update the partner can see. Defaulted to internal,
 * because the safe direction for a mistake is "only BES saw it" — and the
 * database checks it regardless: the insert policy refuses a level this
 * author may not publish at.
 */
import { useRef, useState } from "react";
import { Image, Loader2, Paperclip, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth/auth-context";
import { useQueryClient } from "@tanstack/react-query";
import { postNote } from "@/lib/data/activity";
import { requireSupabase } from "@/lib/supabase/client";
import type { FulfillmentClient } from "@/lib/fulfillment/fulfillment-client-domain";

export function ClientUpdateComposer({ client }: { client: FulfillmentClient }) {
  const auth = useAuth();
  const qc = useQueryClient();
  const { toast } = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [text, setText] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [shared, setShared] = useState(false);
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);

  const add = (list: FileList | File[] | null) => {
    if (!list) return;
    setFiles((f) => [...f, ...Array.from(list)]);
  };

  /* The reason this exists: an agent screenshots a bureau response and pastes
     it straight in. Anything else on the clipboard is left to the textarea. */
  const onPaste = (e: React.ClipboardEvent) => {
    const images = Array.from(e.clipboardData?.items ?? [])
      .filter((i) => i.type.startsWith("image/"))
      .map((i) => i.getAsFile())
      .filter((f): f is File => f !== null);
    if (images.length > 0) {
      e.preventDefault();
      add(images);
    }
  };

  const post = async () => {
    if (!text.trim() && files.length === 0) return;
    setBusy(true);
    try {
      const sb = requireSupabase();
      const stored: string[] = [];
      for (const file of files) {
        const name = file.name || `screenshot-${Date.now()}.png`;
        const path = `clients/${client.id}/${Date.now()}-${name.replace(/[^\w.-]+/g, "_")}`;
        const up = await sb.storage.from("bes-files").upload(path, file, { upsert: false });
        if (up.error) throw up.error;
        /* The same canonical row the Documents tab lists and the ClickUp
           import wrote. One file, one record, two places it shows up. */
        /* `uploaded_by` and `agency_id` are required by the insert policy,
           and `fulfillment_client` is the entity type that actually resolves
           for a CreditOps work file. */
        const { error } = await sb.from("files").insert({
          entity_type: "fulfillment_client", entity_id: client.id, bucket: "bes-files",
          path, name, mime_type: file.type || null, size_bytes: file.size,
          uploaded_by: auth.user?.id ?? null,
          agency_id: auth.agencyId ?? null,
        } as never);
        if (error) throw error;
        stored.push(name);
      }

      await postNote({
        agencyId: auth.agencyId ?? "",
        organizationId: client.organizationId ?? null,
        entityType: "fulfillment_client",
        entityId: client.id,
        actorId: auth.user?.id ?? null,
        actorName: auth.displayName ?? null,
        action: shared ? "Update posted" : "Internal note",
        detail: [text.trim(), stored.length ? `Attached: ${stored.join(", ")}` : ""]
          .filter(Boolean).join("\n"),
        visibility: shared ? "shared_with_partner" : "bes_internal",
      });

      setText(""); setFiles([]);
      void qc.invalidateQueries({ queryKey: ["creditops", "history", client.id] });
      void qc.invalidateQueries({ queryKey: ["creditops", "documents", client.id] });
      toast({
        title: "Posted",
        description: stored.length
          ? "It is in History, and the file is in Documents."
          : "It is in History.",
      });
    } catch (e) {
      /* The text is deliberately KEPT on failure: retyping a paragraph
         because a network blipped is the worst moment to lose it. */
      toast({ title: "That did not post", description: (e as Error).message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => { e.preventDefault(); setDragging(false); add(e.dataTransfer.files); }}
      className={cn(
        "rounded-xl border bg-card p-3 transition-colors",
        dragging ? "border-primary bg-primary/5" : "border-border",
      )}
    >
      <Textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        onPaste={onPaste}
        rows={2}
        placeholder="Post an update… paste a screenshot, or drop a file"
        aria-label="Post an update"
        className="min-h-[52px] resize-none border-0 bg-transparent p-0 text-xs shadow-none focus-visible:ring-0"
      />

      {files.length > 0 && (
        <ul className="mt-2 flex flex-wrap gap-1.5">
          {files.map((f, i) => (
            <li key={`${f.name}:${i}`} className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px]">
              {f.type.startsWith("image/") ? <Image className="h-3 w-3" /> : <Paperclip className="h-3 w-3" />}
              <span className="max-w-[160px] truncate">{f.name || "screenshot.png"}</span>
              <button type="button" aria-label={`Remove ${f.name}`}
                onClick={() => setFiles((list) => list.filter((_, j) => j !== i))}>
                <X className="h-3 w-3 text-muted-foreground hover:text-foreground" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1">
          <input ref={inputRef} type="file" multiple hidden
            onChange={(e) => { add(e.target.files); e.target.value = ""; }} />
          <Button type="button" size="sm" variant="ghost" className="h-7 px-2"
            aria-label="Attach a file" onClick={() => inputRef.current?.click()}>
            <Paperclip className="h-3.5 w-3.5" />
          </Button>
          <label className="inline-flex cursor-pointer items-center gap-1.5 text-[11px] text-muted-foreground">
            <input type="checkbox" checked={shared} onChange={(e) => setShared(e.target.checked)}
              className="h-3 w-3 rounded border-border text-primary focus:ring-primary" />
            Partner can see this
          </label>
        </div>
        <Button size="sm" disabled={busy || (!text.trim() && files.length === 0)} onClick={() => void post()}>
          {busy ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : null}
          Post
        </Button>
      </div>
    </div>
  );
}
