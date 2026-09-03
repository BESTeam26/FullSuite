// Round Escalation Panel — shows the 7-Layer Compliance Method + round tracker
// Aggressive from Round 1. Each round builds documentation for the next layer.

import { Shield, ArrowRight, CheckCircle2, Circle, Layers } from "lucide-react";
import {
  SEVEN_LAYERS,
  buildLayerStates,
  getRoundDefinition,
} from "@/lib/dispute/rounds-and-layers";

export const RoundEscalationPanel = ({
  round,
  onRoundChange,
}: {
  round: number;
  onRoundChange: (r: number) => void;
}) => {
  const roundDef = getRoundDefinition(round);
  const layers = buildLayerStates(round);

  return (
    <div className="space-y-6">
      {/* Round selector */}
      <div className="rounded-2xl border border-border bg-card p-6">
        <div className="flex items-center gap-2">
          <Shield className="h-5 w-5 text-status-success" />
          <h2 className="font-semibold">Round escalation</h2>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          Aggressive from Round 1. Each round builds documentation for the next
          compliance layer if the account remains uncorrected.
        </p>

        <div className="mt-5 flex flex-wrap gap-2">
          {[1, 2, 3, 4, 5, 6, 7].map((r) => {
            const def = getRoundDefinition(r);
            const isActive = r === round;
            const isPast = r < round;
            return (
              <button
                key={r}
                onClick={() => onRoundChange(r)}
                className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-sm font-medium transition-colors ${
                  isActive
                    ? "border-emerald-500/50 bg-emerald-500/10 text-status-success"
                    : isPast
                      ? "border-border bg-muted/40 text-muted-foreground"
                      : "border-border bg-card text-muted-foreground hover:bg-muted/30"
                }`}
              >
                {isPast ? (
                  <CheckCircle2 className="h-3.5 w-3.5 text-status-success" />
                ) : isActive ? (
                  <Circle className="h-3.5 w-3.5 fill-emerald-500/20" />
                ) : (
                  <Circle className="h-3.5 w-3.5" />
                )}
                Round {r}
              </button>
            );
          })}
        </div>

        <div className="mt-5 rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4">
          <p className="text-sm font-semibold text-status-success">
            {roundDef.name}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">{roundDef.focus}</p>
          <div className="mt-3 space-y-1.5">
            {roundDef.requiredActions.map((action) => (
              <p
                key={action}
                className="flex items-start gap-2 text-xs text-foreground"
              >
                <ArrowRight className="mt-0.5 h-3 w-3 shrink-0 text-status-success" />
                {action}
              </p>
            ))}
          </div>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {roundDef.legalBasis.map((b) => (
              <span
                key={b}
                className="rounded-full bg-muted px-2 py-0.5 font-mono text-[10px] text-muted-foreground"
              >
                {b}
              </span>
            ))}
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3 text-xs">
          <div className="rounded-lg border border-border bg-muted/30 p-3">
            <p className="text-muted-foreground">Status update (ClickUp)</p>
            <p className="mt-1 font-medium">{roundDef.statusAfter.clickup}</p>
          </div>
          <div className="rounded-lg border border-border bg-muted/30 p-3">
            <p className="text-muted-foreground">
              Status update (Google Sheet)
            </p>
            <p className="mt-1 font-medium">
              {roundDef.statusAfter.googleSheet}
            </p>
          </div>
        </div>
      </div>

      {/* 7-Layer Compliance Method */}
      <div className="rounded-2xl border border-border bg-card p-6">
        <div className="flex items-center gap-2">
          <Layers className="h-5 w-5 text-status-success" />
          <h2 className="font-semibold">7-Layer Compliance Method</h2>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          Each round activates the next layer. Objective: convert a simple
          dispute into a documented compliance failure case.
        </p>

        <div className="mt-5 space-y-2">
          {layers.map((layer) => {
            const isActive = layer.status === "active";
            return (
              <div
                key={layer.number}
                className={`flex items-start gap-3 rounded-xl border p-4 transition-colors ${
                  isActive
                    ? "border-emerald-500/40 bg-emerald-500/5"
                    : "border-border bg-muted/20"
                }`}
              >
                <div
                  className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-sm font-bold ${
                    isActive
                      ? "bg-emerald-500/20 text-status-success"
                      : "bg-muted text-muted-foreground"
                  }`}
                >
                  {layer.number}
                </div>
                <div className="flex-1">
                  <p
                    className={`text-sm font-semibold ${
                      isActive ? "text-status-success" : "text-foreground"
                    }`}
                  >
                    {layer.name}
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {layer.description}
                  </p>
                </div>
                {isActive && (
                  <span className="flex items-center gap-1 rounded-full bg-emerald-500/10 px-2.5 py-1 text-xs font-medium text-status-success">
                    <CheckCircle2 className="h-3 w-3" /> Active
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
