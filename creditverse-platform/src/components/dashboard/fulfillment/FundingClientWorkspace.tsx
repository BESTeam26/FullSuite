/**
 * Funding Client Workspace — the tabbed record for ONE Client / Borrower.
 *
 *   Overview | Deal List | Documents | Activity
 *
 * This is NOT the Deal Workspace. A Client may own multiple businesses and
 * have multiple funding deals over time. The Deal List tab is scope-aware to
 * this client's deals; opening a deal switches to the Deal Workspace.
 *
 * SOPs & Logins never appears here — it is company-level only.
 */

import { useState } from "react";
import {
  ArrowLeft,
  Building2,
  DollarSign,
  FileText,
  Layers,
  ChevronRight,
} from "lucide-react";
import { useFundingOpsStore } from "@/lib/fulfillment/fundingops-client-store";
import { FundingOpsActivityTimeline } from "./FundingOpsActivityTimeline";
import {
  clientGroupLabel,
  formatCurrency,
  FUNDING_STATUS_TONE,
} from "@/lib/fulfillment/fundingops-domain";
import {
  seedFundingBusinesses,
  seedFundingFiles,
} from "@/lib/fulfillment/fundingops-seed";
import { useFundingDealStore } from "@/lib/fulfillment/funding-deal-store";
import {
  FundingStatusPill,
  FundingModeBadge,
} from "./funding-client-list-helpers";
import { FundingDealListPanel } from "./FundingDealListPanel";
import { DOCUMENT_CATEGORIES, DOC_TONE, dealCode } from "./funding-deal-data";
import { cn } from "@/lib/utils";

interface Props {
  clientId: string;
  onBack: () => void;
  onOpenDeal: (dealId: string) => void;
}

type Tab = "overview" | "deals" | "documents" | "activity";

const TABS: { id: Tab; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "deals", label: "Deal List" },
  { id: "documents", label: "Documents" },
  { id: "activity", label: "Activity" },
];

export function FundingClientWorkspace({
  clientId,
  onBack,
  onOpenDeal,
}: Props) {
  const store = useFundingOpsStore();
  const dealStore = useFundingDealStore();
  const client = store.clients.find((c) => c.id === clientId);
  const [tab, setTab] = useState<Tab>("overview");

  if (!client) {
    return (
      <div className="flex h-full items-center justify-center p-10 text-center">
        <div>
          <p className="text-sm font-semibold text-foreground">
            Client not found
          </p>
          <button
            onClick={onBack}
            className="mt-3 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground"
          >
            Back
          </button>
        </div>
      </div>
    );
  }

  const businesses = seedFundingBusinesses.filter(
    (b) => b.clientId === clientId,
  );
  const files = seedFundingFiles.filter((f) => f.clientId === clientId);
  const deals = dealStore.deals.filter((d) => d.clientId === clientId);

  return (
    <div className="space-y-4 text-xs">
      {/* Header */}
      <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <button
              onClick={onBack}
              className="rounded-lg border border-border bg-muted/40 p-2 text-foreground hover:bg-muted"
            >
              <ArrowLeft className="h-4 w-4" />
            </button>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-foreground">
                  {client.name}
                </h2>
                <FundingModeBadge client={client} />
              </div>
              <p className="text-xs text-muted-foreground">
                {clientGroupLabel(client)} · {client.email}
                {client.phone ? ` · ${client.phone}` : ""}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <FundingStatusPill status={client.status} />
            <span className="text-[11px] text-muted-foreground">
              {deals.length} deal(s) · {files.length} file(s)
            </span>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="sticky top-0 z-10 flex items-center gap-1 overflow-x-auto border-b border-border bg-card px-1">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={cn(
              "whitespace-nowrap border-b-2 px-3.5 py-3 text-xs font-bold transition-all",
              tab === t.id
                ? "border-emerald-600 bg-emerald-500/10 text-status-success"
                : "border-transparent text-muted-foreground hover:bg-muted/40 hover:text-foreground",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {tab === "overview" && (
        <div className="grid gap-4 lg:grid-cols-2">
          {/* Client identity */}
          <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
            <h3 className="border-b border-border/50 pb-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
              Client / Borrower
            </h3>
            <dl className="mt-3 space-y-1.5">
              <Row label="Name" value={client.name} />
              <Row label="Email" value={client.email} />
              <Row label="Phone" value={client.phone ?? "—"} />
              <Row label="Partner" value={clientGroupLabel(client)} />
              <Row
                label="Provenance"
                value={
                  client.provenance === "bes_saas_synced"
                    ? "BES SaaS Synced"
                    : "Agency Manual"
                }
              />
              <Row
                label="Assigned Agent"
                value={client.assignedAgent ?? "Unassigned"}
              />
              <Row
                label="Total Requested"
                value={
                  client.totalRequested
                    ? formatCurrency(client.totalRequested)
                    : "—"
                }
              />
              <Row label="Open Files" value={String(client.openFiles)} />
              <Row label="Created" value={client.createdAt} />
            </dl>
          </div>

          {/* Businesses */}
          <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
            <h3 className="flex items-center gap-2 border-b border-border/50 pb-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
              <Building2 className="h-4 w-4 text-primary" /> Businesses
            </h3>
            <div className="mt-3 space-y-2">
              {businesses.map((b) => (
                <div
                  key={b.id}
                  className="rounded-lg border border-border bg-muted/20 p-3"
                >
                  <p className="font-semibold text-foreground">
                    {b.legalName}
                    {b.dba && (
                      <span className="ml-1 text-muted-foreground">
                        (DBA: {b.dba})
                      </span>
                    )}
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    {b.industry}
                    {b.annualRevenue && ` · Revenue: ${b.annualRevenue}`}
                    {b.timeInBusiness && ` · ${b.timeInBusiness}`}
                    {b.ein && ` · EIN: ${b.ein}`}
                  </p>
                </div>
              ))}
              {businesses.length === 0 && (
                <p className="text-[11px] text-muted-foreground">
                  No businesses on file.
                </p>
              )}
            </div>
          </div>

          {/* Funding Files summary */}
          <div className="rounded-xl border border-border bg-card p-4 shadow-sm lg:col-span-2">
            <h3 className="flex items-center gap-2 border-b border-border/50 pb-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
              <DollarSign className="h-4 w-4 text-status-success" /> Funding
              Files
            </h3>
            <div className="mt-3 space-y-2">
              {files.map((f) => (
                <div
                  key={f.id}
                  className="flex items-center justify-between rounded-lg border border-border bg-muted/20 p-3"
                >
                  <div>
                    <p className="font-semibold text-foreground">
                      {f.businessName}
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      {f.purpose} · {f.dealCount} deal(s)
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-foreground">
                      {formatCurrency(f.requestedAmount)}
                    </span>
                    <span
                      className={cn(
                        "inline-flex rounded-full border px-2 py-0.5 text-[10px] font-medium",
                        FUNDING_STATUS_TONE[f.stage] ??
                          "bg-muted text-muted-foreground border-border",
                      )}
                    >
                      {f.stage}
                    </span>
                  </div>
                </div>
              ))}
              {files.length === 0 && (
                <p className="text-[11px] text-muted-foreground">
                  No funding files on record.
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {tab === "deals" && (
        <FundingDealListPanel clientId={clientId} onOpenDeal={onOpenDeal} />
      )}

      {tab === "documents" && (
        <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
          <h3 className="flex items-center gap-2 border-b border-border/50 pb-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
            <FileText className="h-4 w-4 text-primary" /> Document Review
          </h3>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {DOCUMENT_CATEGORIES.map((d) => (
              <div
                key={d.id}
                className="flex items-center justify-between rounded-lg border border-border bg-muted/20 px-3 py-2"
              >
                <span className="font-medium text-foreground">{d.label}</span>
                <span
                  className={cn(
                    "inline-flex rounded-full border px-2 py-0.5 text-[10px] font-medium",
                    DOC_TONE[d.status] ??
                      "bg-muted text-muted-foreground border-border",
                  )}
                >
                  {d.status}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === "activity" && <FundingOpsActivityTimeline clientId={clientId} />}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-medium text-foreground">{value}</dd>
    </div>
  );
}
