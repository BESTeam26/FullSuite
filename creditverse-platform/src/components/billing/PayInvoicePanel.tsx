/**
 * "Pay this invoice" — the panel from Dee's design, 2026-09-17.
 *
 * One component for both sides of the same invoice: the partner paying their
 * own, and BES Finance charging a card on file. Which of the two it is comes
 * from `mode`, and the difference is small on purpose — the money, the
 * idempotency and the result handling are identical, and writing them twice is
 * how they drift.
 *
 * Dee's three capabilities, kept separate as she asked:
 *
 *   Pay by card    a one-time tokenised card. Not saved. The default.
 *   Card on file   a stored Authorize.Net profile, charged on request.
 *   AutoPay        its own switch, off until somebody turns it on. Saving a
 *                  card is NOT consent to charge it, so the two are never one
 *                  control.
 *
 * ── THE DOUBLE CHARGE ─────────────────────────────────────────────────────
 *
 * One idempotency key per checkout, made when the panel mounts and kept for
 * the life of it. A second click, a retry after an error, a refresh that keeps
 * the component alive — all send the same key, and the server answers the
 * second with the first one's result. The button is also disabled while a
 * charge is in the air, but that is a courtesy: the key is the guarantee.
 *
 * ── AND THE ANSWER THAT NEVER CAME ────────────────────────────────────────
 *
 * `unknown` is not an error to retry. It means the processor may have taken
 * the money and we did not hear back, so the panel stops offering to try
 * again and says what is actually happening.
 */
import { useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle, CheckCircle2, Clock, CreditCard, Landmark, Loader2, Lock, ShieldCheck, Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatDate } from "@/lib/format-date";
import { formatMoneyIn } from "@/lib/format-money";
import { cn } from "@/lib/utils";
import { AcceptJsCardField } from "@/components/billing/AcceptJsCardField";
import {
  type ChargeResult, type SavedCard,
  chargeSavedCard, fetchCardPaymentConfig, fetchSavedCard, newIdempotencyKey,
  payInvoiceWithCard, savePartnerCard, setAutopay,
} from "@/lib/data/partner-card-payments";

export interface PayableInvoice {
  id: string;
  invoiceNumber: string;
  dueDate: string;
  currency: string;
  balanceCents: number;
}

type Method = "card" | "paypal" | "wise";

const METHODS: { key: Method; label: string; icon: typeof CreditCard }[] = [
  { key: "card", label: "Pay by Card", icon: CreditCard },
  { key: "paypal", label: "PayPal", icon: Landmark },
  { key: "wise", label: "Wise", icon: Landmark },
];

const cardLabel = (card: SavedCard) =>
  `${card.brand ?? "Card"} •••• ${card.last4 ?? "????"}`;

/** Two digits, because "Expires 9/28" reads like a date nobody wrote. */
const expiryLabel = (card: SavedCard) =>
  card.expMonth && card.expYear
    ? `Expires ${String(card.expMonth).padStart(2, "0")}/${String(card.expYear).slice(-2)}`
    : null;

const Tile = ({ active, onClick, label, icon: Icon }: {
  active: boolean; onClick: () => void; label: string; icon: typeof CreditCard;
}) => (
  <button
    type="button"
    onClick={onClick}
    aria-pressed={active}
    className={cn(
      "flex flex-1 flex-col items-center gap-1.5 rounded-xl border px-3 py-3 text-xs font-semibold transition",
      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2",
      active
        ? "border-primary bg-primary/10 text-primary"
        : "border-border bg-card text-muted-foreground hover:border-primary/40 hover:bg-muted hover:text-foreground",
    )}
  >
    <Icon className="h-4 w-4" />
    {label}
  </button>
);

const Note = ({ tone, icon: Icon, title, children }: {
  tone: "info" | "good" | "warn" | "bad";
  icon: typeof CheckCircle2; title: string; children?: React.ReactNode;
}) => (
  <div
    role={tone === "bad" || tone === "warn" ? "alert" : undefined}
    className={cn(
      "flex gap-2 rounded-lg border px-3 py-2.5 text-xs",
      tone === "info" && "border-border bg-muted text-foreground",
      tone === "good" && "border-emerald-500/40 bg-emerald-500/10 text-emerald-900",
      tone === "warn" && "border-amber-500/40 bg-amber-500/10 text-amber-900",
      tone === "bad" && "border-red-500/40 bg-red-500/10 text-red-900",
    )}
  >
    <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0" />
    <div className="min-w-0">
      <p className="font-semibold">{title}</p>
      {children && <div className="mt-0.5 opacity-90">{children}</div>}
    </div>
  </div>
);

export function PayInvoicePanel({
  groupId,
  invoice,
  mode = "partner",
  otherWaysToPay,
}: {
  groupId: string;
  invoice: PayableInvoice;
  /** `partner` pays their own invoice; `finance` charges a card on file. */
  mode?: "partner" | "finance";
  otherWaysToPay?: { label: string; instructions: string | null }[];
}) {
  const qc = useQueryClient();
  const [method, setMethod] = useState<Method>("card");
  const [useSaved, setUseSaved] = useState(mode === "finance");
  const [saveForLater, setSaveForLater] = useState(false);
  const [result, setResult] = useState<ChargeResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  /* One key for the life of this panel. The single most important line here:
     every retry of THIS checkout carries it, so the second charge cannot
     happen. A new key only exists when the panel is mounted again. */
  const idempotencyKey = useRef(newIdempotencyKey(invoice.id)).current;

  const config = useQuery({
    queryKey: ["billing", "card-config"],
    queryFn: fetchCardPaymentConfig,
    staleTime: 5 * 60_000,
  });
  const saved = useQuery({
    queryKey: ["billing", "saved-card"],
    queryFn: fetchSavedCard,
    staleTime: 60_000,
  });

  const amount = formatMoneyIn(invoice.balanceCents / 100, invoice.currency);
  const settled = (r: ChargeResult) => {
    setResult(r);
    if (r.status === "approved") {
      /* Everything downstream of a payment: the invoice, the balance, the
         ledger, the portal summary. Invalidated rather than patched, because
         the database recomputed them and this component did not. */
      void qc.invalidateQueries({ queryKey: ["portal", "billing"] });
      void qc.invalidateQueries({ queryKey: ["partner-billing"] });
      void qc.invalidateQueries({ queryKey: ["finance"] });
    }
  };

  const payWithNewCard = useMutation({
    mutationFn: (opaqueData: { dataDescriptor: string; dataValue: string }) =>
      payInvoiceWithCard({
        groupId, invoiceId: invoice.id, amountCents: invoice.balanceCents,
        idempotencyKey, opaqueData,
      }),
    onSuccess: settled,
    onError: (e: Error) => setError(e.message),
  });

  const payWithSavedCard = useMutation({
    mutationFn: () =>
      chargeSavedCard({
        groupId, invoiceId: invoice.id, amountCents: invoice.balanceCents, idempotencyKey,
      }),
    onSuccess: (r) => { setConfirming(false); settled(r); },
    onError: (e: Error) => { setConfirming(false); setError(e.message); },
  });

  const autopay = useMutation({
    mutationFn: (enabled: boolean) => setAutopay(groupId, enabled),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["billing", "saved-card"] }),
    onError: (e: Error) => setError(e.message),
  });

  const busy = payWithNewCard.isPending || payWithSavedCard.isPending || autopay.isPending;
  const card = saved.data;

  /* The invoice is settled. Nothing else on this panel matters. */
  if (result?.status === "approved") {
    return (
      <section className="rounded-xl border border-emerald-500/40 bg-emerald-500/5 p-4">
        <Note tone="good" icon={CheckCircle2} title={`${amount} paid`}>
          <p>
            {invoice.invoiceNumber} is settled. A receipt is on its way
            {result.providerTxnId ? <> · reference {result.providerTxnId}</> : null}.
          </p>
        </Note>
      </section>
    );
  }

  /* The answer never came back. Offering "try again" here is exactly how
     somebody gets billed twice, so the panel does not offer it. */
  if (result?.status === "unknown") {
    return (
      <section className="rounded-xl border border-amber-500/40 bg-amber-500/5 p-4">
        <Note tone="warn" icon={Clock} title="We are confirming this payment">
          <p>
            The card processor did not answer in time, so we do not yet know whether {amount} was
            taken. Please do not try again — BES is checking, and this invoice will update itself
            within a few minutes.
          </p>
        </Note>
      </section>
    );
  }

  return (
    <section className="space-y-3">
      {/* ── Pay this invoice ─────────────────────────────────────────── */}
      <div className="rounded-xl border border-border bg-card p-4">
        <header className="mb-3 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-bold text-foreground">
              {mode === "finance" ? "Charge this invoice" : "Pay this invoice"}
            </h2>
            <p className="text-xs text-muted-foreground">Choose a payment method</p>
          </div>
          <div className="text-right">
            <p className="text-xl font-bold tabular-nums text-foreground">{amount}</p>
            <p className="text-[11px] text-muted-foreground">Due {formatDate(invoice.dueDate)}</p>
          </div>
        </header>

        {(otherWaysToPay?.length ?? 0) > 0 || mode === "partner" ? (
          <div className="mb-3 flex gap-2">
            {METHODS.map((m) => (
              <Tile key={m.key} active={method === m.key} onClick={() => setMethod(m.key)} label={m.label} icon={m.icon} />
            ))}
          </div>
        ) : null}

        {method !== "card" ? (
          <Note tone="info" icon={Landmark} title={`${method === "paypal" ? "PayPal" : "Wise"} is recorded by hand`}>
            <p>
              {otherWaysToPay?.find((w) => w.label.toLowerCase().includes(method))?.instructions
                ?? "Send the payment as arranged, then BES records it against this invoice. "
                 + "It is not confirmed automatically."}
            </p>
          </Note>
        ) : !config.data ? (
          <p className="flex items-center gap-2 py-4 text-xs text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Checking card payment…
          </p>
        ) : !config.data.connected ? (
          <Note tone="warn" icon={AlertTriangle} title="Card payment is not connected yet">
            <p>
              BES has not finished connecting Authorize.Net
              {config.data.missing.length ? <> ({config.data.missing.join(", ")} missing)</> : null}.
              Use one of the other methods for now.
            </p>
          </Note>
        ) : useSaved && card ? (
          <div className="space-y-3">
            <Note tone="info" icon={CreditCard} title={`Charge ${cardLabel(card)}`}>
              <p>{expiryLabel(card) ?? "This card is on file with Authorize.Net."}</p>
            </Note>
            {confirming ? (
              /* Dee asked for a confirmation before a merchant-initiated
                 charge. It also happens to be the moment a double click
                 lands harmlessly on a dialog instead of the processor. */
              <div className="rounded-lg border border-border bg-muted p-3">
                <p className="text-xs font-semibold text-foreground">
                  Charge {amount} to {cardLabel(card)}?
                </p>
                <div className="mt-2 flex gap-2">
                  <Button type="button" size="sm" variant="outline" onClick={() => setConfirming(false)} disabled={busy}>
                    Cancel
                  </Button>
                  <Button type="button" size="sm" onClick={() => payWithSavedCard.mutate()} disabled={busy}>
                    {busy ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Lock className="mr-1 h-3.5 w-3.5" />}
                    Charge card
                  </Button>
                </div>
              </div>
            ) : (
              <Button type="button" className="w-full" onClick={() => setConfirming(true)} disabled={busy}>
                <Lock className="mr-1.5 h-3.5 w-3.5" /> Pay {amount} with {cardLabel(card)}
              </Button>
            )}
            <button
              type="button"
              className="text-xs font-semibold text-primary underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              onClick={() => setUseSaved(false)}
            >
              Use another card
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            <Note tone="info" icon={CreditCard} title="One-time card payment">
              <p>Pay this invoice once. Your card will not be saved.</p>
            </Note>
            <AcceptJsCardField
              apiLoginId={config.data.apiLoginId!}
              clientKey={config.data.clientKey!}
              environment={config.data.environment}
              submitLabel={`Pay ${amount}`}
              busyLabel="Paying…"
              onToken={async (opaqueData, facts) => {
                setError(null);
                /* Saving is a separate, deliberate act — and it happens first,
                   because a nonce is single-use: one nonce cannot both create
                   a profile and pay. Saving creates the profile, and the
                   charge then goes to the saved card. */
                if (saveForLater) {
                  try {
                    await savePartnerCard({ groupId, opaqueData, card: facts });
                    await qc.invalidateQueries({ queryKey: ["billing", "saved-card"] });
                    const r = await chargeSavedCard({
                      groupId, invoiceId: invoice.id,
                      amountCents: invoice.balanceCents, idempotencyKey,
                    });
                    settled(r);
                  } catch (e) {
                    setError(e instanceof Error ? e.message : "The payment could not be completed.");
                  }
                  return;
                }
                await payWithNewCard.mutateAsync(opaqueData).catch(() => undefined);
              }}
            />
            {mode === "partner" && (
              <label className="flex items-start gap-2 text-xs text-foreground">
                <input
                  type="checkbox"
                  checked={saveForLater}
                  onChange={(e) => setSaveForLater(e.target.checked)}
                  className="mt-0.5 h-3.5 w-3.5 rounded border-border text-primary focus:ring-primary"
                />
                <span>Save this card for future payments</span>
              </label>
            )}
            {card && (
              <button
                type="button"
                className="text-xs font-semibold text-primary underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                onClick={() => setUseSaved(true)}
              >
                Use saved card ({cardLabel(card)})
              </button>
            )}
          </div>
        )}

        {result && (
          <div className="mt-3">
            <Note tone="bad" icon={AlertTriangle} title={result.status === "held_for_review" ? "Held for review" : "The card was declined"}>
              <p>{result.reason ?? "The card processor did not accept this payment."}</p>
              <p className="mt-1">This invoice is still unpaid. Try another card, or use another method.</p>
            </Note>
          </div>
        )}
        {error && (
          <div className="mt-3">
            <Note tone="bad" icon={AlertTriangle} title="That did not go through">
              <p>{error}</p>
            </Note>
          </div>
        )}

        {method === "card" && config.data?.connected && (
          <p className="mt-3 flex items-center justify-center gap-1.5 text-[11px] text-muted-foreground">
            <Lock className="h-3 w-3" />
            Secure payment powered by Authorize.Net
            {config.data.environment !== "production" && (
              <span className="ml-1 rounded border border-amber-500/40 bg-amber-500/10 px-1.5 py-0.5 font-bold uppercase tracking-wider text-amber-900">
                Test mode
              </span>
            )}
          </p>
        )}
      </div>

      {/* ── Saved card and AutoPay ───────────────────────────────────── */}
      {mode === "partner" && (
        <div className="rounded-xl border border-border bg-card p-4">
          <h3 className="mb-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
            Saved payment method
          </h3>
          {saved.isPending ? (
            <p className="text-xs text-muted-foreground">Loading…</p>
          ) : saved.isError ? (
            <Note tone="warn" icon={AlertTriangle} title="We couldn't load your saved card">
              <button
                type="button"
                className="font-semibold underline underline-offset-2"
                onClick={() => void saved.refetch()}
              >
                Retry
              </button>
            </Note>
          ) : !card ? (
            <p className="text-xs text-muted-foreground">
              No card saved. Tick “Save this card for future payments” when you pay, and it will
              appear here.
            </p>
          ) : (
            <div className="flex items-center gap-3 rounded-lg border border-border bg-muted/50 px-3 py-2.5">
              <CreditCard className="h-4 w-4 shrink-0 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold text-foreground">{cardLabel(card)}</p>
                <p className="text-[11px] text-muted-foreground">{expiryLabel(card) ?? "On file"}</p>
              </div>
              <span className="rounded border border-border bg-card px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                Default
              </span>
            </div>
          )}

          <div className="mt-3 flex items-start gap-3 border-t border-border pt-3">
            <Zap className={cn("mt-0.5 h-4 w-4 shrink-0", card?.autopayEnabled ? "text-emerald-600" : "text-muted-foreground")} />
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold text-foreground">
                AutoPay is currently {card?.autopayEnabled ? "ON" : "OFF"}
              </p>
              <p className="text-[11px] text-muted-foreground">
                {card?.autopayEnabled
                  ? "Open invoices will be charged to this card on their due date. Paying early stops AutoPay taking it again."
                  : "Turn on AutoPay to have future invoices charged automatically when they fall due."}
              </p>
              {card?.autopayEnabled && card.autopayEnabledAt && (
                <p className="mt-0.5 text-[11px] text-muted-foreground">
                  Turned on {formatDate(card.autopayEnabledAt)}
                  {card.autopayEnabledBy ? ` by ${card.autopayEnabledBy}` : ""}.
                </p>
              )}
            </div>
            <Button
              type="button"
              size="sm"
              variant={card?.autopayEnabled ? "outline" : "default"}
              disabled={!card || busy}
              onClick={() => autopay.mutate(!card?.autopayEnabled)}
            >
              {autopay.isPending && <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />}
              {card?.autopayEnabled ? "Turn off AutoPay" : "Enable AutoPay"}
            </Button>
          </div>
        </div>
      )}

      {mode === "partner" && (
        <div className="flex gap-2 rounded-xl border border-border bg-muted/40 px-3 py-2.5">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
          <div>
            <p className="text-xs font-semibold text-foreground">Your payments are secure</p>
            <p className="text-[11px] text-muted-foreground">
              Card details go from your browser straight to Authorize.Net. BES never receives your
              card number, and there is nowhere in our system that could store one.
            </p>
          </div>
        </div>
      )}
    </section>
  );
}
