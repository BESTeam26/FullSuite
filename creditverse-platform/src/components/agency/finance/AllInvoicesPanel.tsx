/**
 * Every invoice BES has raised, in one place.
 *
 * Dee, 2026-09-13: "i need one place to see all invoices in finance too and
 * create those invoices single record as the invoice in the partners as one
 * record."
 *
 * The second half is the important half, and it is already true: these are the
 * SAME `partner_invoices` rows the partner's Billing tab shows and the partner
 * portal shows. One invoice record, looked at from three places — Finance for
 * the whole book, the partner profile for one account, the portal for the
 * partner's own copy. Nothing here creates or copies an invoice (rule 2).
 *
 * A row links to that partner's billing, which is where an invoice is acted
 * on — rather than duplicating Record Payment into a third screen.
 */
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { FileText, Search } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { OpsSelect } from "@/components/ui/ops-select";
import { useAuth } from "@/lib/auth/auth-context";
import { formatDate } from "@/lib/format-date";
import { formatMoneyIn } from "@/lib/format-money";
import { cn } from "@/lib/utils";
import { fetchAllInvoices } from "@/lib/data/partner-billing";

const ALL = "__all__";

const STATUS_TONE: Record<string, string> = {
  paid: "border-emerald-500/40 bg-emerald-500/10 text-emerald-900",
  partially_paid: "border-amber-500/40 bg-amber-500/10 text-amber-900",
  overdue: "border-red-500/40 bg-red-500/10 text-red-900",
  sent: "border-border bg-muted text-foreground",
  scheduled: "border-sky-500/40 bg-sky-500/10 text-sky-900",
  draft: "border-border bg-muted text-muted-foreground",
  void: "border-border bg-muted text-muted-foreground",
  cancelled: "border-border bg-muted text-muted-foreground",
  refunded: "border-sky-500/40 bg-sky-500/10 text-sky-900",
};
const STATUS_LABEL: Record<string, string> = {
  paid: "Paid", partially_paid: "Partially paid", overdue: "Past due", sent: "Open",
  scheduled: "Scheduled", draft: "Draft", void: "Void", cancelled: "Cancelled", refunded: "Refunded",
};

export function AllInvoicesPanel() {
  const auth = useAuth();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState(ALL);

  const invoices = useQuery({
    queryKey: ["finance", "all-invoices"],
    queryFn: () => fetchAllInvoices(),
    enabled: auth.mode === "live" && auth.status === "signed-in",
    staleTime: 60_000,
  });

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (invoices.data ?? []).filter((i) => {
      if (status !== ALL && i.status !== status) return false;
      if (!q) return true;
      return [i.invoiceNumber, i.partnerName, i.notes].some((v) => v?.toLowerCase().includes(q));
    });
  }, [invoices.data, search, status]);

  /* Totals of what is ON SCREEN, so a filtered view adds up to what it shows
     rather than to something invisible. Void, cancelled and draft are left out
     of the money: they are decisions and intentions, not receivables. */
  const totals = useMemo(() => {
    const live = rows.filter((i) => !["void", "cancelled", "draft"].includes(i.status));
    return {
      count: rows.length,
      invoiced: live.reduce((n, i) => n + i.totalCents, 0),
      collected: live.reduce((n, i) => n + i.amountPaidCents, 0),
      outstanding: live.reduce((n, i) => n + i.balanceCents, 0),
    };
  }, [rows]);

  const statuses = useMemo(
    () => [...new Set((invoices.data ?? []).map((i) => i.status))].sort(),
    [invoices.data],
  );
  const currency = invoices.data?.[0]?.currency ?? "USD";

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[200px] flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Invoice number, partner or note"
            aria-label="Search invoices"
            className="h-8 pl-8 text-xs"
          />
        </div>
        <OpsSelect
          aria-label="Invoice status"
          size="sm"
          value={status}
          onValueChange={setStatus}
          options={[{ value: ALL, label: "Every status" },
            ...statuses.map((s) => ({ value: s, label: STATUS_LABEL[s] ?? s }))]}
        />
      </div>

      <div className="grid gap-2.5 sm:grid-cols-4">
        {[
          { label: "Invoices", value: String(totals.count), tone: "text-foreground" },
          { label: "Invoiced", value: formatMoneyIn(totals.invoiced / 100, currency), tone: "text-foreground" },
          { label: "Collected", value: formatMoneyIn(totals.collected / 100, currency), tone: "text-status-success" },
          { label: "Outstanding", value: formatMoneyIn(totals.outstanding / 100, currency),
            tone: totals.outstanding > 0 ? "text-amber-700" : "text-muted-foreground" },
        ].map((t) => (
          <div key={t.label} className="rounded-xl border border-border bg-card px-3.5 py-3">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{t.label}</p>
            <p className={cn("mt-0.5 text-lg font-bold tabular-nums", t.tone)}>{t.value}</p>
          </div>
        ))}
      </div>

      {invoices.isLoading ? (
        <p className="py-8 text-center text-xs text-muted-foreground">Loading invoices…</p>
      ) : invoices.error ? (
        <p role="alert" className="rounded-xl border border-red-500/30 bg-red-500/5 px-4 py-3 text-sm text-red-700">
          Could not load invoices: {(invoices.error as Error).message}
        </p>
      ) : rows.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-muted/20 px-6 py-10 text-center">
          <FileText className="mx-auto mb-2 h-5 w-5 text-muted-foreground" />
          <p className="text-sm font-semibold text-foreground">
            {(invoices.data ?? []).length === 0 ? "No invoices yet" : "Nothing matches that"}
          </p>
          <p className="mx-auto mt-1 max-w-md text-xs text-muted-foreground">
            Recurring invoices are generated from each partner's billing terms. One-off invoices are
            raised on the partner's Billing tab.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border bg-card">
          <table className="w-full min-w-[46rem] text-left text-xs">
            <thead>
              <tr className="border-b border-border">
                <th className="px-3 py-2 font-semibold text-muted-foreground">Invoice</th>
                <th className="px-3 py-2 font-semibold text-muted-foreground">Partner</th>
                <th className="px-3 py-2 font-semibold text-muted-foreground">Issued</th>
                <th className="px-3 py-2 font-semibold text-muted-foreground">Due</th>
                <th className="px-3 py-2 text-right font-semibold text-muted-foreground">Amount</th>
                <th className="px-3 py-2 text-right font-semibold text-muted-foreground">Paid</th>
                <th className="px-3 py-2 text-right font-semibold text-muted-foreground">Balance</th>
                <th className="px-3 py-2 font-semibold text-muted-foreground">Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((i) => (
                <tr key={i.id} className="border-b border-border/50 transition-colors last:border-b-0 hover:bg-muted/40">
                  <td className="px-3 py-2">
                    <Link to={`/app/bes-partners/${i.groupId}`}
                      className="font-medium text-foreground hover:text-primary hover:underline">
                      {i.invoiceNumber}
                    </Link>
                  </td>
                  <td className="px-3 py-2 text-foreground">{i.partnerName}</td>
                  <td className="px-3 py-2 text-muted-foreground">{formatDate(i.issueDate)}</td>
                  <td className="px-3 py-2 text-muted-foreground">{formatDate(i.dueDate)}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-foreground">
                    {formatMoneyIn(i.totalCents / 100, i.currency)}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                    {formatMoneyIn(i.amountPaidCents / 100, i.currency)}
                  </td>
                  <td className={cn("px-3 py-2 text-right tabular-nums",
                    i.balanceCents > 0 ? "font-semibold text-foreground" : "text-muted-foreground")}>
                    {formatMoneyIn(i.balanceCents / 100, i.currency)}
                  </td>
                  <td className="px-3 py-2">
                    <span className={cn("rounded border px-1.5 py-0.5 text-[10px] font-medium",
                      STATUS_TONE[i.status] ?? "border-border bg-muted text-foreground")}>
                      {STATUS_LABEL[i.status] ?? i.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-[11px] text-muted-foreground">
        These are the same invoice records the partner's own Billing tab and their portal show — one
        invoice, looked at from three places. Nothing here creates a second copy.
      </p>
    </div>
  );
}
