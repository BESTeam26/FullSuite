/**
 * The partner's own end clients — when they have any.
 *
 * A partner MAY have none. A build client, a retainer client and a TalentOps
 * arrangement all legitimately have zero, so "none" is written as an answer
 * rather than an empty state that implies something is missing.
 *
 * Name and email are the whole requirement. A form that demanded a phone
 * number nobody has to hand is how records fill up with "n/a".
 *
 * These are `fulfillment_clients` — the SAME canonical client record CreditOps
 * works on, not a copy (rule 2). A second client table would be a second
 * truth, wrong the moment either was edited.
 */
import { useState } from "react";
import { Link } from "react-router-dom";
import { Loader2, Plus, Search } from "lucide-react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { ContentCard } from "@/components/dashboard/DivisionLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Empty } from "@/components/agency/partner/partner-ui";
import { createPartnerClient, fetchPartnerClients } from "@/lib/data/partner-clients";
import { useAgencyPermissions } from "@/lib/data/agency-permissions";
import { useAuth } from "@/lib/auth/auth-context";
import { formatDate } from "@/lib/format-date";

const PAGE = 25;

export function PartnerClientsTab({ groupId }: { groupId: string }) {
  const auth = useAuth();
  const qc = useQueryClient();
  const perms = useAgencyPermissions();
  const canAdd = perms.can("partners.clients");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");

  /* Server-side search and paging: one partner in the real data has several
     hundred clients, and downloading them all to filter in the browser is the
     payload problem rule 14 names. */
  const clients = useQuery({
    queryKey: ["partner", "clients", groupId, page, search],
    queryFn: () => fetchPartnerClients(groupId, { limit: PAGE, offset: page * PAGE, search }),
    enabled: auth.mode === "live" && auth.status === "signed-in",
    staleTime: 30_000,
  });

  const add = useMutation({
    mutationFn: () => createPartnerClient({
      agencyId: auth.agencyId ?? "", groupId, name, email, phone,
    }),
    onSuccess: () => {
      setName(""); setEmail(""); setPhone(""); setAdding(false);
      void qc.invalidateQueries({ queryKey: ["partner", "clients", groupId] });
      void qc.invalidateQueries({ queryKey: ["agency", "partner-client-counts"] });
    },
  });

  const rows = clients.data?.rows ?? [];
  const total = clients.data?.total ?? 0;

  return (
    <ContentCard
      title={`End clients${total > 0 ? ` (${total})` : ""}`}
      action={
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input className="h-8 w-44 pl-7" value={search} aria-label="Search clients"
              placeholder="Name or email"
              onChange={(e) => { setSearch(e.target.value); setPage(0); }} />
          </div>
          {canAdd && (
            <Button size="sm" variant="ghost" onClick={() => setAdding((v) => !v)}>
              <Plus className="mr-1.5 h-3.5 w-3.5" /> Add client
            </Button>
          )}
        </div>
      }
    >
      {adding && canAdd && (
        <div className="mb-3 flex flex-wrap items-end gap-2 rounded-lg border border-border bg-muted/30 p-3">
          <Input className="h-8 w-44" value={name} onChange={(e) => setName(e.target.value)}
            placeholder="Full name" aria-label="Client name" />
          <Input className="h-8 w-56" type="email" value={email} onChange={(e) => setEmail(e.target.value)}
            placeholder="name@example.com" aria-label="Client email" />
          <Input className="h-8 w-40" value={phone} onChange={(e) => setPhone(e.target.value)}
            placeholder="Phone (optional)" aria-label="Client phone" />
          <Button size="sm" disabled={!name.trim() || !email.trim() || add.isPending}
            onClick={() => add.mutate()}>
            {add.isPending && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />} Add
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setAdding(false)}>Cancel</Button>
          <p className="w-full text-[11px] text-muted-foreground">
            Name and email are all that is needed. Everything else can follow later.
          </p>
          {add.error && (
            <p className="w-full text-xs text-red-700">
              {String((add.error as Error).message).includes("one_email_per_partner")
                ? "This partner already has a file for that email address."
                : (add.error as Error).message}
            </p>
          )}
        </div>
      )}

      {clients.isLoading ? (
        <p className="py-6 text-center text-sm text-muted-foreground">
          <Loader2 className="mr-2 inline h-4 w-4 animate-spin" /> Loading…
        </p>
      ) : rows.length === 0 ? (
        <Empty
          title={search ? "Nobody matches that search" : "No end clients"}
          hint={search ? undefined
            : "Normal for a build, retainer or staffing partner — BES does not manage clients for every partner. This is an answer, not a gap."}
        />
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[34rem] text-left text-xs">
              <thead>
                <tr className="border-b border-border/60 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                  <th className="py-1.5 pr-2">Client</th>
                  <th className="py-1.5 pr-2">Status</th>
                  <th className="py-1.5 pr-2">Round</th>
                  <th className="py-1.5 pr-2 text-right">Open items</th>
                  <th className="py-1.5">Last activity</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                {rows.map((c) => (
                  <tr key={c.id} className="transition-colors hover:bg-muted/40">
                    <td className="py-1.5 pr-2">
                      <Link to={`/app/creditops/clients/${c.id}`} className="font-medium text-foreground hover:text-primary hover:underline">
                        {c.name}
                      </Link>
                      <span className="block text-[11px] text-muted-foreground">{c.email}</span>
                    </td>
                    <td className="py-1.5 pr-2 text-muted-foreground">{c.status}</td>
                    <td className="py-1.5 pr-2 text-muted-foreground">{c.round}</td>
                    <td className="py-1.5 pr-2 text-right tabular-nums text-foreground">{c.openItems}</td>
                    <td className="py-1.5 text-muted-foreground">{formatDate(c.lastActivityAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {total > PAGE && (
            <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
              <span>{page * PAGE + 1}–{Math.min((page + 1) * PAGE, total)} of {total}</span>
              <span className="flex gap-1">
                <Button size="sm" variant="ghost" className="h-7 px-2" disabled={page === 0}
                  onClick={() => setPage((p) => p - 1)}>Previous</Button>
                <Button size="sm" variant="ghost" className="h-7 px-2" disabled={(page + 1) * PAGE >= total}
                  onClick={() => setPage((p) => p + 1)}>Next</Button>
              </span>
            </div>
          )}
        </>
      )}
    </ContentCard>
  );
}
