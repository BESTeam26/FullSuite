/**
 * What BES does for this partner.
 *
 * Prices are NOT here. Billing lives in its own table behind
 * `partners.financials.view`, so a manager's query genuinely cannot return a
 * rate. Putting a price beside a status in one card would make the screen
 * responsible for hiding it, which is the arrangement this release replaces.
 */
import { useState } from "react";
import { Loader2, Pencil, Plus } from "lucide-react";
import { ContentCard } from "@/components/dashboard/DivisionLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { OpsSelect } from "@/components/ui/ops-select";
import { usePartnerServiceActions, usePartnerServices } from "@/lib/data/use-partner-services";
import { useAgencyPermissions } from "@/lib/data/agency-permissions";
import { useAgencyMembers, useAgencyTeams } from "@/lib/data/use-agency-work";
import { formatDate } from "@/lib/format-date";
import type { PartnerService, PartnerServiceStatus } from "@/lib/data/partner-services";
import { cn } from "@/lib/utils";

const NONE = "__none__";
const STATUSES: PartnerServiceStatus[] = ["onboarding", "active", "paused", "ended"];
const STATUS_TONE: Record<PartnerServiceStatus, string> = {
  onboarding: "border-blue-500/30 bg-blue-500/10 text-blue-700",
  active: "border-emerald-500/30 bg-emerald-500/10 text-emerald-700",
  paused: "border-amber-500/30 bg-amber-500/10 text-amber-700",
  ended: "border-border bg-muted text-muted-foreground",
};

export function PartnerServicesTab({ groupId }: { groupId: string }) {
  const services = usePartnerServices(groupId);
  const actions = usePartnerServiceActions(groupId);
  const perms = useAgencyPermissions();
  const members = useAgencyMembers();
  const teams = useAgencyTeams();
  const [editing, setEditing] = useState<PartnerService | "new" | null>(null);

  const canEdit = perms.can("partners.edit");
  const nameOf = (id: string | null) =>
    id ? (members.data ?? []).find((m) => m.id === id)?.name ?? "Assigned" : "Unassigned";

  return (
    <div className="space-y-3">
      <ContentCard
        title="Services"
        action={canEdit ? (
          <Button size="sm" variant="ghost" onClick={() => setEditing("new")}>
            <Plus className="mr-1.5 h-3.5 w-3.5" /> Add service
          </Button>
        ) : undefined}
      >
        <p className="mb-2 text-xs text-muted-foreground">
          A partner buying a second service gets a second row here, never a second partner record.
        </p>

        {services.isLoading ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            <Loader2 className="mr-2 inline h-4 w-4 animate-spin" /> Loading…
          </p>
        ) : (services.data ?? []).length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">No services recorded yet.</p>
        ) : (
          <ul className="divide-y divide-border/50">
            {(services.data ?? []).map((s) => (
              <li key={s.id} className="flex flex-wrap items-start justify-between gap-2 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-foreground">{s.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {s.quantity !== null && <>{s.quantity} {s.quantityUnit ?? "units"} · </>}
                    {nameOf(s.processorId)}
                    {s.startedOn && <> · since {formatDate(s.startedOn)}</>}
                    {s.endedOn && <> · ended {formatDate(s.endedOn)}</>}
                  </p>
                  {s.notes && <p className="mt-0.5 text-xs italic text-muted-foreground">{s.notes}</p>}
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <span className={cn("rounded-full border px-2 py-0.5 text-[10px] font-bold", STATUS_TONE[s.status])}>
                    {s.status}
                  </span>
                  {canEdit && (
                    <Button size="sm" variant="ghost" className="h-7 px-2" aria-label={`Edit ${s.name}`}
                      onClick={() => setEditing(s)}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </ContentCard>

      {editing && canEdit && (
        <ContentCard title={editing === "new" ? "New service" : `Edit ${editing.name}`}>
          <ServiceForm
            service={editing === "new" ? null : editing}
            members={members.data ?? []}
            teams={teams.data ?? []}
            saving={actions.saveService.isPending}
            onCancel={() => setEditing(null)}
            onSave={async (v) => {
              await actions.saveService.mutateAsync({
                id: editing === "new" ? undefined : editing.id, ...v,
              } as never);
              setEditing(null);
            }}
          />
        </ContentCard>
      )}
    </div>
  );
}

function ServiceForm({ service, members, teams, saving, onSave, onCancel }: {
  service: PartnerService | null;
  members: { id: string; name: string }[];
  teams: { id: string; name: string }[];
  saving: boolean;
  onSave: (v: Record<string, unknown>) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(service?.name ?? "");
  const [status, setStatus] = useState<PartnerServiceStatus>(service?.status ?? "active");
  const [startedOn, setStartedOn] = useState(service?.startedOn ?? "");
  const [endedOn, setEndedOn] = useState(service?.endedOn ?? "");
  const [processorId, setProcessorId] = useState(service?.processorId ?? NONE);
  const [teamId, setTeamId] = useState(service?.teamId ?? NONE);
  const [quantity, setQuantity] = useState(service?.quantity?.toString() ?? "");
  const [quantityUnit, setQuantityUnit] = useState(service?.quantityUnit ?? "");
  const [notes, setNotes] = useState(service?.notes ?? "");

  return (
    <div className="space-y-3">
      <Input value={name} onChange={(e) => setName(e.target.value)}
        placeholder="Service name — e.g. CreditOps Fulfillment" aria-label="Service name" />
      <div className="grid gap-2 sm:grid-cols-2">
        <OpsSelect aria-label="Status" size="sm" value={status}
          onValueChange={(v) => setStatus(v as PartnerServiceStatus)}
          options={STATUSES.map((s) => ({ value: s, label: s }))} />
        <OpsSelect aria-label="Assigned processor" size="sm" value={processorId} onValueChange={setProcessorId}
          options={[{ value: NONE, label: "No processor" }, ...members.map((m) => ({ value: m.id, label: m.name }))]} />
        <OpsSelect aria-label="Team" size="sm" value={teamId} onValueChange={setTeamId}
          options={[{ value: NONE, label: "No team" }, ...teams.map((t) => ({ value: t.id, label: t.name }))]} />
        <div className="grid grid-cols-2 gap-2">
          <Input type="number" min="0" value={quantity} onChange={(e) => setQuantity(e.target.value)}
            placeholder="How many" aria-label="Quantity" />
          <Input value={quantityUnit} onChange={(e) => setQuantityUnit(e.target.value)}
            placeholder="clients / agents" aria-label="Unit" />
        </div>
        <label className="text-xs text-muted-foreground">
          Started
          <Input type="date" className="mt-0.5 h-8" value={startedOn}
            onChange={(e) => setStartedOn(e.target.value)} aria-label="Started" />
        </label>
        <label className="text-xs text-muted-foreground">
          Ended — blank while it is running
          <Input type="date" className="mt-0.5 h-8" value={endedOn}
            onChange={(e) => setEndedOn(e.target.value)} aria-label="Ended" />
        </label>
      </div>
      <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)}
        placeholder="Operational notes" aria-label="Notes" />
      <p className="text-xs text-muted-foreground">
        Rates and payment terms are on Billing &amp; Revenue, and are stored separately.
      </p>
      <div className="flex gap-2">
        <Button size="sm" disabled={!name.trim() || saving}
          onClick={() => onSave({
            name, status,
            startedOn: startedOn || null, endedOn: endedOn || null,
            processorId: processorId === NONE ? null : processorId,
            teamId: teamId === NONE ? null : teamId,
            quantity: quantity === "" ? null : Number(quantity),
            quantityUnit: quantityUnit || null, notes: notes || null,
          })}>
          {saving && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />} Save
        </Button>
        <Button size="sm" variant="ghost" onClick={onCancel}>Cancel</Button>
      </div>
    </div>
  );
}
