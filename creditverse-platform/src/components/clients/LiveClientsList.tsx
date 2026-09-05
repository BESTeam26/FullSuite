/**
 * The organization's real CreditOps clients (RLS-scoped, the same rows the
 * Workspace's Main Client List shows), each opening the client profile. The
 * sample list stays in demo mode only.
 */
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Search, Users } from "lucide-react";
import { Input } from "@/components/ui/input";
import { fetchFulfillmentClients } from "@/lib/data/fulfillment-clients";
import { useAgency } from "@/lib/agency-context";
import { DataSourceBadge } from "@/components/dashboard/DataSourceBadge";
import { Button } from "@/components/ui/button";
import { OpsSelect } from "@/components/ui/ops-select";
import { Plus } from "lucide-react";
import { useFulfillment } from "@/lib/data/use-fulfillment";
import { partnerForOrganization } from "@/lib/data/partners";
import { CreditOpsStoreProvider } from "@/lib/fulfillment/creditops-client-store";
import { AddClientModal } from "@/components/dashboard/fulfillment/AddClientModal";
import { LIFECYCLE_LABELS, isActiveClient, type ClientLifecycle } from "@/lib/fulfillment/fulfillment-client-domain";

export function LiveClientsList() {
  return (
    <CreditOpsStoreProvider>
      <LiveClientsListInner />
    </CreditOpsStoreProvider>
  );
}

function LiveClientsListInner() {
  const navigate = useNavigate();
  const agency = useAgency();
  const fulfillment = useFulfillment();
  const [q, setQ] = useState("");
  const [lifecycleView, setLifecycleView] = useState<"active" | "all" | "archived">("active");
  const [adding, setAdding] = useState(false);
  const clients = useQuery({ queryKey: ["creditops", "clients"], queryFn: fetchFulfillmentClients, staleTime: 15_000 });
  const orgId = agency.viewMode === "subaccount" ? agency.activeOrganization?.id ?? null : null;

  const rows = useMemo(() => {
    const list = (clients.data ?? [])
      .filter((c) => !orgId || c.organizationId === orgId)
      .filter((c) => (lifecycleView === "all" ? true : lifecycleView === "active" ? isActiveClient(c) : !isActiveClient(c)));
    const s = q.trim().toLowerCase();
    return s ? list.filter((c) => c.name.toLowerCase().includes(s) || c.email.toLowerCase().includes(s)) : list;
  }, [clients.data, orgId, q, lifecycleView]);
  const partner = agency.activeOrganization ? partnerForOrganization("creditOps", agency.activeOrganization, fulfillment.engagements) : undefined;

  return (
    <div className="p-6 md:p-8">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight text-foreground"><Users className="h-6 w-6 text-primary" /> Clients</h1>
          <p className="text-sm text-muted-foreground">Open a client to work their profile — report, disputes, letters, analysis.</p>
        </div>
        <div className="flex items-center gap-2">
          <DataSourceBadge source="live" />
          <OpsSelect
            value={lifecycleView}
            onValueChange={(v) => setLifecycleView(v as "active" | "all" | "archived")}
            options={[{ value: "active", label: "Active clients" }, { value: "all", label: "All clients" }, { value: "archived", label: "Not active" }]}
            aria-label="Lifecycle filter"
          />
          {partner && (
            <Button type="button" size="sm" onClick={() => setAdding(true)}>
              <Plus className="mr-1 h-4 w-4" /> New client
            </Button>
          )}
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search clients…" className="w-64 pl-9" aria-label="Search clients" />
          </div>
        </div>
      </div>
      <div className="overflow-x-auto rounded-2xl border border-border bg-card">
        {clients.isLoading ? (
          <p className="p-6 text-sm text-muted-foreground">Loading clients…</p>
        ) : clients.error ? (
          <p className="p-6 text-sm text-status-danger">Could not load clients: {(clients.error as Error).message}</p>
        ) : rows.length === 0 ? (
          <p className="p-6 text-sm text-muted-foreground">{q ? "No clients match." : lifecycleView === "active" ? "No active clients yet. Use New client to add one." : "No clients in this view."}</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-left text-[11px] uppercase tracking-wider text-muted-foreground">
              <tr><th className="px-4 py-2.5">Client</th><th className="px-4 py-2.5">Lifecycle</th><th className="px-4 py-2.5">Processing status</th><th className="px-4 py-2.5">Round</th><th className="px-4 py-2.5">Assigned</th><th className="px-4 py-2.5">Last activity</th></tr>
            </thead>
            <tbody>
              {rows.map((c) => (
                <tr
                  key={c.id}
                  onClick={() => navigate(`/app/clients/${c.id}`)}
                  onKeyDown={(e) => { if (e.key === "Enter") navigate(`/app/clients/${c.id}`); }}
                  tabIndex={0}
                  className="cursor-pointer border-t border-border/60 transition-colors hover:bg-muted/40 focus-visible:bg-muted/40 focus-visible:outline-none"
                >
                  <td className="px-4 py-3"><p className="font-medium text-foreground">{c.name}</p><p className="text-xs text-muted-foreground">{c.email}</p></td>
                  <td className="px-4 py-3 text-foreground">{LIFECYCLE_LABELS[(c.lifecycle ?? (isActiveClient(c) ? "active" : "archived")) as ClientLifecycle]}</td>
                  <td className="px-4 py-3 text-foreground">{c.status}</td>
                  <td className="px-4 py-3 text-foreground">{c.round}</td>
                  <td className="px-4 py-3 text-muted-foreground">{c.assignedAgent ?? "Unassigned"}</td>
                  <td className="px-4 py-3 text-muted-foreground">{c.lastActivity ? (Number.isNaN(Date.parse(c.lastActivity)) ? c.lastActivity : new Date(c.lastActivity).toLocaleDateString()) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <AddClientModal open={adding} onClose={() => setAdding(false)} partner={partner} />
    </div>
  );
}
