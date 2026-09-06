/**
 * Tools — the company's app launcher: links to the other systems the team
 * uses every day. Everyone in the organization opens them; an administrator
 * keeps the list.
 */
import { useState } from "react";
import { ExternalLink, Loader2, Plus, Trash2, Wrench } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAgency } from "@/lib/agency-context";
import { usePermissions } from "@/lib/auth/use-permission";
import { useHubTools, useOrganizationHub } from "@/lib/data/use-hub";
import type { HubTool } from "@/lib/data/hub";
import { errorMessage } from "@/lib/data/error-message";

const inputCls = "mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary";
const labelCls = "block text-[10px] font-bold uppercase tracking-wider text-muted-foreground";

/** A link the company added; the host is shown so nobody clicks blind. */
function hostOf(url: string): string {
  try { return new URL(url).host; } catch { return url; }
}

export default function CompanyTools() {
  const { activeOrganization } = useAgency();
  const organizationId = activeOrganization?.id ?? null;
  const hub = useOrganizationHub(organizationId);
  const tools = useHubTools(organizationId, hub.isActive("tools"));
  const permissions = usePermissions();
  const canManage = permissions.canAsMember("settings.manage");
  const [editing, setEditing] = useState<HubTool | null>(null);
  const [composing, setComposing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const close = () => { setComposing(false); setEditing(null); setError(null); };

  return (
    <div className="p-6 md:p-8">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight text-foreground">
            <Wrench className="h-6 w-6 text-primary" /> Tools
          </h1>
          <p className="text-sm text-muted-foreground">The systems your team uses every day, one click away.</p>
        </div>
        {canManage && !composing && <Button type="button" size="sm" onClick={() => setComposing(true)}><Plus className="mr-1 h-4 w-4" /> Add a tool</Button>}
      </div>

      {composing && organizationId && (
        <ToolForm
          organizationId={organizationId}
          initial={editing}
          saving={tools.save.isPending}
          error={error}
          onCancel={close}
          onSave={(input) => tools.save.mutate(input, { onSuccess: close, onError: (e) => setError(errorMessage(e, "The tool could not be saved.")) })}
        />
      )}

      {tools.isLoading ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3" aria-busy="true">
          {[0, 1, 2].map((i) => <div key={i} className="h-24 animate-pulse rounded-xl border border-border bg-card" />)}
        </div>
      ) : tools.error ? (
        <p role="alert" className="text-sm text-status-danger">Could not load the tools: {tools.error}</p>
      ) : tools.tools.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-card p-8 text-center">
          <Wrench className="mx-auto h-6 w-6 text-muted-foreground" />
          <p className="mt-2 text-sm font-semibold text-foreground">No tools yet</p>
          <p className="text-xs text-muted-foreground">{canManage ? "Add the links your team opens every day — your phone system, your email, your payment portal." : "Your administrator has not added any yet."}</p>
        </div>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {tools.tools.map((t) => (
            <li key={t.id} className="group relative rounded-xl border border-border bg-card p-4 shadow-sm transition-colors hover:border-primary/40">
              <a
                href={t.url}
                target="_blank"
                rel="noreferrer noopener"
                className="block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded"
              >
                <p className="flex items-center gap-1.5 text-sm font-bold text-foreground group-hover:text-primary">
                  {t.label} <ExternalLink className="h-3 w-3" />
                </p>
                <p className="truncate text-[11px] text-muted-foreground">{hostOf(t.url)}</p>
                {t.note && <p className="mt-1 text-xs text-muted-foreground">{t.note}</p>}
              </a>
              {canManage && (
                <div className="mt-2 flex gap-1">
                  <Button type="button" size="sm" variant="ghost" onClick={() => { setEditing(t); setComposing(true); }}>Edit</Button>
                  <Button type="button" size="sm" variant="ghost" disabled={tools.remove.isPending} onClick={() => tools.remove.mutate(t.id, { onError: (e) => setError(errorMessage(e, "Could not remove.")) })}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      {error && !composing && <p role="alert" className="mt-3 text-xs text-status-danger">{error}</p>}
    </div>
  );
}

function ToolForm({
  organizationId, initial, saving, error, onSave, onCancel,
}: {
  organizationId: string;
  initial: HubTool | null;
  saving: boolean;
  error: string | null;
  onSave: (input: { id: string | null; organizationId: string; label: string; url: string; note: string | null; sort: number }) => void;
  onCancel: () => void;
}) {
  const [label, setLabel] = useState(initial?.label ?? "");
  const [url, setUrl] = useState(initial?.url ?? "");
  const [note, setNote] = useState(initial?.note ?? "");
  const valid = label.trim().length > 0 && /^https?:\/\/.+/i.test(url.trim());

  return (
    <form
      className="mb-5 space-y-3 rounded-xl border border-primary/30 bg-card p-4 shadow-sm"
      onSubmit={(e) => { e.preventDefault(); if (valid) onSave({ id: initial?.id ?? null, organizationId, label, url, note: note || null, sort: initial?.sort ?? 100 }); }}
    >
      <p className="text-sm font-bold text-foreground">{initial ? "Edit tool" : "Add a tool"}</p>
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="text-sm"><span className={labelCls}>Name</span>
          <input value={label} onChange={(e) => setLabel(e.target.value)} className={inputCls} maxLength={60} required placeholder="Phone system" />
        </label>
        <label className="text-sm"><span className={labelCls}>Link</span>
          <input value={url} onChange={(e) => setUrl(e.target.value)} className={inputCls} maxLength={2000} required placeholder="https://…" inputMode="url" />
        </label>
        <label className="text-sm"><span className={labelCls}>Note (optional)</span>
          <input value={note} onChange={(e) => setNote(e.target.value)} className={inputCls} maxLength={200} placeholder="Sign in with your work email" />
        </label>
      </div>
      {url.trim() && !valid && <p className="text-xs text-status-warning">The link must start with http:// or https://.</p>}
      {error && <p role="alert" className="text-xs text-status-danger">{error}</p>}
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={!valid || saving}>{saving ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : null} {initial ? "Save changes" : "Add tool"}</Button>
        <Button type="button" size="sm" variant="ghost" onClick={onCancel} disabled={saving}>Cancel</Button>
      </div>
    </form>
  );
}
