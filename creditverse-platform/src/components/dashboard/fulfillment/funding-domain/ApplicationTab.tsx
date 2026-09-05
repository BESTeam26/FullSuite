/** Screening data for the file. Saving creates a new version; earlier versions stay as history. */
import { useEffect, useState } from "react";
import { formatDateTime } from "@/lib/format-date";
import { Loader2, Save } from "lucide-react";
import { errorMessage } from "@/lib/data/error-message";
import { saveApplication, type ApplicationDraft, type FundingApplication } from "@/lib/data/funding-domain";
import { useInvalidateFundingFile } from "@/lib/data/use-funding-domain";

interface Props {
  fileId: string;
  application: FundingApplication | null;
  canEdit: boolean;
  actorId: string | null;
}

const empty: ApplicationDraft = {
  requestedAmount: null, purpose: null, useOfFunds: null, productFamily: null, state: null, entityType: null,
  timeInBusinessMonths: null, monthlyRevenue: null, annualRevenue: null, creditScoreStated: null, existingDebtMonthly: null, scenario: {},
};

const toDraft = (a: FundingApplication | null): ApplicationDraft => (a ? { ...empty, ...a } : empty);
const numOrNull = (v: string): number | null => (v.trim() === "" ? null : Number(v));
const strOrNull = (v: string): string | null => (v.trim() === "" ? null : v.trim());

export function ApplicationTab({ fileId, application, canEdit, actorId }: Props) {
  const [draft, setDraft] = useState<ApplicationDraft>(toDraft(application));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const invalidate = useInvalidateFundingFile();
  useEffect(() => setDraft(toDraft(application)), [application]);

  const save = async () => {
    if (!actorId) return;
    setBusy(true); setError(null);
    try { await saveApplication(fileId, draft, application?.version ?? 0, actorId); invalidate(fileId); }
    catch (e) { setError(errorMessage(e, "Could not save the application.")); }
    finally { setBusy(false); }
  };

  const field = (label: string, key: keyof ApplicationDraft, kind: "number" | "text", placeholder?: string) => (
    <label className="block">
      <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{label}</span>
      <input
        type={kind === "number" ? "number" : "text"}
        inputMode={kind === "number" ? "decimal" : undefined}
        value={draft[key] === null || draft[key] === undefined ? "" : String(draft[key])}
        onChange={(e) => setDraft((x) => ({ ...x, [key]: kind === "number" ? numOrNull(e.target.value) : strOrNull(e.target.value) }))}
        disabled={!canEdit || busy}
        placeholder={placeholder}
        className="mt-1 w-full rounded-lg border border-border bg-background px-2.5 py-1.5 text-xs text-foreground disabled:cursor-not-allowed disabled:bg-muted/40 disabled:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
      />
    </label>
  );

  return (
    <div className="space-y-3">
      <p className="text-[11px] text-muted-foreground">
        {application ? `Version ${application.version} · recorded ${formatDateTime(application.createdAt)} via ${application.source}.` : "No application recorded yet."}
        {" "}Saving creates a new version; nothing is overwritten.
      </p>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {field("Requested amount ($)", "requestedAmount", "number")}
        {field("Purpose", "purpose", "text", "Working capital")}
        {field("Use of funds", "useOfFunds", "text")}
        {field("Product family", "productFamily", "text", "business_funding · mca · sba")}
        {field("State (2 letters)", "state", "text", "TX")}
        {field("Entity type", "entityType", "text", "LLC")}
        {field("Time in business (months)", "timeInBusinessMonths", "number")}
        {field("Monthly revenue ($)", "monthlyRevenue", "number")}
        {field("Annual revenue ($)", "annualRevenue", "number")}
        {field("Credit score (stated)", "creditScoreStated", "number")}
        {field("Existing debt payments / month ($)", "existingDebtMonthly", "number")}
      </div>
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => void save()}
          disabled={!canEdit || busy || !actorId}
          className="inline-flex items-center gap-1 rounded-lg bg-primary px-3 py-1.5 text-xs font-bold text-primary-foreground hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />} Save as version {(application?.version ?? 0) + 1}
        </button>
        {error && <p role="alert" className="text-xs text-status-danger">{error}</p>}
      </div>
    </div>
  );
}
