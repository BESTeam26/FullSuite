/**
 * What an agent can do to this file, as business actions.
 *
 * Dee, 2026-09-11: "Agents should make business actions, not manage database
 * fields... They should not manually enter four fields."
 *
 * So Mark as Mailed is one button, and behind it the mailed date is recorded,
 * the file moves to waiting, the due date becomes mailed + 30 days and the
 * processing agent is released. The agent never sees an SLA type, a timer kind
 * or a calculation source, because none of those is a decision anybody working
 * a file should be making.
 *
 * This replaced the hand-off controls. Moving work between departments is
 * still possible — it is what these buttons do — but it is now expressed as
 * the thing that happened rather than as a transfer somebody arranges.
 */
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2, LifeBuoy, Mail, Scale } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ContentCard } from "@/components/dashboard/DivisionLayout";
import { useToast } from "@/hooks/use-toast";
import { useAgencyPermissions } from "@/lib/data/agency-permissions";
import { formatDate } from "@/lib/format-date";
import { markMailed, openComplaint, openSupportCase } from "@/lib/data/client-workflow";

type ActionKey = "mailed" | "support" | "ftc" | "cfpb";

/**
 * Which actions belong to which department's work.
 *
 * Dee, 2026-09-12: "Do not show an agent actions that have nothing to do with
 * the current department/work." All four used to show on every file, so a
 * Complaints agent was offered Mark as Mailed and a processor was offered
 * CFPB Needed.
 *
 * Opening work in ANOTHER department is a handoff, and handoffs live inside
 * Complete Work now — "what happens next" — rather than as four buttons that
 * are wrong three times out of four.
 */
const FOR_DEPARTMENT: Record<string, ActionKey[]> = {
  Dispute: ["mailed"],
  Complaints: ["ftc", "cfpb"],
  Support: [],
  Onboarding: [],
  "Bureau Calling": [],
};

export function ClientWorkflowActions({
  clientId,
  department,
}: {
  clientId: string;
  /** The department whose work is open. Null means no open work. */
  department: string | null;
}) {
  const perms = useAgencyPermissions();
  const qc = useQueryClient();
  const { toast } = useToast();
  const [busy, setBusy] = useState<ActionKey | null>(null);

  if (!perms.can("creditops.clients.edit")) return null;
  const allowed = department ? (FOR_DEPARTMENT[department] ?? []) : [];
  if (allowed.length === 0) return null;

  const run = async (key: ActionKey, fn: () => Promise<string>, said: string) => {
    setBusy(key);
    try {
      const due = await fn();
      toast({ title: said, description: `Next due ${formatDate(due)}.` });
      /* The progress report, the timeline and every queue read from what just
         changed, so all of them refetch rather than one of them being right. */
      void qc.invalidateQueries({ queryKey: ["client-progress", clientId] });
      void qc.invalidateQueries({ queryKey: ["creditops"] });
      void qc.invalidateQueries({ queryKey: ["work"] });
    } catch (e) {
      toast({ title: "That did not go through", description: (e as Error).message, variant: "destructive" });
    } finally {
      setBusy(null);
    }
  };

  const actions: { key: ActionKey; label: string; icon: typeof Mail; go: () => Promise<string>; said: string }[] = [
    { key: "mailed", label: "Mark as Mailed", icon: Mail,
      go: () => markMailed(clientId),
      said: "Mailed. Waiting 30 days, and the processing agent is released." },
    { key: "support", label: "Support Case", icon: LifeBuoy,
      go: () => openSupportCase(clientId),
      said: "Support case opened — due in 24 hours." },
    { key: "ftc", label: "FTC Needed", icon: Scale,
      go: () => openComplaint(clientId, "FTC Needed"),
      said: "FTC work opened — due in 5 days." },
    { key: "cfpb", label: "CFPB Needed", icon: Scale,
      go: () => openComplaint(clientId, "CFPB Needed"),
      said: "CFPB work opened — due in 5 days." },
  ];

  return (
    <ContentCard title={`${department} actions`}>
      <p className="mb-3 text-xs text-muted-foreground">
        The dates look after themselves. Marking a file mailed starts its 30-day wait and
        releases the processing agent; the complaint clocks start when you open them.
      </p>
      <div className="flex flex-wrap gap-2">
        {actions.filter((a) => allowed.includes(a.key)).map((a) => {
          const Icon = a.icon;
          return (
            <Button
              key={a.key}
              size="sm"
              variant="outline"
              disabled={busy !== null}
              onClick={() => void run(a.key, a.go, a.said)}
            >
              {busy === a.key ? (
                <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
              ) : (
                <Icon className="mr-2 h-3.5 w-3.5" />
              )}
              {a.label}
            </Button>
          );
        })}
      </div>
      <p className="mt-3 text-[11px] text-muted-foreground">
        <span className="font-medium text-foreground">Needed</span> means the action is still
        to do. <span className="font-medium text-foreground">Filed</span> is what it becomes
        once it has been done.
      </p>
    </ContentCard>
  );
}
