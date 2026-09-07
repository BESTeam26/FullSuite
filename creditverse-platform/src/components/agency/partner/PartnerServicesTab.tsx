/**
 * Every service BES sells this partner, running or finished.
 *
 * Operational only. Rates, payment terms and revenue are on Billing & Revenue
 * and are stored in a different table, because Postgres RLS is row-level: a
 * policy cannot withhold a column, so the only way a manager's query genuinely
 * cannot return a rate is for the rate to live where their query does not go.
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
import { usePartnerCatalogues, usePartnerServiceActions, usePartnerServices } from "@/lib/data/use-partner-services";
import { useAgencyPermissions } from "@/lib/data/agency-permissions";
import type { PartnerService, PartnerServiceStatus } from "@/lib/data/partner-services";
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
  const [editing, setEditing] = useState<string | "new" | null>(null);
  const [cancelling, setCancelling] = useState<string | null>(null);

  const rows = services.data ?? [];
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
            saving={actions.saveService.isPending}
            onCancel={() => setEditing(null)}
            onSave={async (v) => { await actions.saveService.mutateAsync(v); setEditing(null); }}
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
                open={editing === s.id} onToggle={() => setEditing(editing === s.id ? null : s.id)}
                serviceTypes={catalogues.data?.serviceTypes ?? []}
                saving={actions.saveService.isPending}
                onSave={async (v) => { await actions.saveService.mutateAsync({ ...v, id: s.id }); setEditing(null); }}
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
                open={editing === s.id} onToggle={() => setEditing(editing === s.id ? null : s.id)}
                serviceTypes={catalogues.data?.serviceTypes ?? []}
                saving={actions.saveService.isPending}
                onSave={async (v) => { await actions.saveService.mutateAsync({ ...v, id: s.id }); setEditing(null); }}
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
  onCancelService, cancelling, cancelPanel,
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
  onSave: (v: ServiceInput) => void;
  onCancelService?: () => void;
  cancelling?: boolean;
  cancelPanel?: React.ReactNode;
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
        <ServiceForm current={service} people={people} teams={teams} serviceTypes={serviceTypes}
          saving={saving} onCancel={onToggle} onSave={onSave} />
      )}
    </li>
  );
}

function ServiceForm({ current, people, teams, serviceTypes, saving, onSave, onCancel }: {
  current?: PartnerService;
  people: AgencyPerson[];
  teams: AgencyTeam[];
  serviceTypes: { code: string; label: string; category: string }[];
  saving: boolean;
  onSave: (v: ServiceInput) => void;
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
      <p className="text-[11px] text-muted-foreground">
        Rates and payment terms are on Billing &amp; Revenue, and are stored separately.
      </p>
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
          })}>
          {saving && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />} Save service
        </Button>
        <Button size="sm" variant="ghost" onClick={onCancel}>Cancel</Button>
      </div>
    </div>
  );
}
