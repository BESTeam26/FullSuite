/**
 * The client profile — the 360° customer record.
 *
 * Dee, 2026-09-06: "When I click Cleo Chan from Clients, I should NOT
 * immediately land inside a credit repair application."
 *
 * So this page is identity, relationships and history. The credit-repair
 * application, the funding file and the DIY journey are each one click away
 * through "Open in …", and none of them is embedded here. A person can move
 * between products without being recreated, which only works if the person is
 * a record in their own right rather than a header on a dispute screen.
 */
import { useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, AlertTriangle, ExternalLink } from "lucide-react";
import { useClientHistory, useClientProfile } from "@/lib/data/use-clients";
import { usePermission } from "@/lib/auth/use-permission";
import type { HistoryNeed } from "@/lib/data/use-clients";
import { ServiceBadge } from "@/components/clients/directory/ServiceBadge";
import { enrolledServices, SERVICE_LABELS } from "@/lib/clients/client-directory-domain";
import { OverviewPanel } from "@/components/clients/profile/OverviewPanel";
import { PersonalInfoPanel } from "@/components/clients/profile/PersonalInfoPanel";
import { BusinessesPanel } from "@/components/clients/profile/BusinessesPanel";
import { ServicesPanel } from "@/components/clients/profile/ServicesPanel";
import { DocumentsPanel } from "@/components/clients/profile/DocumentsPanel";
import { ActivityPanel } from "@/components/clients/profile/ActivityPanel";
import { LoginsPanel } from "@/components/clients/profile/LoginsPanel";
import { NotBuiltPanel } from "@/components/clients/profile/NotBuiltPanel";

const TABS = [
  "Overview",
  "Personal Info",
  "Businesses",
  "Services & Plans",
  "Documents",
  "Goals",
  "Logins",
  "Activity",
  "Notes",
] as const;
type Tab = (typeof TABS)[number];

/** Which secondary query a tab needs, so nothing loads behind a closed tab. */
const NEED: Partial<Record<Tab, HistoryNeed>> = {
  Overview: "overview",
  Activity: "activity",
  Documents: "documents",
};

const STATUS_TONE: Record<string, string> = {
  active: "border-emerald-600/30 bg-emerald-500/10 text-status-success",
  paused: "border-amber-600/30 bg-amber-500/10 text-status-warning",
  archived: "border-border bg-muted text-muted-foreground",
};

export function ClientProfilePage() {
  const { id } = useParams();
  const profile = useClientProfile(id);
  const [tab, setTab] = useState<Tab>("Overview");
  const client = profile.data ?? undefined;
  const history = useClientHistory(client, NEED[tab] ?? "none");

  /* Either engine's edit key writes the person — the same rule the database
     applies in `client_writable`, mirrored here only to decide what to offer.
     Both hooks are called unconditionally: `||` would short-circuit the second
     the moment the first allowed, changing the hook order between renders. */
  const canEditCreditClient = usePermission("creditops.clients.edit").allowed;
  const canEditFundingFile = usePermission("fundingops.files.edit").allowed;
  const canWriteClient = canEditCreditClient || canEditFundingFile;

  const services = useMemo(() => (client ? enrolledServices(client) : []), [client]);
  const initials =
    client?.name
      .split(" ")
      .map((w) => w[0])
      .join("")
      .slice(0, 2)
      .toUpperCase() || "CL";

  if (profile.isLoading) {
    return <p className="p-8 text-sm text-muted-foreground">Loading client…</p>;
  }
  if (profile.error) {
    return (
      <div className="p-8">
        <p className="text-sm text-status-danger">
          Could not load this client: {(profile.error as Error).message}
        </p>
        <Link to="/app/clients" className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-primary hover:underline">
          <ArrowLeft className="h-4 w-4" /> Back to Clients
        </Link>
      </div>
    );
  }
  if (!client) {
    return (
      <div className="p-8">
        <p className="text-sm text-muted-foreground">
          This client does not exist, or you are not authorized to see them.
        </p>
        <Link to="/app/clients" className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-primary hover:underline">
          <ArrowLeft className="h-4 w-4" /> Back to Clients
        </Link>
      </div>
    );
  }

  return (
    <div className="p-6 md:p-8">
      <Link
        to="/app/clients"
        className="mb-4 inline-flex items-center gap-1 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
      >
        <ArrowLeft className="h-4 w-4" /> Clients
      </Link>

      {/* ── Who they are ────────────────────────────────────────────────── */}
      <div className="rounded-2xl border border-border bg-card p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-4">
            <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-primary text-lg font-semibold text-primary-foreground">
              {initials}
            </span>
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-foreground">{client.name}</h1>
              <p className="mt-0.5 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${STATUS_TONE[client.status]}`}>
                  {client.status === "archived" ? "Not active" : `${client.status[0].toUpperCase()}${client.status.slice(1)} client`}
                </span>
                <span className="font-mono text-[11px]">{client.publicId}</span>
                <span>{client.email}</span>
                {client.phone && <span>· {client.phone}</span>}
              </p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {services.length === 0 ? (
                  <span className="text-xs text-muted-foreground">No services yet</span>
                ) : (
                  services.map((s) => <ServiceBadge key={s.service} service={s} showState />)
                )}
              </div>
            </div>
          </div>

          {/* Contextual actions: into the engines, never inline. */}
          <div className="flex flex-wrap gap-2">
            {services
              .filter((s) => s.href)
              .map((s) => (
                <Link
                  key={s.service}
                  to={s.href as string}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-2 text-xs font-semibold text-foreground transition-colors hover:border-primary/40 hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                >
                  Open in {SERVICE_LABELS[s.service]} <ExternalLink className="h-3.5 w-3.5" />
                </Link>
              ))}
          </div>
        </div>

        {client.needsReview && (
          <p className="mt-4 flex items-start gap-2 rounded-lg border border-amber-600/30 bg-amber-500/10 p-3 text-xs text-status-warning">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              <strong className="font-semibold">Possible duplicate.</strong>{" "}
              {client.reviewNote ?? "Two records matched on name alone, which is never enough to merge people."}{" "}
              Someone has to confirm or split them.
            </span>
          </p>
        )}
      </div>

      {/* ── Tabs ────────────────────────────────────────────────────────── */}
      <div className="mt-5 flex gap-1 overflow-x-auto border-b border-border" role="tablist">
        {TABS.map((t) => (
          <button
            key={t}
            type="button"
            role="tab"
            aria-selected={tab === t}
            onClick={() => setTab(t)}
            className={`-mb-px shrink-0 border-b-2 px-3.5 py-2.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
              tab === t
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:border-border hover:text-foreground"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      <div className="mt-5">
        {tab === "Overview" && <OverviewPanel client={client} activity={history.activity} onOpenTab={setTab} />}
        {tab === "Personal Info" && <PersonalInfoPanel client={client} />}
        {tab === "Businesses" && <BusinessesPanel client={client} />}
        {tab === "Services & Plans" && <ServicesPanel client={client} />}
        {tab === "Documents" && (
          <DocumentsPanel
            clientId={client.id}
            partnerScopeId={client.partnerScopeId}
            canEdit={canWriteClient}
            documents={history.documents}
            hasLinks={history.hasLinks}
          />
        )}
        {tab === "Logins" && <LoginsPanel client={client} />}
        {tab === "Activity" && <ActivityPanel activity={history.activity} hasLinks={history.hasLinks} />}
        {tab === "Goals" && (
          <NotBuiltPanel
            title="Goals"
            what="What this client is trying to achieve — improve credit, obtain $100K in business funding — recorded once and readable from every service."
            missing="a goals table on the canonical client, with who set the goal and when it was met"
          />
        )}
        {tab === "Notes" && (
          <NotBuiltPanel
            title="Notes"
            what="Relationship notes about the person, separate from the operational notes each engine already keeps on its own work."
            missing="a decision on visibility — a note about a person is not automatically visible to everyone who can see the person"
          />
        )}
      </div>
    </div>
  );
}
