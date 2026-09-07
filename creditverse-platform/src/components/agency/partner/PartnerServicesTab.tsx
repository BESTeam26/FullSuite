/**
 * Every service BES sells this partner, running or finished.
 *
 * ── WHERE THE MONEY IS, AND WHY IT IS BOTH PLACES ──────────────────────────
 *
 * The commercial terms live in a DIFFERENT TABLE from the service, because
 * Postgres RLS is row-level: a policy cannot withhold a column, so the only
 * way a manager's query genuinely cannot return a rate is for the rate to live
 * where their query does not reach.
 *
 * That is a storage decision, not a reason to make somebody who IS allowed to
 * set a rate go and find another tab. So this form shows the amount, the
 * frequency and the billing agreement inline — for a viewer who holds
 * `partners.financials.edit`, and for nobody else. A manager gets the same
 * form with those fields absent, and their query for them comes back empty
 * regardless. Billing & Revenue remains the full picture: history, invoices,
 * payments and revenue.
 *
 * A cancelled or completed line stays on this list. That is the history of the
 * relationship, and hiding it would make a partner who has bought three things
 * over two years look like a partner who has bought one.
 */
import { useState } from "react";
import { Ban, Loader2, Pencil, Plus } from "lucide-react";
import { ContentCard } from "@/components/dashboard/DivisionLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { OpsSelect } from "@/components/ui/ops-select";
import { Empty, Pill } from "@/components/agency/partner/partner-ui";
import { CancelServiceDialog } from "@/components/agency/partner/CancelServiceDialog";
import {
  SERVICE_STATUSES, SERVICE_STATUS_LABEL, SERVICE_STATUS_TONE, serviceIsHistorical,
} from "@/lib/partners/partner-account";
import {
  usePartnerBilling, usePartnerCatalogues, usePartnerServiceActions, usePartnerServices,
} from "@/lib/data/use-partner-services";
import { normalizeToMonthly, revenueClass } from "@/lib/partners/billing-engine";
import { formatMoney } from "@/lib/format-money";
import { useAgencyPermissions } from "@/lib/data/agency-permissions";
import type { PartnerBilling, PartnerService, PartnerServiceStatus } from "@/lib/data/partner-services";
import type { AgencyPerson, AgencyTeam } from "@/lib/data/agency-workforce";
import { formatDate } from "@/lib/format-date";

export function PartnerServicesTab({ groupId, people, teams }: {
  groupId: string;
  people: AgencyPerson[];
  teams: AgencyTeam[];
}) {
  const services = usePartnerServices(groupId);
  const catalogues = usePartnerCatalogues();
  const actions = usePartnerServiceActions(groupId);
  const perms = useAgencyPermissions();
  const canEdit = perms.can("partners.edit");
  const canSeeMoney = perms.can("partners.financials.view");
  const canSetMoney = perms.can("partners.financials.edit");
  const [editing, setEditing] = useState<string | "new" | null>(null);
  const [cancelling, setCancelling] = useState<string | null>(null);

  const rows = services.data ?? [];
  /* Only fetched for somebody the database would answer. A manager's query
     would return an empty map, which reads identically to "nothing is billed"
     — so the capability decides whether to ask at all. */
  const billing = usePartnerBilling(groupId, canSeeMoney ? rows.map((s) => s.id) : []);
  const terms = billing.data ?? {};
  const live = rows.filter((s) => !serviceIsHistorical(s.status));
  const history = rows.filter((s) => serviceIsHistorical(s.status));
  const typeLabel = (code: string | null) =>
    (catalogues.data?.serviceTypes ?? []).find((t) => t.code === code)?.label ?? null;

  return (
    <div className="space-y-3">
      <ContentCard
        title="Service engagements"
        action={canEdit && (
          <Button size="sm" variant="ghost" onClick={() => setEditing(editing === "new" ? null : "new")}>
            <Plus className="mr-1.5 h-3.5 w-3.5" /> Add service
          </Button>
        )}
      >
        {editing === "new" && (
          <ServiceForm
            people={people} teams={teams}
            serviceTypes={catalogues.data?.serviceTypes ?? []}
            billingModels={canSetMoney ? catalogues.data?.billingModels ?? [] : []}
            paymentChannels={canSetMoney ? catalogues.data?.paymentChannels ?? [] : []}
            saving={actions.saveService.isPending || actions.saveBilling.isPending}
            onCancel={() => setEditing(null)}
            onSave={async (v, money) => {
              const id = await actions.saveService.mutateAsync(v);
              if (money) await actions.saveBilling.mutateAsync({ ...money, serviceId: id });
              setEditing(null);
            }}
          />
        )}

        {services.isLoading ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            <Loader2 className="mr-2 inline h-4 w-4 animate-spin" /> Loading…
          </p>
        ) : rows.length === 0 ? (
          <Empty
            title="No services recorded yet"
            hint="A partner is the account. Add what BES actually does for them — CreditOps, a CRM subscription, dedicated staff, a one-off build."
          />
        ) : (
          <ul className="divide-y divide-border/50">
            {live.map((s) => (
              <ServiceRow key={s.id} service={s} typeLabel={typeLabel(s.serviceType)}
                people={people} teams={teams} canEdit={canEdit}
                terms={canSeeMoney ? terms[s.id] : undefined}
                billingModels={canSetMoney ? catalogues.data?.billingModels ?? [] : []}
                paymentChannels={canSetMoney ? catalogues.data?.paymentChannels ?? [] : []}
                modelLabels={Object.fromEntries((catalogues.data?.billingModels ?? []).map((m) => [m.code, m.label]))}
                open={editing === s.id} onToggle={() => setEditing(editing === s.id ? null : s.id)}
                serviceTypes={catalogues.data?.serviceTypes ?? []}
                saving={actions.saveService.isPending || actions.saveBilling.isPending}
                onSave={async (v, money) => {
                  await actions.saveService.mutateAsync({ ...v, id: s.id });
                  if (money) await actions.saveBilling.mutateAsync({ ...money, serviceId: s.id });
                  setEditing(null);
                }}
                onCancelService={canEdit ? () => setCancelling(cancelling === s.id ? null : s.id) : undefined}
                cancelling={cancelling === s.id}
                cancelPanel={cancelling === s.id && (
                  <CancelServiceDialog groupId={groupId} serviceId={s.id} serviceName={s.name}
                    onClose={() => setCancelling(null)} />
                )}
              />
            ))}
          </ul>
        )}
      </ContentCard>

      {history.length > 0 && (
        <ContentCard title={`Finished and cancelled (${history.length})`}>
          <p className="mb-2 text-xs text-muted-foreground">
            Kept, and counted separately. A completed build or a cancelled subscription does not
            end the relationship — the partner's own lifecycle says whether BES still works with them.
          </p>
          <ul className="divide-y divide-border/50">
            {history.map((s) => (
              <ServiceRow key={s.id} service={s} typeLabel={typeLabel(s.serviceType)}
                people={people} teams={teams} canEdit={canEdit}
                terms={canSeeMoney ? terms[s.id] : undefined}
                billingModels={canSetMoney ? catalogues.data?.billingModels ?? [] : []}
                paymentChannels={canSetMoney ? catalogues.data?.paymentChannels ?? [] : []}
                modelLabels={Object.fromEntries((catalogues.data?.billingModels ?? []).map((m) => [m.code, m.label]))}
                open={editing === s.id} onToggle={() => setEditing(editing === s.id ? null : s.id)}
                serviceTypes={catalogues.data?.serviceTypes ?? []}
                saving={actions.saveService.isPending || actions.saveBilling.isPending}
                onSave={async (v, money) => {
                  await actions.saveService.mutateAsync({ ...v, id: s.id });
                  if (money) await actions.saveBilling.mutateAsync({ ...money, serviceId: s.id });
                  setEditing(null);
                }}
              />
            ))}
          </ul>
        </ContentCard>
      )}
    </div>
  );
}

type ServiceInput = Parameters<ReturnType<typeof usePartnerServiceActions>["saveService"]["mutateAsync"]>[0];

function ServiceRow({
  service, typeLabel, people, teams, canEdit, open, onToggle, serviceTypes, saving, onSave,
  onCancelService, cancelling, cancelPanel, terms, billingModels, paymentChannels, modelLabels,
}: {
  service: PartnerService;
  typeLabel: string | null;
  people: AgencyPerson[];
  teams: AgencyTeam[];
  canEdit: boolean;
  open: boolean;
  onToggle: () => void;
  serviceTypes: { code: string; label: string; category: string }[];
  saving: boolean;
  onSave: (v: ServiceInput, money?: MoneyInput) => void;
  onCancelService?: () => void;
  cancelling?: boolean;
  cancelPanel?: React.ReactNode;
  /** Undefined when the viewer may not see money — not "no terms". */
  terms?: PartnerBilling;
  billingModels: BillingModel[];
  paymentChannels: { code: string; label: string }[];
  modelLabels: Record<string, string>;
}) {
  const processor = people.find((p) => p.userId === service.processorId);
  const team = teams.find((t) => t.id === service.teamId);
  return (
    <li className="py-2.5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-2 text-sm font-semibold text-foreground">
            {service.name}
            <Pill tone={SERVICE_STATUS_TONE[service.status]}>{SERVICE_STATUS_LABEL[service.status]}</Pill>
          </p>
          <p className="text-xs text-muted-foreground">
            {[
              typeLabel,
              service.quantity !== null && `${service.quantity} ${service.quantityUnit ?? ""}`.trim(),
              service.clientVolumeText,
              processor?.name && `run by ${processor.name}`,
              team?.name,
              service.startedOn && `from ${formatDate(service.startedOn)}`,
              service.endedOn && `to ${formatDate(service.endedOn)}`,
            ].filter(Boolean).join(" · ") || "No detail recorded"}
          </p>
          {terms && (
            <p className="mt-0.5 text-xs font-medium text-foreground">
              {terms.rateCents === null ? "No rate agreed yet" : formatMoney(terms.rateCents / 100)}
              {terms.billingModel && ` · ${modelLabels[terms.billingModel] ?? terms.billingModel}`}
              {terms.invoiceDay && ` · invoices ${terms.invoiceDay}`}
              {revenueClass(terms.billingModel) === "fixed_recurring" && terms.rateCents !== null && (
                <span className="font-normal text-muted-foreground">
                  {" "}· {formatMoney(normalizeToMonthly(terms.rateCents, terms.billingModel) / 100)}/month run-rate
                </span>
              )}
            </p>
          )}
          {service.description && <p className="mt-0.5 text-xs text-foreground">{service.description}</p>}
          {service.notes && <p className="mt-0.5 text-xs italic text-muted-foreground">{service.notes}</p>}
        </div>
        <span className="flex shrink-0 items-center gap-1">
          {canEdit && (
            <Button size="sm" variant="ghost" className="h-7 px-2" aria-label={`Edit ${service.name}`} onClick={onToggle}>
              <Pencil className="h-3.5 w-3.5" />
            </Button>
          )}
          {onCancelService && (
            <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={onCancelService}>
              <Ban className="mr-1 h-3.5 w-3.5" /> {cancelling ? "Keep" : "Cancel"}
            </Button>
          )}
        </span>
      </div>
      {cancelPanel}
      {open && canEdit && (
        <ServiceForm current={service} currentTerms={terms} people={people} teams={teams}
          serviceTypes={serviceTypes} billingModels={billingModels} paymentChannels={paymentChannels}
          saving={saving} onCancel={onToggle} onSave={onSave} />
      )}
    </li>
  );
}

interface BillingModel { code: string; label: string; unit: string | null; recurring: boolean }
type MoneyInput = PartnerBilling & { effectiveFrom: string };

function ServiceForm({
  current, currentTerms, people, teams, serviceTypes, billingModels, paymentChannels,
  saving, onSave, onCancel,
}: {
  current?: PartnerService;
  currentTerms?: PartnerBilling;
  people: AgencyPerson[];
  teams: AgencyTeam[];
  serviceTypes: { code: string; label: string; category: string }[];
  /** Empty when the viewer may not set money — the block is then not rendered. */
  billingModels: BillingModel[];
  paymentChannels: { code: string; label: string }[];
  saving: boolean;
  onSave: (v: ServiceInput, money?: MoneyInput) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(current?.name ?? "");
  const [serviceType, setServiceType] = useState(current?.serviceType ?? "");
  const [status, setStatus] = useState<PartnerServiceStatus>(current?.status ?? "active");
  const [startedOn, setStartedOn] = useState(current?.startedOn ?? "");
  const [endedOn, setEndedOn] = useState(current?.endedOn ?? "");
  const [processorId, setProcessorId] = useState(current?.processorId ?? "__none__");
  const [teamId, setTeamId] = useState(current?.teamId ?? "__none__");
  const [quantity, setQuantity] = useState(current?.quantity === null || current?.quantity === undefined ? "" : String(current.quantity));
  const [quantityUnit, setQuantityUnit] = useState(current?.quantityUnit ?? "");
  const [volumeText, setVolumeText] = useState(current?.clientVolumeText ?? "");
  const [description, setDescription] = useState(current?.description ?? "");
  const [notes, setNotes] = useState(current?.notes ?? "");

  /* The commercial terms, shown only to somebody who may set them. Stored in
     a different table; asked for here because a person agreeing a service
     agrees its price in the same conversation. */
  const canSetMoney = billingModels.length > 0;
  const [rate, setRate] = useState(
    currentTerms?.rateCents === null || currentTerms?.rateCents === undefined ? "" : String(currentTerms.rateCents / 100));
  const [billingModel, setBillingModel] = useState(currentTerms?.billingModel ?? "RECURRING_MONTHLY");
  const [invoiceDay, setInvoiceDay] = useState(currentTerms?.invoiceDay ?? "");
  const [channel, setChannel] = useState(currentTerms?.paymentChannel ?? "UNKNOWN");
  const [effectiveFrom, setEffectiveFrom] = useState(
    currentTerms?.effectiveFrom ?? new Date().toISOString().slice(0, 10));

  const model = billingModels.find((m) => m.code === billingModel);
  const kind = revenueClass(billingModel);
  const rateCents = rate.trim() === "" ? null : Math.round(Number(rate) * 100);
  const billedQuantity = quantity.trim() === "" ? null : Number(quantity);
  const monthly = kind === "fixed_recurring"
    ? normalizeToMonthly(rateCents, billingModel)
    : kind === "variable_recurring" && rateCents !== null && billedQuantity !== null
      ? Math.round(rateCents * billedQuantity)
      : null;
  const termsChanged = !!currentTerms && currentTerms.effectiveFrom !== effectiveFrom;

  /* Picking a catalogue type fills the display name once, so the common case
     is one click and the unusual one ("2 Dedicated Support Agents") is still
     free text. */
  const chooseType = (code: string) => {
    setServiceType(code);
    const label = serviceTypes.find((t) => t.code === code)?.label;
    if (label && !name.trim()) setName(label);
  };

  return (
    <div className="mt-2 space-y-2 rounded-lg border border-border bg-muted/30 p-3">
      <div className="grid gap-2 sm:grid-cols-2">
        <OpsSelect aria-label="Service type" size="field" value={serviceType || "__none__"}
          onValueChange={(v) => chooseType(v === "__none__" ? "" : v)}
          options={[{ value: "__none__", label: "Choose a service type" },
            ...serviceTypes.map((t) => ({ value: t.code, label: `${t.label} · ${t.category}` }))]} />
        <Input value={name} onChange={(e) => setName(e.target.value)}
          placeholder="What we call it" aria-label="Service name" />
        <OpsSelect aria-label="Service status" size="field" value={status}
          onValueChange={(v) => setStatus(v as PartnerServiceStatus)}
          options={SERVICE_STATUSES.map((s) => ({ value: s, label: SERVICE_STATUS_LABEL[s] }))} />
        <OpsSelect aria-label="Processor" size="field" value={processorId} onValueChange={setProcessorId}
          options={[{ value: "__none__", label: "No processor assigned" },
            ...people.map((p) => ({ value: p.userId, label: p.name }))]} />
        <OpsSelect aria-label="Team" size="field" value={teamId} onValueChange={setTeamId}
          options={[{ value: "__none__", label: "No team assigned" },
            ...teams.filter((t) => !t.archived).map((t) => ({ value: t.id, label: t.name }))]} />
        <div className="grid grid-cols-2 gap-2">
          <Input type="number" min="0" step="1" value={quantity} onChange={(e) => setQuantity(e.target.value)}
            placeholder="How many" aria-label="Quantity" />
          <Input value={quantityUnit} onChange={(e) => setQuantityUnit(e.target.value)}
            placeholder="clients, agents…" aria-label="Quantity unit" />
        </div>
        <label className="text-xs text-muted-foreground">
          Started
          <Input type="date" value={startedOn ?? ""} onChange={(e) => setStartedOn(e.target.value)} aria-label="Started on" />
        </label>
        <label className="text-xs text-muted-foreground">
          Ended
          <Input type="date" value={endedOn ?? ""} onChange={(e) => setEndedOn(e.target.value)} aria-label="Ended on" />
        </label>
      </div>
      <Input value={volumeText} onChange={(e) => setVolumeText(e.target.value)}
        placeholder='Volume as the old tracker recorded it — "300-400", "60 average"'
        aria-label="Legacy client volume" />
      <Textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)}
        placeholder="What this engagement covers" aria-label="Description" />
      <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)}
        placeholder="Operational notes" aria-label="Service notes" />
      {canSetMoney && (
        <div className="space-y-2 rounded-lg border border-border bg-card p-3">
          <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
            Billing agreement
          </p>
          <div className="grid gap-2 sm:grid-cols-2">
            <OpsSelect aria-label="Billing frequency" size="field" value={billingModel}
              onValueChange={setBillingModel}
              options={billingModels.map((m) => ({ value: m.code, label: m.label }))} />
            <Input type="number" step="0.01" min="0" value={rate} onChange={(e) => setRate(e.target.value)}
              placeholder={model?.unit ? `Amount per ${model.unit}` : "Amount"} aria-label="Amount" />
            <Input value={invoiceDay} onChange={(e) => setInvoiceDay(e.target.value)}
              placeholder="Invoice day — Friday, 1, End of month" aria-label="Invoice day" />
            <OpsSelect aria-label="Payment channel" size="field" value={channel} onValueChange={setChannel}
              options={paymentChannels.map((c) => ({ value: c.code, label: c.label }))} />
            <label className="text-xs text-muted-foreground sm:col-span-2">
              These terms take effect from
              <Input type="date" value={effectiveFrom} onChange={(e) => setEffectiveFrom(e.target.value)}
                aria-label="Terms effective from" />
            </label>
          </div>
          {monthly !== null && (
            <p className="text-xs text-muted-foreground">
              {kind === "fixed_recurring"
                ? <>Monthly run-rate <strong className="text-foreground">{formatMoney(monthly / 100)}</strong> — rate × period ÷ 12, never × 4.</>
                : <>Expected this cycle <strong className="text-foreground">{formatMoney(monthly / 100)}</strong> from {billedQuantity} × {formatMoney((rateCents ?? 0) / 100)} — variable, so it is reported beside MRR rather than inside it.</>}
            </p>
          )}
          {kind === "one_time" && (
            <p className="text-xs text-muted-foreground">
              A one-time engagement. It never contributes to MRR, however the payments are spread.
            </p>
          )}
          {termsChanged && (
            <p className="rounded-lg border border-blue-500/30 bg-blue-500/10 px-3 py-2 text-xs text-blue-900">
              This starts a NEW set of terms. The ones before it are kept and close the day before,
              so invoices already issued keep the rate they were issued at.
            </p>
          )}
          <p className="text-[11px] text-muted-foreground">
            Stored separately from the service itself, and only visible to people with financial
            access. Invoices, payments and revenue history are on Billing &amp; Revenue.
          </p>
        </div>
      )}
      {!canSetMoney && (
        <p className="text-[11px] text-muted-foreground">
          Rates and payment terms are stored separately and are not part of this form.
        </p>
      )}
      <div className="flex gap-2">
        <Button size="sm" disabled={saving || !name.trim()}
          onClick={() => onSave({
            groupId: "", agencyId: "", name,
            serviceType: serviceType || null,
            description: description || null,
            status, startedOn: startedOn || null, endedOn: endedOn || null,
            processorId: processorId === "__none__" ? null : processorId,
            teamId: teamId === "__none__" ? null : teamId,
            quantity: quantity.trim() === "" ? null : Number(quantity),
            quantityUnit: quantityUnit || null,
            clientVolumeText: volumeText || null,
            notes: notes || null,
          }, canSetMoney ? {
            serviceId: current?.id ?? "",
            effectiveFrom,
            billingModel,
            billingStatus: currentTerms?.billingStatus ?? "active",
            paymentChannel: channel,
            transactionType: currentTerms?.transactionType ?? "business",
            paymentFrequency: model?.label ?? null,
            invoiceDay: invoiceDay || null,
            rateCents,
            currency: currentTerms?.currency ?? "USD",
            expectedMonthlyCents: monthly,
            mrrCents: kind === "fixed_recurring" ? monthly : null,
            contractedHours: currentTerms?.contractedHours ?? null,
            quantity: billedQuantity,
            currencyOriginal: currentTerms?.currencyOriginal ?? null,
            fxRateUsed: currentTerms?.fxRateUsed ?? null,
            pricingNotes: currentTerms?.pricingNotes ?? null,
          } : undefined)}>
          {saving && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />} Save service
        </Button>
        <Button size="sm" variant="ghost" onClick={onCancel}>Cancel</Button>
      </div>
    </div>
  );
}
