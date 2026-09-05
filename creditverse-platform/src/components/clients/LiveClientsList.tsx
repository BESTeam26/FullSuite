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

export function LiveClientsList() {
  const navigate = useNavigate();
  const agency = useAgency();
  const [q, setQ] = useState("");
  const clients = useQuery({ queryKey: ["creditops", "clients"], queryFn: fetchFulfillmentClients, staleTime: 15_000 });
  const orgId = agency.viewMode === "subaccount" ? agency.activeOrganization?.id ?? null : null;

  const rows = useMemo(() => {
    const list = (clients.data ?? []).filter((c) => !orgId || c.organizationId === orgId);
    const s = q.trim().toLowerCase();
    return s ? list.filter((c) => c.name.toLowerCase().includes(s) || c.email.toLowerCase().includes(s)) : list;
  }, [clients.data, orgId, q]);

  return (
    <div className="p-6 md:p-8">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight text-foreground"><Users className="h-6 w-6 text-primary" /> Clients</h1>
          <p className="text-sm text-muted-foreground">Open a client to work their profile — report, disputes, letters, analysis.</p>
        </div>
        <div className="flex items-center gap-2">
          <DataSourceBadge source="live" />
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
          <p className="p-6 text-sm text-muted-foreground">{q ? "No clients match." : "No clients yet. Add clients from CreditOps → Workspace → Main Client List."}</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-left text-[11px] uppercase tracking-wider text-muted-foreground">
              <tr><th className="px-4 py-2.5">Client</th><th className="px-4 py-2.5">Status</th><th className="px-4 py-2.5">Round</th><th className="px-4 py-2.5">Assigned</th><th className="px-4 py-2.5">Last activity</th></tr>
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
                  <td className="px-4 py-3 text-foreground">{c.status}</td>
                  <td className="px-4 py-3 text-foreground">{c.round}</td>
                  <td className="px-4 py-3 text-muted-foreground">{c.assignedAgent ?? "Unassigned"}</td>
                  <td className="px-4 py-3 text-muted-foreground">{c.lastActivity ? new Date(c.lastActivity).toLocaleDateString() : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
