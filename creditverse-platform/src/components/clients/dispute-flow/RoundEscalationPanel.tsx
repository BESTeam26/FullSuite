/**
 * Where this case has got to, and what the next round would rest on.
 *
 * REWRITTEN in CR-4b. This panel used to render the 7-Layer Compliance Method
 * from `rounds-and-layers.ts`, whose stated objective was "convert a simple
 * dispute into a documented compliance failure case", and which scheduled
 * escalation by round number — compliance officer, chief risk officer, general
 * counsel, executive office, regulatory pressure — regardless of what the
 * record actually held.
 *
 * It now reads the canonical `escalation-ladder`, where a round is EARNED by
 * the record. The difference a user sees: instead of "Layer 4 active", the
 * panel says what the round asks for, who it is addressed to, and what must
 * already be true before it is worth sending.
 *
 * It shows availability. It does not enforce a sequence — an organization may
 * run its own dispute SOP, and every round stays selectable.
 */
import { Shield, ArrowRight, CheckCircle2, Circle, ListChecks, UserCheck } from "lucide-react";
import { ESCALATION_LADDER, REQUIREMENT_LABELS, getRound } from "@/lib/dispute/escalation-ladder";

const RECIPIENT_LABEL: Record<string, string> = {
  cra: "the bureau",
  furnisher: "the furnisher",
  collector: "the collector",
  furnisher_compliance: "the furnisher's compliance function",
  furnisher_executive: "the furnisher's executive office",
  regulator: "a regulator",
  counsel: "counsel",
};

export const RoundEscalationPanel = ({
  round,
  onRoundChange,
}: {
  round: number;
  onRoundChange: (r: number) => void;
}) => {
  const roundDef = getRound(round);

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-border bg-card p-6">
        <div className="flex items-center gap-2">
          <Shield className="h-5 w-5 text-status-info" />
          <h2 className="font-semibold">Round escalation</h2>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          A round is earned by the record, not by counting letters. What escalates is who is written
          to and what is asked for &mdash; never the volume. Your organization&rsquo;s own SOP decides
          which rounds it uses.
        </p>

        <div className="mt-5 flex flex-wrap gap-2">
          {ESCALATION_LADDER.map((def) => {
            const isActive = def.number === round;
            const isPast = def.number < round;
            return (
              <button
                key={def.number}
                onClick={() => onRoundChange(def.number)}
                aria-pressed={isActive}
                title={def.name}
                className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 ${
                  isActive
                    ? "border-emerald-600 bg-emerald-600 text-white"
                    : isPast
                      ? "border-border bg-muted/40 text-foreground hover:bg-muted/60"
                      : "border-border bg-card text-muted-foreground hover:bg-muted/30 hover:text-foreground"
                }`}
              >
                {isPast ? (
                  <CheckCircle2 className="h-3.5 w-3.5" />
                ) : (
                  <Circle className={`h-3.5 w-3.5 ${isActive ? "fill-white/30" : ""}`} />
                )}
                Round {def.number}
              </button>
            );
          })}
        </div>

        {roundDef ? (
          <>
            <div className="mt-5 rounded-xl border border-border bg-muted/30 p-4">
              <p className="text-sm font-semibold text-foreground">{roundDef.name}</p>
              <p className="mt-1 text-xs text-muted-foreground">{roundDef.focus}</p>

              <p className="mt-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Addressed to
              </p>
              <p className="text-xs text-foreground">
                {roundDef.recipients.map((r) => RECIPIENT_LABEL[r] ?? r).join(", ")}
              </p>

              <p className="mt-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                What this round asks for
              </p>
              <div className="mt-1 space-y-1.5">
                {roundDef.asksFor.map((ask) => (
                  <p key={ask} className="flex items-start gap-2 text-xs text-foreground">
                    <ArrowRight className="mt-0.5 h-3 w-3 shrink-0 text-status-info" />
                    {ask}
                  </p>
                ))}
              </div>

              {roundDef.legalBasis.length > 0 && (
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
              )}
            </div>

            <div className="mt-4 rounded-xl border border-dashed border-border bg-muted/20 p-4">
              <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                <ListChecks className="h-3.5 w-3.5" /> What this round rests on
              </p>
              <ul className="mt-1.5 space-y-1">
                {roundDef.requires.map((req) => (
                  <li key={req} className="text-xs text-muted-foreground">
                    &middot; {REQUIREMENT_LABELS[req]}
                  </li>
                ))}
              </ul>
              {(roundDef.humanReview || roundDef.consumerAuthorisation) && (
                <p className="mt-2 flex items-start gap-1.5 text-[11px] text-foreground">
                  <UserCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-status-warning" />
                  {roundDef.consumerAuthorisation
                    ? "The consumer decides whether to take this step. It is theirs alone to make."
                    : "A person signs this round off before it leaves."}
                </p>
              )}
            </div>
          </>
        ) : (
          <p className="mt-5 rounded-xl border border-dashed border-border bg-muted/20 p-4 text-xs text-muted-foreground">
            Round {round} is not one of the twelve the ladder describes. That does not block the work
            &mdash; record what was sent and to whom.
          </p>
        )}
      </div>
    </div>
  );
};
