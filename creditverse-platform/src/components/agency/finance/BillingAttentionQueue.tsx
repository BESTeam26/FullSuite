/**
 * Finance → Billing Attention: the financial exception queue.
 *
 * Dee: "This should operate like a financial exception queue. Not a generic
 * dashboard." So every row is one problem with one partner attached, and every
 * row says what the next action is — a list you work through, not a list you
 * read.
 *
 * The filter arrives in the URL, because the Overview's Needs Attention tiles
 * link straight into a filtered queue and that link has to survive being
 * bookmarked or sent to somebody.
 */
import { useMemo } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { AlertCircle, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatDate } from "@/lib/format-date";
import { formatMoneyIn } from "@/lib/format-money";
import { cn } from "@/lib/utils";
import { useFinanceOverview } from "@/lib/data/use-finance-overview";
import { attentionCounts, daysOverdue } from "@/lib/finance/finance-overview";

const money = (cents: number) => formatMoneyIn(cents / 100, "USD");

interface Row {
  key: string;
  filter: string;
  partner: string;
  groupId: string;
  problem: string;
  amountCents: number | null;
  age: string;
  nextAction: string;
  tone: "bad" | "warn" | "info";
}

export function BillingAttentionQueue() {
  const [params, setParams] = useSearchParams();
  const active = params.get("filter") ?? "all";
  const overview = useFinanceOverview(9);
  const d = overview.data;

  const { rows, tabs } = useMemo(() => {
    if (!d) return { rows: [] as Row[], tabs: [] as { key: string; label: string; count: number }[] };

    const nameOf = new Map(d.openInvoices.map((i) => [i.groupId, i.partnerName]));
    const out: Row[] = [];

    for (const i of d.openInvoices) {
      const late = daysOverdue(i.dueDate, d.today);
      if (late > 0) {
        out.push({
          key: `past-due:${i.id}`, filter: "past-due",
          partner: i.partnerName, groupId: i.groupId,
          problem: `${i.invoiceNumber} unpaid`,
          amountCents: i.balanceCents,
          age: `${late} ${late === 1 ? "day" : "days"}`,
          nextAction: late > 7 ? "Escalate or suspend" : "Send a reminder",
          tone: late > 7 ? "bad" : "warn",
        });
      }
    }
    for (const g of d.attention.autopayFailedGroups) {
      out.push({
        key: `autopay:${g}`, filter: "autopay-failed",
        partner: nameOf.get(g) ?? "—", groupId: g,
        problem: "The saved card was declined", amountCents: null,
        age: "Last attempt", nextAction: "Ask for another card", tone: "bad",
      });
    }
    for (const g of d.attention.missingTermsGroups) {
      out.push({
        key: `terms:${g}`, filter: "missing-terms",
        partner: nameOf.get(g) ?? "—", groupId: g,
        /* This one is quiet and expensive: the service runs and bills nothing,
           and nobody finds out until somebody reads the month's invoices. */
        problem: "A live service has no billing rate", amountCents: null,
        age: "Ongoing", nextAction: "Set the rate on the service", tone: "warn",
      });
    }
    for (const g of d.attention.suspendedGroups) {
      out.push({
        key: `susp:${g}`, filter: "suspended",
        partner: nameOf.get(g) ?? "—", groupId: g,
        problem: "Work is stopped for non-payment", amountCents: null,
        age: "Until settled", nextAction: "Collect, then lift", tone: "info",
      });
    }
    if (d.attention.unmatchedPayments > 0) {
      out.push({
        key: "matching", filter: "matching",
        partner: "Several", groupId: "",
        problem: `${d.attention.unmatchedPayments} payment${d.attention.unmatchedPayments === 1 ? "" : "s"} with no invoice`,
        amountCents: null, age: "—", nextAction: "Match in Payment Matching", tone: "warn",
      });
    }

    const counts = attentionCounts({ invoices: d.openInvoices, today: d.today, ...d.attention });
    return {
      rows: out,
      tabs: [
        { key: "all", label: "All", count: out.length },
        ...counts.map((c) => ({ key: c.filter, label: c.label, count: c.count })),
      ],
    };
  }, [d]);

  if (overview.isPending) {
    return <div className="h-64 animate-pulse rounded-xl border border-border bg-muted/40" />;
  }
  if (overview.isError || !d) {
    return (
      <div role="alert" className="rounded-xl border border-red-500/40 bg-red-500/5 p-6 text-center">
        <AlertCircle className="mx-auto mb-2 h-5 w-5 text-red-700" />
        <p className="text-sm font-semibold text-foreground">We couldn't load the attention queue.</p>
        <Button className="mt-3" size="sm" variant="outline" onClick={() => void overview.refetch()}>Retry</Button>
      </div>
    );
  }

  const shown = active === "all" ? rows : rows.filter((r) => r.filter === active);

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
          <table className="w-full min-w-[46rem] text-left text-xs">
            <thead>
              <tr className="border-b border-border bg-muted/40 text-[11px] uppercase tracking-wider text-muted-foreground">
                <th className="px-3 py-2 font-semibold">Partner</th>
                <th className="px-3 py-2 font-semibold">Problem</th>
                <th className="px-3 py-2 text-right font-semibold">Amount</th>
                <th className="px-3 py-2 font-semibold">Age</th>
                <th className="px-3 py-2 font-semibold">Next action</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((r) => (
                <tr key={r.key} className="border-b border-border/50 last:border-b-0 hover:bg-muted/40">
                  <td className="px-3 py-2 font-medium text-foreground">
                    {r.groupId ? (
                      <Link to={`/app/partners/${r.groupId}`} className="hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                        {r.partner}
                      </Link>
                    ) : r.partner}
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">
                    <span className={cn("mr-1.5 inline-block h-1.5 w-1.5 rounded-full align-middle",
                      r.tone === "bad" ? "bg-red-600" : r.tone === "warn" ? "bg-amber-500" : "bg-muted-foreground")} />
                    {r.problem}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-foreground">
                    {r.amountCents === null ? "—" : money(r.amountCents)}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap text-muted-foreground">{r.age}</td>
                  <td className="px-3 py-2 font-medium text-foreground">{r.nextAction}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-[11px] text-muted-foreground">
        Every row here is derived from the canonical invoices, payments and suspensions. Nothing on
        this page is a stored flag, so it cannot disagree with the ledger — and clearing the problem
        clears the row. Last read {formatDate(d.today)}.
      </p>
    </div>
  );
}
