import { useState } from "react";
import { Check, ArrowRight, LifeBuoy } from "lucide-react";
import type { ActionPlanItem, ActionType } from "@/lib/diy/diy-domain";

const initialPlan: ActionPlanItem[] = [
  {
    id: "ap-1",
    type: "gather-evidence",
    label: "Gather evidence for Portfolio Recovery",
    why: "Your dispute is stronger with supporting documents.",
    needed: "Settlement agreement, bank payment confirmation",
    nextStep: "Upload documents to your evidence vault",
    done: false,
  },
  {
    id: "ap-2",
    type: "prepare-dispute",
    label: "Prepare dispute for LVNV Funding DOFD",
    why: "The DOFD appears inconsistent with your delinquency chronology.",
    needed: "Confirm the date you first became delinquent",
    nextStep: "Open the dispute preparation workspace",
    done: false,
  },
  {
    id: "ap-3",
    type: "reduce-utilization",
    label: "Reduce revolving utilization below 9%",
    why: "High utilization is one of the biggest score factors.",
    needed: "Pay down balances on open cards",
    nextStep: "Track your utilization in the progress center",
    done: false,
  },
  {
    id: "ap-4",
    type: "monitor-account",
    label: "Monitor Midland Funding collection",
    why: "Validate the collector's authority and account ownership.",
    needed: "Wait for validation response",
    nextStep: "Log the response when received",
    done: true,
  },
];

const typeTone: Record<ActionType, string> = {
  "review-information": "text-slate-300",
  "gather-evidence": "text-sky-300",
  "correct-personal-info": "text-slate-300",
  "prepare-dispute": "text-status-warning",
  "contact-furnisher": "text-status-warning",
  "request-documentation": "text-sky-300",
  "monitor-account": "text-purple-300",
  "reduce-utilization": "text-status-success",
  "build-positive-history": "text-status-success",
  "wait-recheck": "text-slate-300",
  "human-help-recommended": "text-status-warning",
};

export const ConsumerActionPlan = () => {
  const [plan, setPlan] = useState<ActionPlanItem[]>(initialPlan);

  const toggle = (id: string) =>
    setPlan((p) =>
      p.map((it) => (it.id === id ? { ...it, done: !it.done } : it)),
    );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">My Plan</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Your personalized action plan. Each step explains what to do, why, and
          what happens next.
        </p>
      </div>

      <div className="space-y-3">
        {plan.map((it) => (
          <div
            key={it.id}
            className={`rounded-2xl border p-5 transition-colors ${
              it.done
                ? "border-emerald-400/30 bg-emerald-500/5"
                : "border-border bg-card"
            }`}
          >
            <div className="flex items-start gap-3">
              <button
                onClick={() => toggle(it.id)}
                className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border ${
                  it.done
                    ? "border-emerald-400 bg-emerald-500 text-charcoal"
                    : "border-border"
                }`}
              >
                {it.done && <Check className="h-3.5 w-3.5" />}
              </button>
              <div className="min-w-0 flex-1">
                <p
                  className={`text-sm font-semibold ${typeTone[it.type]} ${
                    it.done ? "line-through opacity-60" : ""
                  }`}
                >
                  {it.label}
                </p>
                <div className="mt-2 space-y-1.5 text-[11px] leading-relaxed text-muted-foreground">
                  <p>
                    <span className="font-semibold text-muted-foreground">Why:</span>{" "}
                    {it.why}
                  </p>
                  <p>
                    <span className="font-semibold text-muted-foreground">
                      What's needed:
                    </span>{" "}
                    {it.needed}
                  </p>
                  <p>
                    <span className="font-semibold text-muted-foreground">
                      Next step:
                    </span>{" "}
                    {it.nextStep}
                  </p>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="rounded-2xl border border-amber-400/30 bg-amber-500/5 p-5">
        <div className="flex items-start gap-3">
          <LifeBuoy className="mt-0.5 h-5 w-5 text-status-warning" />
          <div>
            <p className="text-sm font-semibold text-status-warning">
              Human help recommended
            </p>
            <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
              If you'd rather have a professional manage this process, you can
              request Done-For-You help from your organization.
            </p>
            <button className="mt-3 flex items-center gap-1.5 text-xs font-semibold text-status-warning hover:text-status-warning">
              Request professional help <ArrowRight className="h-3 w-3" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
