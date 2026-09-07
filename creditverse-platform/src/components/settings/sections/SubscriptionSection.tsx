/**
 * Settings › Plans & Billing — the organization's actual subscription.
 *
 * Everything on this screen is a real row. The plan comes from `plans`, the
 * subscription from `organization_subscriptions`, the card from a tokenised
 * profile, and every charge from `payment_transactions`. There are no
 * illustrative figures, because a made-up number on a billing screen is worse
 * than an empty one.
 *
 * The card field is Accept.js, hosted by Authorize.Net. The number goes from
 * the keyboard to the processor; this app never receives it, never logs it and
 * has nowhere to store it.
 */
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CreditCard, Loader2, ShieldCheck, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { OpsSelect } from "@/components/ui/ops-select";
import { SectionCard } from "@/components/settings/shared";
import { useAgency } from "@/lib/agency-context";
import { formatDate } from "@/lib/format-date";
import { errorMessage } from "@/lib/data/error-message";
import { usePlans } from "@/lib/data/use-plans";
import {
  PAYMENT_LABEL,
  SUBSCRIPTION_LABEL,
  cancelSubscription,
  chargeOrganization,
  chooseSubscriptionPlan,
  fetchPaymentMethods,
  fetchPaymentTransactions,
  fetchPaymentsConfig,
  fetchSubscription,
  saveCard,
} from "@/lib/data/payments";
import { AcceptJsCardField } from "@/components/settings/sections/AcceptJsCardField";

const money = (cents: number) => `$${(cents / 100).toFixed(2)}`;

export function SubscriptionSection() {
  const { activeOrganization } = useAgency();
  const orgId = activeOrganization?.id ?? null;
  const qc = useQueryClient();
  const plans = usePlans();
  const [interval, setInterval] = useState<"monthly" | "annual">("monthly");
  const [planKey, setPlanKey] = useState("");
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);

  const config = useQuery({ queryKey: ["payments", "config"], queryFn: fetchPaymentsConfig, staleTime: 300_000 });
  const subscription = useQuery({
    queryKey: ["payments", "subscription", orgId],
    queryFn: () => fetchSubscription(orgId as string),
    enabled: !!orgId,
  });
  const methods = useQuery({
    queryKey: ["payments", "methods", orgId],
    queryFn: () => fetchPaymentMethods(orgId as string),
    enabled: !!orgId,
  });
  const transactions = useQuery({
    queryKey: ["payments", "transactions", orgId],
    queryFn: () => fetchPaymentTransactions(orgId as string),
    enabled: !!orgId,
  });

  useEffect(() => {
    if (subscription.data && !planKey) {
      setPlanKey(subscription.data.planKey);
      setInterval(subscription.data.interval);
    }
  }, [subscription.data, planKey]);

  const refresh = () => void qc.invalidateQueries({ queryKey: ["payments"] });

  const choose = useMutation({
    mutationFn: () => chooseSubscriptionPlan(orgId as string, planKey, interval),
    onSuccess: () => {
      setMessage({ text: "Plan chosen. Nothing has been charged — add a card and pay when you are ready.", error: false });
      refresh();
    },
    onError: (e) => setMessage({ text: errorMessage(e, "The plan could not be chosen."), error: true }),
  });

  const pay = useMutation({
    mutationFn: () =>
      chargeOrganization(orgId as string, subscription.data!.priceCents, `${subscription.data!.planKey} · ${subscription.data!.interval}`),
    onSuccess: (r) =>
      setMessage({
        text:
          r.status === "approved"
            ? `Paid ${money(subscription.data!.priceCents)}. Transaction ${r.providerTxnId ?? "recorded"}.`
            : `Not paid: ${r.reason}`,
        error: r.status !== "approved",
      }),
    onError: (e) => setMessage({ text: errorMessage(e, "The charge did not go through."), error: true }),
    onSettled: refresh,
  });

  const cancel = useMutation({
    mutationFn: () => cancelSubscription(orgId as string, false),
    onSuccess: () => {
      setMessage({ text: "It will end at the end of the paid period. Nothing is deleted.", error: false });
      refresh();
    },
    onError: (e) => setMessage({ text: errorMessage(e, "It could not be cancelled."), error: true }),
  });

  const options = useMemo(
    () =>
      (plans.data ?? [])
        .filter((p) => (interval === "annual" ? p.annualCents !== null : p.monthlyCents !== null))
        .map((p) => ({
          value: p.key,
          label: `${p.label} — ${money((interval === "annual" ? p.annualCents : p.monthlyCents) ?? 0)}/${interval === "annual" ? "yr" : "mo"}`,
        })),
    [plans.data, interval],
  );

  if (!orgId) {
    return (
      <SectionCard icon={CreditCard} title="Plans & Billing" description="Choose an organization to see its subscription.">
        <p className="text-xs text-muted-foreground">
          Billing belongs to an organization. Switch into one to see and change its plan.
        </p>
      </SectionCard>
    );
  }

  const sub = subscription.data;
  const card = (methods.data ?? []).find((m) => m.isDefault) ?? null;

  return (
    <div className="space-y-4">
      <SectionCard icon={CreditCard} title="Subscription" description="What this organization is on, and what it costs.">
        {sub ? (
          <div className="mb-3 rounded-lg border border-border bg-background p-3">
            <p className="text-sm font-semibold text-foreground">
              {sub.planKey} · {money(sub.priceCents)}/{sub.interval === "annual" ? "year" : "month"}
              <span
                className={`ml-2 rounded-full border px-2 py-0.5 text-[10px] font-bold ${
                  sub.status === "active"
                    ? "border-emerald-600/30 bg-emerald-500/10 text-status-success"
                    : sub.status === "past_due"
                      ? "border-red-500/30 bg-red-500/10 text-status-danger"
                      : "border-border bg-muted text-muted-foreground"
                }`}
              >
                {SUBSCRIPTION_LABEL[sub.status]}
              </span>
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Period from {formatDate(sub.currentPeriodStart)}
              {sub.currentPeriodEnd ? ` to ${formatDate(sub.currentPeriodEnd)}` : " — not yet paid, so no end date"}
              {sub.cancelAtPeriodEnd ? " · cancelling at period end" : ""} · {sub.seats} seat
              {sub.seats === 1 ? "" : "s"}
            </p>
          </div>
        ) : (
          <p className="mb-3 text-xs text-muted-foreground">No subscription yet. Choose a plan below.</p>
        )}

        <div className="flex flex-wrap items-end gap-2">
          <OpsSelect
            value={interval}
            onValueChange={(v) => setInterval(v as "monthly" | "annual")}
            options={[
              { value: "monthly", label: "Monthly" },
              { value: "annual", label: "Annual" },
            ]}
            aria-label="Billing interval"
          />
          <OpsSelect
            value={planKey}
            onValueChange={setPlanKey}
            options={options.length > 0 ? options : [{ value: "", label: "No plans configured" }]}
            aria-label="Plan"
          />
          <Button type="button" size="sm" disabled={!planKey || choose.isPending} onClick={() => choose.mutate()}>
            {choose.isPending && <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />} Choose this plan
          </Button>
          {sub && !sub.cancelAtPeriodEnd && (
            <Button type="button" size="sm" variant="ghost" disabled={cancel.isPending} onClick={() => cancel.mutate()}>
              Cancel at period end
            </Button>
          )}
        </div>
        {message && (
          <p role="status" className={`mt-3 text-xs ${message.error ? "text-status-danger" : "text-status-success"}`}>
            {message.text}
          </p>
        )}
      </SectionCard>

      <SectionCard icon={ShieldCheck} title="Card on file" description="Held by Authorize.Net. This platform never sees the number.">
        {config.isLoading ? (
          <div className="h-16 animate-pulse rounded-lg bg-muted/40" aria-busy="true" />
        ) : !config.data?.connected ? (
          <p className="flex items-start gap-2 text-xs text-status-warning">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            Payments are not connected yet. Missing: {config.data?.missing.join(", ") ?? "the Authorize.Net keys"}.
          </p>
        ) : (
          <>
            {card && (
              <p className="mb-3 text-sm text-foreground">
                {card.cardBrand ?? "Card"} ending {card.last4 ?? "••••"}
                {card.expMonth && card.expYear ? ` · expires ${card.expMonth}/${card.expYear}` : ""}
              </p>
            )}
            <AcceptJsCardField
              apiLoginId={config.data.apiLoginId as string}
              clientKey={config.data.clientKey as string}
              environment={config.data.environment}
              onToken={async (opaqueData) => {
                try {
                  await saveCard(orgId, opaqueData);
                  setMessage({ text: "Card saved with the processor.", error: false });
                  refresh();
                } catch (e) {
                  setMessage({ text: errorMessage(e, "The card was not saved."), error: true });
                }
              }}
            />
            {config.data.environment === "sandbox" && (
              <p className="mt-2 text-[11px] text-status-warning">
                Sandbox mode — nothing is really charged. Set AUTHNET_ENV to production when you are ready.
              </p>
            )}
            {sub && card && (
              <Button type="button" size="sm" className="mt-3" disabled={pay.isPending} onClick={() => pay.mutate()}>
                {pay.isPending && <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />} Pay {money(sub.priceCents)} now
              </Button>
            )}
          </>
        )}
      </SectionCard>

      <SectionCard icon={CreditCard} title="Payments" description="Every charge, exactly as the processor answered.">
        {(transactions.data ?? []).length === 0 ? (
          <p className="text-xs text-muted-foreground">Nothing charged yet.</p>
        ) : (
          <ul className="divide-y divide-border/60 text-xs">
            {(transactions.data ?? []).map((t) => (
              <li key={t.id} className="flex flex-wrap items-center gap-2 py-2">
                <span className="font-semibold text-foreground">{money(t.amountCents)}</span>
                <span
                  className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${
                    t.status === "approved"
                      ? "border-emerald-600/30 bg-emerald-500/10 text-status-success"
                      : "border-red-500/30 bg-red-500/10 text-status-danger"
                  }`}
                >
                  {PAYMENT_LABEL[t.status]}
                </span>
                {t.description && <span className="text-muted-foreground">{t.description}</span>}
                {t.status !== "approved" && t.responseText && (
                  <span className="text-status-danger">{t.responseText}</span>
                )}
                <span className="ml-auto text-muted-foreground">{formatDate(t.createdAt)}</span>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>
    </div>
  );
}
