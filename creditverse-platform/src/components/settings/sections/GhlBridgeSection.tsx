/**
 * BES HQ › Integrations › GoHighLevel.
 *
 * Two ways in, and the agency one is the main one (0115): connect the AGENCY
 * once and discover its locations, or connect a single location by hand.
 * The second is kept because an organization may hand BES one location without
 * agency access, and because everything already connected that way still
 * works exactly as it did.
 * The token and webhook secret are typed once and sent straight to the
 * database function that stores them; nothing here can read them back, and
 * neither can any other screen.
 *
 * What arrives is recorded but **not yet acted on** — no client or funding
 * file is created from an event until the client record moves to the
 * organization level. The panel says so plainly rather than implying a sync
 * that is not happening.
 */
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Cable, Info, Loader2, Plug, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SectionCard } from "@/components/settings/shared";
import { GhlAgencyCard } from "@/components/settings/sections/GhlAgencyCard";
import { useAgency } from "@/lib/agency-context";
import { useAuth } from "@/lib/auth/auth-context";
import { formatDateTime } from "@/lib/format-date";
import { errorMessage } from "@/lib/data/error-message";
import { useAgencyPartners } from "@/lib/data/use-agency-partners";
import {
  connectGhlLocation,
  disconnectGhlLocation,
  fetchGhlConnections,
  fetchGhlEvents,
} from "@/lib/data/ghl";

const inputCls = "mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary";
const labelCls = "block text-[10px] font-bold uppercase tracking-wider text-muted-foreground";

export function GhlBridgeSection() {
  const auth = useAuth();
  const { organizations } = useAgency();
  const qc = useQueryClient();
  const live = auth.mode === "live" && auth.status === "signed-in";

  const connections = useQuery({ queryKey: ["ghl", "connections"], queryFn: fetchGhlConnections, enabled: live, staleTime: 60_000 });
  const events = useQuery({ queryKey: ["ghl", "events"], queryFn: () => fetchGhlEvents(20), enabled: live, staleTime: 30_000 });
  /* Shares the partner list every partner screen uses — one query key, so
     opening Integrations after BES Partners costs nothing (rule 14). */
  const partners = useAgencyPartners();

  const [organizationId, setOrganizationId] = useState("");
  const [locationId, setLocationId] = useState("");
  const [label, setLabel] = useState("");
  const [token, setToken] = useState("");
  const [secret, setSecret] = useState("");
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ["ghl", "connections"] });
    void qc.invalidateQueries({ queryKey: ["ghl", "events"] });
  };

  const connect = useMutation({
    mutationFn: () => connectGhlLocation({ organizationId, locationId, label, token, webhookSecret: secret }),
    onSuccess: () => {
      /* The secret leaves this screen the moment it is stored. */
      setToken("");
      setSecret("");
      setMessage({ text: "Connected. Point the GHL webhook at the address below.", error: false });
      refresh();
    },
    onError: (e) => setMessage({ text: errorMessage(e, "That location could not be connected."), error: true }),
  });

  const disconnect = useMutation({
    mutationFn: disconnectGhlLocation,
    onSuccess: () => { setMessage({ text: "Disconnected. Its token was deleted.", error: false }); refresh(); },
    onError: (e) => setMessage({ text: errorMessage(e, "It could not be disconnected."), error: true }),
  });

  const webhookUrl = `${import.meta.env.VITE_SUPABASE_URL ?? "https://<project>.supabase.co"}/functions/v1/ghl-webhook`;
  /* A connection with no company_id was typed in before the agency credential
     existed. Those keep their own token and their own webhook secret. */
  const byHand = (connections.data ?? []).filter((c) => !c.companyId);
  const ready = organizationId && locationId.trim() && token.trim() && secret.trim();

  return (
    <div className="space-y-4">
      <GhlAgencyCard
        connections={connections.data ?? []}
        organizations={organizations}
        partners={(partners.data ?? []).map((p) => ({ id: p.id, name: p.name }))}
        onChanged={refresh}
      />

      <SectionCard
        icon={Plug}
        title="Connect a single location"
        description="For a location handed to BES without agency access. The agency credential above is the usual route."
      >
        <div className="mb-3 flex items-start gap-2 rounded-lg border border-blue-500/30 bg-blue-500/5 p-3 text-xs text-foreground">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-status-info" />
          <p>
            Events are <strong>recorded, not yet acted on</strong>. Nothing in GHL creates a client or a funding file
            here until the client record moves to the organization level. Connecting now means nothing is lost in the
            meantime — the backlog is replayed once that mapping exists.
          </p>
        </div>

        <form
          className="space-y-3"
          onSubmit={(e) => { e.preventDefault(); if (ready) connect.mutate(); }}
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-sm">
              <span className={labelCls}>Organization</span>
              <select value={organizationId} onChange={(e) => setOrganizationId(e.target.value)} className={inputCls} required>
                <option value="">Choose…</option>
                {organizations.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
              </select>
            </label>
            <label className="text-sm">
              <span className={labelCls}>GHL location ID</span>
              <input value={locationId} onChange={(e) => setLocationId(e.target.value)} className={inputCls} required placeholder="ve9EPM428h8vShlRW1KT" />
            </label>
            <label className="text-sm">
              <span className={labelCls}>Label (optional)</span>
              <input value={label} onChange={(e) => setLabel(e.target.value)} className={inputCls} placeholder="Cedar — main funnel" />
            </label>
            <label className="text-sm">
              <span className={labelCls}>Private Integration token</span>
              <input type="password" value={token} onChange={(e) => setToken(e.target.value)} className={inputCls} required autoComplete="off" />
              <span className="mt-1 block text-[11px] text-muted-foreground">Stored once and never shown again.</span>
            </label>
            <label className="text-sm sm:col-span-2">
              <span className={labelCls}>Webhook secret</span>
              <input type="password" value={secret} onChange={(e) => setSecret(e.target.value)} className={inputCls} required autoComplete="off" />
              <span className="mt-1 block text-[11px] text-muted-foreground">
                A phrase you choose. Put the same one in GHL; it is how we know a request really came from you.
              </span>
            </label>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Button type="submit" size="sm" disabled={!ready || connect.isPending}>
              {connect.isPending ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Cable className="mr-1 h-3.5 w-3.5" />} Connect location
            </Button>
            {message && <p role="status" className={`text-xs ${message.error ? "text-status-danger" : "text-status-success"}`}>{message.text}</p>}
          </div>
        </form>

        <p className="mt-3 rounded-lg bg-muted/40 p-2 text-[11px] text-muted-foreground">
          Webhook address for GHL: <span className="font-mono text-foreground">{webhookUrl}</span>
        </p>
      </SectionCard>

      <SectionCard icon={Plug} title="Locations connected by hand" description="Those with their own token, from before the agency credential.">
        {connections.isLoading ? (
          <div className="h-16 animate-pulse rounded-lg bg-muted/40" aria-busy="true" />
        ) : byHand.length > 0 ? (
          <ul className="divide-y divide-border/60">
            {byHand.map((c) => {
              const org = organizations.find((o) => o.id === c.organizationId);
              return (
                <li key={c.id} className="flex flex-wrap items-center gap-3 py-2.5 text-xs">
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-foreground">{c.label || c.locationId}</p>
                    <p className="text-muted-foreground">
                      {org?.name ?? "Unknown organization"} · <span className="font-mono">{c.locationId}</span> ·{" "}
                      {c.lastEventAt ? `last event ${formatDateTime(c.lastEventAt)}` : "nothing received yet"}
                    </p>
                  </div>
                  <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${c.status === "connected" ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700" : "border-border text-muted-foreground"}`}>
                    {c.status}
                  </span>
                  <Button type="button" size="sm" variant="ghost" disabled={disconnect.isPending} onClick={() => disconnect.mutate(c.locationId)} title="Disconnect and delete its token">
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="text-xs text-muted-foreground">None. Locations discovered through the agency are listed above.</p>
        )}
      </SectionCard>

      <SectionCard icon={Plug} title="Recent events" description="What GHL has sent, newest first.">
        {events.isLoading ? (
          <div className="h-16 animate-pulse rounded-lg bg-muted/40" aria-busy="true" />
        ) : events.data && events.data.length > 0 ? (
          <ul className="divide-y divide-border/60 text-xs">
            {events.data.map((e) => (
              <li key={e.id} className="flex flex-wrap items-center gap-2 py-2">
                <span className="font-semibold text-foreground">{e.eventType}</span>
                <span className="font-mono text-[10px] text-muted-foreground">{e.locationId}</span>
                <span className="ml-auto text-muted-foreground">{formatDateTime(e.receivedAt)}</span>
                <span className="text-[10px] text-muted-foreground">{e.processedAt ? e.outcome ?? "processed" : "recorded"}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-xs text-muted-foreground">Nothing has arrived yet. Once a location is connected and its webhook points here, events appear within seconds.</p>
        )}
      </SectionCard>
    </div>
  );
}
