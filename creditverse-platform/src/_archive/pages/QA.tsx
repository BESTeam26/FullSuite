import { useState } from "react";
import {
  ShieldCheck,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Gauge,
  Send,
  RotateCcw,
  Lock,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useClientWorkspace } from "@/lib/client-workspace-context";

type CheckState = "pass" | "fail" | "warn";

const checks: { label: string; state: CheckState; detail: string }[] = [
  {
    label: "Correct consumer",
    state: "pass",
    detail: "Maria Gonzalez · DOB match",
  },
  { label: "Correct bureau", state: "pass", detail: "TransUnion" },
  { label: "Correct account", state: "pass", detail: "Midland Funding *5678" },
  {
    label: "Account appears on report",
    state: "pass",
    detail: "Snapshot 08/29/2026",
  },
  {
    label: "Balance matches source",
    state: "pass",
    detail: "$4,820 → $0 disputed",
  },
  { label: "Account number matches", state: "pass", detail: "*5678" },
  {
    label: "Dispute reason supported",
    state: "pass",
    detail: "Settlement evidence",
  },
  { label: "Evidence attached", state: "pass", detail: "2 documents" },
  {
    label: "Previous dispute checked",
    state: "pass",
    detail: "No duplicate round",
  },
  {
    label: "Duplicate dispute checked",
    state: "warn",
    detail: "Similar item filed 06/02 — review",
  },
];

const riskScore = 12;
const riskLevel = "LOW";

const queue = [
  {
    id: "QA-3310",
    client: "Maria Gonzalez",
    item: "Balance mismatch",
    risk: "LOW",
    score: 12,
  },
  {
    id: "QA-3309",
    client: "Devon Park",
    item: "Responsibility",
    risk: "MED",
    score: 41,
  },
  {
    id: "QA-3308",
    client: "Lena Ortiz",
    item: "Account status",
    risk: "LOW",
    score: 8,
  },
  {
    id: "QA-3307",
    client: "James Whitaker",
    item: "DOFD",
    risk: "HIGH",
    score: 72,
  },
];

const riskMeta: Record<string, { cls: string; text: string }> = {
  LOW: { cls: "bg-emerald-500/10 text-emerald-600", text: "text-emerald-600" },
  MED: { cls: "bg-amber-500/10 text-amber-600", text: "text-amber-600" },
  HIGH: { cls: "bg-red-500/10 text-red-600", text: "text-red-600" },
};

const stateMeta: Record<
  CheckState,
  { icon: typeof CheckCircle2; cls: string }
> = {
  pass: { icon: CheckCircle2, cls: "text-emerald-600" },
  warn: { icon: AlertTriangle, cls: "text-amber-600" },
  fail: { icon: XCircle, cls: "text-red-600" },
};

const QA = ({ embedded = false }: { embedded?: boolean }) => {
  const [activeId, setActiveId] = useState("QA-3310");
  const { setTab, setQaPassed } = useClientWorkspace();
  const allPass = checks.every((c) => c.state !== "fail");
  const hasWarn = checks.some((c) => c.state === "warn");

  return (
    <div className={embedded ? "" : "p-6 md:p-8"}>
      <div className={embedded ? "mb-6" : "mb-8"}>
        <h1 className="text-2xl font-bold tracking-tight">QA System</h1>
        <p className="text-sm text-muted-foreground">
          Every dispute runs an automated pre-send checklist and risk score
          before a human checker approves it. No dispute leaves the system
          without a separate QA pass.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-6">
          <div className="rounded-2xl border border-border bg-card p-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ShieldCheck className="h-5 w-5 text-emerald-600" />
                <h2 className="font-semibold">AI pre-send checklist</h2>
              </div>
              <Badge className="bg-muted text-muted-foreground">
                {activeId} · Maria Gonzalez
              </Badge>
            </div>

            <div className="mt-5 grid gap-2 sm:grid-cols-2">
              {checks.map((c) => {
                const m = stateMeta[c.state];
                return (
                  <div
                    key={c.label}
                    className="flex items-start gap-3 rounded-xl border border-border bg-muted/30 p-3"
                  >
                    <m.icon className={`mt-0.5 h-4 w-4 shrink-0 ${m.cls}`} />
                    <div>
                      <p className="text-sm font-medium">{c.label}</p>
                      <p className="text-xs text-muted-foreground">
                        {c.detail}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="mt-5 flex items-center justify-between rounded-xl border border-border bg-muted/30 p-4">
              <div className="flex items-center gap-3">
                <Gauge className="h-6 w-6 text-emerald-600" />
                <div>
                  <p className="text-xs text-muted-foreground">Risk score</p>
                  <p
                    className={`text-lg font-bold ${riskMeta[riskLevel].text}`}
                  >
                    {riskScore} · {riskLevel}
                  </p>
                </div>
              </div>
              <div className="text-right text-xs text-muted-foreground">
                {hasWarn
                  ? "1 warning — review before approval"
                  : "All checks passed"}
              </div>
            </div>

            <div className="mt-5 flex flex-wrap gap-3">
              <Button
                disabled={!allPass}
                onClick={() => {
                  setQaPassed(true);
                  setTab("letters");
                }}
                className="bg-gradient-emerald text-white hover:opacity-90 disabled:opacity-40"
              >
                <Send className="h-4 w-4" /> Approve & send
              </Button>
              <Button variant="outline">
                <RotateCcw className="h-4 w-4" /> Return to processor
              </Button>
            </div>
          </div>

          <div className="flex items-start gap-3 rounded-2xl border border-border bg-muted/40 p-5">
            <Lock className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
            <p className="text-sm text-muted-foreground">
              The processor who drafted this dispute cannot approve it. A
              separate checker must review the checklist, resolve any warnings,
              and sign off before delivery — enforced by the workflow engine and
              recorded in the audit ledger.
            </p>
          </div>
        </div>

        <div className="rounded-2xl border border-border bg-card p-6">
          <h2 className="font-semibold">QA queue</h2>
          <div className="mt-4 space-y-2">
            {queue.map((q) => (
              <button
                key={q.id}
                onClick={() => setActiveId(q.id)}
                className={`w-full rounded-xl border p-3 text-left transition-colors ${
                  activeId === q.id
                    ? "border-emerald-500/50 bg-emerald-500/5"
                    : "border-border hover:bg-muted/30"
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-mono text-xs font-medium text-emerald-600">
                    {q.id}
                  </span>
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-medium ${riskMeta[q.risk].cls}`}
                  >
                    {q.risk}
                  </span>
                </div>
                <p className="mt-1 text-sm font-medium">{q.client}</p>
                <p className="text-xs text-muted-foreground">{q.item}</p>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default QA;
