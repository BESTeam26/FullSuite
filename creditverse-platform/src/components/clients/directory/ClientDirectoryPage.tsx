/**
 * All Clients — the organization's master client directory.
 *
 * Dee, 2026-09-06: "Think GHL Contacts, but purpose-built as your canonical BES
 * client database. Clients should be a sortable/filterable list, not a
 * pipeline. The canonical Clients page should never look like DisputeFox."
 *
 * So there is no round here, no processing status, no dispute stage. Those
 * belong to CreditOps → Credit Cases, which asks a different question. This
 * page answers only: who are our customers, what do they buy from us, who owns
 * the relationship, and when did we last touch them.
 */
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Search, Users, Plus, Filter, ArrowUpDown, AlertTriangle } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { OpsSelect } from "@/components/ui/ops-select";
import { DataSourceBadge } from "@/components/dashboard/DataSourceBadge";
import { formatDate } from "@/lib/format-date";
import { useClientDirectory } from "@/lib/data/use-clients";
import { NewClientDialog } from "@/components/clients/NewClientDialog";
import { ServiceBadge } from "@/components/clients/directory/ServiceBadge";
import {
  EMPTY_FILTERS,
  SERVICE_KEYS,
  SERVICE_LABELS,
  assigneeOptions,
  enrolledServices,
  matchesFilters,
  sortRows,
  type ClientDirectoryFilters,
  type ClientSortKey,
  type ServiceKey,
} from "@/lib/clients/client-directory-domain";

const STATUS_TONE: Record<string, string> = {
  active: "border-emerald-600/30 bg-emerald-500/10 text-status-success",
  paused: "border-amber-600/30 bg-amber-500/10 text-status-warning",
  archived: "border-border bg-muted text-muted-foreground",
};

const dateLabel = (iso: string | null) => (iso ? formatDate(iso) : "—");

export function ClientDirectoryPage() {
  const navigate = useNavigate();
  const directory = useClientDirectory();
  const [filters, setFilters] = useState<ClientDirectoryFilters>(EMPTY_FILTERS);
  const [sort, setSort] = useState<{ key: ClientSortKey; direction: "asc" | "desc" }>({
    key: "lastActivity",
    direction: "desc",
  });
  const [creating, setCreating] = useState(false);

  const all = useMemo(() => directory.data ?? [], [directory.data]);
  const rows = useMemo(
    () => sortRows(all.filter((r) => matchesFilters(r, filters)), sort.key, sort.direction),
    [all, filters, sort],
  );
  const assignees = useMemo(() => assigneeOptions(all), [all]);
  const set = <K extends keyof ClientDirectoryFilters>(key: K, value: ClientDirectoryFilters[K]) =>
    setFilters((f) => ({ ...f, [key]: value }));
  const toggleService = (s: ServiceKey) =>
    setFilters((f) => ({
      ...f,
      services: f.services.includes(s) ? f.services.filter((x) => x !== s) : [...f.services, s],
    }));

  const open = (id: string) => navigate(`/app/clients/${id}`);
  const needsReviewCount = all.filter((r) => r.needsReview).length;

  return (
    <div className="p-6 md:p-8">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight text-foreground">
            <Users className="h-6 w-6 text-primary" /> Clients
          </h1>
          <p className="text-sm text-muted-foreground">
            Everyone this organization serves. Open a client to see who they are and what they buy —
            the credit and funding work lives in CreditOps and FundingOps.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <DataSourceBadge source="live" />
          <Button type="button" size="sm" onClick={() => setCreating(true)}>
            <Plus className="mr-1 h-4 w-4" /> New client
          </Button>
        </div>
      </div>

      {/* ── Filters ─────────────────────────────────────────────────────── */}
      <div className="mb-4 flex flex-wrap items-center gap-2 rounded-2xl border border-border bg-card p-3">
        <span className="flex items-center gap-1.5 pl-1 pr-1 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
          <Filter className="h-3.5 w-3.5" /> Filter
        </span>
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={filters.q}
            onChange={(e) => set("q", e.target.value)}
            placeholder="Name, email, phone, business, CN- code…"
            className="w-full pl-9 sm:w-72"
            aria-label="Search clients"
          />
        </div>
        <div className="flex items-center gap-1.5" role="group" aria-label="Service filter">
          {SERVICE_KEYS.map((s) => {
            const on = filters.services.includes(s);
            return (
              <button
                key={s}
                type="button"
                aria-pressed={on}
                onClick={() => toggleService(s)}
                className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
                  on
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-background text-foreground hover:border-primary/40 hover:bg-primary/10"
                }`}
              >
                {SERVICE_LABELS[s]}
              </button>
            );
          })}
        </div>
        <OpsSelect
          value={filters.status}
          onValueChange={(v) => set("status", v as ClientDirectoryFilters["status"])}
          options={[
            { value: "active", label: "Active" },
            { value: "all", label: "All statuses" },
            { value: "inactive", label: "Not active" },
          ]}
          aria-label="Status filter"
        />
        <OpsSelect
          value={filters.business}
          onValueChange={(v) => set("business", v as ClientDirectoryFilters["business"])}
          options={[
            { value: "any", label: "Any business" },
            { value: "with", label: "Has a business" },
            { value: "without", label: "No business" },
          ]}
          aria-label="Business filter"
        />
        <OpsSelect
          value={filters.assigned ?? "__any"}
          onValueChange={(v) => set("assigned", v === "__any" ? null : v)}
          options={[{ value: "__any", label: "Anyone assigned" }, ...assignees.map((a) => ({ value: a, label: a }))]}
          aria-label="Assignment filter"
        />
        <OpsSelect
          value={`${sort.key}:${sort.direction}`}
          onValueChange={(v) => {
            const [key, direction] = v.split(":") as [ClientSortKey, "asc" | "desc"];
            setSort({ key, direction });
          }}
          options={[
            { value: "lastActivity:desc", label: "Last activity — newest" },
            { value: "lastActivity:asc", label: "Last activity — oldest" },
            { value: "name:asc", label: "Name A–Z" },
            { value: "name:desc", label: "Name Z–A" },
            { value: "createdAt:desc", label: "Newest client" },
            { value: "createdAt:asc", label: "Oldest client" },
          ]}
          aria-label="Sort"
        />
        {needsReviewCount > 0 && (
          <button
            type="button"
            aria-pressed={filters.needsReviewOnly}
            onClick={() => set("needsReviewOnly", !filters.needsReviewOnly)}
            className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
              filters.needsReviewOnly
                ? "border-amber-600/50 bg-amber-500/20 text-status-warning"
                : "border-border bg-background text-foreground hover:bg-amber-500/10"
            }`}
          >
            <AlertTriangle className="h-3.5 w-3.5" /> Needs review ({needsReviewCount})
          </button>
        )}
      </div>

      {/* ── The directory ───────────────────────────────────────────────── */}
      <div className="overflow-x-auto rounded-2xl border border-border bg-card">
        {directory.isLoading ? (
          <p className="p-6 text-sm text-muted-foreground">Loading clients…</p>
        ) : directory.error ? (
          <p className="p-6 text-sm text-status-danger">
            Could not load clients: {(directory.error as Error).message}
          </p>
        ) : rows.length === 0 ? (
          <p className="p-6 text-sm text-muted-foreground">
            {all.length === 0
              ? "No clients yet. Use New client to add the first one."
              : "No clients match these filters."}
          </p>
        ) : (
          <>
            {/* Cards below md; the table's seven columns cannot fit a phone. */}
            <ul className="divide-y divide-border/60 md:hidden">
              {rows.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => open(c.id)}
                    className="flex w-full flex-col gap-1.5 px-4 py-3 text-left transition-colors hover:bg-muted/40 focus-visible:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary"
                  >
                    <span className="flex items-center justify-between gap-2">
                      <span className="font-medium text-foreground">{c.name}</span>
                      <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${STATUS_TONE[c.status]}`}>
                        {c.status === "archived" ? "Not active" : c.status}
                      </span>
                    </span>
                    <span className="text-xs text-muted-foreground">{c.email}</span>
                    <span className="flex flex-wrap gap-1.5">
                      {enrolledServices(c).map((s) => (
                        <ServiceBadge key={s.service} service={s} />
                      ))}
                      {enrolledServices(c).length === 0 && (
                        <span className="text-[11px] text-muted-foreground">No services yet</span>
                      )}
                    </span>
                    <span className="text-[11px] text-muted-foreground">
                      {c.businesses.map((b) => b.name).join(", ") || "No business"} ·{" "}
                      {c.assigned.join(", ") || "Unassigned"} · {dateLabel(c.lastActivity)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
            <table className="hidden w-full text-sm md:table">
              <thead className="bg-muted/40 text-left text-[11px] uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="px-4 py-2.5">
                    <span className="inline-flex items-center gap-1">
                      Client <ArrowUpDown className="h-3 w-3 opacity-50" />
                    </span>
                  </th>
                  <th className="px-4 py-2.5">Contact</th>
                  <th className="px-4 py-2.5">Services</th>
                  <th className="px-4 py-2.5">Business</th>
                  <th className="px-4 py-2.5">Assigned</th>
                  <th className="px-4 py-2.5">Status</th>
                  <th className="px-4 py-2.5">Last activity</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((c) => (
                  <tr
                    key={c.id}
                    onClick={() => open(c.id)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") open(c.id);
                    }}
                    tabIndex={0}
                    className="cursor-pointer border-t border-border/60 transition-colors hover:bg-muted/40 focus-visible:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary"
                  >
                    <td className="px-4 py-3">
                      <p className="flex items-center gap-1.5 font-medium text-foreground">
                        {c.name}
                        {c.needsReview && (
                          <AlertTriangle
                            className="h-3.5 w-3.5 text-status-warning"
                            aria-label="Possible duplicate — needs review"
                          />
                        )}
                      </p>
                      <p className="font-mono text-[10px] text-muted-foreground">{c.publicId}</p>
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-foreground">{c.email}</p>
                      <p className="text-xs text-muted-foreground">{c.phone ?? "No phone"}</p>
                    </td>
                    <td className="px-4 py-3">
                      <span className="flex flex-wrap gap-1.5">
                        {enrolledServices(c).map((s) => (
                          <ServiceBadge key={s.service} service={s} />
                        ))}
                        {enrolledServices(c).length === 0 && (
                          <span className="text-xs text-muted-foreground">None yet</span>
                        )}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-foreground">
                      {c.businesses.length === 0 ? (
                        <span className="text-muted-foreground">—</span>
                      ) : (
                        c.businesses.map((b) => b.name).join(", ")
                      )}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {c.assigned.join(", ") || "Unassigned"}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${STATUS_TONE[c.status]}`}>
                        {c.status === "archived" ? "Not active" : c.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{dateLabel(c.lastActivity)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </div>
      <p className="mt-2 text-[11px] text-muted-foreground">
        Showing {rows.length} of {all.length} client{all.length === 1 ? "" : "s"}.
      </p>
      <NewClientDialog open={creating} onOpenChange={setCreating} />
    </div>
  );
}
