/**
 * Announcements for the organization in view (or BES HQ's own board).
 * Everyone who may read sees pinned items first; people who may write get a
 * composer and an archive control. Drafts are visible only to writers and are
 * labelled as drafts. Writes are database functions with their own checks.
 */
import { useState } from "react";
import { Archive, Loader2, Megaphone, Pin, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatDate } from "@/lib/format-date";
import { errorMessage } from "@/lib/data/error-message";
import { useAnnouncements } from "@/lib/data/use-intranet";
import type { Announcement, AnnouncementAudience } from "@/lib/data/intranet";
import { cn } from "@/lib/utils";

interface Props {
  /** The organization in view; null for BES HQ's own board. */
  organizationId: string | null;
  canWrite: boolean;
  /** Audiences the writer may choose (BES HQ chooses; an organization has one). */
  audienceChoices: { value: AnnouncementAudience; label: string }[];
}

const inputCls = "mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary";
const labelCls = "block text-[10px] font-bold uppercase tracking-wider text-muted-foreground";

const AUDIENCE_LABEL: Record<AnnouncementAudience, string> = {
  organization: "Your team",
  all_organizations: "Every organization",
  bes_internal: "BES internal",
};

export function AnnouncementsBoard({ organizationId, canWrite, audienceChoices }: Props) {
  const board = useAnnouncements(organizationId);
  const [composing, setComposing] = useState(false);
  const [editing, setEditing] = useState<Announcement | null>(null);
  const [error, setError] = useState<string | null>(null);

  const startEdit = (a: Announcement) => { setEditing(a); setComposing(true); };
  const close = () => { setComposing(false); setEditing(null); setError(null); };

  return (
    <div className="space-y-4">
      {canWrite && !composing && (
        <div className="flex justify-end">
          <Button type="button" size="sm" onClick={() => setComposing(true)}>
            <Plus className="mr-1 h-4 w-4" /> New announcement
          </Button>
        </div>
      )}

      {composing && (
        <AnnouncementComposer
          organizationId={organizationId}
          audienceChoices={audienceChoices}
          initial={editing}
          saving={board.save.isPending}
          onCancel={close}
          onSave={(input) =>
            board.save.mutate(input, {
              onSuccess: close,
              onError: (e) => setError(errorMessage(e, "The announcement could not be saved.")),
            })
          }
          error={error}
        />
      )}

      {board.isLoading ? (
        <div className="space-y-3" aria-busy="true">
          {[0, 1].map((i) => <div key={i} className="h-24 rounded-xl border border-border bg-card" />)}
        </div>
      ) : board.error ? (
        <p role="alert" className="text-sm text-status-danger">Could not load announcements: {board.error}</p>
      ) : board.announcements.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-card p-8 text-center">
          <Megaphone className="mx-auto h-6 w-6 text-muted-foreground" />
          <p className="mt-2 text-sm font-semibold text-foreground">No announcements yet</p>
          <p className="text-xs text-muted-foreground">{canWrite ? "Post the first one — everyone in the organization sees it here." : "Updates from your organization appear here."}</p>
        </div>
      ) : (
        <ul className="space-y-3">
          {board.announcements.map((a) => (
            <li key={a.id} className={cn("rounded-xl border bg-card p-4 shadow-sm", a.pinned ? "border-primary/40" : "border-border")}>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="flex flex-wrap items-center gap-2 text-sm font-bold text-foreground">
                    {a.pinned && <Pin className="h-3.5 w-3.5 text-primary" aria-label="Pinned" />}
                    {a.title}
                    {a.tag && <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">{a.tag}</span>}
                    {!a.publishedAt && <span className="rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-[11px] font-medium text-amber-700">Draft</span>}
                    {a.organizationId === null && <span className="rounded-full border border-border px-2 py-0.5 text-[11px] font-medium text-muted-foreground">{AUDIENCE_LABEL[a.audience]}</span>}
                  </p>
                  <p className="text-xs text-muted-foreground">{a.publishedAt ? formatDate(a.publishedAt) : `Saved ${formatDate(a.updatedAt)}`}</p>
                </div>
                {canWrite && (
                  <div className="flex items-center gap-1">
                    <Button type="button" size="sm" variant="ghost" onClick={() => startEdit(a)}>Edit</Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      title="Archive — it leaves the board but stays in the record"
                      disabled={board.archive.isPending}
                      onClick={() => board.archive.mutate(a.id, { onError: (e) => setError(errorMessage(e, "Could not archive.")) })}
                    >
                      <Archive className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                )}
              </div>
              <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-foreground">{a.body}</p>
            </li>
          ))}
        </ul>
      )}
      {error && !composing && <p role="alert" className="text-xs text-status-danger">{error}</p>}
    </div>
  );
}

function AnnouncementComposer({
  organizationId,
  audienceChoices,
  initial,
  saving,
  error,
  onSave,
  onCancel,
}: {
  organizationId: string | null;
  audienceChoices: Props["audienceChoices"];
  initial: Announcement | null;
  saving: boolean;
  error: string | null;
  onSave: (input: Parameters<ReturnType<typeof useAnnouncements>["save"]["mutate"]>[0]) => void;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState(initial?.title ?? "");
  const [tag, setTag] = useState(initial?.tag ?? "");
  const [body, setBody] = useState(initial?.body ?? "");
  const [pinned, setPinned] = useState(initial?.pinned ?? false);
  const [audience, setAudience] = useState<AnnouncementAudience>(initial?.audience ?? audienceChoices[0]?.value ?? "organization");
  const valid = title.trim().length > 0 && body.trim().length > 0;

  const submit = (publish: boolean) =>
    onSave({ id: initial?.id ?? null, organizationId, audience, title, body, tag: tag || null, pinned, publish });

  return (
    <form
      className="space-y-3 rounded-xl border border-primary/30 bg-card p-4 shadow-sm"
      onSubmit={(e) => { e.preventDefault(); if (valid) submit(true); }}
    >
      <p className="text-sm font-bold text-foreground">{initial ? "Edit announcement" : "New announcement"}</p>
      <div className="grid gap-3 sm:grid-cols-[2fr_1fr]">
        <label className="text-sm"><span className={labelCls}>Title</span><input value={title} onChange={(e) => setTitle(e.target.value)} className={inputCls} maxLength={200} required /></label>
        <label className="text-sm"><span className={labelCls}>Tag (optional)</span><input value={tag} onChange={(e) => setTag(e.target.value)} className={inputCls} maxLength={40} placeholder="Operations, Policy…" /></label>
      </div>
      <label className="block text-sm"><span className={labelCls}>Message</span><textarea value={body} onChange={(e) => setBody(e.target.value)} className={cn(inputCls, "min-h-32")} maxLength={20000} required /></label>
      <div className="flex flex-wrap items-center gap-4">
        {audienceChoices.length > 1 && (
          <label className="text-sm"><span className={labelCls}>Who sees it</span>
            <select value={audience} onChange={(e) => setAudience(e.target.value as AnnouncementAudience)} className={inputCls}>
              {audienceChoices.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
            </select>
          </label>
        )}
        <label className="flex items-center gap-2 text-sm text-foreground"><input type="checkbox" checked={pinned} onChange={(e) => setPinned(e.target.checked)} className="h-4 w-4 accent-primary" /> Pin to the top</label>
      </div>
      {error && <p role="alert" className="text-xs text-status-danger">{error}</p>}
      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" size="sm" disabled={!valid || saving}>{saving ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : null} {initial?.publishedAt ? "Save changes" : "Publish"}</Button>
        {!initial?.publishedAt && <Button type="button" size="sm" variant="outline" disabled={!valid || saving} onClick={() => submit(false)}>Save as draft</Button>}
        <Button type="button" size="sm" variant="ghost" onClick={onCancel} disabled={saving}>Cancel</Button>
      </div>
    </form>
  );
}
