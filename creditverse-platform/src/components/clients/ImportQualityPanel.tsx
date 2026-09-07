/**
 * Import quality — Complete, Partial, or Review required.
 *
 * ── A DATA-INTEGRITY GUARDRAIL, NOT AN OPERATOR GATE ───────────────────────
 *
 * If the source says 30 accounts and BES parsed 24, this panel says so, names
 * the shortfall, and gets out of the way. The 24 that parsed are workable. The
 * 6 that did not are NOT deleted, absent, or non-reporting — and this panel
 * says that in words, because the confusion it prevents is the expensive one:
 * six unparsed accounts look exactly like six accounts the consumer does not
 * have.
 *
 * What a partial snapshot does stop is completeness-dependent analysis — an
 * item "no longer observed", a bureau "not reporting". Nothing else.
 */
import { CheckCircle2, AlertTriangle, HelpCircle, Info } from "lucide-react";
import type { Bureau } from "@/lib/credit-classification";
import {
  COMPLETENESS_LABEL,
  QUALITY_LABEL,
  buildQualityReport,
  type CompletenessFact,
  type ImportQuality,
  type ReconciliationCheck,
} from "@/lib/credit-report/completeness";

const BUREAU_LABEL: Record<Bureau, string> = { EQ: "Equifax", EX: "Experian", TU: "TransUnion" };

const NOUN: Record<string, string> = {
  accounts: "accounts",
  derogatory: "derogatory accounts",
  public_records: "public records",
  inquiries: "inquiries",
  scores: "score",
};

const label = (c: ReconciliationCheck) => {
  const what = c.checkKey.startsWith("section:")
    ? `${c.checkKey.slice(8).replace(/_/g, " ")} section`
    : NOUN[c.checkKey] ?? c.checkKey;
  return c.bureau ? `${BUREAU_LABEL[c.bureau]} ${what}` : what.replace(/^./, (m) => m.toUpperCase());
};

const TONE: Record<ImportQuality, { box: string; chip: string; Icon: typeof CheckCircle2 }> = {
  complete: {
    box: "border-emerald-600/30 bg-emerald-500/5",
    chip: "bg-emerald-600 text-white",
    Icon: CheckCircle2,
  },
  partial: {
    box: "border-amber-600/40 bg-amber-500/5",
    chip: "bg-amber-600 text-white",
    Icon: AlertTriangle,
  },
  review_required: {
    box: "border-red-600/40 bg-red-500/5",
    chip: "bg-red-600 text-white",
    Icon: AlertTriangle,
  },
};

export function ImportQualityPanel({
  quality,
  checks,
  facts = [],
  acceptance = null,
}: {
  /** From the database where the report is saved; computed for a preview. */
  quality: ImportQuality | null;
  checks: ReconciliationCheck[];
  facts?: CompletenessFact[];
  acceptance?: { reason: string; acceptedAt: string } | null;
}) {
  const report = buildQualityReport(checks);
  /* The DATABASE's verdict wins where there is one. The computed value exists
     only so a preview can show something before anything is written. */
  const verdict = quality ?? report.quality;

  if (verdict === null) {
    return (
      <div className="rounded-xl border border-border bg-muted/30 p-4">
        <p className="flex items-center gap-1.5 text-sm font-bold text-foreground">
          <HelpCircle className="h-4 w-4 text-muted-foreground" /> Import quality: not determined
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          This source states no counts of its own, so the parse could not be checked against it.
          That is not a fault in the report &mdash; it means completeness is <strong>unknown</strong>,
          which is different from complete.
        </p>
      </div>
    );
  }

  const tone = TONE[verdict];
  const notExposed = facts.filter((f) => f.state === "not_exposed_by_provider");
  const otherFacts = facts.filter((f) => f.state !== "not_exposed_by_provider" && f.state !== "present");

  return (
    <div className={`space-y-3 rounded-xl border p-4 ${tone.box}`}>
      <div className="flex flex-wrap items-center gap-2">
        <tone.Icon className="h-4 w-4 text-foreground" />
        <h3 className="text-sm font-bold text-foreground">Import quality</h3>
        <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${tone.chip}`}>
          {QUALITY_LABEL[verdict]}
        </span>
      </div>
      <p className="text-xs text-foreground">{report.summary}</p>

      {verdict !== "complete" && (
        <p className="rounded-lg border border-dashed border-border bg-card p-2.5 text-xs text-foreground">
          The items that did parse are workable. <strong>Nothing missing is treated as deleted, absent,
          or no longer reported</strong> &mdash; it is simply not read yet. Reparse, correct the source,
          or record a reason for working this snapshot as it stands.
        </p>
      )}

      <div className="overflow-x-auto rounded-lg border border-border bg-card">
        <table className="w-full min-w-[26rem] text-xs">
          <thead className="bg-muted/60 text-[10px] uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="px-2 py-1.5 text-left font-semibold">Check</th>
              <th className="px-2 py-1.5 text-right font-semibold">Source expected</th>
              <th className="px-2 py-1.5 text-right font-semibold">Parsed</th>
              <th className="px-2 py-1.5 text-right font-semibold">Difference</th>
              <th className="px-2 py-1.5 text-left font-semibold">Reason</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {checks.map((c) => {
              const diff = c.stated === undefined ? undefined : c.stated - c.parsed;
              return (
                <tr key={`${c.bureau ?? "report"}-${c.checkKey}`} className={c.ok ? undefined : "bg-amber-500/5"}>
                  <td className="px-2 py-1.5 text-foreground">{label(c)}</td>
                  <td className="px-2 py-1.5 text-right text-foreground">
                    {c.stated ?? <span className="text-muted-foreground">not stated</span>}
                  </td>
                  <td className="px-2 py-1.5 text-right text-foreground">{c.parsed}</td>
                  <td className="px-2 py-1.5 text-right font-semibold text-foreground">
                    {diff === undefined ? <span className="font-normal text-muted-foreground">&mdash;</span> : diff === 0 ? "0" : diff > 0 ? `−${diff}` : `+${-diff}`}
                  </td>
                  <td className="px-2 py-1.5 text-muted-foreground">
                    {c.ok ? <span aria-label="reconciled">✓</span> : c.reason ?? "The counts do not agree."}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {notExposed.length > 0 && (
        <div className="rounded-lg border border-border bg-card p-2.5">
          <p className="flex items-center gap-1.5 text-[11px] font-semibold text-foreground">
            <Info className="h-3.5 w-3.5 text-muted-foreground" /> Not exposed by this source
          </p>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            These fields do not exist in this provider&rsquo;s format. That says <strong>nothing</strong> about
            whether a bureau reports them.
          </p>
          <p className="mt-1 font-mono text-[11px] text-foreground">
            {notExposed.map((f) => f.fieldKey).join(" · ")}
          </p>
        </div>
      )}

      {otherFacts.length > 0 && (
        <div className="rounded-lg border border-border bg-card p-2.5">
          <p className="text-[11px] font-semibold text-foreground">Also recorded</p>
          <ul className="mt-1 space-y-0.5">
            {otherFacts.map((f) => (
              <li key={`${f.bureau ?? ""}-${f.fieldKey}`} className="text-[11px] text-muted-foreground">
                <span className="font-mono text-foreground">{f.fieldKey}</span>
                {f.bureau && <> ({BUREAU_LABEL[f.bureau]})</>} &mdash; {COMPLETENESS_LABEL[f.state]}
                {f.reason && <>: {f.reason}</>}
              </li>
            ))}
          </ul>
        </div>
      )}

      {acceptance && (
        <div className="rounded-lg border border-border bg-card p-2.5">
          <p className="text-[11px] font-semibold text-foreground">Working this snapshot as it stands</p>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            Recorded {acceptance.acceptedAt.slice(0, 10)}: &ldquo;{acceptance.reason}&rdquo;
          </p>
          <p className="mt-1 text-[11px] text-muted-foreground">
            This records a decision. It does not change what is missing, and analysis that needs a
            complete snapshot stays off.
          </p>
        </div>
      )}
    </div>
  );
}
