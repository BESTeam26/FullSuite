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
  onChanged,
}: {
  connections: GhlConnection[];
  organizations: Organization[];
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
    mutationFn: ({ locationId, organizationId }: { locationId: string; organizationId: string | null }) =>
      mapGhlLocation(locationId, organizationId),
    onSuccess: () => setMessage({ text: "Mapped. Any events already received were attributed to it.", error: false }),
    onError: (e) => setMessage({ text: errorMessage(e, "It could not be mapped."), error: true }),
    onSettled: refresh,
  });

  const ready = companyId.trim() && token.trim();
  const ghlLocations = connections.filter((c) => c.companyId);
  const mapped = ghlLocations.filter((c) => c.organizationId).length;

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
            {status.data?.tokenKind === "oauth" ? " via a Marketplace app" : " via an agency token"}
            {status.data && !status.data.hasWebhookSecret && " · no webhook secret set"} · {ghlLocations.length}{" "}
            location{ghlLocations.length === 1 ? "" : "s"} known, {mapped} mapped to an organization.
          </p>
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
        description="Every GHL location under the agency, and which BES organization it belongs to."
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
                {!c.organizationId && (
                  <span className="rounded-full border border-dashed border-border px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">
                    Not mapped
                  </span>
                )}
                <OpsSelect
                  value={c.organizationId ?? "__none"}
                  onValueChange={(v) =>
                    map.mutate({ locationId: c.locationId, organizationId: v === "__none" ? null : v })
                  }
                  options={[
                    { value: "__none", label: "Not mapped" },
                    ...organizations.map((o) => ({ value: o.id, label: o.name })),
                  ]}
                  size="sm"
                  aria-label={`Organization for ${c.locationId}`}
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
