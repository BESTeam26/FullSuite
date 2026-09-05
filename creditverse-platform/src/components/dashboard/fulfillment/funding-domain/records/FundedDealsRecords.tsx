/** The immutable funded record: four amounts kept apart, differences shown, renewal state alongside. */
import { formatDate } from "@/lib/format-date";
import { formatMoney } from "@/lib/format-money";
import { useFundedDealRecords } from "@/lib/data/use-funding-records";
import { RENEWAL_STATUS_LABEL } from "@/lib/funding/document-vocabulary";
import { matchesQuery } from "./record-search";
import { FileCell, Pill, RecordTable } from "./RecordTable";

export function FundedDealsRecords({ open, query }: { open: boolean; query: string }) {
  const q = useFundedDealRecords(open);
  const rows = (q.data ?? []).filter((r) => matchesQuery(query, r.file.clientName, r.file.businessName, r.file.publicId, r.lenderName));
  const totals = rows.reduce((t, r) => ({ gross: t.gross + r.grossFunded, net: t.net + r.netFunded }), { gross: 0, net: 0 });
  return (
    <div className="space-y-2">
      {rows.length > 0 && <p className="text-[11px] text-muted-foreground">{rows.length} funded deal{rows.length === 1 ? "" : "s"} shown · gross {formatMoney(totals.gross)} · net {formatMoney(totals.net)}</p>}
      <RecordTable headers={["Client · business", "Lender", "Requested", "Accepted offer", "Gross funded", "Net funded", "Funded", "Renewal"]} loading={q.isLoading} error={q.error} count={rows.length} emptyText="No funded deals yet. A funded deal is created only by confirming funding on a closing.">
        {rows.map((r) => {
          const accepted = r.acceptedOfferAmount;
          const grossDiff = accepted !== null && Math.abs(accepted - r.grossFunded) >= 0.01;
          const held = r.grossFunded - r.netFunded;
          return (
            <tr key={r.id} className="border-t border-border/60 hover:bg-muted/30">
              <FileCell file={r.file} detail={r.disbursementReference ? `Ref ${r.disbursementReference}` : null} />
              <td className="px-4 py-2 text-foreground">{r.lenderName}</td>
              <td className="px-4 py-2 text-foreground">{formatMoney(r.requestedAmount)}</td>
              <td className="px-4 py-2 text-foreground">{formatMoney(accepted)}</td>
              <td className="px-4 py-2 font-bold text-foreground">{formatMoney(r.grossFunded)}{grossDiff && <p className="text-[11px] font-normal text-amber-800">Differs from accepted offer</p>}</td>
              <td className="px-4 py-2 font-bold text-foreground">{formatMoney(r.netFunded)}{held > 0.009 && <p className="text-[11px] font-normal text-muted-foreground">{formatMoney(held)} withheld</p>}</td>
              <td className="px-4 py-2 text-muted-foreground">{formatDate(r.fundedAt)}</td>
              <td className="px-4 py-2">{r.renewal ? <><Pill tone={r.renewal.status === "new_file_created" ? "ok" : r.renewal.status === "monitoring" ? "info" : "neutral"}>{RENEWAL_STATUS_LABEL[r.renewal.status] ?? r.renewal.status}</Pill>{r.renewal.potentialRenewalDate && <p className="mt-0.5 text-[11px] text-muted-foreground">Potential {formatDate(r.renewal.potentialRenewalDate)}</p>}</> : <span className="text-muted-foreground">—</span>}</td>
            </tr>
          );
        })}
      </RecordTable>
    </div>
  );
}
