import { useState } from "react";
import {
  GitCompare,
  TrendingUp,
  TrendingDown,
  CheckCircle2,
  XCircle,
  RefreshCw,
  ArrowRight,
  Sparkles,
  Trash2,
  PencilLine,
  CalendarClock,
  Mail,
  Send,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useClientWorkspace } from "@/lib/client-workspace-context";

type Outcome =
  | "DELETED"
  | "UPDATED"
  | "VERIFIED"
  | "CORRECTED"
  | "REINSERTED"
  | "NEW NEGATIVE"
  | "BALANCE CHANGED"
  | "STATUS CHANGED"
  | "LATE REMOVED"
  | "REMARK CHANGED"
  | "INQUIRY REMOVED"
  | "PERSONAL INFO REMOVED";

const outcomeMeta: Record<
  Outcome,
  { cls: string; icon: typeof CheckCircle2; tone: "pos" | "neu" | "neg" }
> = {
  DELETED: {
    cls: "bg-emerald-500/10 text-emerald-600",
    icon: Trash2,
    tone: "pos",
  },
  UPDATED: {
    cls: "bg-blue-500/10 text-blue-600",
    icon: PencilLine,
    tone: "neu",
  },
  VERIFIED: {
    cls: "bg-slate-500/10 text-slate-600",
    icon: CheckCircle2,
    tone: "neu",
  },
  CORRECTED: {
    cls: "bg-emerald-500/10 text-emerald-600",
    icon: PencilLine,
    tone: "pos",
  },
  REINSERTED: {
    cls: "bg-red-500/10 text-red-600",
    icon: RefreshCw,
    tone: "neg",
  },
  "NEW NEGATIVE": {
    cls: "bg-red-500/10 text-red-600",
    icon: XCircle,
    tone: "neg",
  },
  "BALANCE CHANGED": {
    cls: "bg-amber-500/10 text-amber-600",
    icon: PencilLine,
    tone: "neu",
  },
  "STATUS CHANGED": {
    cls: "bg-amber-500/10 text-amber-600",
    icon: PencilLine,
    tone: "neu",
  },
  "LATE REMOVED": {
    cls: "bg-emerald-500/10 text-emerald-600",
    icon: Trash2,
    tone: "pos",
  },
  "REMARK CHANGED": {
    cls: "bg-blue-500/10 text-blue-600",
    icon: PencilLine,
    tone: "neu",
  },
  "INQUIRY REMOVED": {
    cls: "bg-emerald-500/10 text-emerald-600",
    icon: Trash2,
    tone: "pos",
  },
  "PERSONAL INFO REMOVED": {
    cls: "bg-emerald-500/10 text-emerald-600",
    icon: Trash2,
    tone: "pos",
  },
};

const comparisons: {
  tradeline: string;
  bureau: string;
  before: string;
  after: string;
  outcome: Outcome;
  matched: boolean;
}[] = [
  {
    tradeline: "Portfolio Recovery",
    bureau: "Experian",
    before: "$3,418",
    after: "—",
    outcome: "DELETED",
    matched: true,
  },
  {
    tradeline: "LVNV Funding",
    bureau: "Equifax",
    before: "$2,190",
    after: "—",
    outcome: "DELETED",
    matched: true,
  },
  {
    tradeline: "Capital One",
    bureau: "TransUnion",
    before: "Late 06/23",
    after: "Current",
    outcome: "LATE REMOVED",
    matched: true,
  },
  {
    tradeline: "Midland Funding",
    bureau: "TransUnion",
    before: "$4,820",
    after: "$0",
    outcome: "BALANCE CHANGED",
    matched: true,
  },
  {
    tradeline: "Discover",
    bureau: "Equifax",
    before: "Charge-off",
    after: "Closed",
    outcome: "STATUS CHANGED",
    matched: true,
  },
  {
    tradeline: "Synchrony",
    bureau: "Experian",
    before: "$612",
    after: "$612",
    outcome: "VERIFIED",
    matched: true,
  },
  {
    tradeline: "Unknown tradeline",
    bureau: "Equifax",
    before: "—",
    after: "$1,204",
    outcome: "NEW NEGATIVE",
    matched: false,
  },
  {
    tradeline: "Credit One",
    bureau: "TransUnion",
    before: "—",
    after: "$880",
    outcome: "REINSERTED",
    matched: false,
  },
];

const scoreChanges = [
  { bureau: "Equifax", before: 588, after: 624 },
  { bureau: "Experian", before: 601, after: 643 },
  { bureau: "TransUnion", before: 590, after: 618 },
];

const removedItems = [
  "Portfolio Recovery — Experian",
  "LVNV Funding — Equifax",
  "Capital One — TU late payment",
];

const stillWorking = 6;
const newIssues = 2;

const Results = ({ embedded = false }: { embedded?: boolean }) => {
  const [tab, setTab] = useState<"comparison" | "report">("comparison");
  const { setTab: setClientTab } = useClientWorkspace();
  const positives = comparisons.filter(
    (c) => outcomeMeta[c.outcome].tone === "pos",
  ).length;
  const negatives = comparisons.filter(
    (c) => outcomeMeta[c.outcome].tone === "neg",
  ).length;

  return (
    <div className={embedded ? "" : "p-6 md:p-8"}>
      <div
        className={`${embedded ? "mb-6" : "mb-8"} flex flex-wrap items-center justify-between gap-3`}
      >
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Results Engine</h1>
          <p className="text-sm text-muted-foreground">
            Re-import a report, match it against the prior snapshot, and
            generate an AI progress report. This is the core technology moat.
          </p>
        </div>
        <Button
          onClick={() => setClientTab("import")}
          className="bg-gradient-emerald text-white hover:opacity-90"
        >
          <RefreshCw className="h-4 w-4" /> Re-import report
        </Button>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="text-xs font-medium text-muted-foreground">Deletions</p>
          <p className="mt-1 text-2xl font-bold text-emerald-600">
            {positives}
          </p>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="text-xs font-medium text-muted-foreground">
            Reinserted / new
          </p>
          <p className="mt-1 text-2xl font-bold text-red-600">{negatives}</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="text-xs font-medium text-muted-foreground">
            Matched items
          </p>
          <p className="mt-1 text-2xl font-bold">
            {comparisons.filter((c) => c.matched).length}/{comparisons.length}
          </p>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="text-xs font-medium text-muted-foreground">
            Avg score lift
          </p>
          <p className="mt-1 flex items-center gap-1 text-2xl font-bold text-emerald-600">
            <TrendingUp className="h-4 w-4" /> +35
          </p>
        </div>
      </div>

      <div className="mb-4 inline-flex rounded-lg border border-border bg-card p-1">
        {(["comparison", "report"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`rounded-md px-4 py-1.5 text-sm font-medium transition-colors ${
              tab === t
                ? "bg-gradient-emerald text-white"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {t === "comparison"
              ? "Before / after comparison"
              : "AI progress report"}
          </button>
        ))}
      </div>

      {tab === "comparison" ? (
        <div className="overflow-hidden rounded-2xl border border-border bg-card">
          <div className="flex items-center gap-2 border-b border-border p-5">
            <GitCompare className="h-5 w-5 text-emerald-600" />
            <h2 className="font-semibold">Prior snapshot vs. new report</h2>
            <Badge className="ml-auto bg-muted text-muted-foreground">
              Maria Gonzalez · 08/29/2026
            </Badge>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-border bg-muted/40 text-left text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-5 py-3 font-medium">Tradeline</th>
                  <th className="px-5 py-3 font-medium">Bureau</th>
                  <th className="px-5 py-3 font-medium">Before</th>
                  <th className="px-5 py-3 font-medium">After</th>
                  <th className="px-5 py-3 font-medium">Outcome</th>
                  <th className="px-5 py-3 font-medium">Match</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {comparisons.map((c, i) => {
                  const m = outcomeMeta[c.outcome];
                  return (
                    <tr key={i} className="hover:bg-muted/30">
                      <td className="px-5 py-4 font-medium">{c.tradeline}</td>
                      <td className="px-5 py-4 text-muted-foreground">
                        {c.bureau}
                      </td>
                      <td className="px-5 py-4 text-muted-foreground">
                        {c.before}
                      </td>
                      <td className="px-5 py-4 font-medium">{c.after}</td>
                      <td className="px-5 py-4">
                        <span
                          className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${m.cls}`}
                        >
                          <m.icon className="h-3 w-3" /> {c.outcome}
                        </span>
                      </td>
                      <td className="px-5 py-4">
                        {c.matched ? (
                          <span className="text-xs font-medium text-emerald-600">
                            Auto-matched
                          </span>
                        ) : (
                          <span className="text-xs font-medium text-amber-600">
                            Needs review
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="border-t border-border bg-muted/30 p-4 text-xs text-muted-foreground">
            Items the engine cannot confidently match are flagged for human
            review — never auto-classified as a deletion.
          </div>
        </div>
      ) : (
        <div className="rounded-2xl border border-border bg-card p-6">
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-emerald-600" />
            <h2 className="font-semibold">AI Progress Report</h2>
            <Badge className="ml-auto bg-emerald-500/10 text-emerald-600">
              Auto-generated · ready to send
            </Badge>
          </div>

          <div className="mt-6 rounded-xl border border-emerald-500/20 bg-emerald-950/80 p-6 text-emerald-50 shadow-sm">
            <p className="text-sm text-emerald-100/90 leading-relaxed">
              Maria, here are your results this cycle.
            </p>
            <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
              <div>
                <p className="text-3xl font-bold text-emerald-400">
                  {positives}
                </p>
                <p className="text-xs text-emerald-200/80">deletions</p>
              </div>
              <div>
                <p className="text-3xl font-bold text-emerald-400">2</p>
                <p className="text-xs text-emerald-200/80">corrections</p>
              </div>
              <div>
                <p className="text-3xl font-bold text-emerald-400">1</p>
                <p className="text-xs text-slate-300">late payment removed</p>
              </div>
              <div>
                <p className="text-3xl font-bold text-emerald-400">$8,442</p>
                <p className="text-xs text-slate-300">
                  negative balances removed
                </p>
              </div>
            </div>
          </div>

          <div className="mt-6 grid gap-6 lg:grid-cols-3">
            <div className="lg:col-span-2 space-y-6">
              <div>
                <h3 className="text-sm font-semibold">Credit scores</h3>
                <div className="mt-3 space-y-3">
                  {scoreChanges.map((s) => (
                    <div
                      key={s.bureau}
                      className="flex items-center justify-between rounded-lg border border-border p-3"
                    >
                      <span className="text-sm font-medium">{s.bureau}</span>
                      <span className="text-sm">
                        <span className="text-muted-foreground">
                          {s.before}
                        </span>
                        <ArrowRight className="mx-2 inline h-3.5 w-3.5 text-muted-foreground" />
                        <span className="font-semibold">{s.after}</span>
                        <span className="ml-2 font-semibold text-emerald-600">
                          +{s.after - s.before}
                        </span>
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <h3 className="text-sm font-semibold">Removed</h3>
                <ul className="mt-3 space-y-2">
                  {removedItems.map((r) => (
                    <li
                      key={r}
                      className="flex items-center gap-2 rounded-lg border border-border bg-muted/30 p-3 text-sm"
                    >
                      <CheckCircle2 className="h-4 w-4 text-emerald-600" /> {r}
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            <div className="space-y-4">
              <div className="rounded-xl border border-border p-4">
                <p className="text-xs font-medium text-muted-foreground">
                  Still being worked
                </p>
                <p className="mt-1 text-2xl font-bold">{stillWorking}</p>
                <p className="text-xs text-muted-foreground">accounts</p>
              </div>
              <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4">
                <p className="text-xs font-medium text-amber-600">
                  New issues detected
                </p>
                <p className="mt-1 text-2xl font-bold text-amber-600">
                  {newIssues}
                </p>
                <p className="text-xs text-muted-foreground">accounts</p>
              </div>
              <div className="rounded-xl border border-border bg-muted/30 p-4">
                <p className="flex items-center gap-1.5 text-xs font-medium">
                  <CalendarClock className="h-3.5 w-3.5 text-emerald-600" />{" "}
                  Next action
                </p>
                <p className="mt-1 text-sm">Round 2 review underway.</p>
              </div>
            </div>
          </div>

          <div className="mt-6 flex flex-wrap gap-3 border-t border-border pt-5">
            <Button className="bg-gradient-emerald text-white hover:opacity-90">
              <Send className="h-4 w-4" /> Send to client (SMS)
            </Button>
            <Button variant="outline">
              <Mail className="h-4 w-4" /> Send to client (email)
            </Button>
            <Button variant="outline">Download PDF</Button>
          </div>
        </div>
      )}

      <div className="mt-6 flex items-start gap-3 rounded-2xl border border-border bg-muted/40 p-5">
        <TrendingDown className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
        <p className="text-sm text-muted-foreground">
          The Results Engine compares each new report against the immutable
          prior snapshot — classifying deletions, corrections, reinsertions, and
          unmatched items — then turns verified outcomes into a client-ready
          progress report. This re-import loop is the workflow your operation
          already knows matters most.
        </p>
      </div>
    </div>
  );
};

export default Results;
