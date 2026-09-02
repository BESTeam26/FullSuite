import { useMemo, useState } from "react";
import {
  Download,
  RefreshCw,
  Sparkles,
  BarChart3,
  ListChecks,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { BureauScoreCard } from "@/components/clients/progress-report/BureauScoreCard";
import { ProgressReportNarrative } from "@/components/clients/progress-report/ProgressReportNarrative";
import {
  sampleProgressReport,
  generateProgressUpdate,
  FICO_FACTORS,
} from "@/lib/progress-report-logic";
import { useClientWorkspace } from "@/lib/client-workspace-context";

function ChangeStat({
  value,
  thisRound,
  lastRound,
  grandTotal,
  label,
  tone,
}: {
  value: number;
  thisRound: number;
  lastRound: number;
  grandTotal: number;
  label: string;
  tone: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <p className={`text-2xl font-black ${tone}`}>{value}</p>
      <p className="mt-0.5 text-sm font-semibold leading-tight">{label}</p>
      <div className="mt-1.5 grid grid-cols-2 gap-x-3 text-[11px] text-muted-foreground">
        <span>This round {thisRound}</span>
        <span>Last round {lastRound}</span>
      </div>
      <p className="mt-1 text-xs font-medium">Grand total {grandTotal}</p>
    </div>
  );
}

const ProgressReport = ({ embedded = false }: { embedded?: boolean }) => {
  const [data] = useState(sampleProgressReport);
  const { setTab } = useClientWorkspace();
  const [generated, setGenerated] = useState(() =>
    generateProgressUpdate(data),
  );

  const handleEdit = (key: keyof typeof generated.sections, value: string) => {
    setGenerated((prev) => ({
      ...prev,
      sections: { ...prev.sections, [key]: value },
    }));
  };

  const t = data.totals;

  const avgLift = useMemo(() => {
    const deltas = data.bureaus.map((b) => b.score - b.prevScore);
    return Math.round(deltas.reduce((a, b) => a + b, 0) / deltas.length);
  }, [data]);

  return (
    <div className={embedded ? "" : "p-6 md:p-8"}>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            AI Progress Report
          </h1>
          <p className="text-sm text-muted-foreground">
            {data.clientName} · Summary created {data.reportDate} · previous
            report {data.previousReportDate} · since {data.sinceDate}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => setTab("import")}>
            <RefreshCw className="h-4 w-4" /> Re-import report
          </Button>
          <Button className="bg-gradient-emerald text-white hover:opacity-90">
            <Download className="h-4 w-4" /> Download PDF
          </Button>
        </div>
      </div>

      {/* Top KPI strip */}
      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="text-xs font-medium text-muted-foreground">
            Avg. score lift
          </p>
          <p className="mt-1 text-2xl font-bold text-emerald-600">
            {avgLift >= 0 ? "+" : ""}
            {avgLift}
          </p>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="text-xs font-medium text-muted-foreground">
            Deleted this round
          </p>
          <p className="mt-1 text-2xl font-bold">{t.deletedThisRound}</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="text-xs font-medium text-muted-foreground">
            Disputes on-going
          </p>
          <p className="mt-1 text-2xl font-bold">{t.onGoingThisRound}</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="text-xs font-medium text-muted-foreground">
            New items this round
          </p>
          <p className="mt-1 text-2xl font-bold text-amber-600">
            {t.newItemsAddedThisRound}
          </p>
        </div>
      </div>

      {/* Bureau score cards */}
      <div className="mb-6 grid gap-5 lg:grid-cols-3">
        {data.bureaus.map((b) => (
          <BureauScoreCard key={b.key} bureau={b} />
        ))}
      </div>

      {/* Change summary */}
      <div className="mb-6">
        <div className="mb-3 flex items-center gap-2">
          <ListChecks className="h-4 w-4 text-emerald-600" />
          <h2 className="text-sm font-semibold">
            Changes since your last credit import
          </h2>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <ChangeStat
            value={t.deletedThisRound}
            thisRound={t.deletedThisRound}
            lastRound={t.deletedLastRound}
            grandTotal={t.deletedThisRound + t.deletedLastRound}
            label="Disputes deleted"
            tone="text-indigo-600"
          />
          <ChangeStat
            value={t.onGoingThisRound}
            thisRound={t.onGoingThisRound}
            lastRound={t.onGoingLastRound}
            grandTotal={t.onGoingThisRound + t.onGoingLastRound}
            label="Disputes on-going"
            tone="text-orange-600"
          />
          <ChangeStat
            value={t.undisputedNegativeThisRound}
            thisRound={t.undisputedNegativeThisRound}
            lastRound={t.undisputedNegativeLastRound}
            grandTotal={
              t.undisputedNegativeThisRound + t.undisputedNegativeLastRound
            }
            label="Un-disputed negative"
            tone="text-red-600"
          />
          <ChangeStat
            value={t.updatedToPositiveThisRound}
            thisRound={t.updatedToPositiveThisRound}
            lastRound={t.updatedToPositiveLastRound}
            grandTotal={
              t.updatedToPositiveThisRound + t.updatedToPositiveLastRound
            }
            label="Updated to positive"
            tone="text-emerald-600"
          />
          <ChangeStat
            value={t.newItemsAddedThisRound}
            thisRound={t.newItemsAddedThisRound}
            lastRound={t.newItemsAddedLastRound}
            grandTotal={t.newItemsAddedThisRound + t.newItemsAddedLastRound}
            label="New items added"
            tone="text-blue-600"
          />
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="space-y-6">
          {/* FICO factors */}
          <div className="rounded-2xl border border-border bg-card p-5">
            <div className="mb-3 flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-emerald-600" />
              <h2 className="text-sm font-semibold">
                FICO factors impacting score
              </h2>
            </div>
            <div className="space-y-2.5">
              {FICO_FACTORS.map((f) => (
                <div key={f.label}>
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-medium">{f.label}</span>
                    <span className="text-muted-foreground">{f.pct}%</span>
                  </div>
                  <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-gradient-emerald"
                      style={{ width: `${f.pct * 2}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* AI-generated narrative */}
          <ProgressReportNarrative generated={generated} onEdit={handleEdit} />
        </div>

        <div className="space-y-4">
          <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-5">
            <div className="flex items-center gap-2 text-emerald-700">
              <Sparkles className="h-4 w-4" />
              <p className="text-sm font-semibold">Compliance guardrail</p>
            </div>
            <p className="mt-2 text-xs text-emerald-700">
              This narrative is generated only from verified before/after report
              data. It never fabricates results, never assumes outcomes, and
              never promises a specific future score.
            </p>
          </div>
          <div className="rounded-2xl border border-border bg-card p-5">
            <p className="text-sm font-semibold">Distribution</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Auto-saved to Documents on the client record and inside the Client
              Portal.
            </p>
            <div className="mt-3 flex flex-wrap gap-1.5">
              <Badge className="bg-blue-500/10 text-blue-600">
                Client Portal
              </Badge>
              <Badge className="bg-purple-500/10 text-purple-600">
                Documents tab
              </Badge>
              <Badge className="bg-slate-500/10 text-slate-600">
                Affiliate view
              </Badge>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ProgressReport;
