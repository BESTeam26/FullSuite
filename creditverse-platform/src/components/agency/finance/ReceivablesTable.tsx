/**
 * Everything BES is owed, in the views an owner actually uses.
 *
 * The spreadsheet's RECEIVABLES / COLLECTION FLOW tab is one long list with a
 * PAID column somebody ticks. The useful questions it cannot answer are what
 * is due today, what is late, and what has not been invoiced yet — so those
 * are the filters, and "not yet invoiced" is shown as a separate kind of row
 * because a scheduled obligation and an issued bill are different things.
 */
import { useState } from "react";
import { Link } from "react-router-dom";
import { ContentCard } from "@/components/dashboard/DivisionLayout";
import { Pill } from "@/components/agency/partner/partner-ui";
import type { InvoiceRecord, Month, ScheduledObligation } from "@/lib/partners/billing-engine";
import { formatMoney } from "@/lib/format-money";
import { formatDate } from "@/lib/format-date";
import { cn } from "@/lib/utils";

const money = (cents: number) => formatMoney(cents / 100);

type View = "due_week" | "overdue" | "outstanding" | "not_invoiced" | "paid_month" | "all";

const VIEWS: { key: View; label: string }[] = [
  { key: "due_week", label: "Due this week" },
  { key: "overdue", label: "Overdue" },
  { key: "outstanding", label: "Outstanding" },
  { key: "not_invoiced", label: "Not yet invoiced" },
  { key: "paid_month", label: "Paid this month" },
  { key: "all", label: "All" },
];

const STATUS_TONE: Record<string, string> = {
  draft: "border-border bg-muted text-muted-foreground",
  scheduled: "border-blue-500/30 bg-blue-500/10 text-blue-700",
  sent: "border-blue-500/30 bg-blue-500/10 text-blue-700",
  partially_paid: "border-amber-500/40 bg-amber-500/10 text-amber-800",
  paid: "border-emerald-500/30 bg-emerald-500/10 text-emerald-700",
  overdue: "border-red-500/40 bg-red-500/10 text-red-800",
  void: "border-border bg-muted text-muted-foreground",
  cancelled: "border-border bg-muted text-muted-foreground",
};

export function ReceivablesTable({ invoices, schedule, partnerNames, month, today }: {
  invoices: InvoiceRecord[];
  schedule: ScheduledObligation[];
  partnerNames: Record<string, string>;
  month: Month;
  today: string;
}) {
  const [view, setView] = useState<View>("outstanding");
  const inWeek = new Date(Date.parse(`${today}T00:00:00Z`) + 7 * 86_400_000).toISOString().slice(0, 10);
  const mm = String(month.month).padStart(2, "0");
  const monthPrefix = `${month.year}-${mm}`;

  const rows = invoices.filter((i) => {
    const outstanding = i.totalCents - i.amountPaidCents;
    switch (view) {
      case "due_week": return outstanding > 0 && !["void", "cancelled", "draft"].includes(i.status)
        && i.dueDate >= today && i.dueDate <= inWeek;
      case "overdue": return outstanding > 0 && !["void", "cancelled", "draft"].includes(i.status)
        && i.dueDate < today;
      case "outstanding": return outstanding > 0 && !["void", "cancelled", "draft"].includes(i.status);
      case "paid_month": return i.status === "paid" && i.dueDate.startsWith(monthPrefix);
      case "not_invoiced": return false;
      default: return true;
    }
  });

  /* Scheduled-but-not-invoiced obligations are their own kind of row: money
     BES will be owed, which is not the same as money BES has billed. */
  const pending = view === "not_invoiced" || view === "all"
    ? schedule.filter((s) => s.status === "scheduled")
    : [];

  return (
    <ContentCard
      title="Receivables"
      action={
        <div className="flex flex-wrap gap-1">
          {VIEWS.map((v) => (
            <button key={v.key} type="button" onClick={() => setView(v.key)}
              className={cn(
                "rounded-lg px-2 py-1 text-[11px] font-medium transition-colors",
                view === v.key
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}>
              {v.label}
            </button>
          ))}
        </div>
      }
    >
      {rows.length === 0 && pending.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">
          {view === "overdue" ? "Nothing is overdue." : "Nothing here for this view."}
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[40rem] text-left text-xs">
            <thead>
              <tr className="border-b border-border/60 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                <th className="py-1.5 pr-2">Partner</th>
                <th className="py-1.5 pr-2">Due</th>
                <th className="py-1.5 pr-2 text-right">Amount</th>
                <th className="py-1.5 pr-2 text-right">Paid</th>
                <th className="py-1.5 pr-2 text-right">Outstanding</th>
                <th className="py-1.5">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50">
              {rows.map((i) => (
                <tr key={i.id} className="transition-colors hover:bg-muted/40">
                  <td className="py-1.5 pr-2">
                    <Link to={`/app/bes-partners/${i.groupId}`}
                      className="font-medium text-foreground hover:text-primary hover:underline">
                      {partnerNames[i.groupId] ?? "Partner"}
                    </Link>
                  </td>
                  <td className="py-1.5 pr-2 text-muted-foreground">{formatDate(i.dueDate)}</td>
                  <td className="py-1.5 pr-2 text-right tabular-nums text-foreground">{money(i.totalCents)}</td>
                  <td className="py-1.5 pr-2 text-right tabular-nums text-muted-foreground">{money(i.amountPaidCents)}</td>
                  <td className="py-1.5 pr-2 text-right tabular-nums font-semibold text-foreground">
                    {money(Math.max(i.totalCents - i.amountPaidCents, 0))}
                  </td>
                  <td className="py-1.5">
                    <Pill tone={STATUS_TONE[i.status] ?? STATUS_TONE.draft}>{i.status.replace(/_/g, " ")}</Pill>
                  </td>
                </tr>
              ))}
              {pending.map((s) => (
                <tr key={s.id} className="transition-colors hover:bg-muted/40">
                  <td className="py-1.5 pr-2 text-foreground">
                    <Link to={`/app/bes-partners/${s.groupId}`} className="hover:text-primary hover:underline">
                      {partnerNames[s.groupId] ?? "Partner"}
                    </Link>
                  </td>
                  <td className="py-1.5 pr-2 text-muted-foreground">{formatDate(s.dueOn)}</td>
                  <td className="py-1.5 pr-2 text-right tabular-nums text-foreground">{money(s.amountCents)}</td>
                  <td className="py-1.5 pr-2 text-right tabular-nums text-muted-foreground">—</td>
                  <td className="py-1.5 pr-2 text-right tabular-nums font-semibold text-foreground">{money(s.amountCents)}</td>
                  <td className="py-1.5">
                    <Pill tone="border-border bg-muted text-muted-foreground">
                      {s.kind === "instalment" ? "instalment — not invoiced" : "scheduled"}
                    </Pill>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </ContentCard>
  );
}
