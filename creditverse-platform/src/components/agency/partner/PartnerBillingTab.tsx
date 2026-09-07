/**
 * What BES charges this partner, and what it collected.
 *
 * ── THE DISTINCTION THIS SCREEN HAS TO GET RIGHT ───────────────────────────
 *
 * A manager's billing query comes back EMPTY, not refused — that is RLS doing
 * its job. So "no rows" means one of two completely different things: nothing
 * is billed, or you may not see what is. A screen that guessed would tell a
 * manager the partner is free.
 *
 * So the tab asks `agency_can` separately and says which of the two it is. The
 * permission decides the WORDS; the database decides the DATA, and it has
 * already decided before this component renders.
 */
import { useState } from "react";
import { Lock, Loader2, Pencil } from "lucide-react";
import { ContentCard } from "@/components/dashboard/DivisionLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { OpsSelect } from "@/components/ui/ops-select";
import {
  usePartnerBilling, usePartnerRevenue, usePartnerServiceActions, usePartnerServices,
} from "@/lib/data/use-partner-services";
import { useAgencyPermissions } from "@/lib/data/agency-permissions";
import { formatMoney } from "@/lib/format-money";
import type { PartnerBilling } from "@/lib/data/partner-services";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const FREQUENCIES = ["Weekly", "Biweekly", "Monthly", "Per client", "Per round", "Hourly", "One time", "Custom"];
const money = (cents: number | null) => (cents === null ? "—" : formatMoney(cents / 100));

export function PartnerBillingTab({ groupId }: { groupId: string }) {
  const perms = useAgencyPermissions();
  const services = usePartnerServices(groupId);
  const ids = (services.data ?? []).map((s) => s.id);
  const billing = usePartnerBilling(groupId, ids);
  const [year, setYear] = useState(new Date().getFullYear());
  const revenue = usePartnerRevenue(groupId, year);
  const actions = usePartnerServiceActions(groupId);
  const [editing, setEditing] = useState<string | null>(null);

  const canEdit = perms.can("partners.financials.edit");
  const canRecord = perms.can("partners.revenue.record");

  /* Said plainly, and not confused with "nothing is billed". */
  if (perms.loading) {
    return <p className="py-8 text-center text-sm text-muted-foreground">
      <Loader2 className="mr-2 inline h-4 w-4 animate-spin" /> Checking your access…
    </p>;
  }
  if (!billing.allowed) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-xl border border-border bg-card p-8 text-center">
        <Lock className="h-6 w-6 text-muted-foreground" />
        <p className="text-sm font-semibold text-foreground">You do not have access to billing</p>
        <p className="max-w-md text-xs text-muted-foreground">
          Rates, payment terms and revenue for this partner are restricted. An agency owner or
          administrator can grant access under People → Access if you need it.
        </p>
      </div>
    );
  }

  const byMonth = new Map<number, { expected: number | null; actual: number | null }>();
  for (const e of revenue.data ?? []) {
    const at = byMonth.get(e.month) ?? { expected: null, actual: null };
    byMonth.set(e.month, {
      expected: (at.expected ?? 0) + (e.expectedCents ?? 0) || at.expected,
      actual: (at.actual ?? 0) + (e.actualCents ?? 0) || at.actual,
    });
  }
  const totalExpected = (revenue.data ?? []).reduce((n, e) => n + (e.expectedCents ?? 0), 0);
  const totalActual = (revenue.data ?? []).reduce((n, e) => n + (e.actualCents ?? 0), 0);

  return (
    <div className="space-y-3">
      <ContentCard title="Billing terms">
        {(services.data ?? []).length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            Add a service first — billing terms hang off a service.
          </p>
        ) : (
          <ul className="divide-y divide-border/50">
            {(services.data ?? []).map((s) => {
              const b = billing.data?.[s.id];
              const open = editing === s.id;
              return (
                <li key={s.id} className="py-2.5">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-foreground">{s.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {b ? (
                          <>
                            {money(b.rateCents)} {b.paymentFrequency ? `· ${b.paymentFrequency}` : ""}
                            {b.paymentChannel ? ` · ${b.paymentChannel}` : ""}
                            {b.invoiceDay ? ` · invoices ${b.invoiceDay}` : ""}
                          </>
                        ) : "No billing terms recorded"}
                      </p>
                      {b?.expectedMonthlyCents !== null && b?.expectedMonthlyCents !== undefined && (
                        <p className="text-xs text-muted-foreground">
                          Expected monthly: <span className="font-semibold text-foreground">{money(b.expectedMonthlyCents)}</span>
                        </p>
                      )}
                      {b?.pricingNotes && <p className="mt-0.5 text-xs italic text-muted-foreground">{b.pricingNotes}</p>}
                    </div>
                    {canEdit && (
                      <Button size="sm" variant="ghost" className="h-7 px-2" aria-label={`Edit billing for ${s.name}`}
                        onClick={() => setEditing(open ? null : s.id)}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                  {open && canEdit && (
                    <BillingForm
                      serviceId={s.id}
                      current={b ?? null}
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

      <ContentCard
        title={`Revenue ${year}`}
        action={
          <div className="flex items-center gap-1">
            <Button size="sm" variant="ghost" onClick={() => setYear((y) => y - 1)} aria-label="Previous year">‹</Button>
            <span className="text-xs text-muted-foreground">{year}</span>
            <Button size="sm" variant="ghost" onClick={() => setYear((y) => y + 1)} aria-label="Next year">›</Button>
          </div>
        }
      >
        <div className="overflow-x-auto">
          <table className="w-full min-w-[40rem] text-left text-xs">
            <thead>
              <tr className="border-b border-border/60 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                <th className="py-1.5 pr-2">Month</th>
                <th className="py-1.5 pr-2 text-right">Expected</th>
                <th className="py-1.5 pr-2 text-right">Actual</th>
                <th className="py-1.5 text-right">Difference</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50">
              {MONTHS.map((m, i) => {
                const row = byMonth.get(i + 1);
                const diff = (row?.actual ?? 0) - (row?.expected ?? 0);
                return (
                  <tr key={m} className="transition-colors hover:bg-muted/40">
                    <td className="py-1.5 pr-2 font-medium text-foreground">{m}</td>
                    <td className="py-1.5 pr-2 text-right tabular-nums text-muted-foreground">{money(row?.expected ?? null)}</td>
                    <td className="py-1.5 pr-2 text-right tabular-nums text-foreground">{money(row?.actual ?? null)}</td>
                    <td className="py-1.5 text-right tabular-nums text-muted-foreground">
                      {row ? (diff === 0 ? "—" : `${diff > 0 ? "+" : ""}${formatMoney(diff / 100)}`) : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="border-t border-border font-semibold">
                <td className="py-1.5 pr-2">Year</td>
                <td className="py-1.5 pr-2 text-right tabular-nums">{money(totalExpected || null)}</td>
                <td className="py-1.5 pr-2 text-right tabular-nums">{money(totalActual || null)}</td>
                <td className="py-1.5 text-right tabular-nums">
                  {totalExpected || totalActual ? formatMoney((totalActual - totalExpected) / 100) : "—"}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
        {!canRecord && (
          <p className="mt-2 text-xs text-muted-foreground">
            You can see revenue but not record it.
          </p>
        )}
        {canRecord && (
          <RecordRevenue
            year={year}
            services={(services.data ?? []).map((s) => ({ id: s.id, name: s.name }))}
            saving={actions.saveRevenue.isPending}
            onSave={(v) => actions.saveRevenue.mutate(v)}
          />
        )}
      </ContentCard>
    </div>
  );
}

function BillingForm({ serviceId, current, saving, onSave, onCancel }: {
  serviceId: string; current: PartnerBilling | null; saving: boolean;
  onSave: (v: PartnerBilling) => void; onCancel: () => void;
}) {
  const [rate, setRate] = useState(current?.rateCents !== null && current?.rateCents !== undefined ? String(current.rateCents / 100) : "");
  const [expected, setExpected] = useState(current?.expectedMonthlyCents !== null && current?.expectedMonthlyCents !== undefined ? String(current.expectedMonthlyCents / 100) : "");
  const [frequency, setFrequency] = useState(current?.paymentFrequency ?? "Monthly");
  const [channel, setChannel] = useState(current?.paymentChannel ?? "");
  const [txType, setTxType] = useState(current?.transactionType ?? "");
  const [invoiceDay, setInvoiceDay] = useState(current?.invoiceDay ?? "");
  const [currency, setCurrency] = useState(current?.currency ?? "USD");
  const [notes, setNotes] = useState(current?.pricingNotes ?? "");
  const cents = (v: string) => (v.trim() === "" ? null : Math.round(Number(v) * 100));

  return (
    <div className="mt-2 space-y-2 rounded-lg border border-border bg-muted/30 p-3">
      <div className="grid gap-2 sm:grid-cols-2">
        <Input type="number" step="0.01" min="0" value={rate} onChange={(e) => setRate(e.target.value)}
          placeholder="Rate" aria-label="Rate" />
        <Input type="number" step="0.01" min="0" value={expected} onChange={(e) => setExpected(e.target.value)}
          placeholder="Expected monthly" aria-label="Expected monthly" />
        <OpsSelect aria-label="Payment frequency" size="sm" value={frequency} onValueChange={setFrequency}
          options={FREQUENCIES.map((f) => ({ value: f, label: f }))} />
        <Input value={invoiceDay} onChange={(e) => setInvoiceDay(e.target.value)}
          placeholder="Invoice day — Friday, End of month…" aria-label="Invoice day" />
        <Input value={channel} onChange={(e) => setChannel(e.target.value)}
          placeholder="Payment channel" aria-label="Payment channel" />
        <Input value={txType} onChange={(e) => setTxType(e.target.value)}
          placeholder="Transaction type" aria-label="Transaction type" />
        <Input value={currency} onChange={(e) => setCurrency(e.target.value.toUpperCase())}
          placeholder="USD" aria-label="Currency" maxLength={3} />
      </div>
      <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)}
        placeholder="Special pricing notes" aria-label="Pricing notes" />
      <div className="flex gap-2">
        <Button size="sm" disabled={saving}
          onClick={() => onSave({
            serviceId, rateCents: cents(rate), expectedMonthlyCents: cents(expected),
            paymentFrequency: frequency || null, paymentChannel: channel || null,
            transactionType: txType || null, invoiceDay: invoiceDay || null,
            currency: currency || "USD", pricingNotes: notes || null,
          })}>
          {saving && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />} Save terms
        </Button>
        <Button size="sm" variant="ghost" onClick={onCancel}>Cancel</Button>
      </div>
    </div>
  );
}

function RecordRevenue({ year, services, saving, onSave }: {
  year: number; services: { id: string; name: string }[]; saving: boolean;
  onSave: (v: { serviceId: string | null; year: number; month: number; expectedCents: number | null; actualCents: number | null }) => void;
}) {
  const [month, setMonth] = useState(new Date().getMonth() + 1);
  const [serviceId, setServiceId] = useState<string>(services[0]?.id ?? "__none__");
  const [expected, setExpected] = useState("");
  const [actual, setActual] = useState("");
  const cents = (v: string) => (v.trim() === "" ? null : Math.round(Number(v) * 100));

  return (
    <div className="mt-3 flex flex-wrap items-end gap-2 rounded-lg border border-border bg-muted/30 p-3">
      <OpsSelect aria-label="Month" size="sm" value={String(month)} onValueChange={(v) => setMonth(Number(v))}
        options={MONTHS.map((m, i) => ({ value: String(i + 1), label: `${m} ${year}` }))} />
      <OpsSelect aria-label="Service" size="sm" value={serviceId} onValueChange={setServiceId}
        options={[{ value: "__none__", label: "Whole partner" }, ...services.map((s) => ({ value: s.id, label: s.name }))]} />
      <Input type="number" step="0.01" className="h-8 w-32" value={expected}
        onChange={(e) => setExpected(e.target.value)} placeholder="Expected" aria-label="Expected" />
      <Input type="number" step="0.01" className="h-8 w-32" value={actual}
        onChange={(e) => setActual(e.target.value)} placeholder="Actual" aria-label="Actual" />
      <Button size="sm" disabled={saving || (expected === "" && actual === "")}
        onClick={() => onSave({
          serviceId: serviceId === "__none__" ? null : serviceId,
          year, month, expectedCents: cents(expected), actualCents: cents(actual),
        })}>
        {saving && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />} Record
      </Button>
    </div>
  );
}
