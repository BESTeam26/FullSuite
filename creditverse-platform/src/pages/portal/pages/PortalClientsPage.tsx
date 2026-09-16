/**
 * The partner's clients — the page the portal exists for.
 *
 * Dee, 2026-09-13: "Clients should be one of the most important pages in the
 * Partner Portal."
 *
 * The summary strip and the table are the SAME predicate applied twice
 * (`bucketOf`), so "3 waiting" always has three rows under it. Clicking a tile
 * narrows to exactly what it counted.
 *
 * Every column here is on the partner-safe projection by name. Internal notes,
 * who at BES is assigned, raw SLA and the audit trail are not omitted by a
 * filter — they never reach the browser.
 */
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { AlertCircle, ArrowRight, Loader2, Search, Users } from "lucide-react";
import { Input } from "@/components/ui/input";
import { OpsSelect } from "@/components/ui/ops-select";
import { useMyPartnerClients } from "@/lib/data/use-agency-partners";
import { formatDate } from "@/lib/format-date";
import { cn } from "@/lib/utils";
import { PageLoadError } from "@/components/common/QueryState";
import {
  BUCKET_LABEL, bucketCounts, filterClients, optionsIn,
  type ClientBucket, type ClientFilters,
} from "@/lib/portal/client-filters";

const ALL = "__all__";

const BUCKET_TONE: Record<ClientBucket, string> = {
  active: "text-status-success",
  waiting: "text-amber-700",
  action: "text-red-700",
  closed: "text-muted-foreground",
};

export function PortalClientsPage() {
  const [filters, setFilters] = useState<ClientFilters>({});
  /* Closed files are fetched so the strip can count them; the default bucket
     filter keeps them out of the table until somebody asks. */
  const clients = useMyPartnerClients(true);

  const all = useMemo(() => clients.data ?? [], [clients.data]);
  const counts = useMemo(() => bucketCounts(all), [all]);
  const rows = useMemo(
    () => filterClients(all, filters.bucket ? filters : { ...filters, bucket: null }),
    [all, filters],
  );
  const set = (patch: Partial<ClientFilters>) => setFilters((f) => ({ ...f, ...patch }));
  const pick = (v: string) => (v === ALL ? null : v);
  const narrowed = !!(filters.bucket || filters.status || filters.round || filters.department || filters.actionNeeded);

  if (clients.isLoading) {
    return <p className="py-10 text-center"><Loader2 className="mx-auto h-5 w-5 animate-spin text-muted-foreground" /></p>;
  }
  /* Before the filter chips, because a failed load has no counts to filter and
     "No clients yet" would be a claim about their account, not about the request. */
  if (clients.isError) return <PageLoadError what="Your clients" />;

  return (
    <div className="space-y-4">
      <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
        {(Object.keys(BUCKET_LABEL) as ClientBucket[]).map((b) => {
          const active = filters.bucket === b;
          return (
            <button
              key={b}
              type="button"
              onClick={() => set({ bucket: active ? null : b })}
              aria-pressed={active}
              className={cn(
                "rounded-xl border bg-card px-3.5 py-3 text-left transition-colors",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                active ? "border-primary bg-primary/5" : "border-border hover:border-primary/50 hover:bg-muted/40",
              )}
            >
              <span className="block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                {BUCKET_LABEL[b]}
              </span>
              <span className={cn("mt-1 block text-2xl font-bold tabular-nums",
                counts[b] === 0 ? "text-muted-foreground" : BUCKET_TONE[b])}>
                {counts[b]}
              </span>
            </button>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[200px] flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={filters.search ?? ""}
            onChange={(e) => set({ search: e.target.value })}
            placeholder="Name, reference or what is being done"
            aria-label="Search clients"
            className="h-8 pl-8 text-xs"
          />
        </div>
        <OpsSelect aria-label="Credit status" size="sm" value={filters.status ?? ALL}
          onValueChange={(v) => set({ status: pick(v) })}
          options={[{ value: ALL, label: "Every status" },
            ...optionsIn(all, "status").map((s) => ({ value: s, label: s }))]} />
        <OpsSelect aria-label="Round" size="sm" value={filters.round ?? ALL}
          onValueChange={(v) => set({ round: pick(v) })}
          options={[{ value: ALL, label: "Every round" },
            ...optionsIn(all, "round").map((s) => ({ value: s, label: s }))]} />
        <OpsSelect aria-label="Current department" size="sm" value={filters.department ?? ALL}
          onValueChange={(v) => set({ department: pick(v) })}
          options={[{ value: ALL, label: "Every department" },
            ...optionsIn(all, "currentDepartment").map((s) => ({ value: s, label: s }))]} />
        <label className="flex items-center gap-1.5 text-xs text-foreground">
          <input type="checkbox" checked={filters.actionNeeded ?? false}
            onChange={(e) => set({ actionNeeded: e.target.checked })}
            className="h-3.5 w-3.5 rounded border-border text-primary focus:ring-primary" />
          Action needed
        </label>
        {narrowed && (
          <button type="button" onClick={() => setFilters({ search: filters.search })}
            className="rounded-lg px-2 py-1 text-xs font-medium text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            Clear
          </button>
        )}
      </div>

      {rows.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-muted/20 px-6 py-10 text-center">
          <Users className="mx-auto mb-2 h-5 w-5 text-muted-foreground" />
          <p className="text-sm font-semibold text-foreground">
            {all.length === 0 ? "No clients yet" : "Nothing matches that"}
          </p>
          <p className="mx-auto mt-1 max-w-md text-xs text-muted-foreground">
            {all.length === 0
              ? "Clients BES is working for you appear here as soon as they are onboarded."
              : "Try a different filter, or clear them to see everyone."}
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border bg-card">
          <table className="w-full min-w-[48rem] text-left text-xs">
            <thead>
              <tr className="border-b border-border">
                <th className="px-3 py-2 font-semibold text-muted-foreground">Client</th>
                <th className="px-3 py-2 font-semibold text-muted-foreground">Credit status</th>
                <th className="px-3 py-2 font-semibold text-muted-foreground">Round</th>
                <th className="px-3 py-2 font-semibold text-muted-foreground">Department</th>
                <th className="px-3 py-2 font-semibold text-muted-foreground">Current work</th>
                <th className="px-3 py-2 font-semibold text-muted-foreground">Last update</th>
                <th className="px-3 py-2 font-semibold text-muted-foreground">Action needed</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((c) => (
                <tr key={c.publicId} className="border-b border-border/50 transition-colors last:border-b-0 hover:bg-muted/40">
                  <td className="px-3 py-2">
                    <Link to={`/partner/clients/${c.publicId}`}
                      className="font-medium text-foreground hover:text-primary hover:underline">
                      {c.name}
                    </Link>
                    <span className="block text-[11px] text-muted-foreground">{c.publicId}</span>
                  </td>
                  <td className="px-3 py-2 text-foreground">{c.status}</td>
                  <td className="px-3 py-2 text-muted-foreground">{c.round}</td>
                  <td className="px-3 py-2 text-muted-foreground">{c.currentDepartment ?? "—"}</td>
                  <td className="px-3 py-2">
                    <span className="text-muted-foreground">{c.currentWork ?? "—"}</span>
                    {c.waiting && (
                      <span className="ml-1.5 rounded border border-amber-500/40 bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-medium text-amber-900">
                        Waiting
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">
                    {c.lastActivityAt ? formatDate(c.lastActivityAt.slice(0, 10)) : "—"}
                  </td>
                  <td className="px-3 py-2">
                    {c.actionNeeded ? (
                      <Link to={`/partner/clients/${c.publicId}`}
                        className="inline-flex items-center gap-1 rounded border border-red-500/40 bg-red-500/10 px-1.5 py-0.5 text-[11px] font-semibold text-red-900 hover:bg-red-500/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                        <AlertCircle className="h-3 w-3" />
                        {c.actionTitle ?? "Review"}
                        <ArrowRight className="h-3 w-3" />
                      </Link>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
