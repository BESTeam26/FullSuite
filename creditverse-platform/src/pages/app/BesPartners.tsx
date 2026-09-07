/**
 * BES Partners — the companies BES actually does work for.
 *
 * Dee, 2026-09-06: *"AGENCY HQ 'Clients' should NOT mean end consumers. At BES
 * Agency HQ, use BES PARTNERS."*
 *
 * This is deliberately NOT a directory of anyone's end customers, and not a
 * list of SaaS subscribers either. A company appears here because a
 * `fulfillment_engagements` row says BES was hired to do something for them —
 * the same row `bes_may_fulfil()` reads inside RLS. Screen and database agree
 * because they read the same fact.
 */
import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Handshake, Search, Building2, ExternalLink, AlertTriangle, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AddPartnerDialog } from "@/components/agency/AddPartnerDialog";
import { useAgencyPartners } from "@/lib/data/use-agency-partners";
import { useAuth } from "@/lib/auth/auth-context";
import { atLeast, type AgencyRole } from "@/lib/agency/navigation";
import { Input } from "@/components/ui/input";
import { OpsSelect } from "@/components/ui/ops-select";
import { DataSourceBadge } from "@/components/dashboard/DataSourceBadge";
import { formatDate } from "@/lib/format-date";
import { useAgency } from "@/lib/agency-context";
import { useFulfillment } from "@/lib/data/use-fulfillment";
import { useOutsourcingGroups } from "@/lib/data/use-partners";
import {
  buildBesPartners,
  filterPartners,
  serviceTotals,
  RELATIONSHIP_LABEL,
  SERVICE_LABEL,
  type PartnerFilter,
} from "@/lib/partners/bes-partner-domain";
import type { FulfillmentService } from "@/lib/data/fulfillment-engagements";

const SERVICE_ORDER: FulfillmentService[] = ["creditops", "fundingops", "bes_crm", "talentops"];

const Tile = ({ label, value, hint }: { label: string; value: number; hint: string }) => (
  <div className="rounded-2xl border border-border bg-card p-4">
    <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{label}</p>
    <p className="mt-1 text-2xl font-bold text-foreground">{value}</p>
    <p className="mt-0.5 text-[11px] text-muted-foreground">{hint}</p>
  </div>
);

export default function BesPartners() {
  const agency = useAgency();
  const fulfillment = useFulfillment();
  const groups = useOutsourcingGroups();
  const [filter, setFilter] = useState<PartnerFilter>("live");
  const [q, setQ] = useState("");

  const partners = useMemo(
    () => buildBesPartners(agency.organizations, groups.data ?? [], fulfillment.engagements),
    [agency.organizations, groups.data, fulfillment.engagements],
  );
  const rows = useMemo(() => filterPartners(partners, filter, q), [partners, filter, q]);
  const totals = useMemo(() => serviceTotals(partners), [partners]);
  const loading = fulfillment.isLoading || groups.isLoading;
  const manual = useAgencyPartners();
  const { agencyMembership } = useAuth();
  const canManage = atLeast((agencyMembership?.role as AgencyRole) ?? null, "agency_manager");
  const [adding, setAdding] = useState(false);
  const navigate = useNavigate();

  return (
    <div className="p-6 md:p-8">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight text-foreground">
            <Handshake className="h-6 w-6 text-primary" /> BES Partners
          </h1>
          <p className="max-w-3xl text-sm text-muted-foreground">
            The companies BES is engaged to do work for. A software subscription alone does not put a
            company on this list — an engagement does, and that same engagement is what lets BES staff
            reach their records at all.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <DataSourceBadge source="live" />
          {canManage && (
            <Button size="sm" onClick={() => setAdding(true)}>
              <Plus className="mr-1.5 h-4 w-4" /> Add partner
            </Button>
          )}
        </div>
      </div>

      {/* Partners added by hand, with no engagement and no SaaS tenant. They
          are the same records the list above reads — a partner reaches this
          page because BES recorded them, not because they bought software. */}
      {(manual.data ?? []).length > 0 && (
        <div className="mb-4 rounded-2xl border border-border bg-card p-3">
          <p className="mb-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
            All partner records
          </p>
          <ul className="divide-y divide-border/50">
            {(manual.data ?? []).map((m) => (
              <li key={m.id}>
                <Link to={`/app/bes-partners/${m.id}`}
                  className="flex flex-wrap items-center justify-between gap-2 py-2 transition-colors hover:bg-muted/50">
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium text-foreground">{m.name}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {m.companyName ? `${m.companyName} · ` : ""}{m.contactEmail}
                    </span>
                  </span>
                  <span className="shrink-0 rounded-full border border-border bg-muted px-2 py-0.5 text-[10px] font-bold text-muted-foreground">
                    {m.status}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {SERVICE_ORDER.map((s) => (
          <Tile key={s} label={SERVICE_LABEL[s]} value={totals[s]} hint="partners with a live engagement" />
        ))}
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2 rounded-2xl border border-border bg-card p-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Partner, contact, contract reference…"
            className="w-full pl-9 sm:w-72"
            aria-label="Search partners"
          />
        </div>
        <OpsSelect
          value={filter}
          onValueChange={(v) => setFilter(v as PartnerFilter)}
          options={[
            { value: "live", label: "Live engagements" },
            { value: "all", label: "All partners" },
            { value: "dormant", label: "Nothing live" },
          ]}
          aria-label="Engagement filter"
        />
      </div>

      <div className="overflow-x-auto rounded-2xl border border-border bg-card">
        {loading ? (
          <p className="p-6 text-sm text-muted-foreground">Loading partners…</p>
        ) : rows.length === 0 ? (
          <p className="p-6 text-sm text-muted-foreground">
            {partners.length === 0
              ? "No engagements recorded yet. A partner appears here once BES is engaged to perform a service for them."
              : "No partners match."}
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-left text-[11px] uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-4 py-2.5">Partner</th>
                <th className="px-4 py-2.5">Relationship</th>
                <th className="px-4 py-2.5">Engagements</th>
                <th className="px-4 py-2.5">Primary contact</th>
                <th className="px-4 py-2.5">Organization</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => (
                <tr key={p.scopeId} className="border-t border-border/60 align-top">
                  <td className="px-4 py-3">
                    <p className="font-medium text-foreground">{p.name}</p>
                    {p.contractRef && (
                      <p className="font-mono text-[10px] text-muted-foreground">{p.contractRef}</p>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted px-2.5 py-0.5 text-[11px] font-semibold text-foreground">
                      {p.relationship === "outsourcing_only" ? (
                        <AlertTriangle className="h-3 w-3" />
                      ) : (
                        <Building2 className="h-3 w-3" />
                      )}
                      {RELATIONSHIP_LABEL[p.relationship]}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {p.services.length === 0 ? (
                      <span className="text-xs text-muted-foreground">
                        None recorded — BES cannot reach their records until one is
                      </span>
                    ) : (
                      <ul className="space-y-1">
                        {p.services.map((s) => (
                          <li key={`${s.service}-${s.effectiveFrom}`} className="flex flex-wrap items-center gap-2">
                            <span
                              className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${
                                s.live
                                  ? "border-emerald-600/30 bg-emerald-500/10 text-status-success"
                                  : "border-border bg-muted text-muted-foreground"
                              }`}
                            >
                              {SERVICE_LABEL[s.service]}
                            </span>
                            <span className="text-[11px] text-muted-foreground">
                              {s.live ? "Live" : s.status} · from {formatDate(s.effectiveFrom)}
                              {s.effectiveTo ? ` to ${formatDate(s.effectiveTo)}` : ""}
                              {s.authorizedTeam ? " · team-scoped" : ""}
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <p className="text-foreground">{p.contactName}</p>
                    <p className="text-xs text-muted-foreground">{p.contactEmail}</p>
                  </td>
                  <td className="px-4 py-3">
                    {p.organizationPublicId ? (
                      <Link
                        to={`/app/org/${p.organizationPublicId}`}
                        className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                      >
                        Open organization <ExternalLink className="h-3 w-3" />
                      </Link>
                    ) : (
                      <span className="text-xs text-muted-foreground">No SaaS tenant</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <p className="mt-2 text-[11px] text-muted-foreground">
        Showing {rows.length} of {partners.length} partner{partners.length === 1 ? "" : "s"}. Partner
        health, SLA and recent activity are not shown because no canonical measure of them exists yet.
      </p>
      {adding && (
        <AddPartnerDialog
          open={adding}
          onOpenChange={setAdding}
          onCreated={(id) => { setAdding(false); navigate(`/app/bes-partners/${id}`); }}
        />
      )}
    </div>
  );
}
