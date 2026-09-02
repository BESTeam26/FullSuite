import { CheckCircle2, FileCheck2, Clock, Scale, Trophy } from "lucide-react";
import { useDiy } from "@/lib/diy/diy-context";
import { StatCard } from "./shared";

export const ProgressView = () => {
  const { items } = useDiy();
  const deleted = 3;
  const corrected = 1;
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">My progress</h1>
        <p className="mt-1 text-sm text-slate-400">
          Track your score movement and resolved items across rounds.
        </p>
      </div>

      <div className="grid grid-cols-3 gap-3">
        {[
          {
            label: "Equifax",
            score: "588→624",
            delta: "+36",
            tone: "text-emerald-300",
          },
          {
            label: "Experian",
            score: "601→643",
            delta: "+42",
            tone: "text-emerald-300",
          },
          {
            label: "TransUnion",
            score: "590→618",
            delta: "+28",
            tone: "text-emerald-300",
          },
        ].map((b) => (
          <div
            key={b.label}
            className="rounded-2xl border border-white/10 bg-white/5 p-4 text-center"
          >
            <p className="text-xs text-slate-400">{b.label}</p>
            <p className="mt-1 text-lg font-bold text-white">{b.score}</p>
            <p className={`text-sm font-semibold ${b.tone}`}>{b.delta}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard
          label="Deletions"
          value={deleted}
          tone="text-emerald-300"
          icon={CheckCircle2}
        />
        <StatCard
          label="Corrections"
          value={corrected}
          tone="text-sky-300"
          icon={FileCheck2}
        />
        <StatCard
          label="On-going"
          value={items.filter((i) => i.isNegative).length}
          tone="text-amber-300"
          icon={Clock}
        />
        <StatCard
          label="Still to dispute"
          value={items.filter((i) => i.disposition === "dispute").length}
          tone="text-purple-300"
          icon={Scale}
        />
      </div>

      <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
        <h2 className="mb-3 text-sm font-semibold">Recent wins</h2>
        <div className="space-y-2">
          {[
            {
              name: "Portfolio Recovery",
              bureau: "Experian",
              action: "Deleted",
            },
            { name: "LVNV Funding", bureau: "Equifax", action: "Deleted" },
            {
              name: "Capital One late",
              bureau: "TransUnion",
              action: "Late removed",
            },
          ].map((w, i) => (
            <div
              key={i}
              className="flex items-center justify-between rounded-lg bg-navy-deep/60 p-3"
            >
              <div>
                <p className="text-sm font-medium text-white">{w.name}</p>
                <p className="text-[11px] text-slate-400">{w.bureau}</p>
              </div>
              <span className="rounded-full bg-emerald-500/15 px-2.5 py-1 text-[10px] font-bold text-emerald-300">
                {w.action}
              </span>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-2xl border border-emerald-400/30 bg-emerald-500/5 p-5">
        <Trophy className="h-5 w-5 text-emerald-300" />
        <p className="mt-2 text-sm font-semibold text-emerald-200">
          $8,442 in negative balances removed
        </p>
        <p className="mt-1 text-xs text-slate-300">
          Next action: Round 2 review underway for remaining items.
        </p>
      </div>
    </div>
  );
};
