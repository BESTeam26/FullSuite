/**
 * Finance → Payments: money received, across every partner.
 *
 * One table over the canonical `partner_payments`. The same rows the partner
 * profile shows and the same rows the portal shows — one payment, three views,
 * never three tables.
 *
 * A refund does not remove a payment. Dee: "Never delete financial history to
 * make a refund disappear." So a refunded row stays, with what came in and
 * what went back out beside each other.
 */
import { useMemo, useState } from "react";
import { AlertCircle, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatDate } from "@/lib/format-date";
import { formatMoneyIn } from "@/lib/format-money";
import { cn } from "@/lib/utils";
import { useFinancePayments } from "@/lib/data/use-finance-ledger";

const STATE_TONE: Record<string, string> = {
  matched: "border-emerald-500/40 bg-emerald-500/10 text-emerald-900",
  review_required: "border-amber-500/40 bg-amber-500/10 text-amber-900",
  unreconciled: "border-border bg-muted text-muted-foreground",
};
const STATE_LABEL: Record<string, string> = {
  matched: "Matched", review_required: "Matching review", unreconciled: "Unreconciled",
};

export function PaymentsLedger() {
  const payments = useFinancePayments(300);
  const [q, setQ] = useState("");
  const [method, setMethod] = useState("all");

  const { rows, methods, totals } = useMemo(() => {
    const all = payments.data ?? [];
    const needle = q.trim().toLowerCase();
    const rows = all.filter((p) => {
      if (method !== "all" && p.method !== method) return false;
      if (!needle) return true;
      return [p.partnerName, p.invoiceNumber, p.reference, String(p.amountCents / 100)]
        .some((f) => (f ?? "").toLowerCase().includes(needle));
    });
    return {
      rows,
      methods: [...new Set(all.map((p) => p.method))].sort(),
      totals: {
        /* What actually stayed: received less refunded. Showing the gross
           would say BES collected money it gave back. */
        netCents: rows.reduce((s, p) => s + Math.max(p.amountCents - p.refundAmountCents, 0), 0),
        refundedCents: rows.reduce((s, p) => s + p.refundAmountCents, 0),
      },
    };
  }, [payments.data, q, method]);

  if (payments.isPending) {
    return <div className="h-64 animate-pulse rounded-xl border border-border bg-muted/40" />;
  }
  if (payments.isError) {
    return (
      <div role="alert" className="rounded-xl border border-red-500/40 bg-red-500/5 p-6 text-center">
        <AlertCircle className="mx-auto mb-2 h-5 w-5 text-red-700" />
        <p className="text-sm font-semibold text-foreground">We couldn't load the payment ledger.</p>
        <p className="text-xs text-muted-foreground">{(payments.error as Error)?.message}</p>
        <Button className="mt-3" size="sm" variant="outline" onClick={() => void payments.refetch()}>Retry</Button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <label className="relative min-w-48 flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Partner, invoice, reference or amount"
            aria-label="Search payments"
            className="w-full rounded-lg border border-border bg-background py-1.5 pl-8 pr-3 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </label>
        <select
          value={method}
          onChange={(e) => setMethod(e.target.value)}
          aria-label="Filter by method"
          className="rounded-lg border border-border bg-background px-2 py-1.5 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
        >
          <option value="all">All methods</option>
          {methods.map((m) => <option key={m} value={m}>{m}</option>)}
        </select>
        <p className="ml-auto text-xs text-muted-foreground">
          <span className="font-semibold text-foreground">{formatMoneyIn(totals.netCents / 100, "USD")}</span> net
          {totals.refundedCents > 0 && <> · {formatMoneyIn(totals.refundedCents / 100, "USD")} refunded</>}
        </p>
      </div>

      {rows.length === 0 ? (
        <p className="rounded-xl border border-border bg-card py-10 text-center text-sm text-muted-foreground">
          {(payments.data ?? []).length === 0
            ? "No payment has been recorded yet."
            : "No payment matches that search."}
        </p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border bg-card">
          <table className="w-full min-w-[52rem] text-left text-xs">
            <thead>
              <tr className="border-b border-border bg-muted/40 text-[11px] uppercase tracking-wider text-muted-foreground">
                <th className="px-3 py-2 font-semibold">Date</th>
                <th className="px-3 py-2 font-semibold">Partner</th>
                <th className="px-3 py-2 font-semibold">Invoice</th>
                <th className="px-3 py-2 text-right font-semibold">Amount</th>
                <th className="px-3 py-2 font-semibold">Method</th>
                <th className="px-3 py-2 font-semibold">Reference</th>
                <th className="px-3 py-2 font-semibold">Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => (
                <tr key={p.id} className="border-b border-border/50 last:border-b-0 hover:bg-muted/40">
                  <td className="px-3 py-2 whitespace-nowrap text-muted-foreground">{formatDate(p.paidOn)}</td>
                  <td className="px-3 py-2 font-medium text-foreground">{p.partnerName}</td>
                  <td className="px-3 py-2 text-muted-foreground">{p.invoiceNumber ?? "—"}</td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    <span className="font-semibold text-foreground">
                      {formatMoneyIn(p.amountCents / 100, p.currency)}
                    </span>
                    {p.refundAmountCents > 0 && (
                      <span className="block text-[11px] text-muted-foreground">
                        −{formatMoneyIn(p.refundAmountCents / 100, p.currency)} refunded
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">
                    {p.method}
                    {p.environment === "sandbox" && (
                      <span className="ml-1.5 rounded border border-amber-500/40 bg-amber-500/10 px-1 py-0.5 text-[9px] font-bold uppercase tracking-wider text-amber-900">
                        Test
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 font-mono text-[11px] text-muted-foreground">{p.reference ?? "—"}</td>
                  <td className="px-3 py-2">
                    <span className={cn("rounded border px-1.5 py-0.5 text-[10px] font-medium",
                      STATE_TONE[p.reconciliationState] ?? STATE_TONE.unreconciled)}>
                      {STATE_LABEL[p.reconciliationState] ?? p.reconciliationState}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
