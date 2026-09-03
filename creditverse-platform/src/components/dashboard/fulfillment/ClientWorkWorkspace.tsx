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
  DEFAULT_ATTACHMENTS,
  type AttachmentFile,
} from "@/lib/fulfillment/attachment-domain";
import { ClientWorkActivityTimeline } from "./ClientWorkActivityTimeline";
import { DepartmentProgressSection } from "./DepartmentProgressSection";
import { CompleteWorkSection } from "./CompleteWorkSection";
import { cn } from "@/lib/utils";

interface Props {
  clientId: string;
  onBack: () => void;
}

export function ClientWorkWorkspace({ clientId, onBack }: Props) {
  const store = useCreditOpsStore();
  const client = store.clients.find((c) => c.id === clientId);

  /**
   * Sample text only, and deliberately free of personal data.
   *
   * This field previously carried a hardcoded SSN, date of birth, home address
   * and a consumer's plaintext portal password, shown for EVERY client. Rule 1:
   * identifiers and credentials never live in frontend code. When this panel is
   * backed by a real column, it must also never be the place a password is
   * stored — those belong in a secrets store, not a free-text note.
   */
  const [description, setDescription] = useState(
    `Sample note - not real client data.\n\n${client?.name ?? "Client"}\n${client?.email ?? "email@example.com"}\n\nRound 4 responses received from two bureaus. Reinvestigation results are inconsistent with the documents on file; preparing the next round.`,
  );
  const [isEditingDesc, setIsEditingDesc] = useState(false);
  const [nextAction, setNextAction] = useState(
    "Review Round 4 responses & prepare CFPB complaint",
  );
  const [workabilityBlocker, setWorkabilityBlocker] = useState<string | null>(
    null,
  );

  const [checklists, setChecklists] = useState([
    {
      id: "chk-1",
      text: "Verify Driver License address matches Proof of Residency",
      done: true,
    },
    {
      id: "chk-2",
      text: "Confirm IdentityIQ monitoring logins active",
      done: true,
    },
    {
      id: "chk-3",
      text: "File CFPB complaint for Collection Accounts",
      done: false,
    },
  ]);
  const [newCheckitem, setNewCheckitem] = useState("");

  const [attachments, setAttachments] =
    useState<AttachmentFile[]>(DEFAULT_ATTACHMENTS);

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
                {description}
              </div>
            )}
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

          {/* Department Progress — access controlled */}
          <DepartmentProgressSection clientId={clientId} />

          {/* Workability */}
          <div className="flex items-center justify-between rounded-xl border border-border bg-card p-4 shadow-sm">
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-emerald-600" />
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
                const b = prompt(
                  "Reason for reporting blocker:",
                  "Missing IdentityIQ password",
                );
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
          <ClientWorkActivityTimeline clientId={clientId} />
        </div>
      </div>
    </div>
  );
}
