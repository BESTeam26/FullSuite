/**
 * Teams, and the people on them.
 *
 * ── RETIRING A TEAM: DELETE OR ARCHIVE, DECIDED BY WHAT POINTS AT IT ───────
 *
 * A team created by mistake five minutes ago should just go. A team that has
 * held work, clients or a partner is a record of how BES was organised, and
 * destroying it destroys the meaning of every row pointing at it (rule 11).
 * The button says "Remove", the outcome says which happened and why — "3 work
 * items" is actionable; "could not delete" is not.
 *
 * Removing somebody FROM a team is an ordinary delete: it is a current fact
 * about who is on it and carries no history of its own. Removing somebody from
 * the AGENCY is not, and lives on the People screen.
 */
import { useState } from "react";
import { Link } from "react-router-dom";
import { Loader2, Pencil, Plus, Star, Trash2, Undo2, UserPlus, X } from "lucide-react";
import { ContentCard } from "@/components/dashboard/DivisionLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { OpsSelect } from "@/components/ui/ops-select";
import { Empty, Pill } from "@/components/agency/partner/partner-ui";
import { useWorkforce } from "@/lib/data/use-workforce";
import { useDepartments, useTeamActions } from "@/lib/data/use-agency-teams";
import { useAuth } from "@/lib/auth/auth-context";
import type { AgencyTeam } from "@/lib/data/agency-workforce";
import { OwnerDeleteButton } from "@/components/agency/OwnerDeleteButton";
import type { RemoveTeamOutcome } from "@/lib/data/agency-teams";

export function TeamsManager() {
  const { agencyMembership } = useAuth();
  const canManage = agencyMembership?.role === "agency_owner"
    || agencyMembership?.role === "agency_admin";
  const wf = useWorkforce();
  const departments = useDepartments();
  const actions = useTeamActions();

  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDept, setNewDept] = useState("__none__");
  const [outcome, setOutcome] = useState<{ name: string; result: RemoveTeamOutcome } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const all = wf.data?.teams ?? [];
  const live = all.filter((t) => !t.archived);
  const archived = all.filter((t) => t.archived);
  const people = wf.data?.people ?? [];

  return (
    <div className="space-y-3">
      <ContentCard
        title={`Teams · ${live.length}`}
        action={canManage && (
          <Button size="sm" variant="ghost" onClick={() => setCreating((v) => !v)}>
            <Plus className="mr-1.5 h-3.5 w-3.5" /> New team
          </Button>
        )}
      >
        {creating && canManage && (
          <div className="mb-3 flex flex-wrap items-end gap-2 rounded-lg border border-border bg-muted/30 p-3">
            <Input className="h-8 w-56" value={newName} onChange={(e) => setNewName(e.target.value)}
              placeholder="Team name" aria-label="Team name" />
            <OpsSelect aria-label="Department" size="sm" value={newDept} onValueChange={setNewDept}
              options={[{ value: "__none__", label: "No department" },
                ...(departments.data ?? []).map((d) => ({ value: d.id, label: d.name }))]} />
            <Button size="sm" disabled={!newName.trim() || actions.create.isPending}
              onClick={async () => {
                await actions.create.mutateAsync({
                  name: newName, departmentId: newDept === "__none__" ? null : newDept,
                });
                setNewName(""); setNewDept("__none__"); setCreating(false);
              }}>
              {actions.create.isPending && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />} Create
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setCreating(false)}>Cancel</Button>
          </div>
        )}

        {outcome && (
          <p className="mb-3 rounded-lg border border-blue-500/30 bg-blue-500/10 px-3 py-2 text-xs text-blue-900">
            {outcome.result.kind === "deleted"
              ? `${outcome.name} was deleted — nothing pointed at it.`
              : `${outcome.name} was archived rather than deleted: it still holds ${outcome.result.because}. Everything it held keeps working; the team is out of the active lists.`}
          </p>
        )}
        {error && <p className="mb-3 text-xs text-red-700">{error}</p>}

        {wf.isLoading ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            <Loader2 className="mr-2 inline h-4 w-4 animate-spin" /> Loading teams…
          </p>
        ) : live.length === 0 ? (
          <Empty title="No teams yet"
            hint="A team is who does the work together. Assignment, scope and reporting all read it, so it is worth naming them the way BES actually works." />
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {live.map((t) => (
              <TeamCard key={t.id} team={t} people={people} canManage={canManage}
                departments={departments.data ?? []}
                onRemoved={(result) => { setOutcome({ name: t.name, result }); setError(null); }}
                onError={setError} />
            ))}
          </div>
        )}
      </ContentCard>

      {archived.length > 0 && (
        <ContentCard title={`Archived teams · ${archived.length}`}>
          <p className="mb-2 text-xs text-muted-foreground">
            Out of the active lists, and still attached to everything they held.
          </p>
          <ul className="divide-y divide-border/50">
            {archived.map((t) => (
              <li key={t.id} className="flex items-center justify-between gap-2 py-2">
                <span className="text-sm text-foreground">{t.name}</span>
                {canManage && (
                  <Button size="sm" variant="ghost" className="h-7 px-2 text-xs"
                    onClick={() => actions.restore.mutate(t.id)}>
                    <Undo2 className="mr-1 h-3.5 w-3.5" /> Restore
                  </Button>
                )}
              </li>
            ))}
          </ul>
        </ContentCard>
      )}
    </div>
  );
}

function TeamCard({ team, people, canManage, departments, onRemoved, onError }: {
  team: AgencyTeam;
  people: { userId: string; name: string; role: string }[];
  canManage: boolean;
  departments: { id: string; name: string; assignmentMode?: "auto_equal" | "team_lead" }[];
  onRemoved: (r: RemoveTeamOutcome) => void;
  onError: (m: string) => void;
}) {
  const actions = useTeamActions();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(team.name);
  /* Null for a team with no department, and for FundingOps or BES CRM teams
     — the CreditOps routing engine is the only one with a policy today. */
  const assignmentMode = departments.find((d) => d.id === team.departmentId)?.assignmentMode ?? null;
  const [dept, setDept] = useState("__none__");
  const [adding, setAdding] = useState(false);
  const [addUser, setAddUser] = useState("");
  const [confirming, setConfirming] = useState(false);

  const nameOf = (id: string) => people.find((p) => p.userId === id)?.name ?? "Team member";
  const onTeam = new Set(team.members.map((m) => m.userId));
  const available = people.filter((p) => !onTeam.has(p.userId));

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        {editing && canManage ? (
          <div className="flex flex-wrap items-end gap-2">
            <Input className="h-8 w-44" value={name} onChange={(e) => setName(e.target.value)}
              aria-label={`Rename ${team.name}`} />
            <OpsSelect aria-label="Department" size="sm" value={dept} onValueChange={setDept}
              options={[{ value: "__none__", label: "Keep department" },
                ...departments.map((d) => ({ value: d.id, label: d.name }))]} />
            <Button size="sm" disabled={!name.trim() || actions.update.isPending}
              onClick={async () => {
                await actions.update.mutateAsync({
                  id: team.id, name,
                  ...(dept === "__none__" ? {} : { departmentId: dept }),
                });
                setEditing(false);
              }}>Save</Button>
            <Button size="sm" variant="ghost" onClick={() => { setName(team.name); setEditing(false); }}>
              Cancel
            </Button>
          </div>
        ) : (
          <div className="min-w-0">
            <p className="text-sm font-bold text-foreground">{team.name}</p>
            <p className="text-xs text-muted-foreground">
              {[team.division, team.department].filter(Boolean).join(" · ") || "No department"}
            </p>
            {/* How work reaches a person in this department. Shown here
                because this is where somebody adds members and then wonders
                what happens next (Dee, 2026-09-12). */}
            {assignmentMode && (
              <p className="mt-1 inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">
                {assignmentMode === "auto_equal"
                  ? "Assignment: automatic, shared evenly"
                  : "Assignment: the Team Lead assigns each file"}
              </p>
            )}
          </div>
        )}
        {canManage && !editing && (
          <span className="flex shrink-0 gap-1">
            <Button size="sm" variant="ghost" className="h-7 px-2"
              aria-label={`Rename ${team.name}`} onClick={() => setEditing(true)}>
              <Pencil className="h-3.5 w-3.5" />
            </Button>
            <Button size="sm" variant="ghost" className="h-7 px-2"
              aria-label={`Remove ${team.name}`} onClick={() => setConfirming((v) => !v)}>
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </span>
        )}
      </div>

      {confirming && canManage && (
        <div className="mt-2 rounded-lg border border-amber-500/40 bg-amber-500/10 p-2.5 text-xs text-amber-900">
          <p>
            Remove <strong>{team.name}</strong>? If anything still points at it — work, clients,
            a partner or a service — it is archived instead, and nothing it holds is disturbed.
          </p>
          <div className="mt-2 flex gap-2">
            <Button size="sm" variant="destructive" disabled={actions.remove.isPending}
              onClick={async () => {
                try {
                  onRemoved(await actions.remove.mutateAsync(team.id));
                } catch (e) { onError((e as Error).message); }
                setConfirming(false);
              }}>
              {actions.remove.isPending && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />} Remove
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setConfirming(false)}>Keep it</Button>
          </div>
          {/* The owner can destroy it outright instead. Separate control and
              separate words, because archiving and deleting are different
              answers to "get rid of this". */}
          <OwnerDeleteButton table="teams" id={team.id} name={team.name}
            className="mt-1 h-7 px-2 text-xs" onDeleted={() => setConfirming(false)} />
        </div>
      )}

      <div className="mt-3">
        <div className="flex items-center justify-between">
          <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
            Members · {team.members.length}
          </p>
          {canManage && (
            <Button size="sm" variant="ghost" className="h-6 px-2 text-[11px]"
              onClick={() => setAdding((v) => !v)}>
              <UserPlus className="mr-1 h-3 w-3" /> Add
            </Button>
          )}
        </div>

        {adding && canManage && (
          <div className="mt-1.5 flex flex-wrap items-end gap-2">
            <OpsSelect aria-label={`Add somebody to ${team.name}`} size="sm"
              value={addUser || "__none__"} onValueChange={setAddUser}
              options={[{ value: "__none__", label: available.length ? "Choose a person" : "Everybody is already on it" },
                ...available.map((p) => ({ value: p.userId, label: p.name }))]} />
            <Button size="sm" disabled={!addUser || addUser === "__none__" || actions.addMember.isPending}
              onClick={async () => {
                await actions.addMember.mutateAsync({ teamId: team.id, userId: addUser });
                setAddUser(""); setAdding(false);
              }}>Add</Button>
          </div>
        )}

        {team.members.length === 0 ? (
          <p className="mt-1.5 text-xs text-muted-foreground">Nobody on this team yet.</p>
        ) : (
          <ul className="mt-1.5 space-y-1">
            {team.members.map((m) => (
              <li key={m.userId} className="flex items-center justify-between gap-2">
                <span className="flex min-w-0 items-center gap-1.5 text-sm text-foreground">
                  {/* The SAME canonical person Teams shows — clicking opens
                      their one profile, never a team-local copy (§47). */}
                  <Link to={`/app/people/${m.userId}`} className="truncate hover:underline">{nameOf(m.userId)}</Link>
                  {m.isLead && <Pill tone="border-amber-500/40 bg-amber-500/10 text-amber-800">lead</Pill>}
                </span>
                {canManage && (
                  <span className="flex shrink-0 gap-0.5">
                    <Button size="sm" variant="ghost" className="h-6 px-1.5"
                      aria-label={m.isLead ? `Remove lead from ${nameOf(m.userId)}` : `Make ${nameOf(m.userId)} lead`}
                      onClick={() => actions.setLead.mutate({ teamId: team.id, userId: m.userId, isLead: !m.isLead })}>
                      <Star className={`h-3.5 w-3.5 ${m.isLead ? "fill-amber-400 text-amber-500" : "text-muted-foreground"}`} />
                    </Button>
                    <Button size="sm" variant="ghost" className="h-6 px-1.5"
                      aria-label={`Take ${nameOf(m.userId)} off ${team.name}`}
                      onClick={() => actions.removeMember.mutate({ teamId: team.id, userId: m.userId })}>
                      <X className="h-3.5 w-3.5 text-muted-foreground" />
                    </Button>
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
