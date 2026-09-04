import {
  Workflow,
  CreditCard,
  Banknote,
  Gift,
  FileText,
  Zap,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { SectionCard, Field, ToggleRow, PlaceholderNote } from "../shared";
import { useAgencySettings } from "@/lib/agency-settings-context";

/* ---------------- Fulfillment ---------------- */
export const FulfillmentSection = () => (
  <SectionCard
    icon={Workflow}
    title="Fulfillment Settings"
    description="HQ Done-For-You services: service types, eligible Organizations, SLA rules, routing, QA requirements, handoff rules, and escalation thresholds."
  >
    <div className="space-y-3">
      {[
        {
          t: "CreditOps Round Processing",
          sla: "24h",
          team: "Processing Team",
          qa: true,
        },
        {
          t: "CFPB Complaint Filing",
          sla: "72h",
          team: "Complaints",
          qa: true,
        },
        {
          t: "Experian Upload",
          sla: "12h",
          team: "Processing Team",
          qa: false,
        },
        {
          t: "Reimport & Progress Report",
          sla: "48h",
          team: "QA Team",
          qa: true,
        },
      ].map((r) => (
        <div
          key={r.t}
          className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border p-4"
        >
          <div>
            <p className="text-sm font-medium text-foreground">{r.t}</p>
            <p className="text-[11px] text-muted-foreground">
              SLA {r.sla} · {r.team} · QA {r.qa ? "required" : "optional"}
            </p>
          </div>
          <div className="flex gap-2">
            <Badge variant="outline" className="text-[10px]">
              SLA {r.sla}
            </Badge>
            {r.qa && (
              <Badge
                variant="outline"
                className="text-[10px] border-primary/30 text-primary"
              >
                QA
              </Badge>
            )}
          </div>
        </div>
      ))}
    </div>
  </SectionCard>
);

/* ---------------- CreditOps Configuration ---------------- */
export const CreditOpsSection = () => (
  <SectionCard
    icon={CreditCard}
    title="CreditOps Configuration"
    description="Agency-controlled defaults for statuses, rounds, workflows, SLA/ETA, report providers, letter categories, and QA rules. Critical legal/deterministic rules remain controlled domain logic."
  >
    <PlaceholderNote />
    <div className="grid gap-4 sm:grid-cols-2">
      <Field label="Default round cycle (days)">
        <Input placeholder="e.g. 30" disabled />
      </Field>
      <Field label="Reinvestigation extension (days)">
        <Input placeholder="e.g. 45" disabled />
      </Field>
      <Field label="Default report provider">
        <Input placeholder="e.g. SmartCredit" disabled />
      </Field>
      <Field label="QA pass threshold">
        <Input placeholder="e.g. 96%" disabled />
      </Field>
    </div>
    <div className="mt-4 space-y-2">
      <ToggleRow
        label="Require consumer attestation before dispute"
        description="The Truth Gate runs before any letter is generated (lib/dispute/metro2-guardrails). Unconditional."
        checked
        onChange={() => {}}
        state="enforced"
      />
      <ToggleRow
        label="Block advance-fee billing (CROA)"
        description="No billing-eligibility engine exists yet; this rule is not enforced by software."
        checked={false}
        onChange={() => {}}
        state="unbuilt"
      />
      <ToggleRow
        label="Experian upload-only (no mail)"
        description="Fixed in the dispute engine (cra-addresses-and-workflows, package-builder). Not configurable."
        checked
        onChange={() => {}}
        state="enforced"
      />
    </div>
  </SectionCard>
);

/* ---------------- FundingOps Configuration ---------------- */
export const FundingOpsSection = () => (
  <SectionCard
    icon={Banknote}
    title="FundingOps Configuration"
    description="Funding stages, deal types, document categories, readiness statuses, submission/offer statuses, lender administration, and BRM/Sales Partner/Lender access defaults."
  >
    <div className="grid gap-4 sm:grid-cols-2">
      <div>
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          Funding Stages
        </p>
        <div className="space-y-2">
          {[
            "Application",
            "Readiness Review",
            "Document Collection",
            "Lender Matching",
            "Submission",
            "Conditions",
            "Offer",
            "Funded",
          ].map((s, i) => (
            <div
              key={s}
              className="flex items-center gap-2 rounded-lg border border-border p-2.5 text-sm"
            >
              <span className="flex h-5 w-5 items-center justify-center rounded bg-primary/10 text-[10px] font-semibold text-primary">
                {i + 1}
              </span>
              <span className="font-medium text-foreground">{s}</span>
            </div>
          ))}
        </div>
      </div>
      <div>
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          Access Defaults
        </p>
        <div className="space-y-2">
          <ToggleRow
            label="BRM sees assigned deals only"
            description="Access is decided per record by database policy, not by this switch."
            checked={false}
            onChange={() => {}}
            state="unbuilt"
          />
          <ToggleRow
            label="Sales Partner sees own referrals only"
            description="Access is decided per record by database policy, not by this switch."
            checked={false}
            onChange={() => {}}
            state="unbuilt"
          />
          <ToggleRow
            label="Lender sees submissions sent to them only"
            description="Access is decided per record by database policy, not by this switch."
            checked={false}
            onChange={() => {}}
            state="unbuilt"
          />
        </div>
      </div>
    </div>
  </SectionCard>
);

/* ---------------- DIY & Referrals ---------------- */
export const DiyReferralsSection = () => (
  <SectionCard
    icon={Gift}
    title="DIY Credit & Referral Program"
    description="BES-owned DIY product: program status, consumer plans, referral commission rules, attribution window, approved partners, payout states, and lead routing."
  >
    <PlaceholderNote />
    <div className="grid gap-4 sm:grid-cols-2">
      <Field label="Attribution window (days)">
        <Input placeholder="e.g. 90" disabled />
      </Field>
      <Field label="Default commission (%)">
        <Input placeholder="e.g. 15" disabled />
      </Field>
      <Field label="Partner plan price ($/mo)">
        <Input placeholder="e.g. 49.99" disabled />
      </Field>
      <Field label="Direct DIY price ($/mo)">
        <Input placeholder="e.g. 39" disabled />
      </Field>
    </div>
    <div className="mt-4 space-y-2">
      <ToggleRow
        label="Professional-help requests route to referring partner"
        checked={false}
        onChange={() => {}}
        state="unbuilt"
      />
      <ToggleRow
        label="Funding-interest requests route to eligible FundingOps org"
        checked={false}
        onChange={() => {}}
        state="unbuilt"
      />
      <ToggleRow
        label="Direct BES leads never auto-assigned to a partner"
        checked={false}
        onChange={() => {}}
        state="unbuilt"
      />
    </div>
  </SectionCard>
);

/* ---------------- Templates & Catalogs ---------------- */
export const TemplatesSection = () => (
  <SectionCard
    icon={FileText}
    title="Templates & Catalogs"
    description="Reusable configuration: project templates, work types, checklists, status sets, SLA templates, email/update templates, QA templates, and service catalogs."
  >
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {[
        "Round 1 Dispute Template",
        "MOV Escalation Template",
        "Furnisher Direct Dispute",
        "Identity Theft Block (§1681c-2)",
        "CFPB Complaint Template",
        "Progress Report Template",
        "Funding Readiness Checklist",
        "QA Checklist v2",
        "Onboarding Checklist",
      ].map((t) => (
        <div
          key={t}
          className="rounded-xl border border-border p-3 text-sm hover:border-primary/40"
        >
          <p className="font-medium text-foreground">{t}</p>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            Reusable · Versioned
          </p>
        </div>
      ))}
    </div>
  </SectionCard>
);

/* ---------------- Workflow & Automation Defaults ---------------- */
export const AutomationsSection = () => (
  <SectionCard
    icon={Zap}
    title="Workflow & Automation Defaults"
    description="Reusable rules: Trigger → Conditions → Actions → Audit. Simple, auditable, and configurable."
  >
    <div className="space-y-2">
      {[
        "Work assigned → Notify assignee",
        "Work completed → Move to Production",
        "QA correction → Return to My Work + Attention",
        "Handoff → Notify target team",
        "Overdue → Escalate to Attention Center",
        "Service activated → Provision workspace",
      ].map((r) => (
        <ToggleRow key={r} label={r} checked onChange={() => {}} />
      ))}
    </div>
  </SectionCard>
);
