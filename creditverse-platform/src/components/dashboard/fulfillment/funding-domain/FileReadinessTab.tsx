/**
 * Readiness — does this file meet the configured requirements?
 *
 * Its own tab rather than a corner of Overview, because readiness is the
 * question the team asks before choosing lenders and it deserves the room.
 *
 * Readiness is NOT an approval and not a prediction. It says the file meets
 * the rules BES configured, which is a statement about our own preparation.
 */
import { assessReadiness, READINESS_LEVEL_LABEL, type ReadinessLevel, type ReadinessResult } from "@/lib/funding/readiness-engine";
import { documentTypeLabel } from "@/lib/funding/document-vocabulary";
import { cn } from "@/lib/utils";

const TONE: Record<ReadinessLevel, string> = {
  ready_for_placement: "border-emerald-500/40 bg-emerald-500/10 text-status-success",
  potential_fit: "border-emerald-500/30 bg-emerald-500/5 text-emerald-800",
  conditional: "border-amber-500/40 bg-amber-500/10 text-amber-800",
  not_currently_ready: "border-red-500/30 bg-red-500/10 text-red-700",
  insufficient_information: "border-border bg-muted text-muted-foreground",
};

const DOT: Record<string, string> = {
  pass: "bg-emerald-500",
  fail: "bg-red-500",
};

export function FileReadinessTab({ readiness }: { readiness: ReadinessResult }) {
  return (
    <div className="space-y-3">
      <div className={cn("rounded-lg border p-3", TONE[readiness.level])}>
        <p className="text-sm font-bold">{READINESS_LEVEL_LABEL[readiness.level]}</p>
        <p className="mt-0.5 text-[11px] opacity-90">
          The file meets the configured requirements to this degree. It is not a lender decision.
        </p>
      </div>
      <ul className="space-y-1.5">
        {readiness.factors.map((f) => (
          <li key={f.key} className="flex items-start gap-2 rounded-lg border border-border bg-background px-3 py-2 text-xs">
            <span className={cn("mt-1 inline-block h-2 w-2 shrink-0 rounded-full", DOT[f.status] ?? "bg-muted-foreground/50")} />
            <span className="text-foreground">
              <span className="font-semibold">{f.label}.</span> {f.reason}
            </span>
          </li>
        ))}
      </ul>
      {readiness.missingDocuments.length > 0 && (
        <p className="text-[11px] text-muted-foreground">
          Still needed: {readiness.missingDocuments.map(documentTypeLabel).join(", ")}.
        </p>
      )}
    </div>
  );
}
