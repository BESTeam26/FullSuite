/**
 * Credit Reporting Integrity — what the deterministic engine can say about a
 * client's imported reports. Three labels only: Data discrepancy, Potential
 * inaccuracy, Potential legal issue. Never "violation", never a count of
 * violations, never a claim about the furnisher's raw record.
 */
import { useState } from "react";
import { Loader2, Save, ScanSearch } from "lucide-react";
import { SavedFindingsList } from "@/components/clients/SavedFindingsList";
import { useAuth } from "@/lib/auth/auth-context";
import { errorMessage } from "@/lib/data/error-message";
import { saveFindings } from "@/lib/data/report-findings";
import { useReportIntegrityFindings } from "@/lib/data/use-credit-reports";
import { useInvalidateFindings } from "@/lib/data/use-report-findings";
import type { IntegrityFinding } from "@/lib/dispute/reporting-integrity-engine";
import { ROUTE_GUIDANCE, RULES_CATALOGUE_VERSION, type FindingClassification } from "@/lib/dispute/reporting-integrity-rules";
import { cn } from "@/lib/utils";

interface Props { clientId: string }

const LABEL: Record<FindingClassification, string> = {
  observed_difference: "Data discrepancy",
  potential_anomaly: "Potential inaccuracy",
  evidence_supported_inaccuracy: "Potential inaccuracy · evidence attached",
  potential_legal_issue: "Potential legal issue",
};
const TONE: Record<FindingClassification, string> = {
  observed_difference: "border-border bg-muted text-foreground",
  potential_anomaly: "border-amber-500/40 bg-amber-500/10 text-amber-800",
  evidence_supported_inaccuracy: "border-orange-500/40 bg-orange-500/10 text-orange-800",
  potential_legal_issue: "border-red-500/30 bg-red-500/10 text-red-700",
};
const REMEDY_LABEL: Record<IntegrityFinding["remedy"], string> = {
  correct: "Request correction", modify: "Request modification", delete: "Request deletion", block: "Identity-theft block",
  dispute_notation: "Request dispute notation", no_action: "No action", investigate_first: "Establish the fact first",
};
const ORDER: FindingClassification[] = ["potential_legal_issue", "evidence_supported_inaccuracy", "potential_anomaly", "observed_difference"];

export function ReportIntegrityPanel({ clientId }: Props) {
  const { findings, reportCount, isLoading, error, live } = useReportIntegrityFindings(clientId);
  const auth = useAuth();
  const invalidateFindings = useInvalidateFindings();
  const [showDiscrepancies, setShowDiscrepancies] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  if (!live) return null;
  const actorId = auth.user?.id ?? null;
  /* Same pattern as the letter builder on this page: the controls show for a signed-in person and the
     database's credit_client_writable() decides; a refusal is shown, never hidden. */
  const save = async () => {
    if (!actorId) return;
    setSaving(true); setSaveMessage(null);
    try {
      const n = await saveFindings(clientId, findings.filter((f) => f.classification !== "observed_difference"), actorId);
      invalidateFindings(clientId);
      setSaveMessage(n === 0 ? "Nothing new — every finding was already on the record." : `${n} finding${n === 1 ? "" : "s"} saved to the client record.`);
    } catch (e) { setSaveMessage(errorMessage(e, "Could not save the findings.")); } finally { setSaving(false); }
  };

  const review = findings.filter((f) => f.classification !== "observed_difference");
  const discrepancies = findings.filter((f) => f.classification === "observed_difference");
  const sorted = [...review].sort((a, b) => ORDER.indexOf(a.classification) - ORDER.indexOf(b.classification));

  return (
    <section className="rounded-xl border border-border bg-card p-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-2 border-b border-border/50 pb-2">
        <div>
          <h3 className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-foreground">
            <ScanSearch className="h-4 w-4 text-primary" /> Credit Reporting Integrity
          </h3>
          <p className="text-[11px] text-muted-foreground">
            Deterministic checks over {reportCount} imported report{reportCount === 1 ? "" : "s"} · rules {RULES_CATALOGUE_VERSION}. Imports are consumer-facing displays, so nothing here is a statement about the furnisher's own record.
          </p>
        </div>
        {isLoading && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
      </div>

      {error && <p role="alert" className="mt-3 text-xs text-status-danger">Could not evaluate the reports.</p>}
      {!isLoading && !error && reportCount === 0 && <p className="mt-3 text-xs text-muted-foreground">Import a credit report to run the checks.</p>}
      {!isLoading && !error && reportCount > 0 && review.length === 0 && (
        <p className="mt-3 text-xs text-muted-foreground">Nothing to review from the logical checks. {discrepancies.length > 0 && `${discrepancies.length} data discrepanc${discrepancies.length === 1 ? "y" : "ies"} noted below.`}</p>
      )}

      {sorted.length > 0 && (
        <ul className="mt-3 space-y-2">
          {sorted.map((f, i) => <FindingRow key={`${f.ruleId}-${f.accountRef}-${i}`} f={f} />)}
        </ul>
      )}
      {sorted.length > 0 && actorId && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button type="button" disabled={saving} onClick={() => void save()} className="inline-flex items-center gap-1 rounded-lg border border-primary/40 px-3 py-1.5 text-xs font-bold text-primary hover:bg-primary/10 disabled:opacity-60">
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />} Save findings to the client record
          </button>
          <span className="text-[11px] text-muted-foreground">Saving records that a person saw these; each then needs a decision. Findings already on the record are left as they are.</span>
          {saveMessage && <p role="status" className="text-[11px] text-foreground">{saveMessage}</p>}
        </div>
      )}
      <SavedFindingsList clientId={clientId} canReview={!!actorId} actorId={actorId} />

      {discrepancies.length > 0 && (
        <div className="mt-3">
          <button type="button" onClick={() => setShowDiscrepancies((v) => !v)} className="text-[11px] font-semibold text-primary hover:underline">
            {showDiscrepancies ? "Hide" : "Show"} {discrepancies.length} data discrepanc{discrepancies.length === 1 ? "y" : "ies"} (differences to understand, not inaccuracies)
          </button>
          {showDiscrepancies && <ul className="mt-2 space-y-2">{discrepancies.map((f, i) => <FindingRow key={`${f.ruleId}-${f.accountRef}-${i}`} f={f} />)}</ul>}
        </div>
      )}

      <p className="mt-3 text-[10px] text-muted-foreground">
        A difference is not yet an inaccuracy. An inaccuracy is not automatically a Metro 2 violation. A Metro 2 deviation is not automatically an FCRA violation. Findings become disputes only after the fact is established with evidence and the consumer attests to it.
      </p>
    </section>
  );
}

function FindingRow({ f }: { f: IntegrityFinding }) {
  const route = ROUTE_GUIDANCE[f.route];
  return (
    <li className="rounded-lg border border-border bg-background p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs font-bold text-foreground">{f.itemName}</p>
          <p className="mt-0.5 text-xs text-foreground">{f.observation}</p>
          <p className="mt-1 text-[10px] text-muted-foreground">
            Rule {f.ruleId} v{f.ruleVersion} · fields: {f.fields.join(", ")} · next: <span className="font-semibold">{REMEDY_LABEL[f.remedy]}</span>
            {f.route !== "none" && ` · route: ${route.party}`}
            {f.humanReviewRequired && " · human review required"}
          </p>
        </div>
        <span className={cn("inline-flex shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-bold", TONE[f.classification])}>{LABEL[f.classification]}</span>
      </div>
    </li>
  );
}
