import { useState } from "react";
import { GitFork, ArrowRight } from "lucide-react";
import { useDiy } from "@/lib/diy/diy-context";
import { RoundTracker } from "@/components/diy/RoundTracker";
import { ROUND_DEFS } from "@/lib/diy/round-logic";

export const RoundsView = () => {
  const { items, rounds } = useDiy();
  const disputed = items.filter((i) => i.disposition === "dispute");
  const [selected, setSelected] = useState(disputed[0]?.id ?? "");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Round tracker</h1>
        <p className="mt-1 text-sm text-slate-400">
          Every item moves through lawful, factual stages. Choose when to
          escalate — from initial CRA dispute up to attorney referral.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
        <div className="space-y-2">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
            Items in dispute ({disputed.length})
          </p>
          {disputed.map((it) => {
            const r = rounds[it.id];
            const active = selected === it.id;
            return (
              <button
                key={it.id}
                onClick={() => setSelected(it.id)}
                className={`flex w-full items-center justify-between rounded-xl border px-3 py-2.5 text-left transition-colors ${
                  active
                    ? "border-emerald-400/40 bg-emerald-500/10"
                    : "border-white/10 bg-white/5 hover:bg-white/10"
                }`}
              >
                <div className="min-w-0">
                  <p className="truncate text-xs font-semibold text-white">
                    {it.name}
                  </p>
                  <p className="text-[11px] text-slate-400">
                    {r
                      ? `Round ${ROUND_DEFS.find((d) => d.stage === r.stage)?.round}`
                      : "Not started"}
                  </p>
                </div>
                <GitFork
                  className={`h-3.5 w-3.5 shrink-0 ${active ? "text-emerald-300" : "text-slate-500"}`}
                />
              </button>
            );
          })}
        </div>
        <div>{selected && <RoundTracker itemId={selected} />}</div>
      </div>

      <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
        <h2 className="mb-3 text-sm font-semibold">The escalation ladder</h2>
        <div className="grid gap-3 sm:grid-cols-5">
          {ROUND_DEFS.map((d, i) => (
            <div
              key={d.stage}
              className="rounded-xl border border-white/10 bg-navy-deep/40 p-3"
            >
              <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-300">
                Round {d.round}
              </p>
              <p className="mt-1 text-xs font-semibold text-white">{d.label}</p>
              <p className="mt-1 text-[10px] leading-relaxed text-slate-400">
                {d.recipient}
              </p>
              {i < ROUND_DEFS.length - 1 && (
                <ArrowRight className="mt-2 h-3 w-3 text-slate-600" />
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
