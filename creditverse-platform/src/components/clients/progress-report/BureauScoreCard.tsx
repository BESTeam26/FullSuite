import {
  TrendingUp,
  TrendingDown,
  Trash2,
  Smile,
  Plus,
  GitPullRequest,
} from "lucide-react";
import type { BureauProgress, DeletionRow } from "@/lib/progress-report-logic";
import { fmtMoney } from "@/lib/progress-report-logic";

function StatChip({
  value,
  label,
  tone,
  icon: Icon,
}: {
  value: number;
  label: string;
  tone: string;
  icon: typeof Trash2;
}) {
  return (
    <div className="flex flex-col items-center rounded-lg border border-border bg-muted/30 p-2.5 text-center">
      <Icon className={`h-3.5 w-3.5 ${tone}`} />
      <p className={`mt-1 text-lg font-bold ${tone}`}>{value}</p>
      <p className="text-[10px] leading-tight text-muted-foreground">{label}</p>
    </div>
  );
}

/**
 * What a row's status is called in front of a client. "No longer observed"
 * rather than "Deleted": the report stopped showing the item, which is not the
 * same as a bureau saying it removed it (see `dispute/outcome-vocabulary`).
 */
const ROW_STATUS_LABELS: Record<DeletionRow["status"], string> = {
  NoLongerObserved: "No longer observed",
  Positive: "Positive",
  Negative: "Negative",
};

export function BureauScoreCard({ bureau }: { bureau: BureauProgress }) {
  const change = bureau.score - bureau.prevScore;
  const totalImprovement = bureau.score - bureau.startingScore;
  const isUp = change >= 0;
  const pct = ((bureau.score - 300) / 550) * 100;

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card">
      {/* Brand header */}
      <div
        className="flex items-center justify-between px-5 py-3 text-white"
        style={{ backgroundColor: bureau.brandColor }}
      >
        <div>
          <p className="text-sm font-bold">{bureau.label}</p>
          <p className="text-[11px] opacity-80">Created: {bureau.date}</p>
        </div>
        <div className="flex items-center gap-1 rounded-full bg-white/15 px-2.5 py-1 text-xs font-semibold">
          {isUp ? (
            <TrendingUp className="h-3 w-3" />
          ) : (
            <TrendingDown className="h-3 w-3" />
          )}
          Total {totalImprovement >= 0 ? "+" : ""}
          {totalImprovement}
        </div>
      </div>

      <div className="p-5">
        {/* Gauge */}
        <div className="relative mx-auto h-24 w-36">
          <svg viewBox="0 0 160 100" className="h-full w-full">
            <path
              d="M 20 85 A 60 60 0 0 1 140 85"
              fill="none"
              stroke="#e5e7eb"
              strokeWidth="12"
              strokeLinecap="round"
            />
            <path
              d="M 20 85 A 60 60 0 0 1 140 85"
              fill="none"
              stroke={isUp ? "#10b981" : "#ef4444"}
              strokeWidth="12"
              strokeLinecap="round"
              strokeDasharray={`${(pct / 100) * 188} 188`}
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center pt-3">
            <p className="text-2xl font-bold">{bureau.score}</p>
          </div>
        </div>
        <div className="mt-1 flex justify-between text-[10px] text-muted-foreground">
          <span>300</span>
          <span>850</span>
        </div>
        <p className="mt-1 text-center text-sm font-bold text-status-success">
          {isUp ? "+" : ""}
          {change} since last report
        </p>

        {/* Previous scores timeline */}
        <div className="mt-4">
          <p className="mb-2 text-center text-[11px] font-semibold uppercase text-muted-foreground">
            Previous scores · starting {bureau.startingScore}
          </p>
          <div className="flex items-center justify-between gap-1">
            {bureau.history.map((h) => (
              <div key={h.label} className="flex-1 text-center">
                <p className="text-sm font-bold">{h.score}</p>
                <p
                  className={`text-[10px] font-medium ${h.change >= 0 ? "text-status-success" : "text-status-danger"}`}
                >
                  {h.change >= 0 ? "+" : ""}
                  {h.change}
                </p>
                <p className="text-[9px] text-muted-foreground">{h.label}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Stat chips */}
        <div className="mt-4 grid grid-cols-4 gap-2">
          <StatChip
            value={bureau.itemsDeleted}
            label="Items deleted"
            tone="text-status-success"
            icon={Trash2}
          />
          <StatChip
            value={bureau.updatedToPositive}
            label="Updated positive"
            tone="text-status-info"
            icon={Smile}
          />
          <StatChip
            value={bureau.newItemsAdded}
            label="New items"
            tone="text-status-warning"
            icon={Plus}
          />
          <StatChip
            value={bureau.disputesOnGoing}
            label="Disputes ongoing"
            tone="text-slate-600"
            icon={GitPullRequest}
          />
        </div>

        {/* Deletions & updates table */}
        {bureau.deletionRows.length > 0 && (
          <div className="mt-4">
            <p className="mb-2 text-xs font-semibold">
              Deletions &amp; updates this round
            </p>
            <div className="overflow-hidden rounded-lg border border-border">
              <table className="w-full text-[11px]">
                <thead className="bg-muted/50 text-left uppercase text-muted-foreground">
                  <tr>
                    <th className="px-2.5 py-1.5 font-medium">Item</th>
                    <th className="px-2.5 py-1.5 font-medium">Balance</th>
                    <th className="px-2.5 py-1.5 text-right font-medium">
                      Status
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {bureau.deletionRows.map((r, i) => (
                    <tr key={i}>
                      <td className="px-2.5 py-1.5">
                        <p className="font-medium">{r.name}</p>
                        <p className="text-[10px] text-muted-foreground">
                          {r.category}
                        </p>
                      </td>
                      <td className="px-2.5 py-1.5 text-muted-foreground">
                        {r.highBalance}
                      </td>
                      <td className="px-2.5 py-1.5 text-right">
                        <span
                          className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                            r.status === "NoLongerObserved" ||
                            r.status === "Positive"
                              ? "bg-emerald-500/10 text-status-success"
                              : "bg-red-500/10 text-status-danger"
                          }`}
                        >
                          {ROW_STATUS_LABELS[r.status]}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* New dispute rows */}
        {bureau.newDisputeRows.length > 0 && (
          <div className="mt-3">
            <p className="mb-2 text-xs font-semibold text-status-warning">
              New dispute items for this round
            </p>
            <ul className="space-y-1">
              {bureau.newDisputeRows.map((r, i) => (
                <li
                  key={i}
                  className="flex items-center justify-between rounded-lg border border-amber-500/20 bg-amber-500/5 px-2.5 py-1.5 text-[11px]"
                >
                  <span className="font-medium">{r.name}</span>
                  <span className="text-muted-foreground">{r.category}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Usage */}
        <div className="mt-4 rounded-lg bg-muted/40 p-3">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold">Current credit usage</p>
            <p className="text-lg font-bold">
              {bureau.usage.pct}%{" "}
              <span className="text-[10px] font-normal text-muted-foreground">
                (prev {bureau.usage.prevPct}%)
              </span>
            </p>
          </div>
          <p className="mt-1 text-[11px] text-muted-foreground">
            {fmtMoney(bureau.usage.limit)} in revolving limit, average balance{" "}
            {fmtMoney(bureau.usage.balance)}. Keep balances below 10% for best
            results.
          </p>
        </div>
      </div>
    </div>
  );
}
