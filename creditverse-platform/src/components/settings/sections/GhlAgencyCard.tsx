/**
 * BES HQ › Integrations › GoHighLevel — the AGENCY connection.
 *
 * Dee, 2026-09-06: "I need the GHL My agency API key and not just sub account.
 * I want this app to work with my entire agency platform."
 *
 * One credential for the whole agency, then Sync asks GHL what locations
 * exist under it. Each one appears here whether or not it belongs to a BES
 * organization yet — mapping is a commercial fact a person knows, and matching
 * on a name would be inferring ownership from a display label, which this
 * project does not do (rule 4).
 *
 * The token is typed once and goes straight to a database function. There is
 * no query on this screen that could read it back, because the table it lands
 * in grants nothing to any browser role.
 */
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Building2, Cable, Info, Loader2, RefreshCw, Unplug } from "lucide-react";
import { Button } from "@/components/ui/button";
import { OpsSelect } from "@/components/ui/ops-select";
import { SectionCard } from "@/components/settings/shared";
import { errorMessage } from "@/lib/data/error-message";
import { formatDateTime } from "@/lib/format-date";
import {
  fetchGhlAgencyStatus,
  connectGhlAgency,
  disconnectGhlAgency,
  mapGhlLocation,
  syncGhlLocations,
  type GhlConnection,
  type GhlTokenKind,
} from "@/lib/data/ghl";
import type { Organization } from "@/lib/bes-domain";

const inputCls =
  "mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary";
const labelCls = "block text-[10px] font-bold uppercase tracking-wider text-muted-foreground";

export function GhlAgencyCard({
  connections,
  organizations,
  partners,
  onChanged,
}: {
  connections: GhlConnection[];
  organizations: Organization[];
  /** BES Partners — the usual owner of a location (rule 16 model 3). */
  partners: { id: string; name: string }[];
  onChanged: () => void;
}) {
  const qc = useQueryClient();
  const [companyId, setCompanyId] = useState("");
  const [token, setToken] = useState("");
  const [tokenKind, setTokenKind] = useState<GhlTokenKind>("private_integration");
  const [secret, setSecret] = useState("");
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);

  /* The credential itself, not an inference from whether a sync has run. */
  const status = useQuery({ queryKey: ["ghl", "agency-status"], queryFn: fetchGhlAgencyStatus, staleTime: 60_000 });
  const connectedCompany = status.data?.companyId ?? null;
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ["ghl"] });
    onChanged();
  };

  const connect = useMutation({
    mutationFn: () =>
      connectGhlAgency({ companyId: companyId.trim(), token: token.trim(), tokenKind, webhookSecret: secret.trim() }),
    onSuccess: () => {
      /* The token leaves this screen the moment it is stored. */
      setToken("");
      setSecret("");
      setMessage({ text: "Agency connected. Now press Sync locations.", error: false });
      refresh();
    },
    onError: (e) => setMessage({ text: errorMessage(e, "The agency could not be connected."), error: true }),
  });

  const sync = useMutation({
    mutationFn: syncGhlLocations,
    onSuccess: (r) =>
      setMessage({
        text: `GoHighLevel returned ${r.found} location${r.found === 1 ? "" : "s"} under ${r.companyId}.`,
        error: false,
      }),
    onError: (e) => setMessage({ text: errorMessage(e, "The sync did not complete."), error: true }),
    onSettled: refresh,
  });

  const disconnect = useMutation({
    mutationFn: disconnectGhlAgency,
    onSuccess: () =>
      setMessage({
        text: "Agency disconnected and the token deleted. The locations and their mappings are kept.",
        error: false,
      }),
    onError: (e) => setMessage({ text: errorMessage(e, "It could not be disconnected."), error: true }),
    onSettled: refresh,
  });

  const map = useMutation({
    mutationFn: ({ locationId, owner }: { locationId: string; owner: string }) =>
      /* "p:<id>" a partner, "o:<id>" an organization — one control, because
         the question is "who does this location belong to", and the answer
         is one party of either shape (rule 16). */
      mapGhlLocation(locationId, owner === "bes"
        ? { agencyOwn: true }
        : owner.startsWith("p:")
          ? { partnerId: owner.slice(2) }
          : owner.startsWith("o:")
            ? { organizationId: owner.slice(2) }
            : {}),
    onSuccess: () => setMessage({ text: "Mapped. Any events already received were attributed to it.", error: false }),
    onError: (e) => setMessage({ text: errorMessage(e, "It could not be mapped."), error: true }),
    onSettled: refresh,
  });

  const ready = companyId.trim() && token.trim();
  const ghlLocations = connections.filter((c) => c.companyId);
  const mapped = ghlLocations.filter((c) => c.organizationId || c.outsourcingGroupId || c.agencyOwned).length;
  /* Partners first: almost every BES customer is a partner with no SaaS
     organization, and before this the list held only organizations — of
     which there are none, so nothing could be mapped at all. */
  const ownerOptions = [
    { value: "__none", label: "Not mapped" },
    /* BES's own house account — a different fact from "a customer's", and
       from "nobody has said yet". */
    { value: "bes", label: "BES — our own account" },
    ...partners.map((p) => ({ value: `p:${p.id}`, label: `${p.name} (partner)` })),
    ...organizations.map((o) => ({ value: `o:${o.id}`, label: `${o.name} (organization)` })),
  ];
  const ownerValue = (c: { organizationId: string | null; outsourcingGroupId: string | null; agencyOwned: boolean }) =>
    c.agencyOwned ? "bes"
      : c.outsourcingGroupId ? `p:${c.outsourcingGroupId}`
      : c.organizationId ? `o:${c.organizationId}`
      : "__none";
  const anyEventReceived = connections.some((c) => c.lastEventAt);
  const webhookUrl = `${import.meta.env.VITE_SUPABASE_URL ?? "https://<project>.supabase.co"}/functions/v1/ghl-webhook`;

  return (
    <>
      <SectionCard
        icon={Building2}
        title="GoHighLevel agency"
        description="One credential for the whole agency. Its locations are discovered, not typed in one at a time."
      >
        <div className="mb-3 flex items-start gap-2 rounded-lg border border-blue-500/30 bg-blue-500/5 p-3 text-xs text-foreground">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-status-info" />
          <p>
            Use an <strong>agency-level</strong> token, not a single location’s. In GHL: Settings → Private
            Integrations, at the <em>agency</em> level, with at least <span className="font-mono">locations.readonly</span>.
            The Company ID is in Settings → Company. A location token will be refused by the sync with the
            reason.
          </p>
        </div>

        {connectedCompany && (
          <p className="mb-3 rounded-lg border border-emerald-600/30 bg-emerald-500/10 p-2.5 text-xs text-status-success">
            Connected to company <span className="font-mono">{connectedCompany}</span>
            {status.data?.tokenKind === "oauth" ? " via a Marketplace app" : " via an agency token"} ·{" "}
            {ghlLocations.length} location{ghlLocations.length === 1 ? "" : "s"} known, {mapped} mapped.
          </p>
        )}

        {/* Four facts, each measured — because "connected" was answering only
            the first of them, and Dee asked how to know the bridge really
            works (2026-09-09). A step that is not done says what to do. */}
        {connectedCompany && (
          <div className="mb-3 rounded-lg border border-border bg-muted/30 p-3">
            <p className={labelCls}>Is the bridge actually live?</p>
            <ul className="mt-2 space-y-1.5 text-[11px]">
              <li className="text-foreground">
                ✓ <strong>Agency credential</strong> — locations are being discovered, so BES can read GHL.
              </li>
              <li className={status.data?.hasWebhookSecret ? "text-foreground" : "text-status-danger"}>
                {status.data?.hasWebhookSecret ? "✓" : "✗"} <strong>Webhook secret</strong>
                {status.data?.hasWebhookSecret
                  ? " — set, so signed events from GHL are accepted."
                  : " — NOT set. Until it is, every event GHL sends here is refused: an endpoint that writes rows without checking who sent them would be worse than one switched off. Set it below, then paste the same phrase into GHL."}
              </li>
              <li className={mapped > 0 ? "text-foreground" : "text-muted-foreground"}>
                {mapped > 0 ? "✓" : "○"} <strong>Locations mapped</strong> — {mapped} of {ghlLocations.length}.
                An unmapped location&apos;s events are still recorded and attributed the moment you map it.
              </li>
              <li className={anyEventReceived ? "text-foreground" : "text-muted-foreground"}>
                {anyEventReceived ? "✓" : "○"} <strong>Events arriving</strong>
                {anyEventReceived
                  ? " — something has reached BES; see Recent events below."
                  : " — nothing has arrived yet. Once the secret is set and GHL points at the address below, a test fires within seconds."}
              </li>
            </ul>
            <div className="mt-2.5 border-t border-border/60 pt-2 text-[11px] text-muted-foreground">
              <p className="font-semibold text-foreground">To wire it in GHL</p>
              <p className="mt-1">
                Automation → Workflows → add a <strong>Webhook</strong> action (or Settings → Webhooks) →
                method POST → URL <span className="font-mono text-foreground">{webhookUrl}</span> → add a
                custom header <span className="font-mono text-foreground">x-ghl-signature</span> whose value
                is the same secret you set here. Trigger it on the events you care about — opportunity
                stage changed, contact created, appointment booked.
              </p>
            </div>
          </div>
        )}

        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (ready) connect.mutate();
          }}
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-sm">
              <span className={labelCls}>GHL Company (agency) ID</span>
              <input
                value={companyId}
                onChange={(e) => setCompanyId(e.target.value)}
                className={inputCls}
                required
                placeholder="Settings → Company in GHL"
              />
            </label>
            <label className="text-sm">
              <span className={labelCls}>Token kind</span>
              <div className="mt-1">
                <OpsSelect
                  value={tokenKind}
                  onValueChange={(v) => setTokenKind(v as GhlTokenKind)}
                  options={[
                    { value: "private_integration", label: "Agency Private Integration token" },
                    { value: "oauth", label: "Marketplace app (OAuth)" },
                  ]}
                  size="field"
                  aria-label="Token kind"
                />
              </div>
            </label>
            <label className="text-sm">
              <span className={labelCls}>Agency token</span>
              <input
                type="password"
                value={token}
                onChange={(e) => setToken(e.target.value)}
                className={inputCls}
                required
                autoComplete="off"
              />
              <span className="mt-1 block text-[11px] text-muted-foreground">Stored once and never shown again.</span>
            </label>
            <label className="text-sm">
              <span className={labelCls}>Webhook secret (optional)</span>
              <input
                type="password"
                value={secret}
                onChange={(e) => setSecret(e.target.value)}
                className={inputCls}
                autoComplete="off"
              />
              <span className="mt-1 block text-[11px] text-muted-foreground">
                One phrase for the whole agency. Every location's events can then use the same webhook.
              </span>
            </label>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button type="submit" size="sm" disabled={!ready || connect.isPending}>
              {connect.isPending ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Cable className="mr-1 h-3.5 w-3.5" />}
              {connectedCompany ? "Replace credential" : "Connect agency"}
            </Button>
            <Button type="button" size="sm" variant="outline" disabled={sync.isPending} onClick={() => sync.mutate()}>
              {sync.isPending ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="mr-1 h-3.5 w-3.5" />}
              Sync locations
            </Button>
            {connectedCompany && (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                disabled={disconnect.isPending}
                onClick={() => disconnect.mutate()}
              >
                <Unplug className="mr-1 h-3.5 w-3.5" /> Disconnect
              </Button>
            )}
            {message && (
              <p role="status" className={`text-xs ${message.error ? "text-status-danger" : "text-status-success"}`}>
                {message.text}
              </p>
            )}
          </div>
        </form>
      </SectionCard>

      <SectionCard
        icon={Building2}
        title="Agency locations"
        description="Every GHL location under the agency, and which BES partner or organization it belongs to."
      >
        {ghlLocations.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            None discovered yet. Connect the agency, then press Sync locations.
          </p>
        ) : (
          <ul className="divide-y divide-border/60">
            {ghlLocations.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center gap-3 py-2.5 text-xs">
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-foreground">{c.name || c.label || c.locationId}</p>
                  <p className="text-muted-foreground">
                    <span className="font-mono">{c.locationId}</span>
                    {c.lastEventAt ? ` · last event ${formatDateTime(c.lastEventAt)}` : " · nothing received yet"}
                    {c.discoveredAt ? ` · seen ${formatDateTime(c.discoveredAt)}` : ""}
                  </p>
                </div>
                {!c.organizationId && !c.outsourcingGroupId && !c.agencyOwned && (
                  <span className="rounded-full border border-dashed border-border px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">
                    Not mapped
                  </span>
                )}
                <OpsSelect
                  value={ownerValue(c)}
                  onValueChange={(v) => map.mutate({ locationId: c.locationId, owner: v })}
                  options={ownerOptions}
                  size="sm"
                  aria-label={`Who owns ${c.locationId}`}
                />
              </li>
            ))}
          </ul>
        )}
        <p className="mt-3 text-[11px] text-muted-foreground">
          An unmapped location still has its events recorded, unattributed. Mapping it attributes the backlog too,
          so a location connected late loses nothing.
        </p>
      </SectionCard>
    </>
  );
}
