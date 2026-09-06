/**
 * DIY inside the client portal — the same person, the same login, one more
 * thing they can do.
 *
 * Not a separate app and not a separate identity. It renders inside the portal
 * shell built for C3, reads the journey off the canonical client, and shows
 * exactly one thing: where they are and the single next step. A consumer
 * doing their own credit repair at 11pm should never have to work out what to
 * do next.
 *
 * Every gate refusal is shown in their words, taken from the same state
 * machine the database enforces — so the reason a button is disabled is the
 * reason the server would give.
 */
import { CheckCircle2, Circle, Loader2, ShieldQuestion } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DIY_JOURNEY, canAdvance, nextAction, progress, stageIndex, type JourneyState } from "@/lib/diy/journey";
import { useAdvanceDiy, useDiyConsents, useDiyJourney } from "@/lib/data/use-diy";
import { cn } from "@/lib/utils";

export function DiySection({ clientId }: { clientId: string }) {
  const journey = useDiyJourney(clientId);
  const consents = useDiyConsents(clientId);
  const advance = useAdvanceDiy(clientId);

  if (journey.isLoading || consents.isLoading) {
    return (
      <p className="inline-flex items-center gap-2 text-sm text-muted-foreground" aria-busy="true">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading…
      </p>
    );
  }
  if (!journey.data) return null;

  const state: JourneyState = {
    stage: journey.data.stage,
    roundNumber: journey.data.roundNumber,
    /* Either a consent row, OR a journey already past enrolment — because the
       database refuses to move past `enrolled` without one, so the stage is
       itself proof. Reading only the consents query would tell somebody who
       consented last week to consent again the moment that query was slow. */
    hasConsent:
      (consents.data ?? []).some((c) => c.kind === "service_terms")
      || stageIndex(journey.data.stage) >= stageIndex("consented"),
    /* Attestation lives with the letters, which this milestone does not build.
       Until it does, the gate holds closed — which is the safe direction. */
    hasAttestation: stageIndex(journey.data.stage) >= stageIndex("attested"),
    unreviewedExtraction: false,
    identityTheftPathway: journey.data.identityTheftPathway,
  };

  const p = progress(state.stage);
  const next = nextAction(state);
  const move = canAdvance(state, next.stage);
  const current = stageIndex(state.stage);

  return (
    <section className="rounded-xl border border-border bg-card p-4 shadow-sm">
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h2 className="text-sm font-bold text-foreground">Doing it yourself</h2>
        <span className="text-xs text-muted-foreground">Round {state.roundNumber}</span>
      </div>

      <div className="mb-1 h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden>
        <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${p.percent}%` }} />
      </div>
      <p className="mb-4 text-xs text-muted-foreground">Step {p.done} of {p.total}</p>

      {/* The one thing to do now, before the full list. */}
      <div className="mb-4 rounded-lg border border-primary/40 bg-primary/5 p-3">
        <p className="text-sm font-bold text-foreground">{next.title}</p>
        <p className="mt-0.5 text-sm text-muted-foreground">{next.detail}</p>
        {move.allowed ? (
          <Button
            size="sm" className="mt-3"
            disabled={advance.isPending}
            onClick={() => advance.mutate(next.stage)}
          >
            {advance.isPending && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}
            {next.action}
          </Button>
        ) : (
          <p role="status" className="mt-2 text-xs font-semibold text-amber-700">{move.because}</p>
        )}
        {advance.isError && (
          <p role="alert" className="mt-2 text-xs text-status-danger">
            {(advance.error as Error).message}
          </p>
        )}
      </div>

      <ol className="space-y-1.5">
        {DIY_JOURNEY.map((s, i) => {
          const done = i < current;
          const here = i === current;
          return (
            <li
              key={s.stage}
              aria-current={here ? "step" : undefined}
              className={cn(
                "flex items-start gap-2.5 rounded-lg px-2 py-1.5",
                here && "bg-muted/60",
              )}
            >
              {done
                ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                : <Circle className={cn("mt-0.5 h-4 w-4 shrink-0", here ? "text-primary" : "text-muted-foreground/50")} />}
              <span className="min-w-0">
                <span className={cn(
                  "block text-sm",
                  done ? "text-muted-foreground line-through decoration-emerald-600/50"
                       : here ? "font-bold text-foreground" : "text-muted-foreground",
                )}>
                  {s.title}
                </span>
                {here && <span className="block text-xs text-muted-foreground">{s.detail}</span>}
              </span>
            </li>
          );
        })}
      </ol>

      {/* Identity theft is reached deliberately, never by drifting into it. */}
      <div className="mt-4 flex items-start gap-2 rounded-lg border border-border p-3">
        <ShieldQuestion className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
        <p className="text-xs text-muted-foreground">
          If something on your report was opened by someone else, that is a different route with stronger rights.
          It starts with an Identity Theft Report from IdentityTheft.gov. Do not use it for an account that is yours
          and simply reported wrong.
        </p>
      </div>
    </section>
  );
}
