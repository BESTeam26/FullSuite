import { useState } from "react";
import { ScanSearch, ArrowRight, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AICopilotCard } from "@/components/copilot/AICopilotCard";
import { useClientWorkspace } from "@/lib/client-workspace-context";
import {
  detectAnomaly,
  routeStatutes,
  type AnomalyInput,
} from "@/lib/dispute/metro2-intelligence";
import {
  AnomalyCard,
  TruthGatePanel,
  StatuteRoutingCard,
  ClassificationLegend,
  EvidenceStrengthLegend,
} from "@/components/clients/Metro2IntelligencePanel";

// Sample field data for Midland Funding LLC — mirrors the Inspector's tradeline
const fieldInputs: AnomalyInput[] = [
  {
    field: "Account status",
    values: [
      { bureau: "EX", value: "Collection" },
      { bureau: "EQ", value: "Collection" },
      { bureau: "TU", value: "Closed" },
    ],
    consumerAssertedValue: "Settled & closed",
    hasSourceDocument: true,
    sourceDocumentContradictsReport: true,
    sameReportingPeriodConfirmed: true,
  },
  {
    field: "Balance",
    values: [
      { bureau: "EX", value: "$4,820" },
      { bureau: "EQ", value: "$4,820" },
      { bureau: "TU", value: "$0" },
    ],
    consumerAssertedValue: "$0 after settlement",
    hasSourceDocument: true,
    sourceDocumentContradictsReport: true,
    sameReportingPeriodConfirmed: true,
  },
  {
    field: "Date opened",
    values: [
      { bureau: "EX", value: "04/2022" },
      { bureau: "EQ", value: "04/2022" },
      { bureau: "TU", value: "04/2022" },
    ],
  },
  {
    field: "Last payment",
    values: [
      { bureau: "EX", value: "01/2024" },
      { bureau: "EQ", value: "01/2024" },
      { bureau: "TU", value: "06/2023" },
    ],
    consumerAssertedValue: "01/2024",
    hasSourceDocument: true,
    sourceDocumentContradictsReport: true,
    sameReportingPeriodConfirmed: false,
  },
  {
    field: "Responsibility",
    values: [
      { bureau: "EX", value: "Individual" },
      { bureau: "EQ", value: "Individual" },
      { bureau: "TU", value: "Joint" },
    ],
    consumerAssertedValue: "Individual",
    hasSourceDocument: true,
    sourceDocumentContradictsReport: true,
    sameReportingPeriodConfirmed: true,
  },
];

const Inspector = ({ embedded = false }: { embedded?: boolean }) => {
  const [selectedField, setSelectedField] = useState<string | null>("Balance");
  const { setTab } = useClientWorkspace();

  const results = fieldInputs.map((input) => detectAnomaly(input));
  const active = results.find((r) => r.field === selectedField) ?? results[0];
  const craRouting = routeStatutes("cra");

  return (
    <div className={embedded ? "" : "p-6 md:p-8"}>
      {!embedded && (
        <div className="mb-8">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span>Apex Credit Co.</span>
            <span>/</span>
            <span>Clients</span>
            <span>/</span>
            <span className="text-foreground">Maria Gonzalez</span>
          </div>
          <h1 className="mt-1 text-2xl font-bold tracking-tight">
            Accuracy Inspector
          </h1>
          <p className="text-sm text-muted-foreground">
            Field-level three-bureau comparison for Midland Funding LLC —
            snapshot 08/29/2026. Discrepancies are flagged for consumer
            verification, never assumed illegal.
          </p>
        </div>
      )}
      {embedded && (
        <div className="mb-6">
          <h2 className="text-xl font-bold tracking-tight">
            Accuracy Inspector
          </h2>
          <p className="text-sm text-muted-foreground">
            Field-level three-bureau comparison for Midland Funding LLC —
            snapshot 08/29/2026. Discrepancies are flagged for consumer
            verification, never assumed illegal.
          </p>
        </div>
      )}

      {/* Compliance banner */}
      <div className="mb-6 flex items-start gap-3 rounded-2xl border border-amber-500/30 bg-amber-500/5 p-4">
        <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
        <p className="text-sm text-muted-foreground">
          Metro 2 is an industry data-reporting specification, not a federal
          statute. A Metro 2 anomaly is <strong>evidence</strong> of a
          data-integrity problem — it does not automatically equal an FCRA
          violation, does not automatically make an account unverifiable, and
          does not automatically require deletion. The AI never declares a legal
          conclusion; a human or counsel decides.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Main column — anomaly cards */}
        <div className="space-y-3 lg:col-span-2">
          <div className="flex items-center gap-2">
            <ScanSearch className="h-5 w-5 text-emerald-600" />
            <h2 className="font-semibold">Tradeline field analysis</h2>
            <Badge className="bg-muted text-muted-foreground">
              Midland Funding LLC · acct *5678
            </Badge>
          </div>

          {results.map((r) => (
            <div
              key={r.field}
              onMouseEnter={() => setSelectedField(r.field)}
              onClick={() => setSelectedField(r.field)}
              className={`cursor-pointer rounded-xl ${
                selectedField === r.field ? "ring-2 ring-primary/40" : ""
              }`}
            >
              <AnomalyCard result={r} />
            </div>
          ))}

          {/* Active field action */}
          {active && active.classification !== "consistent" && (
            <div className="rounded-2xl border border-border bg-card p-6">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h3 className="font-semibold">
                    {active.field} — next action
                  </h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {active.observation}
                  </p>
                  <p className="mt-2 text-xs text-muted-foreground">
                    Recommended route: {active.recommendedRoute}
                  </p>
                </div>
                <Button
                  onClick={() => setTab("disputes")}
                  className="shrink-0 bg-gradient-emerald text-white hover:opacity-90"
                >
                  Create issue <ArrowRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}

          <AICopilotCard
            title="AI Legal & Factual Discrepancy Guidance"
            message={`Analyzing field '${active?.field}': ${active?.observation}. Under FCRA § 611 / § 623, furnisher data must be accurate and complete across all reported bureaus. Ask the consumer to confirm their settlement agreement before creating a factual issue.`}
            citations={[
              "FCRA § 611(a)",
              "FCRA § 623(a)(1)",
              "Metro 2 Base Segment",
            ]}
            prompts={[
              "What makes a dispute factual instead of template?",
              "What is DOFD and why does it matter?",
            ]}
          />
        </div>

        {/* Sidebar — legends, truth gate, statute routing */}
        <div className="space-y-4">
          <TruthGatePanel
            passed={false}
            blocks={[
              "Consumer must confirm whether they recognize the account before any dispute is filed.",
              "The specific information believed to be inaccurate must be identified.",
            ]}
            requiredForFiling={[
              "At least one supporting document strengthens the dispute and avoids a frivolous finding.",
            ]}
          />

          <StatuteRoutingCard
            recipient={craRouting.recipient}
            applicableStatutes={craRouting.applicableStatutes}
            incorrectAssignment={craRouting.incorrectAssignment}
            notes={craRouting.notes}
          />

          <ClassificationLegend />
          <EvidenceStrengthLegend />
        </div>
      </div>
    </div>
  );
};

export default Inspector;
