/**
 * End of Day — auto-derived production totals plus the employee's shift context.
 *
 * The totals on this screen are never entered and never stored: they are
 * derived from non-voided production logs every time the page renders
 * (engine rules 1 and 2). There is deliberately no input that could change a
 * number here — the only way to move a total is to complete work.
 *
 * Extracted from HqPages when it was wired to real data, for the same reason
 * as My Time: that file already carried six unrelated pages (rule 13).
 */
import { useEffect, useState } from "react";
import { Timer, AlertTriangle, CheckCircle2 } from "lucide-react";
import { ContentCard } from "@/components/dashboard/DivisionLayout";
import { DataSourceBadge } from "@/components/dashboard/DataSourceBadge";
import { HqPageShell } from "@/pages/app/HqPages";
import { useAuth } from "@/lib/auth/auth-context";
import { useEod } from "@/lib/data/use-time";
import { isEodMissing } from "@/lib/eod-production-engine";
import { divisionLabel } from "@/lib/time-domain";

const DIVISION_ORDER = [
  "creditops",
  "fundingops",
  "bes-crm",
  "talentops",
] as const;

interface ContextFields {
  unfinishedWork: string;
  blockers: string;
  additionalNotes: string;
  nextWorkdayPriority: string;
}

const EMPTY: ContextFields = {
  unfinishedWork: "",
  blockers: "",
  additionalNotes: "",
  nextWorkdayPriority: "",
};

export const EodPage = () => {
  const { displayName } = useAuth();
  const eod = useEod();
  const [fields, setFields] = useState<ContextFields>(EMPTY);
  const [loadedFor, setLoadedFor] = useState<string | null>(null);

  // Seed the form from the saved EOD once it arrives, but never overwrite what
  // the user has since typed — hence keying on the record rather than syncing
  // on every render.
  const recordKey = eod.context?.id ?? null;
  useEffect(() => {
    if (recordKey === loadedFor) return;
    setFields({
      unfinishedWork: eod.context?.unfinishedWork ?? "",
      blockers: eod.context?.blockers ?? "",
      additionalNotes: eod.context?.additionalNotes ?? "",
      nextWorkdayPriority: eod.context?.nextWorkdayPriority ?? "",
    });
    setLoadedFor(recordKey);
  }, [recordKey, loadedFor, eod.context]);

  const set = (k: keyof ContextFields) => (v: string) =>
    setFields((f) => ({ ...f, [k]: v }));

  const state = eod.context?.state;
  const filed =
    state === "submitted" || state === "reviewed" || state === "approved";
  const missing = isEodMissing(
    eod.context
      ? {
          ...eod.context,
          totalUnits: 0,
          unitsByDivision: {} as never,
          unitsByType: {},
          logCount: 0,
        }
      : null,
  );

  const field = (
    label: string,
    key: keyof ContextFields,
    placeholder: string,
  ) => (
    <ContentCard title={label}>
      <textarea
        value={fields[key]}
        onChange={(e) => set(key)(e.target.value)}
        placeholder={placeholder}
        rows={3}
        aria-label={label}
        className="w-full rounded-xl border border-border bg-card p-3 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
      />
    </ContentCard>
  );

  return (
    <HqPageShell
      title="End of Day (EOD) Report"
      description="Production totals are auto-derived from non-voided production logs. Submit shift context & blockers."
      icon={Timer}
    >
      <div className="mb-4 flex items-center gap-2">
        <DataSourceBadge source={eod.source} />
        {eod.source === "demo" && (
          <span className="text-xs text-muted-foreground">
            Sample totals — sign in to see your own production.
          </span>
        )}
      </div>

      {eod.error && (
        <div className="mb-4 flex items-center gap-2 rounded-xl border border-red-500/30 bg-red-500/10 px-3.5 py-2 text-xs font-semibold text-red-700">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          {eod.error}
        </div>
      )}

      {/* Auto-derived totals. No control on this panel can alter a figure. */}
      <div className="mb-6 rounded-2xl border border-primary/20 bg-primary/5 p-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold uppercase tracking-wider text-primary">
                Auto-Derived Production Totals
              </span>
              <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
                Live Aggregation
              </span>
            </div>
            <h3 className="mt-1 text-2xl font-extrabold text-foreground">
              {eod.totals.totalUnits} Total Units Completed
            </h3>
            <p className="text-xs text-muted-foreground">
              Work date: {eod.workDate} • Employee: {displayName} • Logs:{" "}
              {eod.totals.activeLogs.length}
            </p>
          </div>
          {missing && !filed && (
            <div className="flex items-center gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3.5 py-2 text-xs font-semibold text-amber-700">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              EOD Submission Pending Grace Period
            </div>
          )}
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {DIVISION_ORDER.map((d) => (
            <div
              key={d}
              className="rounded-xl border border-border bg-card p-3"
            >
              <p className="text-[11px] font-medium text-muted-foreground">
                {divisionLabel(d)}
              </p>
              <p className="text-lg font-bold text-foreground">
                {eod.totals.unitsByDivision[d]} units
              </p>
            </div>
          ))}
        </div>
      </div>

      {filed ? (
        <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-6 text-center">
          <CheckCircle2 className="mx-auto mb-2 h-12 w-12 text-emerald-600" />
          <h3 className="text-lg font-bold text-foreground">
            EOD Report Submitted
          </h3>
          <p className="mx-auto mt-1 max-w-md text-xs text-muted-foreground">
            Your production totals ({eod.totals.totalUnits} units) and shift
            context are on the Agency EOD ledger.
          </p>
          <button
            onClick={() => eod.save({ ...fields, state: "draft" })}
            disabled={eod.isSaving}
            className="mt-4 rounded-xl border border-border bg-card px-4 py-2 text-xs font-semibold text-foreground hover:bg-muted disabled:opacity-50"
          >
            Reopen for editing
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            {field(
              "Unfinished Work",
              "unfinishedWork",
              "Describe items carried over to tomorrow…",
            )}
            {field(
              "Blockers & Escalations",
              "blockers",
              "Any technical or partner blockers encountered…",
            )}
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            {field(
              "Next Workday Priority",
              "nextWorkdayPriority",
              "Primary focus for your next shift…",
            )}
            {field(
              "Additional Notes",
              "additionalNotes",
              "Any shift context or client call notes…",
            )}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
            <p className="text-xs text-muted-foreground">
              Production totals are non-editable to prevent manual entry errors.
            </p>
            <div className="flex items-center gap-2">
              {eod.saveError && (
                <span className="text-xs font-semibold text-red-600">
                  {eod.saveError}
                </span>
              )}
              <button
                onClick={() => eod.save(fields)}
                disabled={!eod.canSave || eod.isSaving}
                className="rounded-xl border border-border bg-card px-4 py-2.5 text-xs font-semibold text-foreground hover:bg-muted disabled:opacity-50"
              >
                Save draft
              </button>
              <button
                onClick={() => eod.save({ ...fields, state: "submitted" })}
                disabled={!eod.canSave || eod.isSaving}
                className="rounded-xl bg-primary px-6 py-2.5 text-xs font-bold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
                title={
                  eod.canSave ? undefined : "Sign in to submit an EOD report."
                }
              >
                Submit EOD Report
              </button>
            </div>
          </div>
        </div>
      )}

      {eod.logs.length > 0 && (
        <ContentCard title="Production logs behind these totals">
          <div className="space-y-1.5">
            {eod.logs.map((l) => (
              <div
                key={l.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-muted/20 px-3 py-2 text-xs"
              >
                <span className="font-semibold text-foreground">
                  {l.productionUnitQuantity} × {l.productionUnitType}
                </span>
                <span className="text-muted-foreground">
                  {divisionLabel(l.divisionId)}
                  {l.partnerName ? ` · ${l.partnerName}` : ""}
                </span>
                {l.isVoided && (
                  <span className="rounded bg-red-500/10 px-1.5 py-0.5 text-[10px] font-bold text-red-600">
                    VOIDED — excluded from totals
                  </span>
                )}
              </div>
            ))}
          </div>
        </ContentCard>
      )}
    </HqPageShell>
  );
};
