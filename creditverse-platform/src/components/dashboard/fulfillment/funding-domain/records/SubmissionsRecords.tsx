/** Every submission the caller may see: lender, program, policy version judged against, Program Fit then, outcome now. */
import { formatDate } from "@/lib/format-date";
import { formatMoney } from "@/lib/format-money";
import { useSubmissionRecords } from "@/lib/data/use-funding-records";
import { DECISION_LABELS } from "@/lib/funding/document-vocabulary";
import { PROGRAM_FIT_LABEL } from "@/lib/funding/readiness-engine";
import { matchesQuery } from "./record-search";
import { FileCell, Pill, RecordTable } from "./RecordTable";

const STATUS_TONE: Record<string, "ok" | "warn" | "bad" | "info" | "neutral"> = { Submitted: "info", "Under Review": "info", Approved: "ok", Funded: "ok", Declined: "bad", Withdrawn: "neutral", Stipulations: "warn" };
const DECISION_TONE: Record<string, "ok" | "warn" | "bad" | "info" | "neutral"> = { approved: "ok", conditional: "warn", declined: "bad", pending: "info", withdrawn: "neutral", expired: "neutral" };
const REASON_LABEL: Record<string, string> = { credit: "Credit", revenue: "Revenue", time_in_business: "Time in business", industry: "Industry", documentation: "Documentation", bank_activity: "Bank activity", existing_debt: "Existing debt", other: "Other", not_given: "Not given" };

export function SubmissionsRecords({ open, query }: { open: boolean; query: string }) {
  const q = useSubmissionRecords(open);
  const rows = (q.data ?? []).filter((r) => matchesQuery(query, r.file.clientName, r.file.businessName, r.file.publicId, r.lender, r.program));
  return (
    <RecordTable headers={["Client · business", "Lender · program", "Amount", "Judged against", "Status", "Lender decision", "Submitted"]} loading={q.isLoading} error={q.error} count={rows.length} emptyText="No submissions yet. Submissions are made from a file's Matches & Submissions tab.">
      {rows.map((r) => (
        <tr key={r.id} className="border-t border-border/60 hover:bg-muted/30">
          <FileCell file={r.file} />
          <td className="px-4 py-2 text-foreground">{r.lender}{r.program && <span className="text-muted-foreground"> · {r.program}</span>}</td>
          <td className="px-4 py-2 font-bold text-foreground">{formatMoney(r.amount)}</td>
          <td className="px-4 py-2 text-foreground">
            {r.policyVersion !== null ? `Policy v${r.policyVersion}` : <span className="text-muted-foreground">Not recorded</span>}
            {r.fitOutcome && <p className="text-[11px] text-muted-foreground">{PROGRAM_FIT_LABEL[r.fitOutcome] ?? r.fitOutcome} at submission</p>}
          </td>
          <td className="px-4 py-2"><Pill tone={STATUS_TONE[r.status] ?? "neutral"}>{r.status}</Pill></td>
          <td className="px-4 py-2">
            {r.latestDecision ? (
              <>
                <Pill tone={DECISION_TONE[r.latestDecision.decision] ?? "neutral"}>{DECISION_LABELS[r.latestDecision.decision] ?? r.latestDecision.decision}</Pill>
                <p className="mt-0.5 text-[11px] text-muted-foreground">{formatDate(r.latestDecision.decidedAt)}{r.latestDecision.reasonCategory ? ` · ${REASON_LABEL[r.latestDecision.reasonCategory] ?? r.latestDecision.reasonCategory}` : ""}</p>
              </>
            ) : <span className="text-muted-foreground">Awaiting</span>}
          </td>
          <td className="px-4 py-2 text-muted-foreground">{r.submittedAt ? formatDate(r.submittedAt) : "—"}</td>
        </tr>
      ))}
    </RecordTable>
  );
}
