/** Commissions per deal, per party: basis and rate as recorded, the computed amount, and the pending → approved → paid state. */
import { formatDate } from "@/lib/format-date";
import { formatMoney } from "@/lib/format-money";
import { useCommissionRecords } from "@/lib/data/use-funding-records";
import { matchesQuery } from "./record-search";
import { FileCell, Pill, RecordTable } from "./RecordTable";

const PARTY_LABEL: Record<string, string> = { agency: "BES", org_user: "Team member", partner: "Partner", lender_referral: "Lender referral" };
const STATE_TONE: Record<string, "ok" | "warn" | "bad" | "info" | "neutral"> = { pending: "warn", approved: "info", paid: "ok", void: "neutral" };

export function CommissionsRecords({ open, query, memberNames }: { open: boolean; query: string; memberNames: Record<string, string> }) {
  const q = useCommissionRecords(open);
  const rows = (q.data ?? []).filter((r) => matchesQuery(query, r.file.clientName, r.file.businessName, r.file.publicId, r.lender, memberNames[r.partyId]));
  return (
    <RecordTable headers={["Client · business", "Lender · deal", "Party", "Basis", "Amount", "State", "Paid"]} loading={q.isLoading} error={q.error} count={rows.length} emptyText="No commissions recorded yet.">
      {rows.map((r) => (
        <tr key={r.id} className="border-t border-border/60 hover:bg-muted/30">
          <FileCell file={r.file} />
          <td className="px-4 py-2 text-foreground">{r.lender ?? "—"}{r.dealAmount !== null && <span className="text-muted-foreground"> · {formatMoney(r.dealAmount)}</span>}</td>
          <td className="px-4 py-2 text-foreground">{PARTY_LABEL[r.partyKind] ?? r.partyKind}{r.partyKind === "org_user" && memberNames[r.partyId] && <p className="text-[11px] text-muted-foreground">{memberNames[r.partyId]}</p>}</td>
          <td className="px-4 py-2 text-foreground">{r.basis === "pct" ? `${r.rateOrAmount}% of funded` : `Flat ${formatMoney(r.rateOrAmount)}`}</td>
          <td className="px-4 py-2 font-bold text-foreground">{formatMoney(r.computedAmount)}</td>
          <td className="px-4 py-2"><Pill tone={STATE_TONE[r.state] ?? "neutral"}>{r.state.charAt(0).toUpperCase() + r.state.slice(1)}</Pill></td>
          <td className="px-4 py-2 text-muted-foreground">{r.paidAt ? formatDate(r.paidAt) : "—"}</td>
        </tr>
      ))}
    </RecordTable>
  );
}
