/** Renewal opportunities: an operational reminder over funded deals, never eligibility; a renewal is a new file with lineage. */
import { Link } from "react-router-dom";
import { formatDate } from "@/lib/format-date";
import { formatMoney } from "@/lib/format-money";
import { useRenewalRecords } from "@/lib/data/use-funding-records";
import { RENEWAL_STATUS_LABEL } from "@/lib/funding/document-vocabulary";
import { matchesQuery } from "./record-search";
import { FileCell, Pill, RecordTable } from "./RecordTable";

export function RenewalsRecords({ open, query }: { open: boolean; query: string }) {
  const q = useRenewalRecords(open);
  const rows = (q.data ?? []).filter((r) => matchesQuery(query, r.file.clientName, r.file.businessName, r.file.publicId, r.lenderName));
  return (
    <RecordTable headers={["Client · business", "Funded with", "Gross funded", "Funded", "Potential renewal", "Next follow-up", "Status"]} loading={q.isLoading} error={q.error} count={rows.length} emptyText="No renewal opportunities yet. One is opened automatically when funding is confirmed.">
      {rows.map((r) => (
        <tr key={r.id} className="border-t border-border/60 hover:bg-muted/30">
          <FileCell file={r.file} />
          <td className="px-4 py-2 text-foreground">{r.lenderName ?? "—"}</td>
          <td className="px-4 py-2 font-bold text-foreground">{formatMoney(r.grossFunded)}</td>
          <td className="px-4 py-2 text-muted-foreground">{r.fundedAt ? formatDate(r.fundedAt) : "—"}</td>
          <td className="px-4 py-2 text-foreground">{r.potentialRenewalDate ? formatDate(r.potentialRenewalDate) : <span className="text-muted-foreground">Not set</span>}</td>
          <td className="px-4 py-2 text-foreground">{r.nextFollowUpAt ? formatDate(r.nextFollowUpAt) : "—"}</td>
          <td className="px-4 py-2">
            <Pill tone={r.status === "new_file_created" ? "ok" : r.status === "monitoring" ? "info" : "neutral"}>{RENEWAL_STATUS_LABEL[r.status] ?? r.status}</Pill>
            {r.newFileId && <p className="mt-0.5 text-[11px]"><Link to={`/app/funding-files/${r.newFileId}`} className="font-semibold text-primary hover:underline">Open renewal file</Link></p>}
          </td>
        </tr>
      ))}
    </RecordTable>
  );
}
