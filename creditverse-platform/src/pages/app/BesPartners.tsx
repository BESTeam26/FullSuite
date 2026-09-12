/**
 * The BES Partner directory.
 *
 * ── WHAT IS ON THIS LIST ───────────────────────────────────────────────────
 *
 * Every company or person BES has a commercial service relationship with.
 * Not only CreditOps companies: somebody who bought one GHL build is here, so
 * is an hourly TalentOps arrangement, a retainer and a CRM subscription. The
 * canonical partner record is what puts them here.
 *
 * ── WHAT YOU SEE DEPENDS ON WHAT IS ASSIGNED TO YOU ────────────────────────
 *
 * An owner or administrator sees every partner. Everybody else sees the ones
 * assigned to them, to a live team they are on, or to a team in a department
 * they manage — decided by `can_see_partner()` in the database, so this list
 * is short for an agent because the rows never arrive, not because the screen
 * filtered them.
 *
 * "Unassigned" is therefore an owner and admin view by construction: a partner
 * nobody is assigned to is invisible to everybody else, which is precisely why
 * it is worth a screen of its own (Dee, §15).
 *
 * ── THE SECOND TABLE, AND WHY IT IS SEPARATE ───────────────────────────────
 *
 * A SaaS customer who ALSO bought fulfilment (rule 16, model 2) is a partner
 * too, but their record is an organization with a `fulfillment_engagements`
 * row — an AUTHORIZATION, which is the thing that lets BES staff reach their
 * data at all. Merging the two tables would put an access grant and a
 * commercial relationship in the same column, which is exactly the confusion
 * this release exists to end. They are listed apart and labelled.
 */
import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { AlertTriangle, Building2, ExternalLink, Handshake, Plus, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { OpsSelect } from "@/components/ui/ops-select";
import { AddPartnerDialog } from "@/components/agency/AddPartnerDialog";
import { DataSourceBadge } from "@/components/dashboard/DataSourceBadge";
import { Pill } from "@/components/agency/partner/partner-ui";
import { useAgencyPartners, usePartnerClientCounts } from "@/lib/data/use-agency-partners";
import { usePartnerCatalogues, usePartnerServiceSummary } from "@/lib/data/use-partner-services";
import { useWorkforce } from "@/lib/data/use-workforce";
import { useAllPartnerAssignments } from "@/lib/data/use-partner-assignments";
import { useAuth } from "@/lib/auth/auth-context";
import { useAgencyPermissions } from "@/lib/data/agency-permissions";
import { useAgency } from "@/lib/agency-context";
import { useFulfillment } from "@/lib/data/use-fulfillment";
import { useOutsourcingGroups } from "@/lib/data/use-partners";
import {
  HEALTH_LABEL, HEALTH_TONE, LIFECYCLE_LABEL, LIFECYCLE_TONE,
  PARTNER_HEALTHS, PARTNER_LIFECYCLES, healthNeedsAttention,
  type PartnerHealth, type PartnerLifecycle,
} from "@/lib/partners/partner-account";
import { buildBesPartners, RELATIONSHIP_LABEL, SERVICE_LABEL } from "@/lib/partners/bes-partner-domain";
import { partnerLabel } from "@/lib/partners/partner-label";
import { formatDate } from "@/lib/format-date";

const Tile = ({ label, value, hint, tone }: {
  label: string; value: number | string; hint: string; tone?: string;
}) => (
  <div className="rounded-2xl border border-border bg-card p-4">
    <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{label}</p>
    <p className={`mt-1 text-2xl font-bold ${tone ?? "text-foreground"}`}>{value}</p>
    <p className="mt-0.5 text-[11px] text-muted-foreground">{hint}</p>
  </div>
);

export default function BesPartners() {
  const partners = useAgencyPartners(true);
  const services = usePartnerServiceSummary();
  const counts = usePartnerClientCounts();
  const catalogues = usePartnerCatalogues();
  const workforce = useWorkforce();
  const perms = useAgencyPermissions();
  const navigate = useNavigate();

  const [q, setQ] = useState("");
  const [view, setView] = useState<"all" | "mine" | "unassigned">("all");
  const [lifecycle, setLifecycle] = useState<string>("open");
  const [health, setHealth] = useState<string>("any");
  const [serviceType, setServiceType] = useState<string>("any");
  const [adding, setAdding] = useState(false);

  const assignments = useAllPartnerAssignments();
  const { user, agencyMembership } = useAuth();
  const isAdmin = agencyMembership?.role === "agency_owner"
    || agencyMembership?.role === "agency_admin";
  /* Mine = assigned to me by name, or to a live team I am on. The same two
     branches the database uses, so the count on screen matches what an agent
     would actually receive. */
  const myTeamIds = new Set(
    (workforce.data?.teams ?? [])
      .filter((t) => !t.archived && t.members.some((m) => m.userId === user?.id))
      .map((t) => t.id),
  );
  const assignedToMe = (groupId: string) =>
    (assignments.data?.[groupId] ?? []).some(
      (a) => a.userId === user?.id || (a.teamId && myTeamIds.has(a.teamId)),
    );
  const isUnassigned = (groupId: string) => (assignments.data?.[groupId] ?? []).length === 0;

  const typeLabel = useMemo(() => Object.fromEntries(
    (catalogues.data?.serviceTypes ?? []).map((t) => [t.code, t.label]),
  ), [catalogues.data]);
  const people = workforce.data?.people ?? [];
  const teams = workforce.data?.teams ?? [];

  const all = partners.data ?? [];
  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return all.filter((p) => {
      if (view === "mine" && !assignedToMe(p.id)) return false;
      if (view === "unassigned" && !isUnassigned(p.id)) return false;
      if (lifecycle === "open" && (p.lifecycle === "archived" || p.lifecycle === "suspended")) return false;
      if (lifecycle !== "open" && lifecycle !== "any" && p.lifecycle !== lifecycle) return false;
      if (health === "attention" && !healthNeedsAttention(p.health)) return false;
      if (health !== "any" && health !== "attention" && p.health !== health) return false;
      if (serviceType !== "any" && !(services.data?.[p.id]?.live ?? []).includes(serviceType)) return false;
      if (!needle) return true;
      return [p.name, p.companyName ?? "", p.contactEmail, p.primaryContact ?? "", p.contractRef ?? ""]
        .join(" ").toLowerCase().includes(needle);
    });
  }, [all, q, view, lifecycle, health, serviceType, services.data, assignments.data, user?.id]);

  const active = all.filter((p) => p.lifecycle === "active").length;
  const onboarding = all.filter((p) => p.lifecycle === "onboarding" || p.lifecycle === "new").length;
  const atRisk = all.filter((p) => healthNeedsAttention(p.health)).length;
  const totalClients = Object.values(counts.data ?? {}).reduce((n, c) => n + c.activeClients, 0);

  /* Model 2: organizations BES also fulfils for. A different record shape and
     a different meaning, so a different table. */
  const agency = useAgency();
  const fulfillment = useFulfillment();
  const groups = useOutsourcingGroups();
  const engaged = useMemo(
    () => buildBesPartners(agency.organizations, groups.data ?? [], fulfillment.engagements)
      .filter((p) => p.relationship === "saas_and_fulfillment"),
    [agency.organizations, groups.data, fulfillment.engagements],
  );

  return (
    <div className="p-6 md:p-8">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight text-foreground">
            <Handshake className="h-6 w-6 text-primary" /> BES Partners
          </h1>
          <p className="max-w-3xl text-sm text-muted-foreground">
            Every company or person BES has a commercial service relationship with — fulfilment,
            CRM, staffing, retainers and one-off builds alike. A partner is the account; what BES
            sells them lives underneath it as service engagements.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <DataSourceBadge source="live" />
          {perms.can("partners.create") && (
            <Button size="sm" onClick={() => setAdding(true)}>
              <Plus className="mr-1.5 h-4 w-4" /> Add partner
            </Button>
          )}
        </div>
      </div>

      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Tile label="Active partners" value={active} hint="Relationships currently running" />
        <Tile label="New and onboarding" value={onboarding} hint="Not yet fully running" />
        <Tile label="Needing attention" value={atRisk}
          tone={atRisk > 0 ? "text-orange-700" : undefined}
          hint="Concerned or at risk, as somebody recorded it" />
        <Tile label="End clients" value={totalClients} hint="Counted from real client records" />
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2 rounded-2xl border border-border bg-card p-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)}
            placeholder="Partner, contact, contract reference…"
            className="w-full pl-9 sm:w-72" aria-label="Search partners" />
        </div>
        <OpsSelect aria-label="Which partners" value={view}
          onValueChange={(v) => setView(v as "all" | "mine" | "unassigned")}
          options={[
            { value: "all", label: isAdmin ? "All partners" : "Partners I can see" },
            { value: "mine", label: "My partners" },
            ...(isAdmin ? [{ value: "unassigned", label: "Unassigned — nobody is on them" }] : []),
          ]} />
        <OpsSelect aria-label="Lifecycle" value={lifecycle} onValueChange={setLifecycle}
          options={[
            { value: "open", label: "Currently working with" },
            { value: "any", label: "Every partner" },
            ...PARTNER_LIFECYCLES.map((l) => ({ value: l, label: LIFECYCLE_LABEL[l] })),
          ]} />
        <OpsSelect aria-label="Health" value={health} onValueChange={setHealth}
          options={[
            { value: "any", label: "Any health" },
            { value: "attention", label: "Needs attention" },
            ...PARTNER_HEALTHS.map((h) => ({ value: h, label: HEALTH_LABEL[h] })),
          ]} />
        <OpsSelect aria-label="Service" value={serviceType} onValueChange={setServiceType}
          options={[
            { value: "any", label: "Any service" },
            ...(catalogues.data?.serviceTypes ?? []).map((t) => ({ value: t.code, label: t.label })),
          ]} />
      </div>

      <div className="overflow-x-auto rounded-2xl border border-border bg-card">
        {partners.isLoading ? (
          <p className="p-6 text-sm text-muted-foreground">Loading partners…</p>
        ) : rows.length === 0 ? (
          <p className="p-6 text-sm text-muted-foreground">
            {all.length === 0
              ? "No partners recorded yet. Adding one needs a name and an email — nothing else."
              : "No partners match those filters."}
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-left text-[11px] uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-4 py-2.5">Partner</th>
                <th className="px-4 py-2.5">Status</th>
                <th className="px-4 py-2.5">Services</th>
                <th className="px-4 py-2.5">Assigned to</th>
                <th className="px-4 py-2.5 text-right">Clients</th>
                <th className="px-4 py-2.5">Since</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => {
                const summary = services.data?.[p.id];
                const count = counts.data?.[p.id]?.activeClients;
                return (
                  <tr key={p.id} className="border-t border-border/60 align-top transition-colors hover:bg-muted/40">
                    <td className="px-4 py-3">
                      <Link to={`/app/bes-partners/${p.id}`}
                        className="font-medium text-foreground hover:text-primary hover:underline">
                        {partnerLabel({ business: p.name, contact: p.primaryContact })}
                      </Link>
                      <p className="text-xs text-muted-foreground">
                        {p.companyName ? `${p.companyName} · ` : ""}{p.contactEmail}
                      </p>
                    </td>
                    <td className="px-4 py-3">
                      <span className="flex flex-wrap gap-1">
                        <Pill tone={LIFECYCLE_TONE[p.lifecycle as PartnerLifecycle]}>
                          {LIFECYCLE_LABEL[p.lifecycle as PartnerLifecycle]}
                        </Pill>
                        {p.health && (
                          <Pill tone={HEALTH_TONE[p.health as PartnerHealth]}>
                            {HEALTH_LABEL[p.health as PartnerHealth].split(" / ")[0]}
                          </Pill>
                        )}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {!summary || (summary.liveCount === 0 && summary.pausedCount === 0) ? (
                        <span className="text-xs text-muted-foreground">
                          {summary?.historicalCount
                            ? `${summary.historicalCount} finished or cancelled`
                            : "None recorded"}
                        </span>
                      ) : (
                        <span className="flex flex-wrap gap-1">
                          {summary.live.map((code) => (
                            <Pill key={code} tone="border-border bg-muted text-foreground">
                              {typeLabel[code] ?? code}
                            </Pill>
                          ))}
                          {summary.paused.map((code) => (
                            <Pill key={`paused-${code}`} tone="border-amber-500/40 bg-amber-500/10 text-amber-900">
                              {(typeLabel[code] ?? code) + " — on hold"}
                            </Pill>
                          ))}
                          {summary.historicalCount > 0 && (
                            <span className="text-[11px] text-muted-foreground">
                              +{summary.historicalCount} past
                            </span>
                          )}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      {(() => {
                        const rows = assignments.data?.[p.id] ?? [];
                        if (rows.length === 0) {
                          return <span className="text-amber-700">Nobody — only you can see it</span>;
                        }
                        const names = rows.map((a) =>
                          a.userId
                            ? people.find((x) => x.userId === a.userId)?.name ?? "Someone"
                            : teams.find((t) => t.id === a.teamId)?.name ?? "A team");
                        return [...new Set(names)].join(", ");
                      })()}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-foreground">
                      {count === undefined ? "—" : count}
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">{formatDate(p.startedOn)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
      <p className="mt-2 text-[11px] text-muted-foreground">
        Showing {rows.length} of {all.length} partner{all.length === 1 ? "" : "s"} you can see. Client
        counts come from real client records, not a figure anybody typed.
        {isAdmin && " An unassigned partner is visible to owners and administrators only — assign a team to put it in front of the people who work it."}
      </p>

      {engaged.length > 0 && (
        <div className="mt-6">
          <h2 className="mb-1 text-sm font-bold text-foreground">Organizations BES also fulfils for</h2>
          <p className="mb-2 max-w-3xl text-xs text-muted-foreground">
            SaaS customers who separately bought BES fulfilment. Their record is an organization with a
            live engagement — the same engagement that lets BES staff reach their operational data.
            Listed apart because an access grant and a commercial relationship are not the same thing.
          </p>
          <div className="overflow-x-auto rounded-2xl border border-border bg-card">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-left text-[11px] uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="px-4 py-2.5">Organization</th>
                  <th className="px-4 py-2.5">Relationship</th>
                  <th className="px-4 py-2.5">Live engagements</th>
                  <th className="px-4 py-2.5">Principal</th>
                  <th className="px-4 py-2.5" />
                </tr>
              </thead>
              <tbody>
                {engaged.map((p) => (
                  <tr key={p.scopeId} className="border-t border-border/60 align-top">
                    <td className="px-4 py-3 font-medium text-foreground">{partnerLabel({ business: p.name, contact: p.contactName })}</td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted px-2.5 py-0.5 text-[11px] font-semibold text-foreground">
                        {p.relationship === "outsourcing_only"
                          ? <AlertTriangle className="h-3 w-3" />
                          : <Building2 className="h-3 w-3" />}
                        {RELATIONSHIP_LABEL[p.relationship]}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {p.liveServices.length === 0 ? (
                        <span className="text-xs text-muted-foreground">
                          None live — BES cannot reach their records until one is
                        </span>
                      ) : (
                        <span className="flex flex-wrap gap-1">
                          {p.liveServices.map((s) => (
                            <Pill key={s} tone="border-emerald-500/30 bg-emerald-500/10 text-emerald-700">
                              {SERVICE_LABEL[s]}
                            </Pill>
                          ))}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-foreground">{p.contactName}</p>
                      <p className="text-xs text-muted-foreground">{p.contactEmail}</p>
                    </td>
                    <td className="px-4 py-3">
                      {p.organizationPublicId && (
                        <Link to={`/app/org/${p.organizationPublicId}`}
                          className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline">
                          Open <ExternalLink className="h-3 w-3" />
                        </Link>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {adding && (
        <AddPartnerDialog open={adding} onOpenChange={setAdding}
          onCreated={(id) => { setAdding(false); navigate(`/app/bes-partners/${id}`); }} />
      )}
    </div>
  );
}
