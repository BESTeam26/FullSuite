import { useState } from "react";
import {
  ChevronRight,
  Send,
  Clock,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  ScrollText,
  Building2,
  Landmark,
  Gavel,
  History,
} from "lucide-react";
import { useDiy } from "@/lib/diy/diy-context";
import {
  ROUND_DEFS,
  type RoundStage,
  type RoundStatus,
} from "@/lib/diy/round-logic";

const stageIcon: Record<RoundStage, typeof Send> = {
  initial: Send,
  mov: ScrollText,
  furnisher: Building2,
  regulator: Landmark,
  legal: Gavel,
};

const statusConfig: Record<
  RoundStatus,
  { label: string; color: string; dot: string }
> = {
  "not-started": {
    label: "Not started",
    color: "text-slate-400",
    dot: "bg-slate-500",
  },
  drafting: {
    label: "Drafting",
    color: "text-amber-300",
    dot: "bg-amber-400",
  },
  sent: { label: "Sent", color: "text-sky-300", dot: "bg-sky-400" },
  responded: {
    label: "Responded",
    color: "text-emerald-300",
    dot: "bg-emerald-400",
  },
  escalated: {
    label: "Escalated",
    color: "text-purple-300",
    dot: "bg-purple-400",
  },
};

export const RoundTracker = ({ itemId }: { itemId: string }) => {
  const { rounds, advanceRound, setRoundStatus, items } = useDiy();
  const [openStage, setOpenStage] = useState<RoundStage | null>(null);
  const round = rounds[itemId];
  const item = items.find((i) => i.id === itemId);

  if (!round || !item) return null;

  const currentIdx = ROUND_DEFS.findIndex((r) => r.stage === round.stage);

  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <p className="text-sm font-bold">{item.name}</p>
          <p className="text-xs text-slate-400">
            {item.category} · {item.balance || "—"}
          </p>
        </div>
        <div
          className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${statusConfig[round.status].color} bg-white/5`}
        >
          <span
            className={`h-1.5 w-1.5 rounded-full ${statusConfig[round.status].dot}`}
          />
          {statusConfig[round.status].label}
        </div>
      </div>

      {/* Stage ladder */}
      <div className="relative">
        <div className="absolute left-4 top-2 bottom-2 w-0.5 bg-white/10" />
        <div className="space-y-1">
          {ROUND_DEFS.map((def, idx) => {
            const Icon = stageIcon[def.stage];
            const isCurrent = def.stage === round.stage;
            const isPast = idx < currentIdx;
            const isFuture = idx > currentIdx;
            const isOpen = openStage === def.stage;

            return (
              <div key={def.stage} className="relative">
                <button
                  onClick={() => setOpenStage(isOpen ? null : def.stage)}
                  className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors ${
                    isCurrent
                      ? "bg-emerald-500/15 ring-1 ring-emerald-400/30"
                      : "hover:bg-white/5"
                  }`}
                >
                  <span
                    className={`relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
                      isCurrent
                        ? "bg-gradient-emerald text-white"
                        : isPast
                          ? "bg-emerald-500/20 text-emerald-300"
                          : "bg-white/10 text-slate-400"
                    }`}
                  >
                    {isPast ? (
                      <CheckCircle2 className="h-4 w-4" />
                    ) : (
                      <Icon className="h-4 w-4" />
                    )}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p
                        className={`text-sm font-semibold ${isFuture ? "text-slate-400" : "text-white"}`}
                      >
                        {def.short}
                      </p>
                      {isCurrent && (
                        <span className="rounded-full bg-emerald-400/20 px-2 py-0.5 text-[10px] font-bold text-emerald-300">
                          CURRENT
                        </span>
                      )}
                      {isPast && (
                        <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-medium text-slate-400">
                          Done
                        </span>
                      )}
                    </div>
                    <p className="truncate text-xs text-slate-400">
                      {def.label}
                    </p>
                  </div>
                  <ChevronRight
                    className={`h-4 w-4 shrink-0 text-slate-500 transition-transform ${
                      isOpen ? "rotate-90" : ""
                    }`}
                  />
                </button>

                {isOpen && (
                  <div className="ml-11 mt-2 mb-3 rounded-xl border border-white/10 bg-navy-deep/60 p-4">
                    <p className="text-xs leading-relaxed text-slate-300">
                      {def.description}
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <span className="rounded-md bg-white/5 px-2 py-1 text-[10px] font-medium text-sky-300">
                        Recipient: {def.recipient}
                      </span>
                      <span className="rounded-md bg-white/5 px-2 py-1 text-[10px] font-medium text-purple-300">
                        {def.legalBasis}
                      </span>
                    </div>
                    <div className="mt-2 flex items-start gap-1.5 text-[11px] text-slate-400">
                      <Clock className="mt-0.5 h-3 w-3 shrink-0" />
                      <span>{def.timeline}</span>
                    </div>

                    {isCurrent && (
                      <div className="mt-4 border-t border-white/10 pt-3">
                        <p className="mb-2 text-xs font-semibold text-slate-200">
                          {def.round <= currentIdx + 1
                            ? "Actions for this round:"
                            : "What this round involves:"}
                        </p>
                        <ul className="mb-3 space-y-1">
                          {def.actions.map((a) => (
                            <li
                              key={a}
                              className="flex items-start gap-1.5 text-[11px] text-slate-400"
                            >
                              <span className="mt-0.5 text-emerald-400">›</span>
                              {a}
                            </li>
                          ))}
                        </ul>
                        <div className="flex flex-wrap gap-2">
                          {round.status !== "sent" &&
                            round.status !== "responded" && (
                              <button
                                onClick={() => setRoundStatus(itemId, "sent")}
                                className="flex items-center gap-1.5 rounded-lg bg-gradient-emerald px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90"
                              >
                                <Send className="h-3 w-3" /> Mark as sent
                              </button>
                            )}
                          {round.status === "sent" && (
                            <button
                              onClick={() =>
                                setRoundStatus(itemId, "responded")
                              }
                              className="flex items-center gap-1.5 rounded-lg border border-emerald-400/40 bg-emerald-500/10 px-3 py-1.5 text-xs font-semibold text-emerald-300 hover:bg-emerald-500/20"
                            >
                              <CheckCircle2 className="h-3 w-3" /> Mark
                              responded
                            </button>
                          )}
                        </div>

                        {/* Escalation path */}
                        {def.escalation.length > 0 && (
                          <div className="mt-4 border-t border-white/10 pt-3">
                            <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-amber-300">
                              <AlertTriangle className="h-3.5 w-3.5" />
                              Escalation path — choose your next step
                            </p>
                            <div className="space-y-2">
                              {def.escalation.map((opt) => (
                                <button
                                  key={opt.to}
                                  onClick={() => advanceRound(itemId, opt.to)}
                                  className="flex w-full items-start gap-2 rounded-lg border border-white/10 bg-white/5 p-3 text-left transition-colors hover:border-emerald-400/40 hover:bg-emerald-500/10"
                                >
                                  <ArrowRight className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-400" />
                                  <div>
                                    <p className="text-xs font-semibold text-white">
                                      {opt.label}
                                    </p>
                                    <p className="mt-0.5 text-[11px] leading-relaxed text-slate-400">
                                      When: {opt.when}
                                    </p>
                                  </div>
                                </button>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    {isFuture && !isCurrent && (
                      <p className="mt-3 flex items-center gap-1.5 text-[11px] text-slate-500">
                        <Clock className="h-3 w-3" /> Complete the current round
                        before escalating here.
                      </p>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Audit history */}
      {round.history.length > 0 && (
        <div className="mt-4 border-t border-white/10 pt-4">
          <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-slate-300">
            <History className="h-3.5 w-3.5" /> Case audit trail
          </p>
          <div className="space-y-1.5">
            {round.history.map((h, i) => (
              <div
                key={i}
                className="flex items-start gap-2 text-[11px] text-slate-400"
              >
                <span className="font-mono text-slate-500">{h.date}</span>
                <span>{h.note}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
