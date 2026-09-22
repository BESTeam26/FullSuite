/**
 * The credit-repair tooling, gathered behind one tab.
 *
 * ── WHY IT MOVED ──────────────────────────────────────────────────────────
 *
 * There were two client screens. The CreditOps workspace opened a four-tab
 * operational card; a separate route, `/app/creditops/cases/:id`, opened a
 * nine-tab credit-repair application inherited from the original GHL AI
 * Studio export. Same client, two places, and the second one led with
 * analysis tooling rather than with the work.
 *
 * Dee, 2026-09-21: *"I need it to be like ClickUp or monday.com."* Opening a
 * client leads with the task — status, owner, due date, checklist, comments,
 * files. The analysis tools are one click away, together, and none of them
 * has changed: each panel is mounted exactly as it was, with the same data
 * and the same writes.
 *
 * ── THE CONTEXT THEY ALL NEED ─────────────────────────────────────────────
 *
 * Every panel here reads `ClientWorkspaceProvider` — the imported report, its
 * items, the round. It is mounted HERE rather than around the whole card, so
 * a person working the Work tab never pays for a credit-report query they did
 * not ask for (rule 14: do not preload hidden tabs). Choosing a tool loads
 * that tool.
 */
import { lazy, Suspense, useState } from "react";
import { cn } from "@/lib/utils";
import { ClientWorkspaceProvider } from "@/lib/client-workspace-context";
import { ClientCreditReportSection } from "../ClientCreditReportSection";
import { ReportChangesPanel } from "@/components/clients/ReportChangesPanel";
import { ReportIntegrityPanel } from "@/components/clients/ReportIntegrityPanel";
import { Metro2IdentitySection } from "@/components/clients/Metro2IdentitySection";
import { ChronologySection } from "@/components/clients/ChronologySection";
import { RoundOutcomesPanel } from "@/components/clients/RoundOutcomesPanel";

/* Lazy, because these are the heavy ones — the letter builder, the simulator
   and the dispute grid pull in their own engines. A person who opens a client
   to change its status should not download the score simulator. */
const OverviewTab = lazy(() => import("@/components/clients/OverviewTab"));
const DisputeDashboard = lazy(() =>
  import("@/components/clients/DisputeDashboard").then((m) => ({ default: m.DisputeDashboard })));
const LettersTab = lazy(() => import("@/components/clients/LettersTab"));
const PrintTab = lazy(() => import("@/components/clients/PrintTab"));
const NextStepsTab = lazy(() => import("@/components/clients/NextStepsTab"));
const BuildCreditTab = lazy(() => import("@/components/clients/BuildCreditTab"));
const ScoreSimulator = lazy(() => import("@/components/clients/ScoreSimulator"));

const TOOLS = [
  { id: "import", label: "Import & Analysis" },
  { id: "overview", label: "Scores" },
  { id: "disputes", label: "Dispute Dashboard" },
  { id: "letters", label: "Letter Builder" },
  { id: "print", label: "Print & Download" },
  { id: "next-steps", label: "Next Steps" },
  { id: "build", label: "Build Credit" },
  { id: "simulator", label: "Score Simulator" },
] as const;
type ToolId = (typeof TOOLS)[number]["id"];

export function ClientCreditToolsTab({ clientId, clientName, organizationId, outsourcingGroupId }: {
  clientId: string;
  clientName: string;
  organizationId: string | null;
  outsourcingGroupId: string | null;
}) {
  const [tool, setTool] = useState<ToolId>("import");

  return (
    <ClientWorkspaceProvider clientId={clientId}>
      <div className="space-y-3">
        <div className="flex flex-wrap gap-1 rounded-xl border border-border bg-muted/30 p-1">
          {TOOLS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTool(t.id)}
              aria-current={tool === t.id ? "true" : undefined}
              className={cn(
                "rounded-lg px-3 py-1.5 text-[11px] font-semibold transition-colors",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                tool === t.id
                  ? "bg-card text-foreground shadow-sm"
                  : "text-muted-foreground hover:bg-card/60 hover:text-foreground",
              )}
            >
              {t.label}
            </button>
          ))}
        </div>

        <Suspense fallback={<p className="p-6 text-center text-xs text-muted-foreground">Loading…</p>}>
          {tool === "import" && (
            <div className="space-y-3">
              <ClientCreditReportSection
                clientId={clientId}
                organizationId={organizationId}
                outsourcingGroupId={outsourcingGroupId}
              />
              <ReportChangesPanel clientId={clientId} />
              <ReportIntegrityPanel clientId={clientId} />
              <Metro2IdentitySection clientId={clientId} />
              <ChronologySection clientId={clientId} />
              <RoundOutcomesPanel clientId={clientId} />
            </div>
          )}
          {tool === "overview" && <OverviewTab />}
          {tool === "disputes" && <DisputeDashboard />}
          {tool === "letters" && <LettersTab liveClientId={clientId} liveClientName={clientName} />}
          {tool === "print" && <PrintTab />}
          {tool === "next-steps" && <NextStepsTab />}
          {tool === "build" && <BuildCreditTab />}
          {tool === "simulator" && <ScoreSimulator />}
        </Suspense>
      </div>
    </ClientWorkspaceProvider>
  );
}
