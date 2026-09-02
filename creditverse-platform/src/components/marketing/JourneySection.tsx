import { ChevronRight, Split, TrendingUp } from "lucide-react";
import { JOURNEYS, RESPONSIBLE_NOTE } from "@/lib/bes-journeys";

export const JourneySection = () => (
  <section id="journeys" className="bg-muted/40 py-24">
    <div className="container">
      <div className="mx-auto max-w-2xl text-center">
        <h2 className="text-3xl font-bold tracking-tight md:text-4xl">
          One client doesn't always need one solution.
        </h2>
        <p className="mt-4 text-muted-foreground">
          Credit and funding often intersect. BES lets your business support the
          next step without moving the client into another disconnected system.
        </p>
      </div>

      <div className="mt-16 space-y-6">
        {JOURNEYS.map((j, idx) => (
          <div
            key={j.id}
            className="overflow-hidden rounded-2xl border border-border bg-card p-6 md:p-8"
          >
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-3">
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-gold text-sm font-bold text-charcoal">
                  {idx + 1}
                </span>
                <h3 className="text-lg font-semibold">{j.title}</h3>
              </div>
              <span className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                <TrendingUp className="h-3.5 w-3.5 text-emerald-700" />
                {j.responsible}
              </span>
            </div>
            <p className="mt-3 text-sm text-muted-foreground">{j.summary}</p>

            {/* Linear steps with progress bar */}
            <div className="mt-6 flex flex-wrap items-center gap-2">
              {j.steps.map((s, i) => (
                <div key={i} className="flex items-center gap-2">
                  <span className="rounded-lg border border-border bg-background px-3 py-1.5 text-sm font-medium">
                    {s.label}
                  </span>
                  {i < j.steps.length - 1 && (
                    <ChevronRight className="h-4 w-4 text-amber-500/60" />
                  )}
                </div>
              ))}
            </div>

            {/* Branch */}
            {j.branch && (
              <div className="mt-4 rounded-xl border border-dashed border-amber-400/40 bg-amber-500/5 p-4">
                <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-amber-600">
                  <Split className="h-4 w-4" />
                  {j.branch.label}
                </div>
                <div className="mt-4 grid gap-4 sm:grid-cols-2">
                  {j.branch.paths.map((path) => (
                    <div
                      key={path.name}
                      className="rounded-lg border border-border bg-background p-4"
                    >
                      <p className="text-sm font-semibold">{path.name}</p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {path.steps.map((s, i) => (
                          <span
                            key={i}
                            className="rounded-lg border border-border bg-muted px-2.5 py-1 text-xs font-medium"
                          >
                            {s.label}
                          </span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
                <p className="mt-4 text-xs text-muted-foreground">
                  Credit / Readiness Work → Reassessment → Return to FundingOps
                  → Potential Lender Programs → Submission → Offer → Funding
                </p>
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="mx-auto mt-12 max-w-2xl rounded-xl border border-amber-500/30 bg-amber-500/5 p-5 text-center text-sm text-amber-700">
        {RESPONSIBLE_NOTE}
      </div>
    </div>
  </section>
);
