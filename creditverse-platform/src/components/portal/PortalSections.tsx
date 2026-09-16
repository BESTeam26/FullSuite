/**
 * The Partner Portal's operational sections, lifted out of the single page
 * they used to live in.
 *
 * Dee, 2026-09-13: "I want a modern multi-page Partner Portal, not a long
 * single page." These are the same components, unchanged in what they show and
 * what they read — they simply have somewhere to be imported from now that
 * each has its own page.
 */
import { useMemo, useState } from "react";
import { ClipboardList, Download, FileText, Loader2, MessagesSquare, Search, Users, Workflow } from "lucide-react";
import {
  useMyPartnerClients, useMyPartnerProjects, useMyPartnerRequirements, useMySharedFiles,
} from "@/lib/data/use-agency-partners";
import { partnerFileUrl } from "@/lib/data/agency-partners";
import { FilePreviewCard, FilePreviewGrid } from "@/components/common/FilePreviewCard";
import { useFilePreviews } from "@/lib/data/use-file-previews";
import { JOURNEY_LABEL, type JourneyStage } from "@/lib/crm/crm-domain";
import { useChannels } from "@/lib/data/use-channels";
import { ConversationPane } from "@/components/communication/ConversationPane";
import { useAuth } from "@/lib/auth/auth-context";
import { formatDate } from "@/lib/format-date";
import { cn } from "@/lib/utils";
import { PanelState } from "@/components/common/QueryState";
import { hasRows } from "@/lib/ui/query-rows";

/**
 * The partner's BES CRM builds, and what BES is waiting on them for.
 *
 * Both lists come from definer functions gated by `partner_group_of_user()`
 * (0293) — the same boundary as their clients. What a partner sees is the
 * canonical project (rule 2, Dee §40: "show the SAME canonical project"):
 * scope, progress, journey, go-live. What they never see from here: who at
 * BES is building it, the health reason, internal notes, other partners.
 * Requirements are read-only on purpose — BES records the receipt, because
 * "received" is a BES judgement about what arrived (§54), not a self-tick.
 */
export function PortalProjects() {
  const projects = useMyPartnerProjects();
  const requirements = useMyPartnerRequirements();
  const list = projects.data ?? [];
  const asks = requirements.data ?? [];
  /* Hidden only when the answer really is "no builds". A failed request must
     not make the section vanish — that reads as "you have none". */
  if (!projects.isPending && !projects.isError && list.length === 0) return null;

  const engineLabel = (key: string) => key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

  return (
    <section className="rounded-xl border border-border bg-card p-4">
      <h2 className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
        <Workflow className="h-3.5 w-3.5" /> Your BES CRM builds
        {projects.data && <span className="font-normal normal-case">— {list.length}</span>}
      </h2>
      {!hasRows(projects) ? (
        <PanelState query={projects} empty={
          <p className="py-3 text-xs text-muted-foreground">No builds running right now.</p>} />
      ) : (
        <ul className="space-y-2">
          {list.map((pr) => (
            <li key={pr.id} className="rounded-lg border border-border bg-background p-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold text-foreground">{pr.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {pr.businessName ? <>{pr.businessName} · </> : null}
                    {pr.engines.map(engineLabel).join(" · ") || "Scope to be confirmed"}
                  </p>
                </div>
                <span className="rounded-full border border-border bg-muted px-2 py-0.5 text-[10px] font-medium text-foreground">
                  {JOURNEY_LABEL[pr.journey as JourneyStage] ?? pr.journey}
                </span>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                <span className="flex items-center gap-2">
                  <span className="h-1.5 w-32 overflow-hidden rounded-full bg-muted" role="progressbar"
                    aria-valuenow={pr.progress ?? 0} aria-valuemin={0} aria-valuemax={100} aria-label="Progress">
                    <span className="block h-full bg-primary" style={{ width: `${pr.progress ?? 0}%` }} />
                  </span>
                  {pr.progress === null ? "Not started" : `${pr.progress}% complete`}
                </span>
                {pr.wentLiveAt ? <span>Live since {formatDate(pr.wentLiveAt)}</span>
                  : pr.targetGoLive ? <span>Target go-live {formatDate(pr.targetGoLive)}</span> : null}
                {pr.openRequirements > 0 && (
                  <span className="font-medium text-status-warning">
                    {pr.openRequirements} item{pr.openRequirements === 1 ? "" : "s"} BES needs from you
                  </span>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      <h3 className="mb-2 mt-4 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
        <ClipboardList className="h-3.5 w-3.5" /> What BES needs from you
      </h3>
      {!hasRows(requirements) ? (
        <PanelState query={requirements} empty={
          <p className="text-xs text-muted-foreground">Nothing outstanding — BES has everything it asked you for.</p>} />
      ) : (
        <ul className="divide-y divide-border/50 text-xs">
          {asks.map((a) => (
            <li key={a.id} className="py-2">
              <p className="font-medium text-foreground">{a.label}</p>
              <p className="text-muted-foreground">
                {a.projectName} · asked {formatDate(a.requestedOn)}
                {a.detail ? <> — {a.detail}</> : null}
              </p>
            </li>
          ))}
          <li className="pt-2 text-muted-foreground">
            Send these to your BES contact — in the conversation below or by email — and BES will mark them received.
          </li>
        </ul>
      )}
    </section>
  );
}


/**
 * The partner's own clients — the canonical BES records, not a copy.
 *
 * What each row shows is exactly what `my_partner_clients()` returns:
 * partner-safe columns. No BES agent names, no internal notes, no other
 * partner's client, ever — the database function is the boundary, and this
 * component could not widen it if it tried (rule 1).
 */
export function PortalClients() {
  const [includeClosed, setIncludeClosed] = useState(false);
  const [search, setSearch] = useState("");
  const clients = useMyPartnerClients(includeClosed);

  const rows = useMemo(() => {
    const all = clients.data ?? [];
    const needle = search.trim().toLowerCase();
    if (!needle) return all;
    return all.filter((c) =>
      c.name.toLowerCase().includes(needle) || c.email.toLowerCase().includes(needle));
  }, [clients.data, search]);

  return (
    <section className="rounded-xl border border-border bg-card p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
          <Users className="h-3.5 w-3.5" /> Your clients
          {clients.data && <span className="font-normal normal-case">— {clients.data.length}</span>}
        </h2>
        <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <input type="checkbox" checked={includeClosed}
            onChange={(e) => setIncludeClosed(e.target.checked)} />
          Include closed files
        </label>
      </div>

      {!hasRows(clients) ? (
        <PanelState query={clients} empty={
          <p className="py-4 text-center text-sm text-muted-foreground">
            No client files yet. When BES opens files for your clients, their progress appears here.
          </p>} />
      ) : (
        <>
          <div className="relative mb-2 max-w-xs">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <input
              value={search} onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name or email"
              className="w-full rounded-lg border border-border bg-background py-1.5 pl-8 pr-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-[11px] uppercase tracking-wider text-muted-foreground">
                <tr className="border-b border-border">
                  <th className="py-2 pr-3 font-medium">Client</th>
                  <th className="py-2 pr-3 font-medium">Status</th>
                  <th className="py-2 pr-3 font-medium">Round</th>
                  <th className="py-2 pr-3 font-medium">Items in work</th>
                  <th className="py-2 font-medium">Last activity</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((c) => (
                  <tr key={c.publicId} className="border-b border-border/50 align-top">
                    <td className="py-2 pr-3">
                      <span className="block text-foreground">{c.name}</span>
                      <span className="block text-[11px] text-muted-foreground">{c.email}</span>
                    </td>
                    <td className="py-2 pr-3">
                      <span className={cn(
                        "inline-block rounded-full border px-2 py-0.5 text-[11px] font-medium",
                        c.lifecycle === "archived"
                          ? "border-border bg-muted text-muted-foreground"
                          : "border-primary/30 bg-primary/5 text-foreground",
                      )}>
                        {c.status}
                      </span>
                    </td>
                    <td className="py-2 pr-3 text-muted-foreground">{c.round}</td>
                    <td className="py-2 pr-3 text-muted-foreground">{c.openItems}</td>
                    <td className="py-2 text-muted-foreground">{formatDate(c.lastActivityAt)}</td>
                  </tr>
                ))}
                {rows.length === 0 && (
                  <tr><td colSpan={5} className="py-4 text-center text-sm text-muted-foreground">
                    No client matches that search.
                  </td></tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}


/**
 * Only what BES deliberately shared (0146): the row is readable because it is
 * shared, and the download link works because the storage policy follows the
 * row. An unshared file is not a hidden row here — it never arrives at all.
 */
export function PortalFiles({ partnerGroupId }: { partnerGroupId: string }) {
  const files = useMySharedFiles(partnerGroupId);
  const [failedId, setFailedId] = useState<string | null>(null);
  /* One signing request for the whole page of thumbnails, not one per file. */
  const previews = useFilePreviews(
    (files.data ?? []).map((f) => ({ bucket: "bes-files", path: f.path })),
  );

  const open = async (id: string, path: string) => {
    try {
      setFailedId(null);
      const url = await partnerFileUrl(path);
      window.open(url, "_blank", "noopener");
    } catch {
      setFailedId(id);
    }
  };

  return (
    <section className="rounded-xl border border-border bg-card p-4">
      <h2 className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
        <FileText className="h-3.5 w-3.5" /> Shared with you
      </h2>
      {!hasRows(files) ? (
        <PanelState query={files} empty={
          <p className="py-4 text-center text-sm text-muted-foreground">
            Nothing has been shared yet. Documents BES shares with you will appear here.
          </p>} />
      ) : (
        <FilePreviewGrid>
          {(files.data ?? []).map((f) => (
            <FilePreviewCard
              key={f.id}
              file={{
                id: f.id, name: f.name, mimeType: f.mimeType, sizeBytes: f.sizeBytes,
                caption: f.sharedAt ? `Shared ${formatDate(f.sharedAt)}` : formatDate(f.createdAt),
              }}
              url={previews.data?.[`bes-files/${f.path}`]}
              onOpen={() => void open(f.id, f.path)}
              actions={
                <span className="flex items-center justify-between gap-2">
                  <span className="truncate text-[11px] text-destructive">
                    {failedId === f.id ? "Could not open — try again" : ""}
                  </span>
                  <button type="button" onClick={() => void open(f.id, f.path)}
                    className="inline-flex shrink-0 items-center gap-1 text-[11px] font-medium text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                    <Download className="h-3 w-3" /> Download
                  </button>
                </span>
              }
            />
          ))}
        </FilePreviewGrid>
      )}
    </section>
  );
}

