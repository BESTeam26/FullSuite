/**
 * Funding Client Work Workspace — the canonical operational ClickUp-style
 * Funding Client File.
 *
 * Mirrors ClientWorkWorkspace but uses the FundingOps store + funding-domain
 * stages. Assembles:
 *  - Header: Client Name, Funding Status, Stage badges, SLA
 *  - Main Panel: Description, Next Action, Stage Progress, Checklist, Attachments
 *  - Right Panel: Activity Timeline & Comment Composer
 */

import { useState } from "react";
import {
  ArrowLeft,
  Edit2,
  Check,
  ShieldCheck,
  CheckSquare,
  Plus,
  Building2,
  DollarSign,
  Clock,
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
import {
  FundingStatusPill,
  FundingModeBadge,
} from "./funding-client-list-helpers";
import { cn } from "@/lib/utils";

interface Props {
  clientId: string;
  onBack: () => void;
}

export function FundingClientWorkWorkspace({ clientId, onBack }: Props) {
  const store = useFundingOpsStore();
  const client = store.clients.find((c) => c.id === clientId);

  const [description, setDescription] = useState(
    client
      ? `Funding client file — ${client.name}\n${client.email}\n${client.phone ?? "No phone on file"}\n\nPartner: ${clientGroupLabel(client)}\nProvenance: ${client.provenance === "bes_saas_synced" ? "BES SaaS Synced" : "Agency Manual"}`
      : "",
  );
  const [isEditingDesc, setIsEditingDesc] = useState(false);
  const [nextAction, setNextAction] = useState(
    "Collect outstanding stipulations & submit to matched lender",
  );
  const [workabilityBlocker, setWorkabilityBlocker] = useState<string | null>(
    null,
  );
  const [blockerInput, setBlockerInput] = useState("");
  const [showBlockerInput, setShowBlockerInput] = useState(false);

  const [checklists, setChecklists] = useState([
    { id: "fchk-1", text: "Business profile & EIN verified", done: true },
    { id: "fchk-2", text: "Bank statements collected (3 months)", done: true },
    {
      id: "fchk-3",
      text: "Funding readiness assessment complete",
      done: false,
    },
    { id: "fchk-4", text: "Lender program shortlist prepared", done: false },
  ]);
  const [newCheckitem, setNewCheckitem] = useState("");

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
            Back to list
          </button>
        </div>
      </div>
    );
  }

  const businesses = seedFundingBusinesses.filter(
    (b) => b.clientId === clientId,
  );
  const files = seedFundingFiles.filter((f) => f.clientId === clientId);
  const deptStatuses = store.getDepartmentStatuses(clientId);

  const handleAddChecklist = () => {
    if (!newCheckitem.trim()) return;
    setChecklists((prev) => [
      ...prev,
      { id: `fchk-${Date.now()}`, text: newCheckitem.trim(), done: false },
    ]);
    setNewCheckitem("");
  };
  const toggleChecklist = (id: string) =>
    setChecklists((prev) =>
      prev.map((c) => (c.id === id ? { ...c, done: !c.done } : c)),
    );

  const reportBlocker = () => {
    if (!blockerInput.trim()) return;
    setWorkabilityBlocker(blockerInput.trim());
    store.addActivity({
      clientId,
      actor: "Agent (BES HQ)",
      action: "Reported Blocker",
      detail: blockerInput.trim(),
    });
    setBlockerInput("");
    setShowBlockerInput(false);
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
                  {client.name}
                </h2>
                <FundingModeBadge client={client} />
              </div>
              <p className="text-xs text-muted-foreground">
                {clientGroupLabel(client)} · {client.email}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <FundingStatusPill status={client.status} />
            {client.slaHoursRemaining !== undefined && (
              <span
                className={cn(
                  "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-bold",
                  client.slaHoursRemaining <= 8
                    ? "border-red-500/30 bg-red-500/10 text-red-700"
                    : "border-border bg-muted text-foreground",
                )}
              >
                <Clock className="h-3 w-3" /> {client.slaHoursRemaining}h SLA
              </span>
            )}
          </div>
        </div>

        {/* Stage badges */}
        <div className="mt-3 flex flex-wrap gap-1.5">
          {deptStatuses.map((d) => (
            <span
              key={d.department}
              className={cn(
                "inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[10px] font-semibold",
                d.status === "NOT STARTED"
                  ? "border-border bg-muted/40 text-muted-foreground"
                  : "border-emerald-500/30 bg-emerald-500/10 text-emerald-700",
              )}
            >
              {d.department}: {d.status}
            </span>
          ))}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-12">
        {/* LEFT / MAIN OPERATIONAL PANEL */}
        <div className="space-y-4 lg:col-span-7">
          {/* Main Description */}
          <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
            <div className="flex items-center justify-between border-b border-border/50 pb-2">
              <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Main Description
              </h3>
              <button
                onClick={() => setIsEditingDesc(!isEditingDesc)}
                className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
              >
                {isEditingDesc ? (
                  <Check className="h-3.5 w-3.5" />
                ) : (
                  <Edit2 className="h-3.5 w-3.5" />
                )}
                {isEditingDesc ? "Done" : "Edit"}
              </button>
            </div>
            {isEditingDesc ? (
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={8}
                className="mt-3 w-full rounded-lg border border-border bg-background p-3 font-mono text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              />
            ) : (
              <div className="mt-3 whitespace-pre-wrap rounded-lg bg-muted/30 p-3 font-mono text-xs leading-relaxed text-foreground">
                {description}
              </div>
            )}
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

          {/* Funding Files */}
          <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
            <h3 className="flex items-center gap-2 border-b border-border/50 pb-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
              <DollarSign className="h-4 w-4 text-emerald-600" /> Funding Files
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

          {/* Next Action */}
          <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
            <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              Next Action
            </h3>
            <input
              value={nextAction}
              onChange={(e) => setNextAction(e.target.value)}
              placeholder="What needs to happen next?"
              className="mt-2 w-full rounded-lg border border-border bg-background px-3 py-2 text-xs font-medium text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>

          {/* Workability */}
          <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-emerald-600" />
                <div>
                  <p className="font-bold text-foreground">Workability</p>
                  <p className="text-[11px] text-muted-foreground">
                    {workabilityBlocker
                      ? `BLOCKED: ${workabilityBlocker}`
                      : "This file is workable — no active blocker."}
                  </p>
                </div>
              </div>
              {showBlockerInput ? (
                <div className="flex items-center gap-1">
                  <input
                    value={blockerInput}
                    onChange={(e) => setBlockerInput(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && reportBlocker()}
                    placeholder="Blocker reason..."
                    className="w-40 rounded-lg border border-border bg-background px-2 py-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                  <button
                    onClick={reportBlocker}
                    className="rounded-lg bg-amber-600 px-2 py-1.5 font-bold text-white hover:opacity-90"
                  >
                    Save
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setShowBlockerInput(true)}
                  className="rounded-lg border border-border bg-muted/40 px-3 py-1.5 font-bold text-foreground hover:bg-muted"
                >
                  Report Blocker
                </button>
              )}
            </div>
          </div>

          {/* Checklist */}
          <div className="space-y-3 rounded-xl border border-border bg-card p-4 shadow-sm">
            <h3 className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
              <CheckSquare className="h-4 w-4 text-primary" /> Checklist (
              {checklists.filter((c) => c.done).length}/{checklists.length})
            </h3>
            <div className="space-y-1.5">
              {checklists.map((c) => (
                <label
                  key={c.id}
                  onClick={() => toggleChecklist(c.id)}
                  className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-xs hover:bg-muted/30"
                >
                  <input
                    type="checkbox"
                    checked={c.done}
                    onChange={() => {}}
                    className="h-3.5 w-3.5 rounded border-border text-primary focus:ring-primary"
                  />
                  <span
                    className={cn(
                      c.done && "text-muted-foreground line-through",
                    )}
                  >
                    {c.text}
                  </span>
                </label>
              ))}
            </div>
            <div className="flex items-center gap-2 pt-1">
              <input
                value={newCheckitem}
                onChange={(e) => setNewCheckitem(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleAddChecklist()}
                placeholder="Add checklist item..."
                className="flex-1 rounded-lg border border-border bg-background px-3 py-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              />
              <button
                onClick={handleAddChecklist}
                className="rounded-lg bg-primary px-3 py-1.5 font-bold text-primary-foreground hover:opacity-90"
              >
                <Plus className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        </div>

        {/* RIGHT PANEL = COMMENTS + ACTIVITY TIMELINE */}
        <div className="space-y-4 lg:col-span-5">
          <FundingOpsActivityTimeline clientId={clientId} />
        </div>
      </div>
    </div>
  );
}
