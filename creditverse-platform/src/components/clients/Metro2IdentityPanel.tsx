/**
 * Metro 2 Section A — identity defects on this client's report.
 *
 * Three answers, kept apart on purpose:
 *
 *   CONFIRMED   the report itself establishes it. A letter may assert it.
 *   APPARENT    it looks present but one fact would settle it. A letter may
 *               ASK, never assert.
 *   UNKNOWN     it could not be judged, and what was missing.
 *
 * The third is shown rather than hidden, because "nothing was reported" and
 * "nothing is wrong" are different answers and collapsing them is how a
 * missing field becomes a clean bill of health.
 */
import { useMemo } from "react";
import { ShieldCheck, CircleHelp, AlertTriangle, CheckCircle2, Lock } from "lucide-react";
import type { RawReportItem } from "@/lib/credit-classification";
import { buildIdentityInput, type VerifiedIdentity } from "@/lib/dispute/metro2/identity-input";
import { runSection, type Metro2Finding } from "@/lib/dispute/metro2/run-section";
import { SECTION_A_RULES } from "@/lib/dispute/metro2/section-a-identity";

const Group = ({
  title,
  tone,
  icon: Icon,
  blurb,
  findings,
  show,
}: {
  title: string;
  tone: string;
  icon: typeof ShieldCheck;
  blurb: string;
  findings: Metro2Finding[];
  show: "assertion" | "question" | "missing" | "none";
}) => {
  if (findings.length === 0) return null;
  return (
    <div className={`rounded-lg border p-3 ${tone}`}>
      <h4 className="flex items-center gap-1.5 text-xs font-bold">
        <Icon className="h-3.5 w-3.5" /> {title} ({findings.length})
      </h4>
      <p className="mt-0.5 text-[11px] opacity-90">{blurb}</p>
      <ul className="mt-2 space-y-2">
        {findings.map((f) => (
          <li key={f.ruleId} className="rounded border border-border/60 bg-card p-2">
            <p className="text-xs font-semibold text-foreground">
              <span className="font-mono text-[10px] text-muted-foreground">{f.provenance.catalogue}</span> {f.title}
            </p>
            <p className="mt-0.5 text-[11px] text-foreground">{f.observation}</p>
            {show === "assertion" && (
              <p className="mt-1 text-[11px] text-muted-foreground">
                <span className="font-semibold">May assert:</span> “{f.claim.assertion}” — to the{" "}
                {f.claim.recipient === "either" ? "bureau or the furnisher" : f.claim.recipient}
                {f.claim.citations.length > 0 && ` · ${f.claim.citations.join(", ")}`}
              </p>
            )}
            {show === "question" && (
              <p className="mt-1 text-[11px] text-muted-foreground">
                <span className="font-semibold">May ask:</span> “{f.claim.question}”
                {f.needs && <> · settled by: {f.needs}</>}
              </p>
            )}
            {show === "missing" && f.missing && f.missing.length > 0 && (
              <p className="mt-1 text-[11px] text-muted-foreground">Missing: {f.missing.join(", ")}</p>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
};

export function Metro2IdentityPanel({
  reportItems,
  verified,
}: {
  reportItems: RawReportItem[];
  verified: VerifiedIdentity;
}) {
  const { result, deliberatelyAbsent } = useMemo(() => {
    const built = buildIdentityInput(reportItems, verified);
    return { result: runSection(SECTION_A_RULES, built.input), deliberatelyAbsent: built.deliberatelyAbsent };
  }, [reportItems, verified]);

  const nothingToShow =
    result.confirmed.length === 0 && result.apparent.length === 0 && result.unknown.length === 0;

  return (
    <div className="space-y-3 rounded-2xl border border-border bg-card p-4">
      <div>
        <h3 className="flex items-center gap-2 text-sm font-bold text-foreground">
          <ShieldCheck className="h-4 w-4 text-primary" /> Identity reporting (Metro 2 Section A)
        </h3>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Compares what the bureau prints against what this client's own record says. Metro 2 is a
          reporting FORMAT, not a law — a defect here is an inaccuracy to dispute, not a violation to
          allege.
        </p>
      </div>

      {nothingToShow ? (
        <p className="text-xs text-muted-foreground">
          No personal information on the imported report to compare. Import a report that includes the
          personal information section.
        </p>
      ) : (
        <>
          <Group
            title="Confirmed"
            tone="border-red-500/30 bg-red-500/5"
            icon={AlertTriangle}
            blurb="The report establishes these. A letter may state them as fact."
            findings={result.confirmed}
            show="assertion"
          />
          <Group
            title="Apparent — ask, do not assert"
            tone="border-amber-500/40 bg-amber-500/5"
            icon={CircleHelp}
            blurb="One more fact would settle each of these. Until then they are questions."
            findings={result.apparent}
            show="question"
          />
          <Group
            title="Could not be judged"
            tone="border-border bg-muted/40"
            icon={CircleHelp}
            blurb="Not a clean result — the facts needed were not reported. None of these may become a claim."
            findings={result.unknown}
            show="missing"
          />
          <Group
            title="Checked and correct"
            tone="border-emerald-600/30 bg-emerald-500/5"
            icon={CheckCircle2}
            blurb="Considered and ruled out, so nobody disputes correct reporting."
            findings={result.notAnError}
            show="none"
          />
        </>
      )}

      <div className="rounded-lg border border-dashed border-border p-3">
        <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
          <Lock className="h-3 w-3" /> Deliberately not available
        </p>
        <ul className="mt-1.5 space-y-1">
          {deliberatelyAbsent.map((d) => (
            <li key={d.field} className="text-[11px] text-muted-foreground">
              <span className="font-semibold text-foreground">{d.field}:</span> {d.because}
            </li>
          ))}
        </ul>
      </div>

      <p className="text-[10px] text-muted-foreground">
        Section A of the catalogue is complete. Sections B–P are not built yet, so this covers identity
        only — not balances, dates, statuses or payment history.
      </p>
    </div>
  );
}
