import {
  CheckCircle2,
  FileCheck2,
  Clock,
  Scale,
  TrendingUp,
  Trophy,
} from "lucide-react";

const snapshots = [
  { date: "Jun 18, 2026", eq: 588, ex: 572, tu: 590 },
  { date: "Jul 18, 2026", eq: 600, ex: 585, tu: 598 },
  { date: "Aug 18, 2026", eq: 612, ex: 598, tu: 605 },
];

export const ConsumerProgress = () => (
  <div className="space-y-6">
    <div>
      <h1 className="text-2xl font-bold tracking-tight">My Progress</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Track your score movement and resolved items across rounds. Previous
        imports are never overwritten.
      </p>
    </div>

    <div className="grid grid-cols-3 gap-3">
      {[
        { label: "Equifax", start: 588, now: 612 },
        { label: "Experian", start: 572, now: 598 },
        { label: "TransUnion", start: 590, now: 605 },
      ].map((b) => (
        <div
          key={b.label}
          className="rounded-2xl border border-border bg-card p-4 text-center"
        >
          <p className="text-xs text-muted-foreground">{b.label}</p>
          <p className="mt-1 text-2xl font-bold text-foreground">{b.now}</p>
          <p className="text-xs font-semibold text-emerald-300">
            +{b.now - b.start} since start
          </p>
        </div>
      ))}
    </div>

    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      <div className="rounded-xl border border-border bg-card p-4">
        <CheckCircle2 className="h-4 w-4 text-muted-foreground" />
        <p className="mt-2 text-2xl font-bold text-emerald-300">3</p>
        <p className="mt-0.5 text-xs text-muted-foreground">Deletions</p>
      </div>
      <div className="rounded-xl border border-border bg-card p-4">
        <FileCheck2 className="h-4 w-4 text-muted-foreground" />
        <p className="mt-2 text-2xl font-bold text-sky-300">1</p>
        <p className="mt-0.5 text-xs text-muted-foreground">Corrections</p>
      </div>
      <div className="rounded-xl border border-border bg-card p-4">
        <Clock className="h-4 w-4 text-muted-foreground" />
        <p className="mt-2 text-2xl font-bold text-amber-300">4</p>
        <p className="mt-0.5 text-xs text-muted-foreground">On-going</p>
      </div>
      <div className="rounded-xl border border-border bg-card p-4">
        <Scale className="h-4 w-4 text-muted-foreground" />
        <p className="mt-2 text-2xl font-bold text-purple-300">2</p>
        <p className="mt-0.5 text-xs text-muted-foreground">Still to dispute</p>
      </div>
    </div>

    <div className="rounded-2xl border border-border bg-card p-5">
      <h2 className="mb-3 text-sm font-semibold">Report history</h2>
      <div className="space-y-2">
        {snapshots.map((s) => (
          <div
            key={s.date}
            className="flex items-center justify-between rounded-lg bg-navy-deep/60 p-3"
          >
            <div>
              <p className="text-sm font-medium text-foreground">{s.date}</p>
              <p className="text-[11px] text-muted-foreground">
                EQ {s.eq} · EX {s.ex} · TU {s.tu}
              </p>
            </div>
            <TrendingUp className="h-4 w-4 text-emerald-300" />
          </div>
        ))}
      </div>
    </div>

    <div className="rounded-2xl border border-border bg-card p-5">
      <h2 className="mb-3 text-sm font-semibold">Recent wins</h2>
      <div className="space-y-2">
        {[
          { name: "Portfolio Recovery", bureau: "Experian", action: "Deleted" },
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
              <p className="text-sm font-medium text-foreground">{w.name}</p>
              <p className="text-[11px] text-muted-foreground">{w.bureau}</p>
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
      <p className="mt-1 text-xs text-muted-foreground">
        Next action: Round 2 review underway for remaining items.
      </p>
    </div>
  </div>
);
