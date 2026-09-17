/**
 * Finance → Payment Matching: reconciling money that arrived on its own.
 *
 * A Wise or PayPal transfer lands with a reference somebody typed, and
 * sometimes that reference is wrong or missing. This is where a person decides
 * which invoice it settles.
 *
 * The candidates come from the canonical `payment_matching_review` view,
 * ranked by how close each invoice's balance is to the payment. They are
 * SUGGESTIONS and are never applied automatically. Dee: "Every manual match
 * must be audited." The database records the actor, the before and the after;
 * this screen only asks.
 */
import { useState } from "react";
import { AlertCircle, CheckCircle2, Link2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatDate } from "@/lib/format-date";
import { formatMoneyIn } from "@/lib/format-money";
import { cn } from "@/lib/utils";
import { useMatchPayment, useUnmatchedPayments } from "@/lib/data/use-finance-ledger";

/** An exact match on the amount is worth saying out loud; nothing else is. */
const exactly = (balanceCents: number, amountCents: number) => balanceCents === amountCents;

export function PaymentMatching() {
  const unmatched = useUnmatchedPayments();
  const match = useMatchPayment();
  const [chosen, setChosen] = useState<Record<string, string>>({});

  if (unmatched.isPending) {
    return <div className="h-64 animate-pulse rounded-xl border border-border bg-muted/40" />;
  }
  if (unmatched.isError) {
    return (
      <div role="alert" className="rounded-xl border border-red-500/40 bg-red-500/5 p-6 text-center">
        <AlertCircle className="mx-auto mb-2 h-5 w-5 text-red-700" />
        <p className="text-sm font-semibold text-foreground">We couldn't load unmatched payments.</p>
        <p className="text-xs text-muted-foreground">{(unmatched.error as Error)?.message}</p>
        <Button className="mt-3" size="sm" variant="outline" onClick={() => void unmatched.refetch()}>Retry</Button>
      </div>
    );
  }

  const rows = unmatched.data ?? [];
  if (rows.length === 0) {
    return (
      <div className="rounded-xl border border-emerald-500/40 bg-emerald-500/5 py-10 text-center">
        <CheckCircle2 className="mx-auto mb-2 h-5 w-5 text-emerald-700" />
        <p className="text-sm font-semibold text-foreground">Every payment is matched to an invoice 🎉</p>
        <p className="text-xs text-muted-foreground">
          A payment appears here when it arrives without an invoice behind it.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {rows.map((p) => {
        /* Preselect only an EXACT amount match. Preselecting a near-miss is
           how somebody clicks through and settles the wrong invoice. */
        const picked = chosen[p.id]
          ?? p.candidates.find((c) => exactly(c.balanceCents, p.amountCents))?.invoiceId
          ?? "";
        return (
          <section key={p.id} className="grid gap-3 rounded-xl border border-border bg-card p-4 lg:grid-cols-[1fr_1.4fr]">
            {/* What arrived */}
            <div className="min-w-0">
              <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Unmatched payment</p>
              <p className="mt-1 text-xl font-bold tabular-nums text-foreground">
                {formatMoneyIn(p.amountCents / 100, p.currency)}
              </p>
              <p className="text-sm font-semibold text-foreground">{p.partnerName}</p>
              <dl className="mt-2 space-y-0.5 text-[11px] text-muted-foreground">
                <div className="flex gap-1.5"><dt className="font-semibold">Received</dt><dd>{formatDate(p.paidOn)}</dd></div>
                <div className="flex gap-1.5"><dt className="font-semibold">Method</dt><dd>{p.method}</dd></div>
                {p.reference && (
                  <div className="flex gap-1.5"><dt className="font-semibold">Reference</dt>
                    <dd className="font-mono">{p.reference}</dd></div>
                )}
                {p.recordedByName && (
                  <div className="flex gap-1.5"><dt className="font-semibold">Recorded by</dt>
                    <dd>{p.recordedByName}</dd></div>
                )}
                {p.notes && <div className="pt-0.5">{p.notes}</div>}
              </dl>
            </div>

            {/* What it might belong to */}
            <div className="min-w-0">
              <p className="mb-1.5 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                Possible invoices
              </p>
              {p.candidates.length === 0 ? (
                <p className="rounded-lg border border-border bg-muted/40 px-3 py-4 text-xs text-muted-foreground">
                  This partner has no open invoice. The money stays on their account until one exists,
                  or somebody decides what it was for.
                </p>
              ) : (
                <>
                  <ul className="space-y-1">
                    {p.candidates.map((c) => (
                      <li key={c.invoiceId}>
                        <label className={cn(
                          "flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-xs transition-colors",
                          picked === c.invoiceId
                            ? "border-primary bg-primary/10"
                            : "border-border hover:bg-muted",
                        )}>
                          <input
                            type="radio"
                            name={`match-${p.id}`}
                            checked={picked === c.invoiceId}
                            onChange={() => setChosen((s) => ({ ...s, [p.id]: c.invoiceId }))}
                            className="h-3.5 w-3.5 border-border text-primary focus:ring-primary"
                          />
                          <span className="min-w-0 flex-1 truncate font-medium text-foreground">{c.invoiceNumber}</span>
                          <span className="whitespace-nowrap text-muted-foreground">due {formatDate(c.dueDate)}</span>
                          <span className="tabular-nums font-semibold text-foreground">
                            {formatMoneyIn(c.balanceCents / 100, p.currency)}
                          </span>
                          {exactly(c.balanceCents, p.amountCents) && (
                            <span className="rounded border border-emerald-500/40 bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-medium text-emerald-900">
                              Exact
                            </span>
                          )}
                        </label>
                      </li>
                    ))}
                  </ul>
                  <div className="mt-2 flex items-center gap-2">
                    <Button
                      size="sm"
                      disabled={!picked || match.isPending}
                      onClick={() => match.mutate({ paymentId: p.id, invoiceId: picked })}
                    >
                      {match.isPending
                        ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                        : <Link2 className="mr-1 h-3.5 w-3.5" />}
                      Match payment
                    </Button>
                    <p className="text-[11px] text-muted-foreground">
                      Matching moves the invoice and is recorded against your name.
                    </p>
                  </div>
                </>
              )}
              {match.isError && (
                <p role="alert" className="mt-2 text-xs text-status-danger">
                  {(match.error as Error)?.message}
                </p>
              )}
            </div>
          </section>
        );
      })}
    </div>
  );
}
