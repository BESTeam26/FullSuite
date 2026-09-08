/**
 * One BES Partner, in full.
 *
 * ── WHAT A PARTNER IS ──────────────────────────────────────────────────────
 *
 * A company or person BES has a commercial service relationship with. Not a
 * CreditOps client, not a SaaS tenant, not necessarily a company with end
 * clients at all. This screen has to read correctly for a fulfilment company
 * with five hundred clients AND for somebody who bought one GHL build, so
 * nothing on it assumes CreditOps and nothing assumes end clients exist.
 *
 * ── THE TAB LIST IS BUILT FROM PERMISSIONS ─────────────────────────────────
 *
 * Dee, 2026-09-07: "if they don't have access, do not show it." A manager
 * without partner financials gets no Billing & Revenue tab — not a locked one,
 * not a greyed one. The database refuses those queries as well; this is the
 * second half of the same rule rather than the first line of defence.
 *
 * Radix unmounts an inactive tab, so each tab's queries fire when it is opened
 * and not before — rule 14's "do not preload hidden tabs", enforced by the
 * component rather than by remembering.
 */
import { useState } from "react";
import { ArrowLeft, Handshake, Loader2 } from "lucide-react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { HqPageShell } from "@/pages/app/HqPages";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { OpsSelect } from "@/components/ui/ops-select";
import { Pill } from "@/components/agency/partner/partner-ui";
import { OwnerDeleteButton } from "@/components/agency/OwnerDeleteButton";
import { PartnerOverviewTab } from "@/components/agency/partner/PartnerOverviewTab";
import { PartnerServicesTab } from "@/components/agency/partner/PartnerServicesTab";
import { PartnerOperationsTab } from "@/components/agency/partner/PartnerOperationsTab";
import { PartnerClientsTab } from "@/components/agency/partner/PartnerClientsTab";
import { PartnerContactsTab } from "@/components/agency/partner/PartnerContactsTab";
import { PartnerTeamTab } from "@/components/agency/partner/PartnerTeamTab";
import { PartnerFilesTab } from "@/components/agency/partner/PartnerFilesTab";
import { PartnerPortalTab } from "@/components/agency/partner/PartnerPortalTab";
import { PartnerActivityTab } from "@/components/agency/partner/PartnerActivityTab";
import { PartnerBillingTab } from "@/components/agency/partner/PartnerBillingTab";
import {
  useAgencyPartner, usePartnerActions, usePartnerClientCounts, usePartnerContacts,
} from "@/lib/data/use-agency-partners";
import { usePartnerCatalogues, usePartnerServices } from "@/lib/data/use-partner-services";
import { useAgencyPermissions } from "@/lib/data/agency-permissions";
import { useWorkforce } from "@/lib/data/use-workforce";
import {
  HEALTH_LABEL, HEALTH_TONE, LIFECYCLE_LABEL, LIFECYCLE_TONE, PARTNER_LIFECYCLES,
  formatDaysActive, daysActive, rollUpServices, suggestedLifecycle,
  type PartnerLifecycle,
} from "@/lib/partners/partner-account";

export const PartnerProfilePage = () => {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const partner = useAgencyPartner(id);
  const perms = useAgencyPermissions();
  const workforce = useWorkforce();
  const services = usePartnerServices(id);
  const catalogues = usePartnerCatalogues();
  const counts = usePartnerClientCounts();
  const contacts = usePartnerContacts(id);
  const actions = usePartnerActions();
  const [tab, setTab] = useState("overview");

  if (partner.isLoading || perms.loading) {
    return (
      <HqPageShell title="Partner" description="Loading…" icon={Handshake}>
        <p className="py-10 text-center text-sm text-muted-foreground">
          <Loader2 className="mr-2 inline h-4 w-4 animate-spin" /> Loading…
        </p>
      </HqPageShell>
    );
  }

  const p = partner.data;
  if (!p) {
    return (
      <HqPageShell title="Partner not found" description="" icon={Handshake}>
        <p className="text-sm text-muted-foreground">
          This partner does not exist, or is outside what you are authorized to see.
        </p>
        <Link to="/app/bes-partners" className="mt-3 inline-flex items-center gap-1 text-sm text-primary hover:underline">
          <ArrowLeft className="h-4 w-4" /> Back to BES Partners
        </Link>
      </HqPageShell>
    );
  }

  const people = workforce.data?.people ?? [];
  const teams = workforce.data?.teams ?? [];
  const serviceRows = services.data ?? [];
  const roll = rollUpServices(serviceRows.map((s) => ({
    id: s.id, name: s.name, serviceType: s.serviceType, status: s.status,
  })));
  const clientCount = counts.data?.[p.id]?.activeClients ?? null;
  const activePortal = (contacts.data ?? []).filter((c) => c.userId && c.status === "active").length;
  const days = daysActive(p.startedOn, new Date().toISOString());
  const typeLabels = Object.fromEntries(
    (catalogues.data?.serviceTypes ?? []).map((t) => [t.code, t.label]),
  );
  const suggestion = suggestedLifecycle(p.lifecycle, roll);

  /* Built here, once. Both the trigger list and the content list read it, so a
     tab cannot exist in one and not the other. */
  const tabs = [
    { key: "overview", label: "Overview", show: true },
    { key: "services", label: "Services", show: true },
    { key: "operations", label: "Operations", show: true },
    { key: "clients", label: "Clients", show: true },
    { key: "contacts", label: "Contacts", show: true },
    { key: "team", label: "Team", show: true },
    { key: "files", label: "Files", show: perms.can("partners.files.view") },
    { key: "portal", label: "Portal", show: true },
    { key: "activity", label: "Activity", show: true },
    { key: "billing", label: "Billing & Revenue", show: perms.can("partners.financials.view") },
  ].filter((t) => t.show);

  return (
    <HqPageShell
      title={p.name}
      description={p.companyName ?? "BES Partner"}
      icon={Handshake}
      actions={
        perms.can("partners.edit") && (
          <div className="flex flex-wrap items-center gap-2">
            <OpsSelect aria-label="Partner lifecycle" size="sm" value={p.lifecycle}
              onValueChange={(v) => actions.setLifecycle.mutate({ id: p.id, lifecycle: v as PartnerLifecycle })}
              options={PARTNER_LIFECYCLES.map((l) => ({ value: l, label: LIFECYCLE_LABEL[l] }))} />
            {actions.setLifecycle.isPending && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
            {/* Owner only. Archiving keeps everything and is what everybody
                else has; this destroys the record, for the test partners Dee
                creates while trying the system. */}
            <OwnerDeleteButton table="outsourcing_groups" id={p.id} name={p.name}
              onDeleted={() => navigate("/app/bes-partners")} />
          </div>
        )
      }
    >
      <Link to="/app/bes-partners" className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> BES Partners
      </Link>

      {/* The header facts, in the order somebody actually asks for them. */}
      <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border border-border bg-card px-4 py-3">
        <Pill tone={LIFECYCLE_TONE[p.lifecycle]}>{LIFECYCLE_LABEL[p.lifecycle]}</Pill>
        {p.health && <Pill tone={HEALTH_TONE[p.health]}>{HEALTH_LABEL[p.health]}</Pill>}
        <Fact label="Primary contact" value={p.primaryContact ?? p.contactEmail} />
        <Fact label="Account manager"
          value={people.find((x) => x.userId === p.accountManagerId)?.name ?? "Unassigned"} />
        <Fact label="Team" value={teams.find((t) => t.id === p.teamId)?.name ?? "None"} />
        <Fact label="Services" value={`${roll.live} running`} />
        <Fact label="End clients" value={clientCount === null ? "—" : String(clientCount)} />
        <Fact label="Portal" value={activePortal === 0 ? "Nobody active" : `${activePortal} active`} />
        {days !== null && <Fact label="With BES" value={formatDaysActive(days)} />}
      </div>

      {p.lifecycle === "archived" && (
        <div className="mb-3 rounded-xl border border-border bg-muted px-4 py-3 text-sm text-muted-foreground">
          This partner is archived. Everything about them is kept — clients, work, invoices,
          payments, files and history. They no longer appear in active lists, and portal access
          is off.
        </div>
      )}

      {suggestion && perms.can("partners.edit") && (
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-blue-500/30 bg-blue-500/10 px-4 py-2.5 text-sm text-blue-900">
          <span>
            This partner is marked <strong>{LIFECYCLE_LABEL[p.lifecycle]}</strong>, but {suggestion.because}.
            Should it be <strong>{LIFECYCLE_LABEL[suggestion.lifecycle]}</strong>?
          </span>
          <Button size="sm" variant="outline"
            onClick={() => actions.setLifecycle.mutate({ id: p.id, lifecycle: suggestion.lifecycle })}>
            Set {LIFECYCLE_LABEL[suggestion.lifecycle]}
          </Button>
        </div>
      )}

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="h-8 flex-wrap bg-muted/60">
          {tabs.map((t) => (
            <TabsTrigger key={t.key} value={t.key} className="text-[11px]">{t.label}</TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="overview" className="mt-3">
          <PartnerOverviewTab partner={p} services={serviceRows} people={people} teams={teams}
            clientCount={clientCount} catalogue={typeLabels} />
        </TabsContent>
        <TabsContent value="services" className="mt-3">
          <PartnerServicesTab groupId={p.id} people={people} teams={teams} />
        </TabsContent>
        <TabsContent value="operations" className="mt-3">
          <PartnerOperationsTab groupId={p.id} people={people} />
        </TabsContent>
        <TabsContent value="clients" className="mt-3">
          <PartnerClientsTab groupId={p.id} />
        </TabsContent>
        <TabsContent value="contacts" className="mt-3">
          <PartnerContactsTab groupId={p.id} />
        </TabsContent>
        <TabsContent value="team" className="mt-3">
          <PartnerTeamTab partner={p} services={serviceRows} people={people} teams={teams} />
        </TabsContent>
        {perms.can("partners.files.view") && (
          <TabsContent value="files" className="mt-3">
            <PartnerFilesTab groupId={p.id} />
          </TabsContent>
        )}
        <TabsContent value="portal" className="mt-3">
          <PartnerPortalTab partner={p} />
        </TabsContent>
        <TabsContent value="activity" className="mt-3">
          <PartnerActivityTab groupId={p.id} />
        </TabsContent>
        {perms.can("partners.financials.view") && (
          <TabsContent value="billing" className="mt-3">
            <PartnerBillingTab groupId={p.id} people={people} />
          </TabsContent>
        )}
      </Tabs>
    </HqPageShell>
  );
};

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <span className="min-w-0">
      <span className="block text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{label}</span>
      <span className="block truncate text-sm text-foreground">{value}</span>
    </span>
  );
}
