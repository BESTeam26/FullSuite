/**
 * The Partner Portal's operational sections, lifted out of the single page
 * they used to live in.
 *
 * Dee, 2026-09-13: "I want a modern multi-page Partner Portal, not a long
 * single page." These are the same components, unchanged in what they show and
 * what they read — they simply have somewhere to be imported from now that
 * each has its own page.
 */
import { useMemo, useRef, useState } from "react";
import { CheckCircle2, CircleDashed, ClipboardList, Download, ExternalLink, FileText, Loader2, MessagesSquare, Search, Upload, Users, Workflow } from "lucide-react";
import {
  useMyPartnerClients, useMyPartnerFiles, useMyPartnerMilestones, useMyPartnerProjectEngines, useMyPartnerProjects,
  useMyPartnerRequirements, useMySharedClientFiles, useUploadMyPartnerFile,
} from "@/lib/data/use-agency-partners";
import { useMyPartnerAgreements } from "@/lib/data/use-partner-agreements";
import { groupPartnerFiles } from "@/lib/portal/portal-files";
import { Link } from "react-router-dom";
import { ENGINE_STAGE_LABEL, enginesFor, milestonesFor } from "@/lib/portal/project-progress";
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
  /* Per-engine progress and published milestones (2026-10-02): asked for only
     once the partner has a build to show them on (rule 14). */
  const hasBuilds = (projects.data ?? []).length > 0;
  const engines = useMyPartnerProjectEngines(hasBuilds);
  const milestones = useMyPartnerMilestones(hasBuilds);
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
              <ProjectDetail
                engines={enginesFor(pr.id, engines.data ?? [])}
                milestones={milestonesFor(pr.id, milestones.data ?? [])}
                failed={engines.isError || milestones.isError} />
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
 * One build's engines, milestones and deliverables — what the doctrine asks
 * Projects & Services to show. Counts and published milestones only; the
 * partner never sees a work unit, who holds it or a QA verdict.
 */
function ProjectDetail({ engines, milestones, failed }: {
  engines: ReturnType<typeof enginesFor>;
  milestones: ReturnType<typeof milestonesFor>;
  failed: boolean;
}) {
  if (failed) {
    return <p className="mt-2 text-[11px] text-status-danger">Progress and milestones could not be loaded. Reload to try again.</p>;
  }
  if (engines.length === 0 && milestones.reached.length === 0 && milestones.upcoming.length === 0) return null;
  return (
    <div className="mt-3 grid gap-3 border-t border-border/60 pt-3 md:grid-cols-2">
      {engines.length > 0 && (
        <div>
          <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Progress by area</p>
          <ul className="space-y-1.5">
            {engines.map((e) => (
              <li key={e.engineKey} className="text-xs">
                <span className="flex items-center justify-between gap-2">
                  <span className="truncate text-foreground">{e.label}</span>
                  <span className="shrink-0 text-[11px] text-muted-foreground">
                    {e.percent === null ? ENGINE_STAGE_LABEL[e.stage] : `${e.percent}% · ${ENGINE_STAGE_LABEL[e.stage]}`}
                  </span>
                </span>
                <span className="mt-0.5 block h-1 overflow-hidden rounded-full bg-muted" role="progressbar"
                  aria-label={`${e.label} progress`} aria-valuenow={e.percent ?? 0} aria-valuemin={0} aria-valuemax={100}>
                  <span className="block h-full bg-primary" style={{ width: `${e.percent ?? 0}%` }} />
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {(milestones.reached.length > 0 || milestones.upcoming.length > 0) && (
        <div>
          <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Milestones</p>
          <ul className="space-y-1 text-xs">
            {milestones.upcoming.slice(0, 3).map((m) => (
              <li key={m.id} className="flex items-start gap-1.5 text-muted-foreground">
                <CircleDashed className="mt-0.5 h-3 w-3 shrink-0" aria-hidden />
                <span className="min-w-0">
                  <span className="text-foreground">{m.label}</span>
                  {m.scheduledAt && <> · planned {formatDate(m.scheduledAt)}</>}
                </span>
              </li>
            ))}
            {milestones.reached.slice(0, 4).map((m) => (
              <li key={m.id} className="flex items-start gap-1.5 text-muted-foreground">
                <CheckCircle2 className="mt-0.5 h-3 w-3 shrink-0 text-status-success" aria-hidden />
                <span className="min-w-0">
                  <span className="text-foreground">{m.label}</span> · reached {formatDate(m.completedAt as string)}
                  {m.linkUrl && (
                    <a href={m.linkUrl} target="_blank" rel="noopener noreferrer"
                      className="ml-1.5 inline-flex items-center gap-0.5 font-semibold text-primary underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                      View deliverable <ExternalLink className="h-2.5 w-2.5" aria-hidden />
                    </a>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
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
  /* Dee, 2026-10-01 doctrine: Files is shared files only — the partner's own
     uploads, what BES shared, reports, client documents, agreements and
     deliverables. Each list comes from a partner-scoped function; the storage
     rule decides every download (20261002006000 / 007000). */
  const files = useMyPartnerFiles();
  const clientFiles = useMySharedClientFiles();
  const agreements = useMyPartnerAgreements();
  const milestones = useMyPartnerMilestones();
  const upload = useUploadMyPartnerFile(partnerGroupId);
  const inputRef = useRef<HTMLInputElement>(null);
  const [failedId, setFailedId] = useState<string | null>(null);
  const groups = groupPartnerFiles(files.data ?? []);
  const signed = (agreements.data ?? []).filter((a) => a.status === "signed");
  const deliverables = (milestones.data ?? []).filter((m) => m.completedAt && m.linkUrl);

  /* One signing request for every thumbnail on the page, not one per file. */
  const previews = useFilePreviews([
    ...(files.data ?? []).map((f) => ({ bucket: "bes-files", path: f.path })),
    ...(clientFiles.data ?? []).map((f) => ({ bucket: "bes-files", path: f.path })),
  ]);

  const open = async (id: string, path: string) => {
    try {
      setFailedId(null);
      const url = await partnerFileUrl(path);
      window.open(url, "_blank", "noopener");
    } catch {
      setFailedId(id);
    }
  };

  const grid = (rows: { id: string; name: string; path: string; mimeType: string | null; sizeBytes: number | null; caption: string }[]) => (
    <FilePreviewGrid>
      {rows.map((f) => (
        <FilePreviewCard key={f.id}
          file={{ id: f.id, name: f.name, mimeType: f.mimeType, sizeBytes: f.sizeBytes, caption: f.caption }}
          url={previews.data?.[`bes-files/${f.path}`]}
          onOpen={() => void open(f.id, f.path)}
          actions={
            <span className="flex items-center justify-between gap-2">
              <span className="truncate text-[11px] text-destructive">{failedId === f.id ? "Could not open — try again" : ""}</span>
              <button type="button" onClick={() => void open(f.id, f.path)}
                className="inline-flex shrink-0 items-center gap-1 text-[11px] font-medium text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                <Download className="h-3 w-3" /> Download
              </button>
            </span>
          } />
      ))}
    </FilePreviewGrid>
  );
  const when = (f: { sharedAt: string | null; createdAt?: string }) => formatDate(f.sharedAt ?? f.createdAt ?? null);

  return (
    <div className="space-y-3">
      <section className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-card p-4">
        <div>
          <h2 className="text-sm font-bold text-foreground">Send BES a file</h2>
          <p className="text-[11px] text-muted-foreground">Documents, logos, exports — BES is told the moment it arrives.</p>
        </div>
        <input ref={inputRef} type="file" className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) upload.mutate(f); e.target.value = ""; }} />
        <button type="button" disabled={upload.isPending} onClick={() => inputRef.current?.click()}
          className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60">
          {upload.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />} Upload a file
        </button>
        {upload.error && <p role="alert" className="w-full text-[11px] text-status-danger">{(upload.error as Error).message}</p>}
      </section>

      <FileSection icon={FileText} title="Shared by BES" query={files} empty="Nothing has been shared yet. Documents BES shares with you appear here."
        count={groups.documents.length}>
        {grid(groups.documents.map((f) => ({ ...f, caption: `Shared ${when(f)}` })))}
      </FileSection>

      {groups.reports.length > 0 && (
        <FileSection icon={FileText} title="Reports" query={files} count={groups.reports.length}>
          {grid(groups.reports.map((f) => ({ ...f, caption: `Shared ${when(f)}` })))}
        </FileSection>
      )}

      <FileSection icon={Users} title="Client documents" query={clientFiles} count={(clientFiles.data ?? []).length}
        empty="Client documents BES shares with you appear here, with the client they belong to.">
        {grid((clientFiles.data ?? []).map((f) => ({ ...f, caption: `${f.clientName} · shared ${formatDate(f.sharedAt)}` })))}
      </FileSection>

      {groups.uploads.length > 0 && (
        <FileSection icon={Upload} title="Your uploads" query={files} count={groups.uploads.length}>
          {grid(groups.uploads.map((f) => ({ ...f, caption: `Uploaded ${formatDate(f.createdAt)}` })))}
        </FileSection>
      )}

      {(signed.length > 0 || deliverables.length > 0) && (
        <section className="grid gap-3 md:grid-cols-2">
          {signed.length > 0 && (
            <div className="rounded-xl border border-border bg-card p-4">
              <h2 className="mb-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">Agreements</h2>
              <ul className="space-y-1 text-xs">
                {signed.slice(0, 5).map((a) => (
                  <li key={a.id} className="flex items-center justify-between gap-2">
                    <span className="truncate text-foreground">{a.title}</span>
                    <span className="shrink-0 text-muted-foreground">signed {formatDate(a.signedAt)}</span>
                  </li>
                ))}
              </ul>
              <Link to="/partner/agreements" className="mt-2 inline-block text-xs font-semibold text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                Open agreements →
              </Link>
            </div>
          )}
          {deliverables.length > 0 && (
            <div className="rounded-xl border border-border bg-card p-4">
              <h2 className="mb-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">Deliverables</h2>
              <ul className="space-y-1 text-xs">
                {deliverables.slice(0, 6).map((m) => (
                  <li key={m.id} className="flex items-center justify-between gap-2">
                    <span className="truncate text-foreground">{m.label}</span>
                    <a href={m.linkUrl as string} target="_blank" rel="noopener noreferrer"
                      className="inline-flex shrink-0 items-center gap-0.5 font-semibold text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                      Open <ExternalLink className="h-2.5 w-2.5" aria-hidden />
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      )}
    </div>
  );
}

/** A titled list that never reads a failed load as "nothing here". */
function FileSection({ icon: Icon, title, query, count, empty, children }: {
  icon: typeof FileText; title: string; query: { isPending: boolean; isError: boolean };
  count: number; empty?: string; children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-border bg-card p-4">
      <h2 className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
        <Icon className="h-3.5 w-3.5" /> {title}{count > 0 && <span className="font-normal normal-case">— {count}</span>}
      </h2>
      {query.isPending ? (
        <p className="py-4 text-center"><Loader2 className="mx-auto h-4 w-4 animate-spin text-muted-foreground" /></p>
      ) : query.isError ? (
        <p role="alert" className="py-4 text-center text-sm text-status-danger">These files could not be loaded. Reload to try again.</p>
      ) : count === 0 ? (
        empty ? <p className="py-4 text-center text-sm text-muted-foreground">{empty}</p> : null
      ) : children}
    </section>
  );
}

