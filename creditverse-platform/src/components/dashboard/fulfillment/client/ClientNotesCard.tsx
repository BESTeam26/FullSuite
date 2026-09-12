/**
 * The free-text notes kept about a client — quick facts, reminders, standing
 * instructions, and who needs to know.
 *
 * Dee, 2026-09-12: "I lost the DESCRIPTION FIELD I have on client info that I
 * can save almost all info just like my old ClickUp. These are for quick
 * client info and reminders and client instruction." Then: "This should be on
 * the work and not on client info." Then: "I also want this to have mention
 * capability just like the ClickUp."
 *
 * ── WHAT IS SAVED ───────────────────────────────────────────────────────────
 *
 * Two columns, one note. `description` is the plain text every other reader
 * already uses — the client list, search, exports, notes written before today.
 * `description_body` is the same note as a document, where an @mention is a
 * node carrying a user id, which is what lets the database tell the right
 * person and not somebody who happens to share a first name.
 *
 * Saved on blur rather than behind a button: this is a scratchpad somebody
 * types in between calls, and a Save button people forget is how notes get
 * lost. Only newly added mentions notify — correcting a typo in a note that
 * names three people does not tell those three people again.
 *
 * ── WHAT DECIDES THE WRITE ──────────────────────────────────────────────────
 *
 * The gate below is presentation. Whether the update is allowed is decided by
 * row-level security on `fulfillment_clients` as the signed-in person, and a
 * refusal surfaces as the toast rather than as a silent no-op.
 */
import { Suspense, lazy, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { ContentCard } from "@/components/dashboard/DivisionLayout";
import { NoteContent } from "@/components/composer/NoteContent";
import { useToast } from "@/hooks/use-toast";
import { useCreditOpsAccess } from "@/lib/fulfillment/creditops-access";
import { useMentionable } from "@/lib/data/use-mentionable";
import { updateClientField } from "@/lib/data/fulfillment-clients";
import { isDocEmpty, isNoteDoc, type NoteDoc } from "@/lib/activity/note-body";
import { clientNotesPatch } from "@/lib/fulfillment/client-notes";

/* Same as the composer: the editor bundle is paid for only on a screen that
   actually renders one (rule 14). */
const RichTextEditor = lazy(() => import("@/components/composer/RichTextEditor"));

const EditorFallback = () => (
  <div className="flex h-[120px] items-center justify-center rounded-lg border border-border bg-muted/20">
    <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
  </div>
);

export function ClientNotesCard({
  clientId,
  notes,
  notesBody,
}: {
  clientId: string;
  notes: string;
  notesBody: unknown;
}) {
  const access = useCreditOpsAccess();
  const qc = useQueryClient();
  const { toast } = useToast();
  /* A client record is BES's own, so the people who may be named are BES
     colleagues — `useMentionable(null)` is exactly that roster. */
  const { mentionable, mentionAvatars } = useMentionable(null);
  const [saving, setSaving] = useState(false);

  /* The document as last saved, and the document being edited. Compared on
     blur so clicking away without typing writes nothing. */
  const initial: NoteDoc | undefined = isNoteDoc(notesBody) ? notesBody : undefined;
  const saved = useRef<string>(JSON.stringify(initial ?? null));
  const draft = useRef<NoteDoc | null>(initial ?? null);

  const canEdit = access.canLogWork;

  const save = async () => {
    const doc = draft.current;
    if (doc === null) return;
    const next = JSON.stringify(doc);
    if (next === saved.current) return;
    setSaving(true);
    try {
      await updateClientField({ clientId, ...clientNotesPatch(doc) });
      saved.current = next;
      await qc.invalidateQueries({ queryKey: ["creditops"] });
    } catch (e) {
      toast({ title: "Notes did not save", description: (e as Error).message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  /* Read-only for anyone who does not work CreditOps, and absent entirely when
     there is nothing to read — an empty box they cannot type in is furniture. */
  if (!canEdit) {
    if (initial && !isDocEmpty(initial)) {
      return (
        <ContentCard title="Notes & instructions">
          <NoteContent body={initial} fallbackText={notes} />
        </ContentCard>
      );
    }
    return notes.trim() ? (
      <ContentCard title="Notes & instructions">
        <p className="whitespace-pre-wrap text-xs leading-relaxed text-foreground">{notes}</p>
      </ContentCard>
    ) : null;
  }

  return (
    <ContentCard title="Notes & instructions">
      {/* Remounted per client: the editor reads its starting document once, so
          the record changing has to be a new editor rather than new content
          pushed into the one somebody is typing in. */}
      <div key={clientId} onBlur={() => void save()}>
        <Suspense fallback={<EditorFallback />}>
          <RichTextEditor
            resetToken={0}
            initialDoc={initial}
            placeholder="Quick client info, reminders, standing instructions. Type @ to mention someone."
            onChange={(doc) => { draft.current = doc; }}
            onSubmit={() => void save()}
            onFiles={() => {
              toast({
                title: "Files go on the update",
                description: "Attach screenshots and documents to a posted update, so they land in Documents with a note saying what they are.",
              });
            }}
            mentionable={mentionable}
            mentionAvatars={mentionAvatars}
          />
        </Suspense>
      </div>
      <p className="mt-1 text-[11px] text-muted-foreground">
        {saving ? "Saving…" : "Saves when you click away. Anyone you @mention is notified once."}
      </p>
    </ContentCard>
  );
}
