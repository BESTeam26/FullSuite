/**
 * One client, partner-safe.
 *
 * Dee, 2026-09-13, listing what this page may show and what it must never:
 * current department, current work, status, round, action needed, a
 * partner-safe timeline and shared files — and never internal BES notes, the
 * internal assignee, raw SLA, the audit trail or credentials.
 *
 * None of those are filtered out in this component. The three functions behind
 * it do not select them, and the timeline reads only activity BES deliberately
 * marked `shared_with_partner`. A note written for an agent is not hidden
 * here; it never arrives.
 *
 * If the partner owes an action on this client, it leads — that is the whole
 * reason somebody opens this page from a red badge.
 */
import { Link, useParams } from "react-router-dom";
import { AlertCircle, ArrowLeft, Download, Loader2 } from "lucide-react";
import { FilePreviewCard, FilePreviewGrid } from "@/components/common/FilePreviewCard";
import { useFilePreviews } from "@/lib/data/use-file-previews";
import { useState } from "react";
import { partnerFileUrl } from "@/lib/data/agency-partners";
import { formatDate, formatDateTime } from "@/lib/format-date";
import { cn } from "@/lib/utils";
import {
  usePortalClient, usePortalClientFiles, usePortalClientTimeline,
} from "@/lib/data/use-portal-client";

const Fact = ({ label, value }: { label: string; value: React.ReactNode }) => (
  <div>
    <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{label}</p>
    <p className="mt-0.5 text-sm text-foreground">{value || <span className="text-muted-foreground">—</span>}</p>
  </div>
);

const Panel = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <section className="rounded-xl border border-border bg-card p-4">
    <h2 className="mb-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">{title}</h2>
    {children}
  </section>
);

export function PortalClientDetail() {
  const { publicId } = useParams<{ publicId: string }>();
  const client = usePortalClient(publicId);
  const timeline = usePortalClientTimeline(publicId);
  const files = usePortalClientFiles(publicId);
  const [failedId, setFailedId] = useState<string | null>(null);
  /* Partner files all live in the same bucket the download helper reads. */
  const previews = useFilePreviews(
    (files.data ?? []).map((f) => ({ bucket: "bes-files", path: f.path })),
  );

  const open = async (id: string, path: string) => {
    try {
      setFailedId(null);
      window.open(await partnerFileUrl(path), "_blank", "noopener");
    } catch {
      setFailedId(id);
    }
  };

  if (client.isLoading) {
    return <p className="py-10 text-center"><Loader2 className="mx-auto h-5 w-5 animate-spin text-muted-foreground" /></p>;
  }

  if (!client.data) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-muted/20 px-6 py-10 text-center">
        <p className="text-sm font-semibold text-foreground">That client is not on your account</p>
        <p className="mx-auto mt-1 max-w-md text-xs text-muted-foreground">
          It may have been archived, or the link may be wrong.
        </p>
        <Link to="/partner/clients" className="mt-3 inline-block text-xs font-medium text-primary hover:underline">
          Back to clients
        </Link>
      </div>
    );
  }

  const c = client.data;

  return (
    <div className="space-y-4">
      <Link to="/partner/clients"
        className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        <ArrowLeft className="h-3.5 w-3.5" /> All clients
      </Link>

      {c.actionNeeded && (
        <section className="rounded-xl border-2 border-red-500/40 bg-red-500/5 p-4">
          <h2 className="flex items-center gap-2 text-sm font-bold text-red-900">
            <AlertCircle className="h-4 w-4 shrink-0" /> {c.actionTitle ?? "Action needed"}
          </h2>
          {c.actionDetail && <p className="mt-1 text-sm text-foreground">{c.actionDetail}</p>}
          <Link to="/partner/actions"
            className="mt-3 inline-flex items-center rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            Review
          </Link>
        </section>
      )}

      <section className="rounded-xl border border-border bg-card p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-lg font-bold text-foreground">{c.name}</h2>
            <p className="text-[11px] text-muted-foreground">{c.publicId}</p>
          </div>
          {c.waiting && (
            <span className="shrink-0 rounded border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-[11px] font-medium text-amber-900">
              Waiting
            </span>
          )}
        </div>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Fact label="Credit status" value={c.status} />
          <Fact label="Round" value={c.round} />
          <Fact label="Current department" value={c.currentDepartment} />
          <Fact label="Current work" value={c.currentWork} />
          <Fact label="Client since" value={c.createdAt ? formatDate(c.createdAt.slice(0, 10)) : null} />
          <Fact label="Last update" value={c.lastActivityAt ? formatDate(c.lastActivityAt.slice(0, 10)) : null} />
          <Fact label="Last processed" value={c.processedOn ? formatDate(c.processedOn) : null} />
          <Fact label="Open items" value={String(c.openItems)} />
        </div>
      </section>

      <Panel title="Updates">
        {timeline.isLoading ? (
          <p className="py-3"><Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /></p>
        ) : (timeline.data ?? []).length === 0 ? (
          <p className="py-2 text-sm text-muted-foreground">
            No updates have been shared yet. What BES shares about this client appears here.
          </p>
        ) : (
          <ul className="divide-y divide-border/50">
            {(timeline.data ?? []).map((e) => (
              <li key={e.id} className="py-2">
                <p className="text-sm font-medium text-foreground">{e.action}</p>
                {e.detail && <p className="mt-0.5 whitespace-pre-wrap text-xs leading-relaxed text-muted-foreground">{e.detail}</p>}
                <p className="mt-0.5 text-[11px] text-muted-foreground">
                  {formatDateTime(e.happenedAt)}{e.actorName ? ` · ${e.actorName}` : ""}
                </p>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <Panel title="Shared documents">
        {(files.data ?? []).length === 0 ? (
          <p className="py-2 text-sm text-muted-foreground">
            Nothing has been shared for this client yet.
          </p>
        ) : (
          /* Previews rather than filenames, for the same reason as the
             internal document tab: a partner scanning "Screenshot 2026-09-08"
             five times over learns nothing. */
          <FilePreviewGrid>
            {(files.data ?? []).map((f) => (
              <FilePreviewCard
                key={f.id}
                file={{
                  id: f.id, name: f.name, mimeType: f.mimeType, sizeBytes: f.sizeBytes,
                  caption: f.sharedAt ? `Shared ${formatDate(f.sharedAt.slice(0, 10))}` : null,
                }}
                url={previews.data?.[`bes-files/${f.path}`]}
                onOpen={() => void open(f.id, f.path)}
                actions={
                  <span className="flex items-center justify-between gap-2">
                    <span className="truncate text-[11px] text-muted-foreground">
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
      </Panel>
    </div>
  );
}
