/**
 * The shape of the company, as a tree Dee can edit.
 *
 *   BES AGENCY HQ → DIVISION → DEPARTMENT → TEAM → PEOPLE
 *
 * ── WHY A DIVISION'S "SERVICE" IS SET ONCE AND NEVER EDITED ────────────────
 *
 * The name is Dee's — rename "BES CRM" to anything, nothing else moves. The
 * SERVICE is the authorization identity: it is what `in_scope()` reads to
 * decide who may see a customer's work. Changing it would move what an entire
 * division can reach, silently, from a dropdown. So it is chosen when the
 * division is created and shown as a fact afterwards.
 *
 * A division with no service — Corporate Operations — grants nothing. Being in
 * it is an organizational fact and not a permission (Dee, §20).
 *
 * ── ARCHIVING SHOWS ITS CONSEQUENCE FIRST ──────────────────────────────────
 *
 * Never a hard delete, and never a silent one: the impact is counted before
 * the confirmation, so somebody sees "4 people, 2 teams" rather than finding
 * out afterwards that assignments were left pointing nowhere.
 */
import { useState } from "react";
import {
  Building2, ChevronDown, ChevronRight, Loader2, Network, Pencil, Plus,
  Undo2, Users,
} from "lucide-react";
import { ContentCard } from "@/components/dashboard/DivisionLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { OpsSelect } from "@/components/ui/ops-select";
import { Pill } from "@/components/agency/partner/partner-ui";
import { useOrganizationTree, useStructureActions } from "@/lib/data/use-organization-structure";
import { useWorkforce } from "@/lib/data/use-workforce";
import { useAgencyPermissions } from "@/lib/data/agency-permissions";
import type { Department, Division, OrgTeam, StructureImpact } from "@/lib/data/organization-structure";
import { cn } from "@/lib/utils";

/* Every division carries one. `corporate` is the value for a division that
   grants nothing — leadership, finance, admin — and no engagement is ever
   created for it, so being inside it confers no access at all. A division
   with NO service could hold no departments, which is the defect Dee hit. */
const SERVICES = [
  { value: "creditops", label: "CreditOps — operational" },
  { value: "talentops", label: "TalentOps — operational" },
  { value: "bes_crm", label: "BES CRM — operational" },
  { value: "fundingops", label: "FundingOps — operational" },
  { value: "corporate", label: "Corporate — grants no access to customer work" },
];
const SERVICE_LABEL: Record<string, string> = {
  creditops: "CreditOps", fundingops: "FundingOps",
  bes_crm: "BES CRM", talentops: "TalentOps", corporate: "Corporate",
};

export function OrganizationStructure() {
  const tree = useOrganizationTree();
  const wf = useWorkforce();
  const perms = useAgencyPermissions();
  const actions = useStructureActions();
  const canManage = perms.can("org.structure.manage");

  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [addingDivision, setAddingDivision] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const people = wf.data?.people ?? [];
  const nameOf = (id: string | null) =>
    id ? people.find((p) => p.userId === id)?.name ?? null : null;

  const divisions = (tree.data?.divisions ?? []).filter((d) => showArchived || !d.archived);
  const departmentsOf = (divisionId: string) =>
    (tree.data?.departments ?? []).filter((d) => d.divisionId === divisionId && (showArchived || !d.archived));
  const teamsOf = (departmentId: string) =>
    (tree.data?.teams ?? []).filter((t) => t.departmentId === departmentId && (showArchived || !t.archived));
  const looseTeams = (tree.data?.teams ?? []).filter((t) => !t.departmentId && !t.archived);

  return (
    <ContentCard
      title={<span className="flex items-center gap-2"><Network className="h-4 w-4 text-muted-foreground" /> Organization structure</span>}
      action={
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" variant="ghost" className="h-7 px-2 text-xs"
            onClick={() => setShowArchived((v) => !v)}>
            {showArchived ? "Hide archived" : "Show archived"}
          </Button>
          {canManage && (
            <Button size="sm" variant="ghost" onClick={() => setAddingDivision((v) => !v)}>
              <Plus className="mr-1.5 h-3.5 w-3.5" /> Division
            </Button>
          )}
        </div>
      }
    >
      {error && <p className="mb-2 text-xs text-red-700">{error}</p>}

      {addingDivision && canManage && (
        <DivisionForm
          saving={actions.saveDivision.isPending} people={people}
          onCancel={() => setAddingDivision(false)}
          onSave={async (v) => {
            try { await actions.saveDivision.mutateAsync(v); setAddingDivision(false); }
            catch (e) { setError((e as Error).message); }
          }}
        />
      )}

      {tree.isLoading ? (
        <p className="py-6 text-center text-sm text-muted-foreground">
          <Loader2 className="mr-2 inline h-4 w-4 animate-spin" /> Loading the structure…
        </p>
      ) : (
        <ul className="space-y-1">
          {divisions.map((division) => {
            const departments = departmentsOf(division.id);
            const isOpen = open[division.id] ?? true;
            return (
              <li key={division.id} className={cn("rounded-lg border border-border", division.archived && "opacity-60")}>
                <DivisionRow
                  division={division} leadName={nameOf(division.leadId)} people={people}
                  isOpen={isOpen} canManage={canManage}
                  departmentCount={departments.length}
                  onToggle={() => setOpen((o) => ({ ...o, [division.id]: !isOpen }))}
                  onError={setError}
                />
                {isOpen && (
                  <ul className="space-y-1 border-t border-border/60 px-3 py-2">
                    {departments.map((department) => (
                      <DepartmentRow key={department.id} department={department}
                        managerName={nameOf(department.managerId)} people={people}
                        teams={teamsOf(department.id)} nameOf={nameOf}
                        canManage={canManage} onError={setError} />
                    ))}
                    {departments.length === 0 && (
                      <li className="py-1 text-xs text-muted-foreground">No departments yet.</li>
                    )}
                    {canManage && !division.archived && (
                      <li>
                        <AddDepartment divisionId={division.id} people={people}
                          saving={actions.saveDepartment.isPending}
                          onSave={async (v) => {
                            try { await actions.saveDepartment.mutateAsync(v); }
                            catch (e) { setError((e as Error).message); }
                          }} />
                      </li>
                    )}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {looseTeams.length > 0 && (
        <div className="mt-3 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3">
          <p className="text-xs font-semibold text-amber-900">
            {looseTeams.length} team{looseTeams.length === 1 ? "" : "s"} with no department
          </p>
          <p className="mt-0.5 text-[11px] text-amber-900">
            They work — a team does not need a department — but they will not appear anywhere the
            structure is used to group work. Give them one on the Teams screen.
          </p>
          <p className="mt-1 text-xs text-amber-900">
            {looseTeams.map((t) => t.name).join(", ")}
          </p>
        </div>
      )}
    </ContentCard>
  );
}

function DivisionRow({ division, leadName, people, isOpen, canManage, departmentCount, onToggle, onError }: {
  division: Division;
  leadName: string | null;
  people: { userId: string; name: string }[];
  isOpen: boolean;
  canManage: boolean;
  departmentCount: number;
  onToggle: () => void;
  onError: (m: string) => void;
}) {
  const actions = useStructureActions();
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState<StructureImpact | null>(null);

  return (
    <div className="px-3 py-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <button type="button" onClick={onToggle}
          className="flex min-w-0 items-center gap-2 text-left">
          {isOpen ? <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
                  : <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />}
          <Building2 className="h-4 w-4 shrink-0 text-muted-foreground" />
          <span className="min-w-0">
            <span className="flex flex-wrap items-center gap-1.5 text-sm font-bold text-foreground">
              {division.name}
              <Pill tone={division.service === "corporate"
                ? "border-border bg-muted text-muted-foreground"
                : "border-blue-500/30 bg-blue-500/10 text-blue-700"}>
                {SERVICE_LABEL[division.service] ?? division.service}
                {division.service === "corporate" && " · grants nothing"}
              </Pill>
              {division.archived && <Pill tone="border-border bg-muted text-muted-foreground">archived</Pill>}
            </span>
            <span className="block text-[11px] text-muted-foreground">
              {departmentCount} department{departmentCount === 1 ? "" : "s"}
              {leadName && ` · led by ${leadName}`}
              {division.description && ` · ${division.description}`}
            </span>
          </span>
        </button>

        {canManage && (
          <span className="flex shrink-0 gap-1">
            <Button size="sm" variant="ghost" className="h-7 px-2"
              aria-label={`Edit ${division.name}`} onClick={() => setEditing((v) => !v)}>
              <Pencil className="h-3.5 w-3.5" />
            </Button>
            {division.archived ? (
              <Button size="sm" variant="ghost" className="h-7 px-2 text-xs"
                onClick={() => actions.archiveDivision.mutate({ id: division.id, archived: false })}>
                <Undo2 className="mr-1 h-3.5 w-3.5" /> Restore
              </Button>
            ) : (
              <Button size="sm" variant="ghost" className="h-7 px-2 text-xs"
                onClick={async () => setConfirming(await actions.impactOfDivision(division.id))}>
                Archive
              </Button>
            )}
          </span>
        )}
      </div>

      {confirming && canManage && (
        <div className="mt-2 rounded-lg border border-amber-500/40 bg-amber-500/10 p-2.5 text-xs text-amber-900">
          <p>
            Archive <strong>{division.name}</strong>?
            {confirming.children === 0 && confirming.people === 0
              ? " Nothing sits under it."
              : ` ${confirming.children} department${confirming.children === 1 ? "" : "s"} and ${confirming.people} ${confirming.people === 1 ? "person" : "people"} are placed here. They keep their placement and their history; the division leaves the active lists.`}
          </p>
          <div className="mt-2 flex gap-2">
            <Button size="sm" variant="destructive"
              onClick={async () => {
                try { await actions.archiveDivision.mutateAsync({ id: division.id, archived: true }); }
                catch (e) { onError((e as Error).message); }
                setConfirming(null);
              }}>Archive</Button>
            <Button size="sm" variant="ghost" onClick={() => setConfirming(null)}>Keep it</Button>
          </div>
        </div>
      )}

      {editing && canManage && (
        <DivisionForm current={division} people={people} saving={actions.saveDivision.isPending}
          onCancel={() => setEditing(false)}
          onSave={async (v) => {
            try { await actions.saveDivision.mutateAsync({ ...v, id: division.id }); setEditing(false); }
            catch (e) { onError((e as Error).message); }
          }} />
      )}
    </div>
  );
}

function DepartmentRow({ department, managerName, people, teams, nameOf, canManage, onError }: {
  department: Department;
  managerName: string | null;
  people: { userId: string; name: string }[];
  teams: OrgTeam[];
  nameOf: (id: string | null) => string | null;
  canManage: boolean;
  onError: (m: string) => void;
}) {
  const actions = useStructureActions();
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState<StructureImpact | null>(null);

  return (
    <li className={cn("rounded-lg border border-border/60 bg-muted/20 px-3 py-2", department.archived && "opacity-60")}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-1.5 text-sm font-semibold text-foreground">
            {department.name}
            {department.archived && <Pill tone="border-border bg-muted text-muted-foreground">archived</Pill>}
          </p>
          <p className="text-[11px] text-muted-foreground">
            {teams.length} team{teams.length === 1 ? "" : "s"}
            {managerName && ` · managed by ${managerName}`}
            {department.description && ` · ${department.description}`}
          </p>
        </div>
        {canManage && (
          <span className="flex shrink-0 gap-1">
            <Button size="sm" variant="ghost" className="h-6 px-1.5"
              aria-label={`Edit ${department.name}`} onClick={() => setEditing((v) => !v)}>
              <Pencil className="h-3 w-3" />
            </Button>
            {department.archived ? (
              <Button size="sm" variant="ghost" className="h-6 px-1.5 text-[11px]"
                onClick={() => actions.archiveDepartment.mutate({ id: department.id, archived: false })}>
                Restore
              </Button>
            ) : (
              <Button size="sm" variant="ghost" className="h-6 px-1.5 text-[11px]"
                onClick={async () => setConfirming(await actions.impactOfDepartment(department.id))}>
                Archive
              </Button>
            )}
          </span>
        )}
      </div>

      {teams.length > 0 && (
        <ul className="mt-1.5 space-y-0.5 pl-4">
          {teams.map((t) => (
            <li key={t.id} className="flex flex-wrap items-center gap-2 text-xs">
              <Users className="h-3 w-3 shrink-0 text-muted-foreground" />
              <span className="font-medium text-foreground">{t.name}</span>
              <span className="text-muted-foreground">
                {t.members.length === 0
                  ? "nobody yet"
                  : t.members.map((m) => `${nameOf(m.userId) ?? "member"}${m.isLead ? " (lead)" : ""}`).join(", ")}
              </span>
              {t.archived && <Pill tone="border-border bg-muted text-muted-foreground">archived</Pill>}
            </li>
          ))}
        </ul>
      )}

      {confirming && canManage && (
        <div className="mt-2 rounded-lg border border-amber-500/40 bg-amber-500/10 p-2.5 text-xs text-amber-900">
          <p>
            Archive <strong>{department.name}</strong>?
            {confirming.children === 0 && confirming.people === 0 && confirming.work === 0
              ? " Nothing sits under it."
              : ` ${confirming.children} team${confirming.children === 1 ? "" : "s"}, ${confirming.people} ${confirming.people === 1 ? "person" : "people"} and ${confirming.work} open work item${confirming.work === 1 ? "" : "s"} sit here. Nothing is deleted — reassign what should keep moving before you archive.`}
          </p>
          <div className="mt-2 flex gap-2">
            <Button size="sm" variant="destructive"
              onClick={async () => {
                try { await actions.archiveDepartment.mutateAsync({ id: department.id, archived: true }); }
                catch (e) { onError((e as Error).message); }
                setConfirming(null);
              }}>Archive</Button>
            <Button size="sm" variant="ghost" onClick={() => setConfirming(null)}>Keep it</Button>
          </div>
        </div>
      )}

      {editing && canManage && (
        <DepartmentForm current={department} divisionId={department.divisionId ?? ""} people={people}
          saving={actions.saveDepartment.isPending}
          onCancel={() => setEditing(false)}
          onSave={async (v) => {
            try { await actions.saveDepartment.mutateAsync({ ...v, id: department.id }); setEditing(false); }
            catch (e) { onError((e as Error).message); }
          }} />
      )}
    </li>
  );
}

function DivisionForm({ current, people, saving, onSave, onCancel }: {
  current?: Division;
  people: { userId: string; name: string }[];
  saving: boolean;
  onSave: (v: { name: string; description?: string | null; service?: string | null; leadId?: string | null }) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(current?.name ?? "");
  const [description, setDescription] = useState(current?.description ?? "");
  const [service, setService] = useState(current?.service ?? "corporate");
  const [leadId, setLeadId] = useState(current?.leadId ?? "__none__");

  return (
    <div className="mt-2 space-y-2 rounded-lg border border-border bg-muted/30 p-3">
      <div className="grid gap-2 sm:grid-cols-2">
        <Input value={name} onChange={(e) => setName(e.target.value)}
          placeholder="Division name" aria-label="Division name" />
        <OpsSelect aria-label="Division lead" size="field" value={leadId} onValueChange={setLeadId}
          options={[{ value: "__none__", label: "No lead" },
            ...people.map((p) => ({ value: p.userId, label: p.name }))]} />
        <Input className="sm:col-span-2" value={description} onChange={(e) => setDescription(e.target.value)}
          placeholder="What this division does" aria-label="Division description" />
        {!current && (
          <div className="sm:col-span-2">
            <OpsSelect aria-label="Service" size="field" value={service} onValueChange={setService}
              options={SERVICES} />
            <p className="mt-1 text-[11px] text-muted-foreground">
              A division's service is its authorization identity and is set once. The NAME can be
              changed any time and changes nothing else; the service decides what work the division
              can reach, so it is not editable afterwards.
            </p>
          </div>
        )}
        {current && (
          <p className="text-[11px] text-muted-foreground sm:col-span-2">
            Service: <strong className="text-foreground">
              {current.service ? SERVICE_LABEL[current.service] ?? current.service : "none — grants nothing"}
            </strong>. Fixed when the division was created, because changing it would move what a
            whole division can reach.
          </p>
        )}
      </div>
      <div className="flex gap-2">
        <Button size="sm" disabled={saving || !name.trim()}
          onClick={() => onSave({
            name, description,
            service,
            leadId: leadId === "__none__" ? null : leadId,
          })}>
          {saving && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />} Save division
        </Button>
        <Button size="sm" variant="ghost" onClick={onCancel}>Cancel</Button>
      </div>
    </div>
  );
}

function DepartmentForm({ current, divisionId, people, saving, onSave, onCancel }: {
  current?: Department;
  divisionId: string;
  people: { userId: string; name: string }[];
  saving: boolean;
  onSave: (v: { divisionId: string; name: string; description?: string | null; managerId?: string | null }) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(current?.name ?? "");
  const [description, setDescription] = useState(current?.description ?? "");
  const [managerId, setManagerId] = useState(current?.managerId ?? "__none__");

  return (
    <div className="mt-2 space-y-2 rounded-lg border border-border bg-card p-3">
      <div className="grid gap-2 sm:grid-cols-2">
        <Input value={name} onChange={(e) => setName(e.target.value)}
          placeholder="Department name" aria-label="Department name" />
        <OpsSelect aria-label="Department manager" size="field" value={managerId} onValueChange={setManagerId}
          options={[{ value: "__none__", label: "No manager" },
            ...people.map((p) => ({ value: p.userId, label: p.name }))]} />
        <Input className="sm:col-span-2" value={description} onChange={(e) => setDescription(e.target.value)}
          placeholder="What this department does" aria-label="Department description" />
      </div>
      <p className="text-[11px] text-muted-foreground">
        Managing a department is a reporting relationship, not a permission. What somebody may see
        is still decided by their role, scope and assignment.
      </p>
      <div className="flex gap-2">
        <Button size="sm" disabled={saving || !name.trim()}
          onClick={() => onSave({
            divisionId, name, description,
            managerId: managerId === "__none__" ? null : managerId,
          })}>
          {saving && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />} Save department
        </Button>
        <Button size="sm" variant="ghost" onClick={onCancel}>Cancel</Button>
      </div>
    </div>
  );
}

function AddDepartment({ divisionId, people, saving, onSave }: {
  divisionId: string;
  people: { userId: string; name: string }[];
  saving: boolean;
  onSave: (v: { divisionId: string; name: string; description?: string | null; managerId?: string | null }) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  if (!open) {
    return (
      <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => setOpen(true)}>
        <Plus className="mr-1 h-3.5 w-3.5" /> Add department
      </Button>
    );
  }
  return (
    <DepartmentForm divisionId={divisionId} people={people} saving={saving}
      onCancel={() => setOpen(false)}
      onSave={async (v) => { await onSave(v); setOpen(false); }} />
  );
}
