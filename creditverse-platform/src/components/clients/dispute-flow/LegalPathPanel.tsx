// Legal Path Panel — surfaces the factual-dispute decision engine.
// This is the centerpiece of the research upgrade: instead of a "stronger-letter
// generator," the platform shows the correct statutory pathway selected for each
// item based on evidence + prior history, with trigger-based citations and the
// factual error table. The AI never declares a legal conclusion.

import { useState } from "react";
import {
  Building2,
  ArrowUpCircle,
  Search,
  RotateCcw,
  ShieldAlert,
  Building,
  Receipt,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  FileSearch,
  CheckCircle2,
  RefreshCw,
  Lock,
  Sparkles,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useClientWorkspace } from "@/lib/client-workspace-context";
import {
  decideDisputePath,
  buildFactualDisputeRecord,
  type DisputeDecisionInput,
} from "@/lib/dispute/decision-engine";
import {
  getLegalPathwayMeta,
  getDisputeStateMeta,
  CONFIDENCE_STATES,
  type LegalPathway,
  type ConfidenceState,
} from "@/lib/dispute/legal-paths";

const pathwayIcon: Record<LegalPathway, typeof Building2> = {
  "cra-accuracy": Building2,
  "cra-reinvestigation-escalation": ArrowUpCircle,
  "procedure-request": Search,
  reinsertion: RotateCcw,
  "identity-theft-block": ShieldAlert,
  "furnisher-direct": Building,
  "billing-error": Receipt,
  "potential-compliance": AlertTriangle,
};

const confidenceTone: Record<ConfidenceState, string> = {
  "detected-fact": "bg-emerald-500/10 text-emerald-600",
  "potential-issue": "bg-amber-500/10 text-amber-600",
  "legal-conclusion": "bg-red-500/10 text-red-600",
};

const confidenceLabel: Record<ConfidenceState, string> = {
  "detected-fact": "Detected Fact",
  "potential-issue": "Potential Issue",
  "legal-conclusion": "Legal Conclusion — Human Only",
};

export const LegalPathPanel = () => {
  const { items, round } = useClientWorkspace();
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const disputeItems = items.filter((i) => i.disposition === "dispute");

  if (disputeItems.length === 0) {
    return (
      <div className="rounded-2xl border border-border bg-card p-6">
        <div className="flex items-center gap-2">
          <FileSearch className="h-5 w-5 text-emerald-600" />
          <h2 className="font-semibold">Legal path decision engine</h2>
        </div>
        <p className="mt-2 text-sm text-muted-foreground">
          No items staged for dispute. The engine routes each item to the
          correct statutory pathway once evidence and prior history are
          available.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="rounded-2xl border border-border bg-card p-6">
        <div className="flex items-center gap-2">
          <FileSearch className="h-5 w-5 text-emerald-600" />
          <h2 className="font-semibold">Legal path decision engine</h2>
          <Badge className="bg-emerald-500/10 text-emerald-600">
            {disputeItems.length} item{disputeItems.length === 1 ? "" : "s"}{" "}
            routed
          </Badge>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          Each item is routed to the correct statutory pathway based on its
          evidence and prior dispute history. Citations are trigger-based and
          evidence-grounded — never boilerplate. The AI assists with drafting
          language; it never decides a legal conclusion.
        </p>

        {/* Confidence state legend */}
        <div className="mt-4 flex flex-wrap gap-2">
          {CONFIDENCE_STATES.map((c) => (
            <span
              key={c.key}
              className={`rounded-full px-2.5 py-1 text-[11px] font-medium ${confidenceTone[c.key]}`}
            >
              {confidenceLabel[c.key]}
            </span>
          ))}
        </div>
      </div>

      {/* Per-item routing */}
      <div className="space-y-3">
        {disputeItems.map((item) => {
          const input: DisputeDecisionInput = {
            item,
            round,
            hasEvidence: !!item.balance || !!item.dofd,
            priorDisputeCount: Math.max(0, round - 1),
            wasVerifiedPrior: round >= 2,
            hasNewEvidence: round >= 2,
            evidenceContradictsVerification: round >= 2,
          };
          const decision = decideDisputePath(input);
          const record = buildFactualDisputeRecord(input);
          const pathMeta = getLegalPathwayMeta(decision.pathway);
          const stateMeta = getDisputeStateMeta(decision.state);
          const PathIcon = pathwayIcon[decision.pathway];
          const isOpen = expandedId === item.id;

          return (
            <div
              key={item.id}
              className="overflow-hidden rounded-2xl border border-border bg-card"
            >
              <button
                onClick={() => setExpandedId(isOpen ? null : item.id)}
                className="flex w-full items-center justify-between p-5 text-left hover:bg-muted/30"
              >
                <div className="flex items-center gap-3">
                  <span
                    className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-muted/40 ${pathMeta.tone}`}
                  >
                    <PathIcon className="h-5 w-5" />
                  </span>
                  <div>
                    <p className="font-semibold">{item.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {pathMeta.label} · {pathMeta.shortStatute}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span
                    className={`rounded-full px-2.5 py-1 text-[11px] font-medium ${confidenceTone[decision.confidence]}`}
                  >
                    {confidenceLabel[decision.confidence]}
                  </span>
                  {decision.humanReviewRequired && (
                    <span className="flex items-center gap-1 rounded-full bg-red-500/10 px-2 py-0.5 text-[10px] font-medium text-red-600">
                      <Lock className="h-2.5 w-2.5" /> Human review
                    </span>
                  )}
                  {isOpen ? (
                    <ChevronUp className="h-4 w-4 text-muted-foreground" />
                  ) : (
                    <ChevronDown className="h-4 w-4 text-muted-foreground" />
                  )}
                </div>
              </button>

              {isOpen && (
                <div className="border-t border-border p-5">
                  {/* Dispute state */}
                  <div className="mb-4 flex items-start gap-3 rounded-xl border border-border bg-muted/20 p-4">
                    <StateIcon state={decision.state} />
                    <div>
                      <p className="text-sm font-semibold">{stateMeta.label}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {stateMeta.description}
                      </p>
                      <p className="mt-1.5 text-xs text-muted-foreground">
                        <span className="font-medium text-foreground">
                          What the system does:{" "}
                        </span>
                        {stateMeta.whatSoftwareDoes}
                      </p>
                    </div>
                  </div>

                  {/* Pathway trigger */}
                  <div className="mb-4">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Pathway trigger
                    </p>
                    <p className="mt-1 text-sm">{pathMeta.trigger}</p>
                  </div>

                  {/* Factual opening */}
                  <div className="mb-4 rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4">
                    <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-emerald-600">
                      <Sparkles className="h-3.5 w-3.5" /> Factual opening (AI
                      assists, never decides)
                    </p>
                    <p className="mt-2 text-sm leading-relaxed">
                      {decision.opening}
                    </p>
                  </div>

                  {/* Error table */}
                  {record.errorTable.length > 0 && (
                    <div className="mb-4">
                      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        Disputed field table
                      </p>
                      <div className="overflow-hidden rounded-xl border border-border">
                        <table className="w-full text-xs">
                          <thead className="bg-muted/40">
                            <tr>
                              <th className="px-3 py-2 text-left font-medium text-muted-foreground">
                                Field
                              </th>
                              <th className="px-3 py-2 text-left font-medium text-muted-foreground">
                                Reported
                              </th>
                              <th className="px-3 py-2 text-left font-medium text-muted-foreground">
                                Consumer asserts
                              </th>
                              <th className="px-3 py-2 text-left font-medium text-muted-foreground">
                                Evidence
                              </th>
                            </tr>
                          </thead>
                          <tbody>
                            {record.errorTable.map((e, i) => (
                              <tr
                                key={i}
                                className="border-t border-border bg-card"
                              >
                                <td className="px-3 py-2 font-medium">
                                  {e.field}
                                </td>
                                <td className="px-3 py-2">{e.reportedValue}</td>
                                <td className="px-3 py-2">
                                  {e.consumerAssertedCorrect}
                                </td>
                                <td className="px-3 py-2">
                                  {e.evidence === "Pending" ? (
                                    <span className="text-amber-600">
                                      {e.evidence}
                                    </span>
                                  ) : (
                                    e.evidence
                                  )}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {/* Trigger-based citations */}
                  <div className="mb-4">
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Legal basis (trigger-based)
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {decision.legalCitations.map((c) => (
                        <span
                          key={c}
                          className="rounded-full bg-blue-500/10 px-2.5 py-1 text-[11px] font-medium text-blue-600"
                        >
                          {c}
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* Remedy */}
                  <div className="mb-4 rounded-xl border border-border bg-muted/20 p-4">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Requested remedy
                    </p>
                    <p className="mt-1 text-sm">{decision.remedy}</p>
                    <p className="mt-2 text-[11px] text-muted-foreground">
                      Mirrors §1681i(a)(5)(A): delete OR modify, as appropriate
                      — not "inaccurate = must delete."
                    </p>
                  </div>

                  {/* Compliance flags */}
                  {decision.flags.length > 0 && (
                    <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4">
                      <p className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-amber-600">
                        <AlertTriangle className="h-3.5 w-3.5" /> Compliance
                        flags
                      </p>
                      <ul className="space-y-1.5">
                        {decision.flags.map((f, i) => (
                          <li
                            key={i}
                            className="flex items-start gap-2 text-xs text-muted-foreground"
                          >
                            <span className="mt-0.5 text-amber-600">⚠</span>
                            {f}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

function StateIcon({ state }: { state: string }) {
  const map: Record<string, typeof FileSearch> = {
    "initial-factual": FileSearch,
    "verified-no-change": CheckCircle2,
    "escalation-new-info": ArrowUpCircle,
    "procedure-request": Search,
    reimport: RefreshCw,
    "identity-theft": ShieldAlert,
    "potential-compliance-failure": AlertTriangle,
  };
  const Icon = map[state] ?? FileSearch;
  return (
    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-card text-emerald-600">
      <Icon className="h-4 w-4" />
    </span>
  );
}
