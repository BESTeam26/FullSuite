/**
 * Finance → Billing Attention: the financial exception queue.
 *
 * Dee §28: "This is an exception projection, not another workflow database…
 * Failed conditions should disappear automatically once canonical data is
 * corrected."
 *
 * So every row here comes from the `billing_attention` view, which is derived
 * from invoices, payments, reminders, suspensions, card charges and billing
 * terms. Nothing is stored, nothing is dismissed, and fixing the underlying
 * fact is what clears the row.
 *
 * The first version of this screen re-derived the same exceptions in the
 * browser. That was a second definition of "overdue" and "autopay failed",
 * which would have drifted the first time the view learned something new.
 */
import { useMemo } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { AlertCircle, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatDate } from "@/lib/format-date";
import { formatMoneyIn } from "@/lib/format-money";
import { cn } from "@/lib/utils";
import { useBillingAttention, type AttentionRow } from "@/lib/data/use-finance-ledger";
import { ATTENTION_KINDS, nextActionFor } from "@/lib/finance/attention-kinds";

const money = (cents: number) => formatMoneyIn(cents / 100, "USD");

const SEVERITY_DOT: Record<AttentionRow["severity"], string> = {
  critical: "bg-red-600",
  high: "bg-red-500",
  medium: "bg-amber-500",
};

export function BillingAttentionQueue() {
  const [params, setParams] = useSearchParams();
  const active = params.get("filter") ?? "all";
  const attention = useBillingAttention();

  const { rows, tabs } = useMemo(() => {
    const all = attention.data ?? [];
    const counts = new Map<string, number>();
    for (const r of all) counts.set(r.kind, (counts.get(r.kind) ?? 0) + 1);
    return {
      rows: all,
      /* Every kind the view CAN produce, so "0 suspended" is still said —
         a category that vanishes when it is clear reads as a category that
         was never checked. */
      tabs: [
        { key: "all", label: "All", count: all.length },
        ...ATTENTION_KINDS.map((k) => ({ key: k.kind, label: k.label, count: counts.get(k.kind) ?? 0 })),
      ],
    };
  }, [attention.data]);

  if (attention.isPending) {
    return <div className="h-64 animate-pulse rounded-xl border border-border bg-muted/40" />;
  }
  if (attention.isError) {
    return (
      <div role="alert" className="rounded-xl border border-red-500/40 bg-red-500/5 p-6 text-center">
        <AlertCircle className="mx-auto mb-2 h-5 w-5 text-red-700" />
        <p className="text-sm font-semibold text-foreground">We couldn't load the attention queue.</p>
        <p className="text-xs text-muted-foreground">{(attention.error as Error)?.message}</p>
        <Button className="mt-3" size="sm" variant="outline" onClick={() => void attention.refetch()}>Retry</Button>
      </div>
    );
  }

  const shown = active === "all" ? rows : rows.filter((r) => r.kind === active);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-1.5">
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setParams(t.key === "all" ? {} : { filter: t.key })}
            aria-pressed={active === t.key}
            className={cn(
              "rounded-lg border px-2.5 py-1 text-xs font-semibold transition-colors",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              active === t.key
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-card text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            {t.label}
            <span className="ml-1.5 tabular-nums opacity-70">{t.count}</span>
          </button>
        ))}
      </div>

      {shown.length === 0 ? (
        <div className="rounded-xl border border-emerald-500/40 bg-emerald-500/5 py-10 text-center">
          <CheckCircle2 className="mx-auto mb-2 h-5 w-5 text-emerald-700" />
          <p className="text-sm font-semibold text-foreground">
            {active === "all" ? "Nothing needs a person right now 🎉" : "Nothing in this category."}
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border bg-card">
          <table className="w-full min-w-[52rem] text-left text-xs">
            <thead>
              <tr className="border-b border-border bg-muted/40 text-[11px] uppercase tracking-wider text-muted-foreground">
                <th className="px-3 py-2 font-semibold">Partner</th>
                <th className="px-3 py-2 font-semibold">Problem</th>
                <th className="px-3 py-2 text-right font-semibold">Amount</th>
                <th className="px-3 py-2 font-semibold">Since</th>
                <th className="px-3 py-2 font-semibold">Next action</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((r, i) => (
                <tr key={`${r.kind}:${r.groupId}:${r.invoiceId ?? i}`}
                    className="border-b border-border/50 last:border-b-0 hover:bg-muted/40">
                  <td className="px-3 py-2 font-medium text-foreground">
                    <Link to={`/app/partners/${r.groupId}`}
                          className="hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                      {r.partnerName}
                    </Link>
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">
                    <span className={cn("mr-1.5 inline-block h-1.5 w-1.5 rounded-full align-middle", SEVERITY_DOT[r.severity])} />
                    {r.invoiceNumber ? <span className="font-medium text-foreground">{r.invoiceNumber} · </span> : null}
                    {r.detail}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-foreground">
                    {r.amountCents > 0 ? money(r.amountCents) : "—"}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap text-muted-foreground">
                    {r.since ? formatDate(r.since) : "—"}
                  </td>
                  <td className="px-3 py-2 font-medium text-foreground">{nextActionFor(r.kind)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-[11px] text-muted-foreground">
        Every row is derived from the canonical invoices, payments and suspensions — there is no
        exception table to keep in step, and correcting the underlying fact clears the row.
      </p>
    </div>
  );
}
