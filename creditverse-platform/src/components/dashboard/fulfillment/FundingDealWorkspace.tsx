/**
 * Funding Deal Workspace — the canonical ClickUp-style working record for ONE
 * lender deal inside a Funding File.
 *
 *   LEFT  : Client / Business, Request, Funding status, Assigned team, BRM,
 *           Sales Partner, Readiness, Documents, Matches, Submission status,
 *           Stipulations, Offers, Next action, SLA, Checklist, Work Completion
 *   RIGHT : Activity / Comments timeline + composer
 *
 * A Funding File may hold multiple lender Deals. Each Deal is its own working
 * unit — funding one deal does not delete the file or the other submissions.
 */

import { useState } from "react";
import { ArrowLeft, Clock } from "lucide-react";
import { useFundingOpsStore } from "@/lib/fulfillment/fundingops-client-store";
import { useFundingDealStore } from "@/lib/fulfillment/funding-deal-store";
import {
  clientGroupLabel,
  formatCurrency,
  DEAL_STATUSES,
  type DealStatus,
  type FundingDeal,
} from "@/lib/fulfillment/fundingops-domain";
import {
  seedFundingBusinesses,
  seedFundingFiles,
} from "@/lib/fulfillment/fundingops-seed";
import { FundingModeBadge } from "./funding-client-list-helpers";
import { dealCode, SEED_STIPS } from "./funding-deal-data";
import {
  DealClientBusinessSection,
  DealDescriptionSection,
  DealReadinessSection,
  DealDocumentsSection,
  DealStipulationsSection,
} from "./FundingDealSectionsA";
import {
  DealNextActionWorkabilitySection,
  DealChecklistSection,
  type ChecklistItem,
  DealWorkCompletionSection,
} from "./FundingDealSectionsB";
import { DealActivitySection } from "./DealActivitySection";
import { WORK_GROUPS } from "./funding-deal-data";
import { cn } from "@/lib/utils";
import { OpsSelect } from "@/components/ui/ops-select";

interface Props {
  dealId: string;
  onBack: () => void;
}

export function FundingDealWorkspace({ dealId, onBack }: Props) {
  const store = useFundingOpsStore();
  const dealStore = useFundingDealStore();
  const deal = dealStore.getDeal(dealId);

  const [description, setDescription] = useState(
    deal
      ? `Deal ${dealCode(deal.id)} — ${deal.lender} · ${deal.program}\nAmount: ${formatCurrency(deal.amount)}${deal.rate ? ` · Rate: ${deal.rate}` : ""}${deal.term ? ` · Term: ${deal.term}` : ""}\nStatus: ${deal.status}\nStips outstanding: ${deal.stipsOutstanding}`
      : "",
  );
  const [isEditingDesc, setIsEditingDesc] = useState(false);
  const [isEditingFields, setIsEditingFields] = useState(false);
  const [fieldDraft, setFieldDraft] = useState({
    lender: deal?.lender ?? "",
    program: deal?.program ?? "",
    amount: deal ? String(deal.amount) : "",
    rate: deal?.rate ?? "",
    term: deal?.term ?? "",
  });
  const [nextAction, setNextAction] = useState(
    "Collect outstanding stipulations & submit to matched lender",
  );
  const [workabilityBlocker, setWorkabilityBlocker] = useState<string | null>(
    null,
  );
  const [blockerInput, setBlockerInput] = useState("");
  const [showBlockerInput, setShowBlockerInput] = useState(false);

  const [checklists, setChecklists] = useState<ChecklistItem[]>([
    { id: "dchk-1", text: "Business profile & EIN verified", done: true },
    { id: "dchk-2", text: "Bank statements collected (3 months)", done: true },
    {
      id: "dchk-3",
      text: "Funding readiness assessment complete",
      done: false,
    },
    { id: "dchk-4", text: "Lender program shortlist prepared", done: false },
  ]);
  const [newCheckitem, setNewCheckitem] = useState("");
  const [stips, setStips] = useState(SEED_STIPS);
  const [selectedWork, setSelectedWork] = useState<string[]>([]);
  const [workNotes, setWorkNotes] = useState("");
  const [comment, setComment] = useState("");

  if (!deal) {
    return (
      <div className="flex h-full items-center justify-center p-10 text-center">
        <div>
          <p className="text-sm font-semibold text-foreground">
            Deal not found
          </p>
          <button
            onClick={onBack}
            className="mt-3 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground"
          >
            Back to list
          </button>
        </div>
      </div>
    );
  }

  const client = store.clients.find((c) => c.id === deal.clientId);
  const file = seedFundingFiles.find((f) => f.id === deal.fileId);
  const business = seedFundingBusinesses.find((b) => b.id === file?.businessId);
  const deptStatuses = client ? store.getDepartmentStatuses(client.id) : [];
  const clientActivity = client ? store.getActivity(client.id) : [];
  const dealActivity = dealStore.getDealActivity(deal.id);
  const activity = [...dealActivity, ...clientActivity];

  const handleStatusChange = (newStatus: DealStatus) => {
    dealStore.updateDealStatus(deal.id, newStatus, "Agent (BES HQ)");
  };

  const saveFields = () => {
    dealStore.updateDeal(
      deal.id,
      {
        lender: fieldDraft.lender.trim(),
        program: fieldDraft.program.trim(),
        amount: Number(fieldDraft.amount) || deal.amount,
        rate: fieldDraft.rate.trim() || undefined,
        term: fieldDraft.term.trim() || undefined,
      },
      "Agent (BES HQ)",
    );
    setIsEditingFields(false);
  };

  const handleAddChecklist = () => {
    if (!newCheckitem.trim()) return;
    setChecklists((prev) => [
      ...prev,
      { id: `dchk-${Date.now()}`, text: newCheckitem.trim(), done: false },
    ]);
    setNewCheckitem("");
  };
  const toggleChecklist = (id: string) =>
    setChecklists((prev) =>
      prev.map((c) => (c.id === id ? { ...c, done: !c.done } : c)),
    );
  const toggleStip = (id: string) =>
    setStips((prev) =>
      prev.map((s) => (s.id === id ? { ...s, done: !s.done } : s)),
    );
  const toggleWork = (item: string) =>
    setSelectedWork((prev) =>
      prev.includes(item) ? prev.filter((w) => w !== item) : [...prev, item],
    );

  const handleAddComment = () => {
    if (!comment.trim() || !client) return;
    store.addActivity({
      clientId: client.id,
      actor: "Agent (BES HQ)",
      action: "Deal comment added",
      detail: `${dealCode(deal.id)} (${deal.lender}): ${comment.trim()}`,
    });
    setComment("");
  };

  const reportBlocker = () => {
    if (!blockerInput.trim() || !client) return;
    setWorkabilityBlocker(blockerInput.trim());
    store.addActivity({
      clientId: client.id,
      actor: "Agent (BES HQ)",
      action: "Reported Blocker",
      detail: `${dealCode(deal.id)} (${deal.lender}): ${blockerInput.trim()}`,
    });
    setBlockerInput("");
    setShowBlockerInput(false);
  };

  const submitWork = () => {
    if (!client || selectedWork.length === 0) return;
    const dept =
      WORK_GROUPS.find((g) => g.items.some((i) => selectedWork.includes(i)))
        ?.label ?? "Work";
    store.logProduction({
      clientId: client.id,
      clientName: `${client.name} — ${dealCode(deal.id)} (${deal.lender})`,
      partnerName: clientGroupLabel(client),
      department: dept,
      actions: selectedWork,
      workNotes: workNotes.trim() || undefined,
      actor: "Agent (BES HQ)",
    });
    setSelectedWork([]);
    setWorkNotes("");
  };

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
                  {dealCode(deal.id)}
                </h2>
                {client && <FundingModeBadge client={client} />}
              </div>
              <p className="text-xs text-muted-foreground">
                {deal.lender} · {deal.program}
                {client && ` · ${client.name}`}
                {client && ` · ${clientGroupLabel(client)}`}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <OpsSelect
                value={deal.status}
                onValueChange={(v) => handleStatusChange(v as DealStatus)}
                options={DEAL_STATUSES}
                aria-label="Deal status"
                className="font-bold"
              />
            </div>
            {file?.slaHoursRemaining !== undefined && (
              <span
                className={cn(
                  "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-bold",
                  file.slaHoursRemaining <= 8
                    ? "border-red-500/30 bg-red-500/10 text-red-700"
                    : "border-border bg-muted text-foreground",
                )}
              >
                <Clock className="h-3 w-3" /> {file.slaHoursRemaining}h SLA
              </span>
            )}
          </div>
        </div>
        {deptStatuses.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {deptStatuses.map((d) => (
              <span
                key={d.department}
                className={cn(
                  "inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[10px] font-semibold",
                  d.status === "NOT STARTED"
                    ? "border-border bg-muted/40 text-muted-foreground"
                    : "border-emerald-500/30 bg-emerald-500/10 text-status-success",
                )}
              >
                {d.department}: {d.status}
              </span>
            ))}
          </div>
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-12">
        {/* LEFT / MAIN OPERATIONAL PANEL */}
        <div className="space-y-4 lg:col-span-7">
          <DealClientBusinessSection
            client={client}
            business={business}
            file={file}
            deal={deal}
          />
          <DealFieldsSection
            deal={deal}
            isEditing={isEditingFields}
            setIsEditing={setIsEditingFields}
            draft={fieldDraft}
            setDraft={setFieldDraft}
            onSave={saveFields}
          />
          <DealDescriptionSection
            description={description}
            setDescription={setDescription}
            isEditing={isEditingDesc}
            setIsEditing={setIsEditingDesc}
          />
          <DealReadinessSection />
          <DealDocumentsSection />
          <DealStipulationsSection
            lender={deal.lender}
            stips={stips}
            toggleStip={toggleStip}
          />
          <DealNextActionWorkabilitySection
            nextAction={nextAction}
            setNextAction={setNextAction}
            workabilityBlocker={workabilityBlocker}
            blockerInput={blockerInput}
            setBlockerInput={setBlockerInput}
            showBlockerInput={showBlockerInput}
            setShowBlockerInput={setShowBlockerInput}
            reportBlocker={reportBlocker}
          />
          <DealChecklistSection
            checklists={checklists}
            toggleChecklist={toggleChecklist}
            newCheckitem={newCheckitem}
            setNewCheckitem={setNewCheckitem}
            handleAddChecklist={handleAddChecklist}
          />
          <DealWorkCompletionSection
            selectedWork={selectedWork}
            toggleWork={toggleWork}
            workNotes={workNotes}
            setWorkNotes={setWorkNotes}
            submitWork={submitWork}
          />
        </div>

        {/* RIGHT PANEL = COMMENTS + ACTIVITY TIMELINE */}
        <div className="space-y-4 lg:col-span-5">
          <DealActivitySection dealId={deal.id} activity={activity} />
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Editable deal fields — lender, program, amount, rate, term          */
/* ------------------------------------------------------------------ */

function DealFieldsSection({
  deal,
  isEditing,
  setIsEditing,
  draft,
  setDraft,
  onSave,
}: {
  deal: FundingDeal;
  isEditing: boolean;
  setIsEditing: (v: boolean) => void;
  draft: {
    lender: string;
    program: string;
    amount: string;
    rate: string;
    term: string;
  };
  setDraft: (v: typeof draft) => void;
  onSave: () => void;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
      <div className="flex items-center justify-between border-b border-border/50 pb-2">
        <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
          Deal Details
        </h3>
        {isEditing ? (
          <button
            onClick={onSave}
            className="inline-flex items-center gap-1 rounded-md bg-primary px-2.5 py-1 text-[10px] font-bold text-primary-foreground hover:opacity-90"
          >
            Save
          </button>
        ) : (
          <button
            onClick={() => setIsEditing(true)}
            className="text-xs font-semibold text-primary hover:underline"
          >
            Edit
          </button>
        )}
      </div>
      {isEditing ? (
        <div className="mt-3 grid grid-cols-2 gap-2">
          <Field label="Lender">
            <input
              value={draft.lender}
              onChange={(e) => setDraft({ ...draft, lender: e.target.value })}
              className="w-full rounded-lg border border-border bg-background px-2 py-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </Field>
          <Field label="Program">
            <input
              value={draft.program}
              onChange={(e) => setDraft({ ...draft, program: e.target.value })}
              className="w-full rounded-lg border border-border bg-background px-2 py-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </Field>
          <Field label="Amount ($)">
            <input
              type="number"
              value={draft.amount}
              onChange={(e) => setDraft({ ...draft, amount: e.target.value })}
              className="w-full rounded-lg border border-border bg-background px-2 py-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </Field>
          <Field label="Rate">
            <input
              value={draft.rate}
              onChange={(e) => setDraft({ ...draft, rate: e.target.value })}
              placeholder="e.g. 14%"
              className="w-full rounded-lg border border-border bg-background px-2 py-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </Field>
          <Field label="Term">
            <input
              value={draft.term}
              onChange={(e) => setDraft({ ...draft, term: e.target.value })}
              placeholder="e.g. 24mo"
              className="w-full rounded-lg border border-border bg-background px-2 py-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </Field>
        </div>
      ) : (
        <dl className="mt-3 grid grid-cols-2 gap-2 text-xs">
          <Row label="Lender" value={deal.lender} />
          <Row label="Program" value={deal.program} />
          <Row label="Amount" value={formatCurrency(deal.amount)} />
          <Row label="Rate" value={deal.rate ?? "—"} />
          <Row label="Term" value={deal.term ?? "—"} />
          <Row label="Submitted" value={deal.submittedAt} />
        </dl>
      )}
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <p className="mb-1 text-[10px] font-semibold uppercase text-muted-foreground">
        {label}
      </p>
      {children}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-border bg-muted/20 px-2.5 py-1.5">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-semibold text-foreground">{value}</span>
    </div>
  );
}
