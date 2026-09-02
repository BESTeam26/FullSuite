// Strategy Engine — "what should happen next" driven by the legal-path decision
// engine. Routes the actual dispute items to their statutory pathways based on
// evidence + prior history. The AI never decides an account is legally
// inaccurate — it recommends a lawful next action a human must approve.

import { useState } from "react";
import {
  Brain,
  Gauge,
  History,
  FileText,
  ShieldCheck,
  ArrowRight,
  CheckCircle2,
  AlertTriangle,
  Sparkles,
  Building2,
  ArrowUpCircle,
  Search,
  RotateCcw,
  ShieldAlert,
  Building,
  Receipt,
  Lock,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useClientWorkspace } from "@/lib/client-workspace-context";
import {
  decideDisputePath,
  type DisputeDecisionInput,
} from "@/lib/dispute/decision-engine";
import {
  getLegalPathwayMeta,
  getDisputeStateMeta,
  type LegalPathway,
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

const confidenceTone: Record<string, string> = {
  "detected-fact": "bg-emerald-500/10 text-emerald-600",
  "potential-issue": "bg-amber-500/10 text-amber-600",
  "legal-conclusion": "bg-red-500/10 text-red-600",
};

const confidenceLabel: Record<string, string> = {
  "detected-fact": "Detected Fact",
  "potential-issue": "Potential Issue",
  "legal-conclusion": "Legal Conclusion — Human Only",
};

const Strategy = ({ embedded = false }: { embedded?: boolean }) => {
  const { items, round, setTab } = useClientWorkspace();
  const disputeItems = items.filter((i) => i.disposition === "dispute");
  const [activeId, setActiveId] = useState<string | null>(
    disputeItems[0]?.id ?? null,
  );

  const active = disputeItems.find((i) => i.id === activeId) ?? disputeItems[0];

  if (disputeItems.length === 0) {
    return (
      <div className={embedded ? "" : "p-6 md:p-8"}>
        <div className="rounded-2xl border border-border bg-card p-10 text-center">
          <Brain className="mx-auto h-8 w-8 text-muted-foreground" />
          <p className="mt-3 font-medium">No items staged for strategy</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Stage items for dispute in the Dispute Dashboard to see legal-path
            routing here.
          </p>
        </div>
      </div>
    );
  }

  const input: DisputeDecisionInput = active
    ? {
        item: active,
        round,
        hasEvidence: !!active.balance || !!active.dofd,
        priorDisputeCount: Math.max(0, round - 1),
        wasVerifiedPrior: round >= 2,
        hasNewEvidence: round >= 2,
        evidenceContradictsVerification: round >= 2,
      }
    : ({} as DisputeDecisionInput);
  const decision = active ? decideDisputePath(input) : null;
  const pathMeta = decision ? getLegalPathwayMeta(decision.pathway) : null;
  const stateMeta = decision ? getDisputeStateMeta(decision.state) : null;
  const PathIcon = decision ? pathwayIcon[decision.pathway] : Building2;

  return (
    <div className={embedded ? "" : "p-6 md:p-8"}>
      <div className={embedded ? "mb-6" : "mb-8"}>
        <h1 className="text-2xl font-bold tracking-tight">Strategy Engine</h1>
        <p className="text-sm text-muted-foreground">
          The legal-path decision engine routes each item to the correct
          statutory pathway based on evidence and prior history. It recommends
          what should happen next — never which letter template to use, and
          never a legal conclusion.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Item list */}
        <div className="space-y-3">
          {disputeItems.map((item) => {
            const itemInput: DisputeDecisionInput = {
              item,
              round,
              hasEvidence: !!item.balance || !!item.dofd,
              priorDisputeCount: Math.max(0, round - 1),
              wasVerifiedPrior: round >= 2,
              hasNewEvidence: round >= 2,
              evidenceContradictsVerification: round >= 2,
            };
            const d = decideDisputePath(itemInput);
            const pm = getLegalPathwayMeta(d.pathway);
            const PIcon = pathwayIcon[d.pathway];
            const conf = d.confidence === "detected-fact" ? 90 : 65;
            return (
              <button
                key={item.id}
                onClick={() => setActiveId(item.id)}
                className={`w-full rounded-2xl border p-4 text-left transition-colors ${
                  active?.id === item.id
                    ? "border-emerald-500/50 bg-emerald-500/5"
                    : "border-border bg-card hover:bg-muted/30"
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-2 font-medium">
                    <PIcon className={`h-4 w-4 ${pm.tone}`} />
                    {item.name}
                  </span>
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${confidenceTone[d.confidence]}`}
                  >
                    {confidenceLabel[d.confidence]}
                  </span>
                </div>
                <p className="mt-1.5 text-xs text-muted-foreground">
                  {pm.shortStatute}
                </p>
                <div className="mt-3 flex items-center gap-2">
                  <Gauge className="h-4 w-4 text-emerald-600" />
                  <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-gradient-emerald"
                      style={{ width: `${conf}%` }}
                    />
                  </div>
                  <span className="text-xs font-semibold">{conf}%</span>
                </div>
              </button>
            );
          })}
        </div>

        {/* Active item analysis */}
        <div className="space-y-6 lg:col-span-2">
          {active && decision && pathMeta && stateMeta && (
            <>
              <div className="rounded-2xl border border-border bg-card p-6">
                <div className="flex items-center gap-2">
                  <Brain className="h-5 w-5 text-emerald-600" />
                  <h2 className="font-semibold">
                    Account analysis · {active.name}
                  </h2>
                  <span
                    className={`ml-auto rounded-full px-2.5 py-1 text-xs font-medium ${confidenceTone[decision.confidence]}`}
                  >
                    {confidenceLabel[decision.confidence]}
                  </span>
                </div>

                {/* Routed pathway */}
                <div className="mt-5 flex items-start gap-3 rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-card text-emerald-600">
                    <PathIcon className="h-5 w-5" />
                  </span>
                  <div>
                    <p className="text-sm font-semibold">{pathMeta.label}</p>
                    <p className="text-xs text-muted-foreground">
                      {pathMeta.statute}
                    </p>
                    <p className="mt-1.5 text-sm">{pathMeta.description}</p>
                  </div>
                </div>

                {/* Dispute state */}
                <div className="mt-4">
                  <p className="text-xs font-medium uppercase text-muted-foreground">
                    Dispute state
                  </p>
                  <div className="mt-2 rounded-lg border border-border bg-muted/30 p-3 text-sm">
                    <span className="font-medium">{stateMeta.label}</span>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {stateMeta.description}
                    </p>
                  </div>
                </div>

                {/* Pathway trigger */}
                <div className="mt-4">
                  <p className="flex items-center gap-1.5 text-xs font-medium uppercase text-muted-foreground">
                    <AlertTriangle className="h-3.5 w-3.5" /> Pathway trigger
                  </p>
                  <p className="mt-2 text-sm">{pathMeta.trigger}</p>
                </div>

                {/* Prior history */}
                {decision.flags.some((f) => f.includes("prior")) && (
                  <div className="mt-4">
                    <p className="flex items-center gap-1.5 text-xs font-medium uppercase text-muted-foreground">
                      <History className="h-3.5 w-3.5" /> Prior dispute history
                    </p>
                    <div className="mt-2 space-y-2">
                      <div className="flex items-center justify-between rounded-lg border border-border p-3 text-sm">
                        <span className="font-medium">Round 1</span>
                        <span className="rounded-full bg-slate-500/10 px-2 py-0.5 text-xs font-medium text-slate-600">
                          Verified
                        </span>
                      </div>
                      {round >= 2 && (
                        <div className="flex items-center justify-between rounded-lg border border-border p-3 text-sm">
                          <span className="font-medium">Round 2</span>
                          <span className="rounded-full bg-slate-500/10 px-2 py-0.5 text-xs font-medium text-slate-600">
                            Verified
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Evidence */}
                <div className="mt-4">
                  <p className="flex items-center gap-1.5 text-xs font-medium uppercase text-muted-foreground">
                    <FileText className="h-3.5 w-3.5" /> Evidence
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {active.balance && (
                      <span className="flex items-center gap-1.5 rounded-lg border border-border bg-muted/30 px-3 py-1.5 text-xs font-medium">
                        <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />{" "}
                        Balance: {active.balance}
                      </span>
                    )}
                    {active.dofd && (
                      <span className="flex items-center gap-1.5 rounded-lg border border-border bg-muted/30 px-3 py-1.5 text-xs font-medium">
                        <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />{" "}
                        DOFD: {active.dofd}
                      </span>
                    )}
                    {!active.balance && !active.dofd && (
                      <span className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-1.5 text-xs font-medium text-amber-600">
                        No evidence on file — gather before filing
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Recommended next action */}
              <div className="rounded-2xl border border-border bg-card p-6">
                <div className="flex items-center gap-2">
                  <Sparkles className="h-5 w-5 text-emerald-600" />
                  <h2 className="font-semibold">Recommended next action</h2>
                </div>
                <div className="mt-4 rounded-xl border border-emerald-500/40 bg-emerald-500/5 p-4">
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-2 text-sm font-semibold">
                      <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                      {pathMeta.label}
                    </span>
                    <Badge className="bg-emerald-500/10 text-emerald-600">
                      Recommended
                    </Badge>
                  </div>
                  <p className="mt-1.5 pl-6 text-xs text-muted-foreground">
                    {pathMeta.description}
                  </p>
                </div>

                {/* Compliance flags */}
                {decision.flags.length > 0 && (
                  <div className="mt-4 rounded-xl border border-amber-500/20 bg-amber-500/5 p-4">
                    <p className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-amber-600">
                      <AlertTriangle className="h-3.5 w-3.5" /> Compliance flags
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

                <div className="mt-5 flex flex-wrap gap-3">
                  <Button
                    onClick={() => setTab("letters")}
                    className="bg-gradient-emerald text-white hover:opacity-90"
                  >
                    <ArrowRight className="h-4 w-4" /> Apply recommendation
                  </Button>
                  {decision.humanReviewRequired && (
                    <Button variant="outline" disabled>
                      <Lock className="h-4 w-4" /> Human review required
                    </Button>
                  )}
                  <Button variant="outline">Override with reason</Button>
                </div>
              </div>

              <div className="flex items-start gap-3 rounded-2xl border border-border bg-muted/40 p-5">
                <Brain className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
                <p className="text-sm text-muted-foreground">
                  The Strategy Engine never decides an account is legally
                  inaccurate on its own. It weighs detected inconsistencies,
                  prior round outcomes, and evidence — then recommends a lawful
                  next action that a human must approve. Legal conclusions are
                  human-only.
                </p>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default Strategy;
