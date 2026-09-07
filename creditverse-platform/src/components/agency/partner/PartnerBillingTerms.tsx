/**
 * The commercial terms of each service, effective-dated.
 *
 * Changing a rate does not overwrite the old one: a new row starts on a date
 * and the previous row closes the day before. That is why the form asks
 * "effective from" rather than just taking today — a rate rising on 1 October
 * must leave September's invoices alone (Dee, §29-30).
 */
import { useState } from "react";
import { Loader2, Pencil } from "lucide-react";
import { ContentCard } from "@/components/dashboard/DivisionLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { OpsSelect } from "@/components/ui/ops-select";
import { Empty, Pill } from "@/components/agency/partner/partner-ui";
import { usePartnerCatalogues, usePartnerServiceActions } from "@/lib/data/use-partner-services";
import { normalizeToMonthly, revenueClass } from "@/lib/partners/billing-engine";
import type { PartnerBilling, PartnerService } from "@/lib/data/partner-services";
import { formatMoney } from "@/lib/format-money";
import { formatDate } from "@/lib/format-date";

const BILLING_STATUSES = [
  { value: "active", label: "Active" },
  { value: "invoice_pending", label: "Invoice sent — awaiting payment" },
  { value: "overdue", label: "Overdue" },
  { value: "paused", label: "Paused" },
  { value: "cancelled", label: "Cancelled" },
];
const STATUS_TONE: Record<string, string> = {
  active: "border-emerald-500/30 bg-emerald-500/10 text-emerald-700",
  invoice_pending: "border-blue-500/30 bg-blue-500/10 text-blue-700",
  overdue: "border-red-500/40 bg-red-500/10 text-red-800",
  paused: "border-amber-500/40 bg-amber-500/10 text-amber-800",
  cancelled: "border-border bg-muted text-muted-foreground",
};
const money = (cents: number | null | undefined) =>
  cents === null || cents === undefined ? "—" : formatMoney(cents / 100);

export function PartnerBillingTerms({ groupId, services, billing, canEdit }: {
  groupId: string;
  services: PartnerService[];
  billing: Record<string, PartnerBilling>;
  canEdit: boolean;
}) {
  const catalogues = usePartnerCatalogues();
  const actions = usePartnerServiceActions(groupId);
  const [editing, setEditing] = useState<string | null>(null);
  const models = catalogues.data?.billingModels ?? [];
  const channels = catalogues.data?.paymentChannels ?? [];

  return (
    <ContentCard title="Billing terms">
      {services.length === 0 ? (
        <Empty title="Add a service first"
          hint="Terms hang off a service engagement, because a partner with three services has three sets of terms and one of them may be a fixed-price build." />
      ) : (
        <ul className="divide-y divide-border/50">
          {services.map((s) => {
            const b = billing[s.id];
            const model = models.find((m) => m.code === b?.billingModel);
            const kind = revenueClass(b?.billingModel ?? null);
            const runRate = kind === "fixed_recurring"
              ? normalizeToMonthly(b?.rateCents ?? null, b?.billingModel ?? null) : null;
            return (
              <li key={s.id} className="py-2.5">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="flex flex-wrap items-center gap-2 text-sm font-semibold text-foreground">
                      {s.name}
                      {b?.billingStatus && (
                        <Pill tone={STATUS_TONE[b.billingStatus] ?? STATUS_TONE.cancelled}>
                          {BILLING_STATUSES.find((x) => x.value === b.billingStatus)?.label ?? b.billingStatus}
                        </Pill>
                      )}
                    </p>
                    {b ? (
                      <>
                        <p className="text-xs text-muted-foreground">
                          {money(b.rateCents)}{model && ` · ${model.label}`}
                          {b.quantity !== null && b.quantity !== undefined && ` × ${b.quantity}`}
                          {b.invoiceDay && ` · invoices ${b.invoiceDay}`}
                          {b.paymentChannel && ` · ${channels.find((c) => c.code === b.paymentChannel)?.label ?? b.paymentChannel}`}
                          {b.transactionType && ` · ${b.transactionType}`}
                        </p>
                        <p className="text-[11px] text-muted-foreground">
                          {runRate !== null && <>Monthly run-rate {money(runRate)} · </>}
                          {kind === "variable_recurring" && <>Variable — expected amount moves with volume · </>}
                          {kind === "one_time" && <>One-time — contributes nothing to MRR · </>}
                          in force from {formatDate(b.effectiveFrom)}
                          {b.effectiveTo && ` to ${formatDate(b.effectiveTo)}`}
                        </p>
                        {b.pricingNotes && <p className="mt-0.5 text-xs italic text-muted-foreground">{b.pricingNotes}</p>}
                      </>
                    ) : (
                      <p className="text-xs text-muted-foreground">No terms recorded</p>
                    )}
                  </div>
                  {canEdit && (
                    <Button size="sm" variant="ghost" className="h-7 px-2"
                      aria-label={`Edit terms for ${s.name}`}
                      onClick={() => setEditing(editing === s.id ? null : s.id)}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
                {editing === s.id && canEdit && (
                  <TermsForm
                    serviceId={s.id} current={b ?? null} models={models} channels={channels}
                    saving={actions.saveBilling.isPending}
                    onCancel={() => setEditing(null)}
                    onSave={async (v) => { await actions.saveBilling.mutateAsync(v); setEditing(null); }}
                  />
                )}
              </li>
            );
          })}
        </ul>
      )}
    </ContentCard>
  );
}

function TermsForm({ serviceId, current, models, channels, saving, onSave, onCancel }: {
  serviceId: string;
  current: PartnerBilling | null;
  models: { code: string; label: string; unit: string | null; recurring: boolean }[];
  channels: { code: string; label: string }[];
  saving: boolean;
  onSave: (v: PartnerBilling & { effectiveFrom: string }) => void;
  onCancel: () => void;
}) {
  const dollars = (c: number | null | undefined) =>
    c === null || c === undefined ? "" : String(c / 100);
  const [effectiveFrom, setEffectiveFrom] = useState(
    current?.effectiveFrom ?? new Date().toISOString().slice(0, 10));
  const [billingModel, setBillingModel] = useState(current?.billingModel ?? "RECURRING_MONTHLY");
  const [billingStatus, setBillingStatus] = useState(current?.billingStatus ?? "active");
  const [rate, setRate] = useState(dollars(current?.rateCents));
  const [quantity, setQuantity] = useState(
    current?.quantity === null || current?.quantity === undefined ? "" : String(current.quantity));
  const [invoiceDay, setInvoiceDay] = useState(current?.invoiceDay ?? "");
  const [channel, setChannel] = useState(current?.paymentChannel ?? "UNKNOWN");
  const [txType, setTxType] = useState(current?.transactionType ?? "business");
  const [currency, setCurrency] = useState(current?.currency ?? "USD");
  const [hours, setHours] = useState(
    current?.contractedHours === null || current?.contractedHours === undefined ? "" : String(current.contractedHours));
  const [fx, setFx] = useState(current?.fxRateUsed === null || current?.fxRateUsed === undefined ? "" : String(current.fxRateUsed));
  const [notes, setNotes] = useState(current?.pricingNotes ?? "");

  const model = models.find((m) => m.code === billingModel);
  const kind = revenueClass(billingModel);
  const cents = (v: string) => (v.trim() === "" ? null : Math.round(Number(v) * 100));
  const rateCents = cents(rate);
  const preview = kind === "fixed_recurring"
    ? normalizeToMonthly(rateCents, billingModel)
    : kind === "variable_recurring" && quantity.trim() !== "" && rateCents !== null
      ? Math.round(rateCents * Number(quantity))
      : null;
  const changingRate = current && current.effectiveFrom !== effectiveFrom;

  return (
    <div className="mt-2 space-y-2 rounded-lg border border-border bg-muted/30 p-3">
      <div className="grid gap-2 sm:grid-cols-2">
        <OpsSelect aria-label="Billing model" size="field" value={billingModel} onValueChange={setBillingModel}
          options={models.map((m) => ({ value: m.code, label: m.label }))} />
        <OpsSelect aria-label="Billing status" size="field" value={billingStatus} onValueChange={setBillingStatus}
          options={BILLING_STATUSES} />
        <Input type="number" step="0.01" min="0" value={rate} onChange={(e) => setRate(e.target.value)}
          placeholder={model?.unit ? `Rate per ${model.unit}` : "Rate"} aria-label="Rate" />
        <Input type="number" step="0.01" min="0" value={quantity} onChange={(e) => setQuantity(e.target.value)}
          placeholder={model?.unit ? `How many ${model.unit}s` : "Quantity"} aria-label="Quantity" />
        <Input value={invoiceDay} onChange={(e) => setInvoiceDay(e.target.value)}
          placeholder="Invoice day — Friday, 1, End of month" aria-label="Invoice day" />
        <OpsSelect aria-label="Payment channel" size="field" value={channel} onValueChange={setChannel}
          options={channels.map((c) => ({ value: c.code, label: c.label }))} />
        <OpsSelect aria-label="Transaction type" size="field" value={txType} onValueChange={setTxType}
          options={[{ value: "business", label: "Business" }, { value: "personal", label: "Personal" }]} />
        <Input value={currency} onChange={(e) => setCurrency(e.target.value.toUpperCase())}
          maxLength={3} placeholder="USD" aria-label="Currency" />
        {billingModel === "HOURLY" && (
          <Input type="number" step="0.5" min="0" value={hours} onChange={(e) => setHours(e.target.value)}
            placeholder="Contracted hours" aria-label="Contracted hours" />
        )}
        <Input type="number" step="0.0001" min="0" value={fx} onChange={(e) => setFx(e.target.value)}
          placeholder="FX rate used, if agreed in another currency" aria-label="FX rate used" />
        <label className="text-xs text-muted-foreground">
          Effective from
          <Input type="date" value={effectiveFrom} onChange={(e) => setEffectiveFrom(e.target.value)}
            aria-label="Effective from" />
        </label>
      </div>

      {preview !== null && (
        <p className="text-xs text-muted-foreground">
          {kind === "fixed_recurring"
            ? <>Monthly run-rate <strong className="text-foreground">{money(preview)}</strong> — rate × period ÷ 12, not × 4.</>
            : <>Expected this cycle <strong className="text-foreground">{money(preview)}</strong> — variable, so it is reported beside MRR rather than inside it.</>}
        </p>
      )}
      {kind === "one_time" && (
        <p className="text-xs text-muted-foreground">
          A one-time engagement. It never contributes to MRR, however the payments are spread —
          use an instalment plan to schedule the parts.
        </p>
      )}
      {changingRate && (
        <p className="rounded-lg border border-blue-500/30 bg-blue-500/10 px-3 py-2 text-xs text-blue-900">
          This starts a new set of terms on {formatDate(effectiveFrom)}. The terms before it are kept
          and close the day before, so invoices already issued keep the rate they were issued at.
        </p>
      )}

      <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)}
        placeholder="Billing notes — special pricing, what was agreed" aria-label="Billing notes" />
      <div className="flex gap-2">
        <Button size="sm" disabled={saving}
          onClick={() => onSave({
            serviceId, effectiveFrom,
            billingModel, billingStatus,
            paymentChannel: channel, transactionType: txType,
            paymentFrequency: model?.label ?? null,
            invoiceDay: invoiceDay || null,
            rateCents, currency: currency || "USD",
            expectedMonthlyCents: preview,
            mrrCents: kind === "fixed_recurring" ? preview : null,
            contractedHours: hours.trim() === "" ? null : Number(hours),
            quantity: quantity.trim() === "" ? null : Number(quantity),
            currencyOriginal: currency === "USD" ? null : currency,
            fxRateUsed: fx.trim() === "" ? null : Number(fx),
            pricingNotes: notes || null,
          })}>
          {saving && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />} Save terms
        </Button>
        <Button size="sm" variant="ghost" onClick={onCancel}>Cancel</Button>
      </div>
    </div>
  );
}
