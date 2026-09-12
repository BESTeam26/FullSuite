/**
 * The free-text notes kept about a client — quick facts, reminders, standing
 * instructions.
 *
 * Dee, 2026-09-12: "I lost the DESCRIPTION FIELD I have on client info that I
 * can save almost all info just like my old ClickUp. These are for quick
 * client info and reminders and client instruction." And then: "This should
 * be on the work and not on client info" — it is working material, read while
 * the file is being worked, not a record of who the person is.
 *
 * The consolidation had made it read-only AND hidden when empty, so a client
 * with no notes had nowhere to write any and a client with notes could not
 * have them corrected.
 *
 * It writes `fulfillment_clients.description` through `updateClientField`, the
 * same canonical writer the client list uses, and the database records the
 * change. Saved on blur rather than behind a button: this is a scratchpad
 * somebody types in between calls, and a Save button people forget is how
 * notes get lost.
 *
 * The gate here is presentation. Whether the write is allowed is decided by
 * row-level security on `fulfillment_clients` as the signed-in person, and a
 * refusal surfaces as the toast below rather than as a silent no-op.
 */
import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ContentCard } from "@/components/dashboard/DivisionLayout";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { useCreditOpsAccess } from "@/lib/fulfillment/creditops-access";
import { updateClientField } from "@/lib/data/fulfillment-clients";

export function ClientNotesCard({ clientId, notes }: { clientId: string; notes: string }) {
  const access = useCreditOpsAccess();
  const qc = useQueryClient();
  const { toast } = useToast();
  const [text, setText] = useState(notes);
  const [saving, setSaving] = useState(false);
  /* What is on the server, as far as this card knows. Compared against on
     blur so clicking away without typing does not write. */
  const saved = useRef(notes);
  const canEdit = access.canLogWork;

  /* Re-seed when the RECORD changes, not on every refetch — a background
     refresh must never overwrite a half-typed sentence. */
  useEffect(() => {
    setText(notes);
    saved.current = notes;
  }, [clientId]); // eslint-disable-line react-hooks/exhaustive-deps

  const save = async () => {
    const next = text;
    if (next === saved.current) return;
    setSaving(true);
    try {
      await updateClientField({ clientId, description: next });
      saved.current = next;
      await qc.invalidateQueries({ queryKey: ["creditops"] });
    } catch (e) {
      toast({ title: "Notes did not save", description: (e as Error).message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  if (!canEdit) {
    return text.trim() ? (
      <ContentCard title="Notes & instructions">
        <p className="whitespace-pre-wrap text-xs leading-relaxed text-foreground">{text}</p>
      </ContentCard>
    ) : null;
  }

  return (
    <ContentCard title="Notes & instructions">
      <Textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => void save()}
        rows={7}
        placeholder="Quick client info, reminders, standing instructions — anything the next person working this file should know."
        aria-label="Client notes and instructions"
        className="text-xs leading-relaxed"
      />
      <p className="mt-1 text-[11px] text-muted-foreground">
        {saving ? "Saving…" : "Saves when you click away."}
      </p>
    </ContentCard>
  );
}
