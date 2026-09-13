/**
 * The partner's billing page: what they owe, what they have paid, what they
 * have left, and — when it applies — why their work has stopped.
 *
 * Dee, 2026-09-13: "If suspended, show prominently: Account Suspended -
 * Payment Required… Suspended Partners must still retain access to Billing and
 * Contact BES."
 *
 * So the suspension banner leads, and everything below it keeps working. This
 * is the screen a delinquent partner has to be able to reach; locking them out
 * of it is locking them out of fixing it.
 *
 * Every figure comes from the canonical ledger through definer functions that
 * take no id. Nothing here is typed in, and nothing here can be reached by
 * guessing at somebody else's.
 */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle, CalendarClock, CreditCard, FileText, Loader2, MessageSquare, Wallet,
} from "lucide-react";
import { useAuth } from "@/lib/auth/auth-context";
import { formatDate } from "@/lib/format-date";
import { formatMoneyIn } from "@/lib/format-money";
import { cn } from "@/lib/utils";
import {
  creditUnitLabel, fetchPortalAccountCredit, fetchPortalBilling, fetchPortalInvoices,
  fetchPortalPaymentMethods, fetchPortalPayments, fetchPortalProcessingCredits,
} from "@/lib/data/portal-billing";

const STATUS_TONE: Record<string, string> = {
  paid: "border-emerald-500/40 bg-emerald-500/10 text-emerald-900",
  partially_paid: "border-amber-500/40 bg-amber-500/10 text-amber-900",
  overdue: "border-red-500/40 bg-red-500/10 text-red-900",
  sent: "border-border bg-muted text-foreground",
  scheduled: "border-border bg-muted text-muted-foreground",
  void: "border-border bg-muted text-muted-foreground",
  cancelled: "border-border bg-muted text-muted-foreground",
  refunded: "border-sky-500/40 bg-sky-500/10 text-sky-900",
};
const STATUS_LABEL: Record<string, string> = {
  paid: "Paid", partially_paid: "Partially paid", overdue: "Past due", sent: "Open",
  scheduled: "Scheduled", void: "Void", cancelled: "Cancelled", refunded: "Refunded",
};

const Panel = ({ icon: Icon, title, children }: {
  icon: typeof Wallet; title: string; children: React.ReactNode;
}) => (
  <section className="rounded-xl border border-border bg-card p-4">
    <h2 className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
      <Icon className="h-3.5 w-3.5" /> {title}
    </h2>
    {children}
  </section>
);

export function PortalBilling({ onContactBes }: { onContactBes?: () => void }) {
  const auth = useAuth();
  /* Four sections, one page. Dee: "Keep Billing as ONE main menu item… inside
     Billing use Invoices | Payments | Credits | Billing Settings." */
  const [tab, setTab] = useState<"invoices" | "payments" | "credits" | "settings">("invoices");
  const live = auth.mode === "live" && auth.status === "signed-in";
  const opts = { enabled: live, staleTime: 60_000 };

  const summary = useQuery({ queryKey: ["portal", "billing", "summary"], queryFn: fetchPortalBilling, ...opts });
  const invoices = useQuery({ queryKey: ["portal", "billing", "invoices"], queryFn: fetchPortalInvoices, ...opts });
  const payments = useQuery({ queryKey: ["portal", "billing", "payments"], queryFn: fetchPortalPayments, ...opts });
  /* Two separate reads, because they are two separate ledgers. Money and
     rounds are never summed, never shown in one figure, and never both called
     "credits" (Dee, 2026-09-13). */
  const accountCredit = useQuery({ queryKey: ["portal", "billing", "account-credit"], queryFn: fetchPortalAccountCredit, ...opts });
  const credits = useQuery({ queryKey: ["portal", "billing", "processing-credits"], queryFn: fetchPortalProcessingCredits, ...opts });
  const methods = useQuery({ queryKey: ["portal", "billing", "methods"], queryFn: fetchPortalPaymentMethods, ...opts });

  if (summary.isLoading) {
    return (
      <section className="rounded-xl border border-border bg-card p-4">
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading your billing…
        </p>
      </section>
    );
  }

  const s = summary.data;
  if (!s) {
    return (
      <section className="rounded-xl border border-border bg-card p-4">
        <p className="text-sm text-muted-foreground">
          There is no billing set up for your account yet. Your BES contact can answer any question
          about invoices in the meantime.
        </p>
      </section>
    );
  }

  const currency = invoices.data?.[0]?.currency ?? "USD";
  const processingAvailable = (credits.data ?? []).reduce((n, c) => n + c.available, 0);

  return (
    <div className="space-y-3">
      {s.suspended && (
        <section className="rounded-xl border-2 border-red-500/50 bg-red-500/5 p-4">
          <h2 className="flex items-center gap-2 text-sm font-bold text-red-900">
            <AlertTriangle className="h-4 w-4 shrink-0" /> Account suspended — payment required
          </h2>
          <p className="mt-1 text-sm text-foreground">
            Work on your account is paused while {formatMoneyIn(s.overdueCents / 100, currency)} remains
            outstanding{s.overdueInvoices > 0 && ` across ${s.overdueInvoices} overdue ${s.overdueInvoices === 1 ? "invoice" : "invoices"}`}.
            Nothing has been deleted — your clients, files and history are all exactly where they were,
            and work resumes as soon as the balance is settled.
          </p>
          {s.suspensionDetail && (
            <p className="mt-1 text-[11px] text-muted-foreground">{s.suspensionDetail}</p>
          )}
          <p className="mt-2 text-xs text-foreground">
            <span className="font-semibold">To pay:</span> {s.paymentMethods}. Quote your invoice number
            as the payment reference so it can be matched.
          </p>
          {onContactBes && (
            <button
              type="button"
              onClick={onContactBes}
              className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <MessageSquare className="h-3.5 w-3.5" /> Contact BES
            </button>
          )}
        </section>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <div className={cn(
          "rounded-xl border bg-card p-4",
          s.balanceCents > 0 ? "border-amber-500/40" : "border-border",
        )}>
          <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
            <Wallet className="h-3.5 w-3.5" /> Current balance
          </p>
          <p className={cn("mt-1 text-2xl font-bold",
            s.balanceCents > 0 ? "text-foreground" : "text-status-success")}>
            {formatMoneyIn(s.balanceCents / 100, currency)}
          </p>
          <p className="text-[11px] text-muted-foreground">
            {s.balanceCents > 0 ? "due" : "nothing outstanding"}
          </p>
        </div>

        <div className="rounded-xl border border-border bg-card p-4">
          <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
            <CalendarClock className="h-3.5 w-3.5" /> Next billing
          </p>
          <p className="mt-1 text-2xl font-bold text-foreground">
            {s.nextBillingOn ? formatDate(s.nextBillingOn) : "—"}
          </p>
          <p className="text-[11px] text-muted-foreground">
            {s.nextBillingCents > 0 ? formatMoneyIn(s.nextBillingCents / 100, currency) : "no recurring agreement"}
          </p>
        </div>

        <div className="rounded-xl border border-border bg-card p-4">
          <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
            <CreditCard className="h-3.5 w-3.5" /> Payment method
          </p>
          <p className="mt-1 text-sm font-semibold text-foreground">{s.paymentMethods}</p>
          <p className="text-[11px] text-muted-foreground">use your invoice number as the reference</p>
        </div>

        {/* The two ledgers, side by side and never merged. Money and rounds
            are different units, so they are different cards with different
            words — Dee, 2026-09-13. */}
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
            <Wallet className="h-3.5 w-3.5" /> Account credit
          </p>
          <p className={cn("mt-1 text-2xl font-bold",
            (accountCredit.data?.availableCents ?? 0) > 0 ? "text-status-success" : "text-muted-foreground")}>
            {formatMoneyIn((accountCredit.data?.availableCents ?? 0) / 100, accountCredit.data?.currency ?? currency)}
          </p>
          <p className="text-[11px] text-muted-foreground">money on your account</p>
        </div>

        <div className="rounded-xl border border-border bg-card p-4">
          <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
            <CreditCard className="h-3.5 w-3.5" /> Processing credits
          </p>
          <p className={cn("mt-1 text-2xl font-bold tabular-nums",
            processingAvailable > 0 ? "text-foreground" : "text-muted-foreground")}>
            {processingAvailable}
          </p>
          <p className="text-[11px] text-muted-foreground">rounds available</p>
        </div>
      </div>

      <nav aria-label="Billing sections" className="flex gap-1 overflow-x-auto border-b border-border">
        {(["invoices", "payments", "credits", "settings"] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            aria-current={tab === t ? "page" : undefined}
            className={cn(
              "shrink-0 border-b-2 px-3.5 py-2 text-xs font-bold capitalize transition-colors",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              tab === t ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {t === "settings" ? "Billing settings" : t}
          </button>
        ))}
      </nav>

      {/* ── PAY NOW ────────────────────────────────────────────────────────
          Exactly the methods BES turned on for this partner, with the
          instructions they wrote. Wise and PayPal are Personal accounts with
          no API to generate a charge from, so these are instructions and a
          link rather than a button that would pretend to take money. */}
      {(methods.data ?? []).length > 0 && (
        <Panel icon={CreditCard} title={s.balanceCents > 0 ? "Pay now" : "How to pay"}>
          <ul className="space-y-2">
            {(methods.data ?? []).map((m) => (
              <li key={m.method} className="rounded-lg border border-border bg-muted/30 p-3">
                <p className="text-sm font-semibold text-foreground">{m.label}</p>
                {m.instructions && (
                  <p className="mt-0.5 whitespace-pre-wrap text-xs leading-relaxed text-muted-foreground">
                    {m.instructions}
                  </p>
                )}
                {m.payUrl && (
                  <a
                    href={m.payUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <CreditCard className="h-3.5 w-3.5" /> {m.label}
                  </a>
                )}
                {m.method === "authorize_net_autopay" && (
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    AutoPay is arranged with BES. Nothing is charged without an invoice being raised first.
                  </p>
                )}
              </li>
            ))}
          </ul>
          <p className="mt-2 rounded-lg border border-amber-500/40 bg-amber-500/5 px-3 py-2 text-[11px] text-amber-900">
            Please include your invoice number — for example <strong>INV-0512</strong> — as the payment
            reference, so it can be matched to the right invoice.
          </p>
        </Panel>
      )}

      {tab === "invoices" && (
      <Panel icon={FileText} title="Invoices">
        {invoices.isLoading ? (
          <p className="py-4"><Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /></p>
        ) : (invoices.data ?? []).length === 0 ? (
          <p className="py-4 text-center text-sm text-muted-foreground">No invoices yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[36rem] text-left text-xs">
              <thead>
                <tr className="border-b border-border/60">
                  <th className="py-1.5 pr-3 font-semibold text-muted-foreground">Invoice</th>
                  <th className="py-1.5 pr-3 font-semibold text-muted-foreground">Issued</th>
                  <th className="py-1.5 pr-3 font-semibold text-muted-foreground">Due</th>
                  <th className="py-1.5 pr-3 text-right font-semibold text-muted-foreground">Amount</th>
                  <th className="py-1.5 pr-3 text-right font-semibold text-muted-foreground">Balance</th>
                  <th className="py-1.5 font-semibold text-muted-foreground">Status</th>
                </tr>
              </thead>
              <tbody>
                {(invoices.data ?? []).map((i) => (
                  <tr key={i.id} className="border-b border-border/40 last:border-b-0">
                    <td className="py-1.5 pr-3 font-medium text-foreground">
                      {i.invoiceNumber}
                      {i.periodKey && <span className="ml-1.5 text-muted-foreground">{i.periodKey}</span>}
                    </td>
                    <td className="py-1.5 pr-3 text-muted-foreground">{formatDate(i.issueDate)}</td>
                    <td className="py-1.5 pr-3 text-muted-foreground">{formatDate(i.dueDate)}</td>
                    <td className="py-1.5 pr-3 text-right tabular-nums text-foreground">
                      {formatMoneyIn(i.totalCents / 100, i.currency)}
                    </td>
                    <td className={cn("py-1.5 pr-3 text-right tabular-nums",
                      i.balanceCents > 0 ? "font-semibold text-foreground" : "text-muted-foreground")}>
                      {formatMoneyIn(i.balanceCents / 100, i.currency)}
                    </td>
                    <td className="py-1.5">
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
      </Panel>
      )}

      {tab === "payments" && (
      <Panel icon={Wallet} title="Payments received">
        {(payments.data ?? []).length === 0 ? (
          <p className="py-4 text-center text-sm text-muted-foreground">
            No payments recorded yet. Once BES receives and matches a payment it appears here.
          </p>
        ) : (
          <ul className="divide-y divide-border/50">
            {(payments.data ?? []).map((p) => (
              <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 py-1.5">
                <span className="min-w-0">
                  <span className="block text-sm font-semibold text-foreground">
                    {formatMoneyIn(p.amountCents / 100, p.currency)}
                    {p.status === "refunded" && <span className="ml-1.5 text-xs font-normal text-muted-foreground">refunded</span>}
                  </span>
                  <span className="block text-[11px] text-muted-foreground">
                    {formatDate(p.paidOn)}
                    {p.method && ` · ${p.method}`}
                    {p.invoiceNumber && ` · ${p.invoiceNumber}`}
                    {p.reference && ` · ${p.reference}`}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </Panel>
      )}

      {tab === "credits" && (accountCredit.data?.history.length ?? 0) > 0 && (
        <Panel icon={Wallet} title="Account credit — money on your account">
          <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
            <span className="text-[11px] text-muted-foreground">Added <span className="font-medium text-foreground">{formatMoneyIn((accountCredit.data?.addedCents ?? 0) / 100, accountCredit.data?.currency ?? currency)}</span></span>
            <span className="text-[11px] text-muted-foreground">Used <span className="font-medium text-foreground">{formatMoneyIn((accountCredit.data?.usedCents ?? 0) / 100, accountCredit.data?.currency ?? currency)}</span></span>
            <span className="text-[11px] text-muted-foreground">Available <span className="font-bold text-foreground">{formatMoneyIn((accountCredit.data?.availableCents ?? 0) / 100, accountCredit.data?.currency ?? currency)}</span></span>
          </div>
          <ul className="mt-1.5 divide-y divide-border/40">
            {(accountCredit.data?.history ?? []).slice(0, 10).map((h, n) => (
              <li key={`ac-${n}`} className="flex items-center justify-between gap-2 py-1">
                <span className="min-w-0 flex-1 truncate text-[11px] text-foreground">{h.description ?? h.kind}</span>
                <span className="shrink-0 text-[11px] text-muted-foreground">{formatDate(h.at?.slice(0, 10))}</span>
                <span className={cn("w-20 shrink-0 text-right text-[11px] font-semibold tabular-nums",
                  h.amountCents > 0 ? "text-status-success" : "text-foreground")}>
                  {h.amountCents > 0 ? "+" : "−"}{formatMoneyIn(Math.abs(h.amountCents) / 100, accountCredit.data?.currency ?? currency)}
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-1.5 text-[11px] text-muted-foreground">
            This is money, and it is applied to invoices. It is not the same thing as processing credits.
          </p>
        </Panel>
      )}

      {tab === "credits" && (credits.data ?? []).length > 0 && (
        <Panel icon={CreditCard} title="Processing credits — rounds you have bought">
          {(credits.data ?? []).map((c) => (
            <div key={c.unit} className="mb-3 last:mb-0">
              <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
                <span className="text-sm font-semibold capitalize text-foreground">{creditUnitLabel(c.unit)}</span>
                <span className="text-[11px] text-muted-foreground">Purchased <span className="font-medium text-foreground">{c.added}</span></span>
                <span className="text-[11px] text-muted-foreground">Used <span className="font-medium text-foreground">{c.used}</span></span>
                <span className="text-[11px] text-muted-foreground">Available <span className="font-bold text-foreground">{c.available}</span></span>
              </div>
              {c.history.length > 0 && (
                <ul className="mt-1.5 divide-y divide-border/40">
                  {c.history.slice(0, 10).map((h, n) => (
                    <li key={`${c.unit}-${n}`} className="flex items-center justify-between gap-2 py-1">
                      <span className="min-w-0 flex-1 truncate text-[11px] text-foreground">
                        {h.description ?? h.kind}
                      </span>
                      <span className="shrink-0 text-[11px] text-muted-foreground">{formatDate(h.at?.slice(0, 10))}</span>
                      <span className={cn("w-10 shrink-0 text-right text-[11px] font-semibold tabular-nums",
                        h.quantity > 0 ? "text-status-success" : "text-foreground")}>
                        {h.quantity > 0 ? `+${h.quantity}` : h.quantity}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </Panel>
      )}

      {tab === "credits"
        && (accountCredit.data?.history.length ?? 0) === 0
        && (credits.data ?? []).length === 0 && (
        <div className="rounded-xl border border-dashed border-border bg-muted/20 px-6 py-10 text-center">
          <Wallet className="mx-auto mb-2 h-5 w-5 text-muted-foreground" />
          <p className="text-sm font-semibold text-foreground">No credits on your account</p>
          <p className="mx-auto mt-1 max-w-md text-xs text-muted-foreground">
            Account credit is money held for you — from an overpayment, for instance. Processing
            credits are rounds bought in advance. They are different things and neither is on your
            account yet.
          </p>
        </div>
      )}

      {/* ── BILLING SETTINGS ───────────────────────────────────────────────
          Partner-safe only: how and when they are billed, and how to pay.
          Rates, margins and the commercial terms behind them are BES's and
          stay on the internal side (Dee, 2026-09-13). */}
      {tab === "settings" && (
        <Panel icon={CalendarClock} title="Billing settings">
          <dl className="grid gap-3 sm:grid-cols-2">
            <div>
              <dt className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Next billing date</dt>
              <dd className="mt-0.5 text-sm text-foreground">
                {s.nextBillingOn ? formatDate(s.nextBillingOn) : "No recurring agreement"}
              </dd>
            </div>
            <div>
              <dt className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Expected amount</dt>
              <dd className="mt-0.5 text-sm text-foreground">
                {s.nextBillingCents > 0 ? formatMoneyIn(s.nextBillingCents / 100, currency) : "—"}
              </dd>
            </div>
            <div>
              <dt className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Payment methods</dt>
              <dd className="mt-0.5 text-sm text-foreground">{s.paymentMethods}</dd>
            </div>
            <div>
              <dt className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">AutoPay</dt>
              <dd className="mt-0.5 text-sm text-foreground">
                {(methods.data ?? []).some((m) => m.method === "authorize_net_autopay")
                  ? "On — BES collects automatically once an invoice is raised"
                  : "Off — invoices are paid manually"}
              </dd>
            </div>
          </dl>

          {(methods.data ?? []).filter((m) => m.instructions || m.payUrl).length > 0 && (
            <div className="mt-3 space-y-2">
              <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                Payment instructions
              </p>
              {(methods.data ?? []).filter((m) => m.instructions || m.payUrl).map((m) => (
                <div key={m.method} className="rounded-lg border border-border bg-muted/30 p-3">
                  <p className="text-sm font-semibold text-foreground">{m.label}</p>
                  {m.instructions && (
                    <p className="mt-0.5 whitespace-pre-wrap text-xs leading-relaxed text-muted-foreground">
                      {m.instructions}
                    </p>
                  )}
                  {m.payUrl && (
                    <a href={m.payUrl} target="_blank" rel="noopener noreferrer"
                      className="mt-1.5 inline-block text-xs font-medium text-primary hover:underline">
                      {m.payUrl}
                    </a>
                  )}
                </div>
              ))}
            </div>
          )}

          <p className="mt-3 text-[11px] text-muted-foreground">
            To change how you pay, message BES — payment details are never entered or stored here.
          </p>
        </Panel>
      )}

      <p className="text-[11px] text-muted-foreground">
        Processing credits are units of work, not money — they are separate from account credit above.
        Every figure here is calculated from your invoices and the payments recorded against them.
        If something looks wrong, contact BES and it can be checked against the same records.
      </p>
    </div>
  );
}
