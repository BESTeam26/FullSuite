/**
 * What BES charges this partner, what it invoiced, and what actually arrived.
 *
 * ── THIS TAB IS NOT RENDERED WITHOUT THE CAPABILITY ────────────────────────
 *
 * Dee, 2026-09-07: "if they don't have access, do not show it." The profile
 * builds its tab list from `agency_can`, so a manager without partner
 * financials sees no Billing tab at all — no lock icon, no greyed panel, and
 * no route that would render one. Every query below is refused by RLS as well;
 * this is the second half of the same rule, not the first line of defence.
 *
 * ── THE NUMBERS ARE KEPT APART ─────────────────────────────────────────────
 *
 * Fixed MRR, variable recurring, project value, expected, invoiced, collected
 * and outstanding are seven different facts. Adding them produces a figure
 * that answers nothing, so they are shown side by side and the arithmetic
 * comes from `billing-engine`, where it is tested.
 */
import { useState } from "react";
import { Loader2, Plus } from "lucide-react";
import { ContentCard } from "@/components/dashboard/DivisionLayout";
import { Button } from "@/components/ui/button";
import { Empty } from "@/components/agency/partner/partner-ui";
import { PartnerBillingTerms } from "@/components/agency/partner/PartnerBillingTerms";
import { PartnerInvoiceList } from "@/components/agency/partner/PartnerInvoiceList";
import { RecordPaymentForm } from "@/components/agency/partner/RecordPaymentForm";
import { usePartnerBilling, usePartnerRevenue, usePartnerServices } from "@/lib/data/use-partner-services";
import {
  usePartnerInvoices, usePartnerPayments, usePartnerSchedule,
} from "@/lib/data/use-partner-billing";
import { useAgencyPermissions } from "@/lib/data/agency-permissions";
import { financialPosition, monthOf } from "@/lib/partners/billing-engine";
import { formatMoney } from "@/lib/format-money";
import { formatDate } from "@/lib/format-date";
import type { AgencyPerson } from "@/lib/data/agency-workforce";

const money = (cents: number) => formatMoney(cents / 100);

export function PartnerBillingTab({ groupId, people }: { groupId: string; people: AgencyPerson[] }) {
  const perms = useAgencyPermissions();
  const services = usePartnerServices(groupId);
  const serviceIds = (services.data ?? []).map((s) => s.id);
  const billing = usePartnerBilling(groupId, serviceIds);
  const invoices = usePartnerInvoices(groupId);
  const payments = usePartnerPayments(groupId);
  const schedule = usePartnerSchedule(groupId);
  const today = new Date().toISOString().slice(0, 10);
  const month = monthOf(today);
  const revenue = usePartnerRevenue(groupId, month.year);
  const [recording, setRecording] = useState(false);

  const terms = (services.data ?? []).map((s) => {
    const b = billing.data?.[s.id];
    return {
      serviceId: s.id, groupId,
      live: s.status === "active" || s.status === "onboarding",
      billingModel: b?.billingModel ?? null,
      rateCents: b?.rateCents ?? null,
      quantity: b?.quantity ?? s.quantity ?? null,
      invoiceDay: b?.invoiceDay ?? null,
      effectiveFrom: b?.effectiveFrom ?? null,
      cancellationEffectiveOn: null,
      contractValueCents: null,
    };
  });
  const position = financialPosition(
    terms, schedule.data ?? [], invoices.data ?? [], payments.data ?? [], month, today,
  );

  const legacyRows = (revenue.data ?? []).filter((r) => (r.expectedCents ?? 0) + (r.actualCents ?? 0) > 0);

  return (
    <div className="space-y-3">
      <ContentCard title={`This month — ${formatDate(`${month.year}-${String(month.month).padStart(2, "0")}-01`)}`}>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Figure label="Fixed MRR" value={money(position.recurring.fixedMrrCents)}
            hint="Committed recurring run-rate" />
          <Figure label="Variable recurring" value={money(position.recurring.variableExpectedCents)}
            hint="Per client, per round, per agent — moves with volume" />
          <Figure label="Expected this month" value={money(position.expected.totalCents)}
            hint={position.expected.estimatedLines > 0
              ? `${position.expected.estimatedLines} line${position.expected.estimatedLines === 1 ? "" : "s"} estimated from the run-rate`
              : "From the actual billing schedule"} />
          <Figure label="Project value" value={money(position.projectValueCents)}
            hint="Live one-time work. Never counted as MRR" />
          <Figure label="Invoiced" value={money(position.invoicedCents)} />
          <Figure label="Collected" value={money(position.collectedCents)}
            hint="Payments received — not invoices sent" tone="text-emerald-700" />
          <Figure label="Outstanding" value={money(position.outstandingCents)} />
          <Figure label="Overdue" value={money(position.overdueCents)}
            tone={position.overdueCents > 0 ? "text-red-700" : undefined} />
        </div>
        {position.recurring.unpricedRecurring > 0 && (
          <p className="mt-3 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-900">
            {position.recurring.unpricedRecurring} running service
            {position.recurring.unpricedRecurring === 1 ? " has" : "s have"} no rate or quantity
            recorded. They are counted as unknown, not as zero — a per-client rate with no client
            count would otherwise quietly understate the month.
          </p>
        )}
      </ContentCard>

      <PartnerBillingTerms
        groupId={groupId}
        services={services.data ?? []}
        billing={billing.data ?? {}}
        canEdit={perms.can("partners.financials.edit")}
      />

      <PartnerInvoiceList
        groupId={groupId}
        services={services.data ?? []}
        invoices={invoices.data ?? []}
        loading={invoices.isLoading}
        canManage={perms.can("partners.invoices.manage")}
        canRecordPayment={perms.can("partners.payments.record")}
      />

      <ContentCard
        title="Payments received"
        action={perms.can("partners.payments.record") && (
          <Button size="sm" variant="ghost" onClick={() => setRecording((v) => !v)}>
            <Plus className="mr-1.5 h-3.5 w-3.5" /> Record payment
          </Button>
        )}
      >
        {recording && (
          <RecordPaymentForm groupId={groupId} invoices={invoices.data ?? []}
            services={services.data ?? []} onDone={() => setRecording(false)} />
        )}
        {payments.isLoading ? (
          <p className="py-4 text-center text-sm text-muted-foreground">
            <Loader2 className="mr-2 inline h-4 w-4 animate-spin" /> Loading…
          </p>
        ) : (payments.data ?? []).length === 0 ? (
          <Empty title="No payments recorded"
            hint="Money counts as collected only when a payment is recorded or a provider confirms one. An invoice being sent is not a payment." />
        ) : (
          <ul className="divide-y divide-border/50">
            {(payments.data ?? []).map((p) => (
              <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span className="min-w-0">
                  <span className="block text-sm font-semibold text-foreground">
                    {money(p.amountCents - p.refundAmountCents)}
                    {p.refundAmountCents > 0 && (
                      <span className="ml-1.5 text-xs font-normal text-muted-foreground">
                        ({money(p.amountCents)} less {money(p.refundAmountCents)} refunded)
                      </span>
                    )}
                  </span>
                  <span className="block text-xs text-muted-foreground">
                    {formatDate(p.paidOn)} · {p.provider.replace(/_/g, " ")}
                    {p.method && ` · ${p.method}`}
                    {p.notes && ` · ${p.notes}`}
                  </span>
                </span>
                <span className="shrink-0 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                  {p.source === "manual" ? "Manually recorded" : "Provider confirmed"}
                </span>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-2 text-[11px] text-muted-foreground">
          A manually recorded payment is somebody's word that money arrived. It is labelled that
          way until a provider confirms the transaction, and never shown as verified.
        </p>
      </ContentCard>

      {legacyRows.length > 0 && (
        <ContentCard title={`Legacy tracker figures — ${month.year}`}>
          <p className="mb-2 text-xs text-muted-foreground">
            What the spreadsheet recorded, kept for reference. These are <strong>not</strong> counted
            in Collected above — that figure comes only from the payment ledger.
          </p>
          <ul className="divide-y divide-border/50 text-sm">
            {legacyRows.map((r) => (
              <li key={r.id} className="flex justify-between py-1.5">
                <span className="text-muted-foreground">
                  {formatDate(`${r.year}-${String(r.month).padStart(2, "0")}-01`)}
                </span>
                <span className="tabular-nums text-foreground">
                  expected {money(r.expectedCents ?? 0)} · actual {money(r.actualCents ?? 0)}
                </span>
              </li>
            ))}
          </ul>
        </ContentCard>
      )}
    </div>
  );
}

function Figure({ label, value, hint, tone }: {
  label: string; value: string; hint?: string; tone?: string;
}) {
  return (
    <div className="rounded-lg border border-border bg-muted/30 p-3">
      <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className={`mt-0.5 text-lg font-bold tabular-nums ${tone ?? "text-foreground"}`}>{value}</p>
      {hint && <p className="mt-0.5 text-[11px] leading-tight text-muted-foreground">{hint}</p>}
    </div>
  );
}
