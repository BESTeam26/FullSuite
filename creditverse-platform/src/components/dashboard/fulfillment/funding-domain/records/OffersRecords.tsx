/** Offers across files: the lender's raw terms exactly as given, and what arithmetic can say from them — never an APR the lender did not state. */
import { formatDate } from "@/lib/format-date";
import { formatMoney } from "@/lib/format-money";
import { useOfferRecords } from "@/lib/data/use-funding-records";
import { calculateOffer, formatPricing } from "@/lib/funding/offer-math";
import { matchesQuery } from "./record-search";
import { FileCell, Pill, RecordTable } from "./RecordTable";

const STATUS_LABEL: Record<string, string> = { received: "Received", internal_review: "Internal review", presented: "Presented to client", accepted: "Accepted", declined_by_client: "Client declined", expired: "Expired", withdrawn: "Withdrawn by lender", superseded: "Superseded" };
const STATUS_TONE: Record<string, "ok" | "warn" | "bad" | "info" | "neutral"> = { received: "info", internal_review: "warn", presented: "info", accepted: "ok", declined_by_client: "neutral", expired: "neutral", withdrawn: "bad", superseded: "neutral" };

export function OffersRecords({ open, query }: { open: boolean; query: string }) {
  const q = useOfferRecords(open);
  const rows = (q.data ?? []).filter((r) => matchesQuery(query, r.file.clientName, r.file.businessName, r.file.publicId, r.lender, r.program));
  return (
    <RecordTable headers={["Client · business", "Lender · program", "Offer", "Pricing (as stated)", "Calculated", "Status", "Received"]} loading={q.isLoading} error={q.error} count={rows.length} emptyText="No offers recorded yet. Offers are entered on a file's Offers tab as the lender states them.">
      {rows.map((r) => {
        const calc = calculateOffer(r.raw);
        return (
          <tr key={r.id} className="border-t border-border/60 hover:bg-muted/30">
            <FileCell file={r.file} />
            <td className="px-4 py-2 text-foreground">{r.lender}{r.program && <span className="text-muted-foreground"> · {r.program}</span>}</td>
            <td className="px-4 py-2 font-bold text-foreground">{formatMoney(r.raw.offerAmount)}<p className="text-[11px] font-normal text-muted-foreground">{r.raw.termText ?? "Term not stated"}</p></td>
            <td className="px-4 py-2 text-foreground">{formatPricing(r.raw.pricingType, r.raw.pricingValue)}{r.raw.paymentAmount !== null && <p className="text-[11px] text-muted-foreground">{formatMoney(r.raw.paymentAmount)} {r.raw.paymentFrequency ?? ""}</p>}</td>
            <td className="px-4 py-2 text-foreground">
              {calc.totalPayback !== null ? <>Payback {formatMoney(calc.totalPayback)}<p className="text-[11px] text-muted-foreground">Cost {formatMoney(calc.estimatedFinancingCost)} · Net {formatMoney(calc.netProceeds)}</p></> : <span className="text-muted-foreground">Not computable from stated terms</span>}
            </td>
            <td className="px-4 py-2"><Pill tone={STATUS_TONE[r.status] ?? "neutral"}>{STATUS_LABEL[r.status] ?? r.status}</Pill>{r.expiresAt && <p className="mt-0.5 text-[11px] text-muted-foreground">Expires {formatDate(r.expiresAt)}</p>}</td>
            <td className="px-4 py-2 text-muted-foreground">{formatDate(r.receivedAt)}</td>
          </tr>
        );
      })}
    </RecordTable>
  );
}
