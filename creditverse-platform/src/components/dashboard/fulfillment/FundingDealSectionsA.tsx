/**
 * Funding Deal Workspace — operational panel sections (part 1).
 * Pure-presentational sections taking state via props from the parent workspace.
 */

import {
  Building2,
  ShieldCheck,
  FileText,
  ListChecks,
  Edit2,
  Check,
} from "lucide-react";
import { formatCurrency } from "@/lib/fulfillment/fundingops-domain";
import type {
  FundingBusiness,
  FundingFile,
  FundingDeal,
  FundingClient,
} from "@/lib/fulfillment/fundingops-domain";
import {
  READINESS_AREAS,
  READINESS_TONE,
  DOCUMENT_CATEGORIES,
  DOC_TONE,
  type Stip,
} from "./funding-deal-data";
import { cn } from "@/lib/utils";

export function DealClientBusinessSection({
  client,
  business,
  file,
  deal,
}: {
  client?: FundingClient;
  business?: FundingBusiness;
  file?: FundingFile;
  deal: FundingDeal;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
      <h3 className="flex items-center gap-2 border-b border-border/50 pb-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
        <Building2 className="h-4 w-4 text-primary" /> Client / Business
      </h3>
      <div className="mt-3 grid grid-cols-2 gap-3">
        <div className="rounded-lg border border-border bg-muted/20 p-3">
          <p className="text-[10px] font-semibold uppercase text-muted-foreground">
            Borrower
          </p>
          <p className="font-semibold text-foreground">{client?.name ?? "—"}</p>
          <p className="text-[11px] text-muted-foreground">
            {client?.email ?? "—"}
          </p>
        </div>
        <div className="rounded-lg border border-border bg-muted/20 p-3">
          <p className="text-[10px] font-semibold uppercase text-muted-foreground">
            Business
          </p>
          <p className="font-semibold text-foreground">
            {business?.legalName ?? file?.businessName ?? "—"}
          </p>
          <p className="text-[11px] text-muted-foreground">
            {business?.industry ?? "—"}
            {business?.annualRevenue && ` · ${business.annualRevenue}`}
            {business?.timeInBusiness && ` · ${business.timeInBusiness}`}
          </p>
        </div>
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2 text-[11px]">
        <div className="rounded-lg border border-border bg-muted/20 p-2">
          <p className="font-semibold uppercase text-muted-foreground">
            Requested
          </p>
          <p className="font-bold text-foreground">
            {formatCurrency(deal.amount)}
          </p>
        </div>
        <div className="rounded-lg border border-border bg-muted/20 p-2">
          <p className="font-semibold uppercase text-muted-foreground">
            Rate / Term
          </p>
          <p className="font-bold text-foreground">
            {deal.rate ?? "—"} · {deal.term ?? "—"}
          </p>
        </div>
        <div className="rounded-lg border border-border bg-muted/20 p-2">
          <p className="font-semibold uppercase text-muted-foreground">
            Funding File
          </p>
          <p className="font-bold text-foreground">{file?.purpose ?? "—"}</p>
        </div>
      </div>
    </div>
  );
}

export function DealDescriptionSection({
  description,
  setDescription,
  isEditing,
  setIsEditing,
}: {
  description: string;
  setDescription: (v: string) => void;
  isEditing: boolean;
  setIsEditing: (v: boolean) => void;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
      <div className="flex items-center justify-between border-b border-border/50 pb-2">
        <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
          Main Description
        </h3>
        <button
          onClick={() => setIsEditing(!isEditing)}
          className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
        >
          {isEditing ? (
            <Check className="h-3.5 w-3.5" />
          ) : (
            <Edit2 className="h-3.5 w-3.5" />
          )}
          {isEditing ? "Done" : "Edit"}
        </button>
      </div>
      {isEditing ? (
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={6}
          className="mt-3 w-full rounded-lg border border-border bg-background p-3 font-mono text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
        />
      ) : (
        <div className="mt-3 whitespace-pre-wrap rounded-lg bg-muted/30 p-3 font-mono text-xs leading-relaxed text-foreground">
          {description}
        </div>
      )}
    </div>
  );
}

export function DealReadinessSection() {
  return (
    <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
      <h3 className="flex items-center gap-2 border-b border-border/50 pb-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
        <ShieldCheck className="h-4 w-4 text-status-success" /> Funding
        Readiness
      </h3>
      <p className="mt-2 text-[11px] text-muted-foreground">
        Operational readiness — is this file complete enough to match &amp;
        submit? Not a lender credit decision.
      </p>
      <div className="mt-3 grid grid-cols-2 gap-2">
        {READINESS_AREAS.map((r) => (
          <div
            key={r.id}
            className="flex items-center justify-between rounded-lg border border-border bg-muted/20 px-2.5 py-1.5"
          >
            <span className="text-foreground">{r.label}</span>
            <span
              className={cn(
                "inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold",
                READINESS_TONE[r.state] ??
                  "bg-muted text-muted-foreground border-border",
              )}
            >
              {r.state}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function DealDocumentsSection() {
  return (
    <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
      <h3 className="flex items-center gap-2 border-b border-border/50 pb-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
        <FileText className="h-4 w-4 text-primary" /> Document Review
      </h3>
      <div className="mt-3 space-y-1.5">
        {DOCUMENT_CATEGORIES.map((d) => (
          <div
            key={d.id}
            className="flex items-center justify-between rounded-lg border border-border bg-muted/20 px-2.5 py-1.5"
          >
            <span className="text-foreground">{d.label}</span>
            <span
              className={cn(
                "inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold",
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
  );
}

export function DealStipulationsSection({
  lender,
  stips,
  toggleStip,
}: {
  lender: string;
  stips: Stip[];
  toggleStip: (id: string) => void;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
      <h3 className="flex items-center gap-2 border-b border-border/50 pb-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
        <ListChecks className="h-4 w-4 text-status-warning" /> Stipulations —{" "}
        {lender}
      </h3>
      <p className="mt-2 text-[11px] text-muted-foreground">
        Stips belong to this lender submission, not globally to the client.
      </p>
      <div className="mt-3 space-y-1.5">
        {stips.map((s) => (
          <label
            key={s.id}
            className="flex cursor-pointer items-center gap-2 rounded-lg border border-border bg-muted/20 px-2.5 py-1.5 hover:bg-muted/40"
          >
            <input
              type="checkbox"
              checked={s.done}
              onChange={() => toggleStip(s.id)}
              className="h-3.5 w-3.5 rounded border-border text-primary focus:ring-primary"
            />
            <span
              className={cn(
                "flex-1",
                s.done && "text-muted-foreground line-through",
              )}
            >
              {s.req}
            </span>
            <span className="text-[10px] text-muted-foreground">{s.party}</span>
          </label>
        ))}
      </div>
    </div>
  );
}
