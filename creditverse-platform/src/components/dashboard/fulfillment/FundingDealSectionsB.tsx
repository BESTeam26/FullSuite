/**
 * Funding Deal Workspace — operational panel sections (part 2).
 * Next action, workability, checklist, work completion, and activity timeline.
 */

import {
  ShieldCheck,
  CheckSquare,
  Plus,
  Trophy,
  Handshake,
  Send,
} from "lucide-react";
import type { FundingActivityEntry } from "@/lib/fulfillment/fundingops-store-types";
import { WORK_GROUPS } from "./funding-deal-data";
import { cn } from "@/lib/utils";

export function DealNextActionWorkabilitySection({
  nextAction,
  setNextAction,
  workabilityBlocker,
  blockerInput,
  setBlockerInput,
  showBlockerInput,
  setShowBlockerInput,
  reportBlocker,
}: {
  nextAction: string;
  setNextAction: (v: string) => void;
  workabilityBlocker: string | null;
  blockerInput: string;
  setBlockerInput: (v: string) => void;
  showBlockerInput: boolean;
  setShowBlockerInput: (v: boolean) => void;
  reportBlocker: () => void;
}) {
  return (
    <>
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
      <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-status-success" />
            <div>
              <p className="font-bold text-foreground">Workability</p>
              <p className="text-[11px] text-muted-foreground">
                {workabilityBlocker
                  ? `BLOCKED: ${workabilityBlocker}`
                  : "This deal is workable — no active blocker."}
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
    </>
  );
}

export interface ChecklistItem {
  id: string;
  text: string;
  done: boolean;
}

export function DealChecklistSection({
  checklists,
  toggleChecklist,
  newCheckitem,
  setNewCheckitem,
  handleAddChecklist,
}: {
  checklists: ChecklistItem[];
  toggleChecklist: (id: string) => void;
  newCheckitem: string;
  setNewCheckitem: (v: string) => void;
  handleAddChecklist: () => void;
}) {
  return (
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
              className={cn(c.done && "text-muted-foreground line-through")}
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
  );
}

export function DealWorkCompletionSection({
  selectedWork,
  toggleWork,
  workNotes,
  setWorkNotes,
  submitWork,
}: {
  selectedWork: string[];
  toggleWork: (item: string) => void;
  workNotes: string;
  setWorkNotes: (v: string) => void;
  submitWork: () => void;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
      <h3 className="flex items-center gap-2 border-b border-border/50 pb-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
        <Trophy className="h-4 w-4 text-primary" /> Work Completion
      </h3>
      <p className="mt-2 text-[11px] text-muted-foreground">
        One work submission = one meaningful production unit (one file worked).
        Selected actions become Production Actions.
      </p>
      <div className="mt-3 space-y-3">
        {WORK_GROUPS.map((g) => (
          <div key={g.id}>
            <p className="mb-1 text-[10px] font-bold uppercase text-muted-foreground">
              {g.label}
            </p>
            <div className="grid grid-cols-1 gap-1 sm:grid-cols-2">
              {g.items.map((item) => {
                const checked = selectedWork.includes(item);
                return (
                  <label
                    key={item}
                    className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-xs hover:bg-muted/30"
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleWork(item)}
                      className="h-3.5 w-3.5 rounded border-border text-primary focus:ring-primary"
                    />
                    <span className="text-foreground">{item}</span>
                  </label>
                );
              })}
            </div>
          </div>
        ))}
      </div>
      <div className="mt-3 space-y-2 border-t border-border/50 pt-3">
        <textarea
          value={workNotes}
          onChange={(e) => setWorkNotes(e.target.value)}
          placeholder="Work notes (optional)..."
          rows={2}
          className="w-full rounded-lg border border-border bg-background p-2 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
        />
        <button
          onClick={submitWork}
          disabled={selectedWork.length === 0}
          className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-bold text-primary-foreground hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <Handshake className="h-3.5 w-3.5" /> Log Production (
          {selectedWork.length})
        </button>
      </div>
    </div>
  );
}
