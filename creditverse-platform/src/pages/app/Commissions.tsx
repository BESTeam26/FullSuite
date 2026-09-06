/**
 * What partners are owed, and what has actually been paid.
 *
 * The screen's job is to keep two numbers apart that everybody wants to merge:
 *
 *   EARNED    a deal funded, so a partner is owed their share. Real, and
 *             visible the moment it happens.
 *   PAYABLE   the organization has confirmed the money on that deal arrived.
 *
 * Paying from earned is the mistake this page exists to prevent, so the pay
 * button simply is not there until revenue is confirmed, and the reason is
 * written where the button would be. The database refuses it too — this is the
 * courtesy, not the control.
 */
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BadgeCheck, Loader2, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatDate } from "@/lib/format-date";
import { errorMessage } from "@/lib/data/error-message";
import { fetchCommissions, markCommissionPaid, reverseCommission } from "@/lib/data/commissions";
import { STATE_LABELS, canPay, totals, type CommissionState } from "@/lib/commissions/commission-domain";
import { cn } from "@/lib/utils";

const money = (n: number) =>
  `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const TONE: Record<CommissionState, string> = {
  pending: "bg-muted text-muted-foreground",
  earned: "bg-amber-500/15 text-amber-700",
  payable: "bg-primary/15 text-primary",
  paid: "bg-emerald-500/15 text-emerald-700",
  reversed: "bg-status-danger/15 text-status-danger",
  void: "bg-muted text-muted-foreground",
};

export default function Commissions() {
  const qc = useQueryClient();
  const list = useQuery({ queryKey: ["commissions"], queryFn: fetchCommissions, staleTime: 30_000 });
  const [note, setNote] = useState<{ text: string; error: boolean } | null>(null);

  const refresh = () => void qc.invalidateQueries({ queryKey: ["commissions"] });

  const pay = useMutation({
    mutationFn: ({ id, reference }: { id: string; reference: string }) => markCommissionPaid(id, reference),
    onSuccess: () => { setNote({ text: "Recorded as paid.", error: false }); refresh(); },
    onError: (e) => setNote({ text: errorMessage(e, "It could not be recorded."), error: true }),
  });

  const reverse = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) => reverseCommission(id, reason),
    onSuccess: () => { setNote({ text: "Reversed.", error: false }); refresh(); },
    onError: (e) => setNote({ text: errorMessage(e, "It could not be reversed."), error: true }),
  });

  const rows = list.data ?? [];
  const t = useMemo(() => totals(rows.map((r) => ({ state: r.state, computedAmount: r.computedAmount }))), [rows]);

  return (
    <div className="mx-auto max-w-[1600px] space-y-4 p-4 md:p-6">
      <div>
        <h1 className="text-lg font-bold text-foreground">Commissions</h1>
        <p className="text-xs text-muted-foreground">
          Earned when a deal funds. Payable once you confirm the money arrived.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Tile label="Owed" value={money(t.owed)} detail="Earned plus ready to pay" strong />
        <Tile label="Earned, awaiting the money" value={money(t.earned)} detail="Not payable yet" />
        <Tile label="Ready to pay" value={money(t.payable)} detail="Revenue confirmed" />
        <Tile label="Paid" value={money(t.paid)} detail="Settled" />
      </div>

      {note && (
        <p role="status" className={cn("text-xs", note.error ? "text-status-danger" : "text-status-success")}>
          {note.text}
        </p>
      )}

      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="w-full text-left text-xs">
          <thead className="bg-muted/50 text-[11px] uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="px-4 py-2 font-bold">Partner</th>
              <th className="px-4 py-2 font-bold">How it was worked out</th>
              <th className="px-4 py-2 font-bold">Amount</th>
              <th className="px-4 py-2 font-bold">Funded</th>
              <th className="px-4 py-2 font-bold">State</th>
              <th className="px-4 py-2 font-bold">Action</th>
            </tr>
          </thead>
          <tbody>
            {list.isLoading && (
              <tr><td colSpan={6} className="px-4 py-6 text-center text-muted-foreground">
                <Loader2 className="mr-1 inline h-4 w-4 animate-spin" /> Loading…
              </td></tr>
            )}
            {!list.isLoading && rows.length === 0 && (
              <tr><td colSpan={6} className="px-4 py-6 text-center text-muted-foreground">
                Nothing yet. A commission appears here the moment a referred deal funds.
              </td></tr>
            )}
            {rows.map((r) => {
              const payable = canPay(r.state);
              return (
                <tr key={r.id} className="border-t border-border/60">
                  <td className="px-4 py-2 font-semibold text-foreground">{r.partyName}</td>
                  <td className="px-4 py-2 text-muted-foreground">
                    {r.basis === "flat"
                      ? `Flat ${money(r.rateOrAmount)}`
                      : `${r.rateOrAmount}% of ${r.basisAmount === null ? "the deal" : money(r.basisAmount)}`}
                  </td>
                  <td className="px-4 py-2 font-semibold text-foreground">{money(r.computedAmount)}</td>
                  <td className="px-4 py-2 text-muted-foreground">{r.fundedAt ? formatDate(r.fundedAt) : "—"}</td>
                  <td className="px-4 py-2">
                    <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-bold", TONE[r.state])}>
                      {STATE_LABELS[r.state]}
                    </span>
                  </td>
                  <td className="px-4 py-2">
                    {r.state === "paid" ? (
                      <span className="text-muted-foreground">{r.paymentReference ?? "Paid"}</span>
                    ) : payable.allowed ? (
                      <div className="flex flex-wrap items-center gap-1.5">
                        <Button
                          size="sm" variant="outline" disabled={pay.isPending}
                          onClick={() => {
                            const reference = window.prompt("Payment reference (cheque number, ACH id, however you paid it):");
                            if (reference?.trim()) pay.mutate({ id: r.id, reference: reference.trim() });
                          }}
                        >
                          <BadgeCheck className="mr-1 h-3.5 w-3.5" /> Record payment
                        </Button>
                        <Button
                          size="sm" variant="ghost" disabled={reverse.isPending}
                          onClick={() => {
                            const reason = window.prompt("Why is this being reversed?");
                            if (reason?.trim()) reverse.mutate({ id: r.id, reason: reason.trim() });
                          }}
                        >
                          <Undo2 className="h-3.5 w-3.5" />
                          <span className="sr-only">Reverse</span>
                        </Button>
                      </div>
                    ) : (
                      /* No button, and the reason where the button would be. */
                      <span className="text-muted-foreground">{payable.because}</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {list.error && <p role="alert" className="text-xs text-status-danger">They could not be loaded.</p>}
    </div>
  );
}

function Tile({ label, value, detail, strong }: { label: string; value: string; detail: string; strong?: boolean }) {
  return (
    <div className={cn("rounded-xl border bg-card p-4", strong ? "border-primary/40" : "border-border")}>
      <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className={cn("mt-1 font-bold text-foreground", strong ? "text-2xl" : "text-xl")}>{value}</p>
      <p className="text-[11px] text-muted-foreground">{detail}</p>
    </div>
  );
}
