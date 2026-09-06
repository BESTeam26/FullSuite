/**
 * Knowledge Base: the organization's own articles plus what BES publishes to
 * every organization, grouped by category. Writers (settings.manage, or BES
 * staff on the shared library) add and archive; everyone else reads.
 */
import { useMemo, useState } from "react";
import { Archive, BookOpen, ChevronDown, ChevronRight, Loader2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatDate } from "@/lib/format-date";
import { errorMessage } from "@/lib/data/error-message";
import { useKnowledgeArticles } from "@/lib/data/use-intranet";
import type { KnowledgeArticle, KnowledgeAudience } from "@/lib/data/intranet";
import { cn } from "@/lib/utils";

interface Props {
  organizationId: string | null;
  canWrite: boolean;
  /** Audiences a writer may pick. */
  audienceChoices: { value: KnowledgeAudience; label: string }[];
}

const inputCls = "mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary";
const labelCls = "block text-[10px] font-bold uppercase tracking-wider text-muted-foreground";
const UNCATEGORISED = "General";

export function KnowledgeBase({ organizationId, canWrite, audienceChoices }: Props) {
  const kb = useKnowledgeArticles(organizationId);
  const [composing, setComposing] = useState(false);
  const [editing, setEditing] = useState<KnowledgeArticle | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const groups = useMemo(() => {
    const m = new Map<string, KnowledgeArticle[]>();
    for (const a of kb.articles) {
      const key = a.category ?? UNCATEGORISED;
      if (!m.has(key)) m.set(key, []);
      m.get(key)!.push(a);
    }
    return [...m.entries()];
  }, [kb.articles]);

  const close = () => { setComposing(false); setEditing(null); setError(null); };

  return (
    <div className="space-y-4">
      {canWrite && !composing && (
        <div className="flex justify-end">
          <Button type="button" size="sm" onClick={() => setComposing(true)}><Plus className="mr-1 h-4 w-4" /> New article</Button>
        </div>
      )}
      {composing && (
        <ArticleComposer
          organizationId={organizationId}
          audienceChoices={audienceChoices}
          initial={editing}
          saving={kb.save.isPending}
          error={error}
          onCancel={close}
          onSave={(input) => kb.save.mutate(input, { onSuccess: close, onError: (e) => setError(errorMessage(e, "The article could not be saved.")) })}
        />
      )}

      {kb.isLoading ? (
        <div className="h-24 rounded-xl border border-border bg-card" aria-busy="true" />
      ) : kb.error ? (
        <p role="alert" className="text-sm text-status-danger">Could not load the knowledge base: {kb.error}</p>
      ) : kb.articles.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-card p-8 text-center">
          <BookOpen className="mx-auto h-6 w-6 text-muted-foreground" />
          <p className="mt-2 text-sm font-semibold text-foreground">No articles yet</p>
          <p className="text-xs text-muted-foreground">{canWrite ? "Write your procedures, scripts and how-tos here so the whole team works from one source." : "Your organization's procedures and guides appear here."}</p>
        </div>
      ) : (
        <div className="space-y-5">
          {groups.map(([category, articles]) => (
            <section key={category} aria-label={category}>
              <h3 className="mb-2 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">{category}</h3>
              <ul className="divide-y divide-border/60 overflow-hidden rounded-xl border border-border bg-card">
                {articles.map((a) => {
                  const expanded = open === a.id;
                  return (
                    <li key={a.id}>
                      <div className="flex items-start gap-2 px-4 py-3">
                        <button
                          type="button"
                          onClick={() => setOpen(expanded ? null : a.id)}
                          aria-expanded={expanded}
                          className="flex min-w-0 flex-1 items-start gap-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded"
                        >
                          {expanded ? <ChevronDown className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" /> : <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />}
                          <span className="min-w-0">
                            <span className="flex flex-wrap items-center gap-2 text-sm font-semibold text-foreground">
                              {a.title}
                              {!a.publishedAt && <span className="rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-[11px] font-medium text-amber-700">Draft</span>}
                              {a.organizationId === null && <span className="rounded-full border border-border px-2 py-0.5 text-[11px] font-medium text-muted-foreground">Shared library</span>}
                            </span>
                            <span className="block text-[11px] text-muted-foreground">Updated {formatDate(a.updatedAt)}</span>
                          </span>
                        </button>
                        {canWrite && (a.organizationId === organizationId) && (
                          <div className="flex shrink-0 items-center gap-1">
                            <Button type="button" size="sm" variant="ghost" onClick={() => { setEditing(a); setComposing(true); }}>Edit</Button>
                            <Button type="button" size="sm" variant="ghost" title="Archive" disabled={kb.archive.isPending} onClick={() => kb.archive.mutate(a.id, { onError: (e) => setError(errorMessage(e, "Could not archive.")) })}><Archive className="h-3.5 w-3.5" /></Button>
                          </div>
                        )}
                      </div>
                      {expanded && <div className="border-t border-border/60 bg-muted/20 px-4 py-3"><p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">{a.body}</p></div>}
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      )}
      {error && !composing && <p role="alert" className="text-xs text-status-danger">{error}</p>}
    </div>
  );
}

function ArticleComposer({
  organizationId, audienceChoices, initial, saving, error, onSave, onCancel,
}: {
  organizationId: string | null;
  audienceChoices: Props["audienceChoices"];
  initial: KnowledgeArticle | null;
  saving: boolean;
  error: string | null;
  onSave: (input: Parameters<ReturnType<typeof useKnowledgeArticles>["save"]["mutate"]>[0]) => void;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState(initial?.title ?? "");
  const [category, setCategory] = useState(initial?.category ?? "");
  const [body, setBody] = useState(initial?.body ?? "");
  const [audience, setAudience] = useState<KnowledgeAudience>(initial?.audience ?? audienceChoices[0]?.value ?? "organization");
  const valid = title.trim().length > 0 && body.trim().length > 0;
  const submit = (publish: boolean) => onSave({ id: initial?.id ?? null, organizationId, audience, category: category || null, title, body, sort: initial?.sort ?? 0, publish });

  return (
    <form className="space-y-3 rounded-xl border border-primary/30 bg-card p-4 shadow-sm" onSubmit={(e) => { e.preventDefault(); if (valid) submit(true); }}>
      <p className="text-sm font-bold text-foreground">{initial ? "Edit article" : "New article"}</p>
      <div className="grid gap-3 sm:grid-cols-[2fr_1fr]">
        <label className="text-sm"><span className={labelCls}>Title</span><input value={title} onChange={(e) => setTitle(e.target.value)} className={inputCls} maxLength={200} required /></label>
        <label className="text-sm"><span className={labelCls}>Category</span><input value={category} onChange={(e) => setCategory(e.target.value)} className={inputCls} maxLength={60} placeholder="Procedures, Scripts, Policies…" /></label>
      </div>
      <label className="block text-sm"><span className={labelCls}>Article</span><textarea value={body} onChange={(e) => setBody(e.target.value)} className={cn(inputCls, "min-h-48")} maxLength={60000} required /></label>
      {audienceChoices.length > 1 && (
        <label className="block text-sm sm:w-64"><span className={labelCls}>Who sees it</span>
          <select value={audience} onChange={(e) => setAudience(e.target.value as KnowledgeAudience)} className={inputCls}>
            {audienceChoices.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
          </select>
        </label>
      )}
      {error && <p role="alert" className="text-xs text-status-danger">{error}</p>}
      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" size="sm" disabled={!valid || saving}>{saving ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : null} {initial?.publishedAt ? "Save changes" : "Publish"}</Button>
        {!initial?.publishedAt && <Button type="button" size="sm" variant="outline" disabled={!valid || saving} onClick={() => submit(false)}>Save as draft</Button>}
        <Button type="button" size="sm" variant="ghost" onClick={onCancel} disabled={saving}>Cancel</Button>
      </div>
    </form>
  );
}
