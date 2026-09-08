/**
 * Client Work Workspace — the canonical operational ClickUp-style Client Work File.
 *
 * Assembles:
 *  - ClientWorkHeader: Client Name, Main Status, Department badges, Due Date & SLA
 *  - Main Panel: Description, Next Action, Department Progress, Workability, Checklist, Complete Work, Attachments
 *  - Right Panel: Activity Timeline & Rich Comment Composer
 */

import { useState, useEffect } from "react";
import { Edit2, Check, ShieldCheck, CheckSquare, Plus } from "lucide-react";
import { useCreditOpsStore } from "@/lib/fulfillment/creditops-client-store";
import { clientGroupLabel } from "@/lib/fulfillment/fulfillment-client-domain";
import { ClientWorkHeader } from "./ClientWorkHeader";
import { ClientWorkAttachments } from "./ClientWorkAttachments";
import {
  type AttachmentFile,
} from "@/lib/fulfillment/attachment-domain";
import { ClientWorkActivityTimeline } from "./ClientWorkActivityTimeline";
import { DepartmentProgressSection } from "./DepartmentProgressSection";
import { CompleteWorkSection } from "./CompleteWorkSection";
import { Link } from "react-router-dom";
import { FundingReadinessCard } from "./FundingReadinessCard";
import { ClientLifecycleControl } from "./ClientLifecycleControl";
import { useCreditOpsAccess } from "@/lib/fulfillment/creditops-access";
import { usePartnerOperations } from "@/lib/data/use-partner-services";
import { cn } from "@/lib/utils";

interface Props {
  clientId: string;
  onBack: () => void;
}

export function ClientWorkWorkspace({ clientId, onBack }: Props) {
  const store = useCreditOpsStore();
  const client = store.clients.find((c) => c.id === clientId);
  const access = useCreditOpsAccess();
  /* The partner decides, not the client: BES is either the system of record
     for their credit work or it is not. */
  const operations = usePartnerOperations(client?.outsourcingGroupId ?? null);

  /**
   * ── A NEW CLIENT'S FILE IS EMPTY, AND SAYS SO ──────────────────────────
   *
   * These four panels used to open with somebody else's case pre-filled: a
   * note about "Round 4 responses received from two bureaus", a next action
   * to file a CFPB complaint, three checklist items with two already ticked,
   * and three documents — a driver's licence, a utility bill and a credit
   * report — that do not exist.
   *
   * Shown on EVERY client, including one created minutes earlier. Dee found
   * it exactly that way. The danger is not that it looks untidy: a colleague
   * reading this file would believe identity documents were on file and that
   * a round of disputes had been worked.
   *
   * None of these fields has a database column yet, so none of them persists.
   * They start empty and each panel says plainly that it is not stored — an
   * empty box a person can see is not yet saved is honest; a filled one that
   * silently forgets is not (rule 12: never present sample data as real).
   */
  const [description, setDescription] = useState("");
  const [isEditingDesc, setIsEditingDesc] = useState(false);
  const [nextAction, setNextAction] = useState("");
  const [workabilityBlocker, setWorkabilityBlocker] = useState<string | null>(
    null,
  );

  const [checklists, setChecklists] = useState<
    { id: string; text: string; done: boolean }[]
  >([]);
  const [newCheckitem, setNewCheckitem] = useState("");

  /* Empty. The three sample documents that used to seed this list implied a
     client's identity papers were on file when nothing had been uploaded. */
  const [attachments, setAttachments] = useState<AttachmentFile[]>([]);

  // Clipboard paste listener for images — adds directly to the attachments
  // gallery. (The comment composer has its own paste handler for inline
  // comment attachments.)
  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      // Ignore pastes happening inside a textarea/input (those are handled
      // by the comment composer / description editor).
      const target = e.target as HTMLElement;
      if (
        target &&
        (target.tagName === "TEXTAREA" || target.tagName === "INPUT")
      ) {
        return;
      }
      const items = e.clipboardData?.items;
      if (!items) return;
      for (let i = 0; i < items.length; i++) {
        if (items[i].type.indexOf("image") !== -1) {
          const blob = items[i].getAsFile();
          if (blob) {
            const url = URL.createObjectURL(blob);
            const newAtt: AttachmentFile = {
              id: `att-paste-${Date.now()}`,
              name: `Pasted_Screenshot_${new Date().toLocaleTimeString().replace(/:/g, "")}.png`,
              size: `${Math.round(blob.size / 1024)} KB`,
              type: blob.type,
              category: "Screenshot",
              url,
              uploadedBy: "Agent (Clipboard)",
              uploadedAt: "Just now",
            };
            setAttachments((prev) => [newAtt, ...prev]);
            store.addActivity({
              clientId,
              actor: "Agent (BES HQ)",
              action: "Image pasted from clipboard",
              detail: `Uploaded screenshot (${newAtt.name})`,
            });
          }
        }
      }
    };
    window.addEventListener("paste", handlePaste);
    return () => window.removeEventListener("paste", handlePaste);
  }, [clientId, store]);

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

  const handleAddChecklist = () => {
    if (!newCheckitem.trim()) return;
    setChecklists((prev) => [
      ...prev,
      { id: `chk-${Date.now()}`, text: newCheckitem.trim(), done: false },
    ]);
    setNewCheckitem("");
  };

  const toggleChecklist = (id: string) => {
    setChecklists((prev) =>
      prev.map((c) => (c.id === id ? { ...c, done: !c.done } : c)),
    );
  };

  return (
    <div className="space-y-4 text-xs">
      <ClientWorkHeader client={client} onBack={onBack} />
      {client && <ClientLifecycleControl client={client} canEdit={access.canEditDepartmentProgress} />}
      {/* ── ONLY WHERE BES IS THE SYSTEM OF RECORD ─────────────────────
          The credit report, dispute and letter screens are BES's own CRM.
          Every partner today runs their credit work in their own system, and
          that product is not being sold yet — so for them this link led to a
          workspace their data does not live in.

          Absent, not disabled: a greyed control still says the feature is
          there and you are not allowed it, which is neither true. The partner's
          Operations tab turns it on when BES really is the system of record. */}
      {operations.data?.usesBesCreditCrm && (
        <div className="flex justify-end">
          <Link
            to={`/app/creditops/cases/${clientId}`}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-semibold text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            Open client profile (report, disputes, letters)
          </Link>
        </div>
      )}

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
                rows={10}
                className="mt-3 w-full rounded-lg border border-border bg-background p-3 font-mono text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              />
            ) : (
              <div className="mt-3 whitespace-pre-wrap rounded-lg bg-muted/30 p-3 font-mono text-xs leading-relaxed text-foreground">
                {description || (
                  <span className="font-sans not-italic text-muted-foreground">
                    Nothing recorded for this client yet.
                  </span>
                )}
              </div>
            )}
            <p className="mt-2 text-[11px] text-muted-foreground">
              Not saved yet — this panel has no database column, so what is typed
              here is lost on reload. Notes that must survive belong on the
              client's activity timeline.
            </p>
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
            <p className="mt-1 text-[11px] text-muted-foreground">Not saved yet.</p>
          </div>

          {/* Department Progress — access controlled */}
          <DepartmentProgressSection clientId={clientId} />

          {/* Workability */}
          <div className="flex items-center justify-between rounded-xl border border-border bg-card p-4 shadow-sm">
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-status-success" />
              <div>
                <p className="font-bold text-foreground">Workability</p>
                <p className="text-[11px] text-muted-foreground">
                  {workabilityBlocker
                    ? `BLOCKED: ${workabilityBlocker}`
                    : "This file is workable - no active blocker."}
                </p>
              </div>
            </div>
            <button
              onClick={() => {
                /* No suggested reason: a pre-filled blocker is how a made-up
                   one gets recorded against a real client by somebody pressing
                   OK. This one DOES persist — it writes to the activity
                   timeline — so it must be typed. */
                const b = prompt("Reason for reporting blocker:");
                if (b) {
                  setWorkabilityBlocker(b);
                  store.addActivity({
                    clientId,
                    actor: "Agent (BES HQ)",
                    action: "Reported Blocker",
                    detail: b,
                  });
                }
              }}
              className="rounded-lg border border-border bg-muted/40 px-3 py-1.5 font-bold text-foreground hover:bg-muted"
            >
              Report Blocker
            </button>
          </div>

          {/* Checklist */}
          <div className="space-y-3 rounded-xl border border-border bg-card p-4 shadow-sm">
            <h3 className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
              <CheckSquare className="h-4 w-4 text-primary" /> Checklist (
              {checklists.filter((c) => c.done).length}/{checklists.length})
            </h3>
            {checklists.length === 0 && (
              <p className="text-xs text-muted-foreground">
                No checklist yet. Add the steps this file needs — they are not
                saved between visits.
              </p>
            )}
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

          {/* Complete Work — access controlled */}
          <CompleteWorkSection
            clientId={clientId}
            clientName={client?.name ?? "this client"}
            partnerName={client ? clientGroupLabel(client) : "—"}
          />

          {/* Attachments */}
          <ClientWorkAttachments
            clientId={clientId}
            attachments={attachments}
            setAttachments={setAttachments}
          />
        </div>

        {/* RIGHT PANEL = COMMENTS + CHRONOLOGICAL ACTIVITY TIMELINE */}
        <div className="space-y-4 lg:col-span-5">
          <FundingReadinessCard fulfillmentClientId={clientId} />
          <ClientWorkActivityTimeline clientId={clientId} />
        </div>
      </div>
    </div>
  );
}
