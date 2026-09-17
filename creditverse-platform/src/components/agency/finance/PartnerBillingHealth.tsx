/**
 * Finance → Billing: how each partner is configured to be CHARGED.
 *
 * Dee draws the line herself: "Invoices = individual receivables. Billing =
 * how each Partner is configured to be charged." So this screen never lists an
 * invoice. It lists partners, their terms, what collects them, and whether
 * that arrangement is actually workable.
 *
 * Billing health is derived, never stored: a partner is Past Due because they
 * owe money late, and Missing Configuration because a live service has no
 * rate. A stored health flag would be wrong the moment somebody paid.
 */
import { useMemo } from "react";
import { Link } from "react-router-dom";
import { AlertCircle, CreditCard, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatDate } from "@/lib/format-date";
import { formatMoneyIn } from "@/lib/format-money";
import { cn } from "@/lib/utils";
import { useFinanceOverview } from "@/lib/data/use-finance-overview";
import { daysOverdue } from "@/lib/finance/finance-overview";

type Health = "healthy" | "attention" | "past-due" | "suspended" | "autopay-failed" | "missing-config";

const HEALTH: Record<Health, { label: string; cls: string }> = {
  healthy: { label: "Healthy", cls: "border-emerald-500/40 bg-emerald-500/10 text-emerald-900" },
  attention: { label: "Attention required", cls: "border-amber-500/40 bg-amber-500/10 text-amber-900" },
  "past-due": { label: "Past due", cls: "border-red-500/40 bg-red-500/10 text-red-900" },
  suspended: { label: "Suspended", cls: "border-red-500/40 bg-red-500/10 text-red-900" },
  "autopay-failed": { label: "AutoPay failed", cls: "border-red-500/40 bg-red-500/10 text-red-900" },
  "missing-config": { label: "Missing configuration", cls: "border-amber-500/40 bg-amber-500/10 text-amber-900" },
};

const money = (cents: number) => formatMoneyIn(cents / 100, "USD");

export function PartnerBillingHealth() {
  const overview = useFinanceOverview(9);
  const d = overview.data;

  const rows = useMemo(() => {
    if (!d) return [];
    const byPartner = new Map<string, {
      groupId: string; name: string; owedCents: number; oldestDue: string | null;
      method: string; autopay: boolean; nextDue: string | null; nextCents: number;
    }>();

    for (const i of d.openInvoices) {
      const at = byPartner.get(i.groupId) ?? {
        groupId: i.groupId, name: i.partnerName, owedCents: 0, oldestDue: null,
        method: i.method, autopay: i.autopay, nextDue: null, nextCents: 0,
      };
      at.owedCents += i.balanceCents;
      if (!at.oldestDue || i.dueDate < at.oldestDue) at.oldestDue = i.dueDate;
      /* The next thing to collect is the soonest one not yet due. */
      if (daysOverdue(i.dueDate, d.today) <= 0 && (!at.nextDue || i.dueDate < at.nextDue)) {
        at.nextDue = i.dueDate;
        at.nextCents = i.balanceCents;
      }
      byPartner.set(i.groupId, at);
    }

    const failed = new Set(d.attention.autopayFailedGroups);
    const missing = new Set(d.attention.missingTermsGroups);
    const suspended = new Set(d.attention.suspendedGroups);

    /* A partner with no open invoice still has a billing arrangement, and a
       broken one is exactly what nobody notices. Missing terms come in from
       the attention list rather than from the invoices. */
    for (const g of missing) {
      if (!byPartner.has(g)) {
        byPartner.set(g, {
          groupId: g, name: d.partnerNames[g] ?? "Unknown partner", owedCents: 0, oldestDue: null,
          method: "manual", autopay: false, nextDue: null, nextCents: 0,
        });
      }
    }

    return [...byPartner.values()]
      .map((p) => {
        const late = p.oldestDue ? daysOverdue(p.oldestDue, d.today) : 0;
        const health: Health =
          suspended.has(p.groupId) ? "suspended"
          : failed.has(p.groupId) ? "autopay-failed"
          : late > 0 ? "past-due"
          : missing.has(p.groupId) ? "missing-config"
          : "healthy";
        return { ...p, late, health };
      })
      .sort((a, b) => b.owedCents - a.owedCents || a.name.localeCompare(b.name));
  }, [d]);

  if (overview.isPending) {
    return <div className="h-64 animate-pulse rounded-xl border border-border bg-muted/40" />;
  }
  if (overview.isError || !d) {
    return (
      <div role="alert" className="rounded-xl border border-red-500/40 bg-red-500/5 p-6 text-center">
        <AlertCircle className="mx-auto mb-2 h-5 w-5 text-red-700" />
        <p className="text-sm font-semibold text-foreground">We couldn't load partner billing.</p>
        <Button className="mt-3" size="sm" variant="outline" onClick={() => void overview.refetch()}>Retry</Button>
      </div>
    );
  }
  if (rows.length === 0) {
    return (
      <p className="rounded-xl border border-border bg-card py-10 text-center text-sm text-muted-foreground">
        No partner has an open billing arrangement yet.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-border bg-card">
      <table className="w-full min-w-[46rem] text-left text-xs">
        <thead>
          <tr className="border-b border-border bg-muted/40 text-[11px] uppercase tracking-wider text-muted-foreground">
            <th className="px-3 py-2 font-semibold">Partner</th>
            <th className="px-3 py-2 text-right font-semibold">Owed now</th>
            <th className="px-3 py-2 font-semibold">Next due</th>
            <th className="px-3 py-2 text-right font-semibold">Expected</th>
            <th className="px-3 py-2 font-semibold">Collection</th>
            <th className="px-3 py-2 font-semibold">AutoPay</th>
            <th className="px-3 py-2 font-semibold">Billing status</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((p) => (
            <tr key={p.groupId} className="border-b border-border/50 last:border-b-0 hover:bg-muted/40">
              <td className="px-3 py-2 font-medium text-foreground">
                <Link to={`/app/partners/${p.groupId}`} className="hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  {p.name}
                </Link>
              </td>
              <td className={cn("px-3 py-2 text-right tabular-nums",
                p.owedCents > 0 ? "font-semibold text-foreground" : "text-muted-foreground")}>
                {money(p.owedCents)}
              </td>
              <td className="px-3 py-2 whitespace-nowrap text-muted-foreground">
                {p.nextDue ? formatDate(p.nextDue) : p.late > 0 ? `${p.late} days late` : "—"}
              </td>
              <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                {p.nextCents > 0 ? money(p.nextCents) : "—"}
              </td>
              <td className="px-3 py-2 capitalize text-muted-foreground">
                <span className="inline-flex items-center gap-1">
                  {p.method === "card" || p.method === "autopay" ? <CreditCard className="h-3 w-3" /> : null}
                  {p.method === "autopay" ? "Card" : p.method}
                </span>
              </td>
              <td className="px-3 py-2">
                {p.autopay ? (
                  <span className="inline-flex items-center gap-1 rounded border border-emerald-500/40 bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-emerald-900">
                    <Zap className="h-2.5 w-2.5" /> On
                  </span>
                ) : (
                  <span className="text-[11px] text-muted-foreground">Off</span>
                )}
              </td>
              <td className="px-3 py-2">
                <span className={cn("rounded border px-1.5 py-0.5 text-[10px] font-medium", HEALTH[p.health].cls)}>
                  {HEALTH[p.health].label}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
