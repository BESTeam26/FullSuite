/**
 * Who may work this account.
 *
 * These rows are what `can_see_partner()` reads, so this panel is not a record
 * of a decision made elsewhere — it IS the decision. Adding a team here makes
 * the partner appear for everybody on that team; ending an assignment makes it
 * disappear for whoever it named, unless something else still grants it.
 *
 * Ended assignments stay on the list, greyed, with their dates. Who ran an
 * account is part of its history and does not change hands when the account
 * does (rule 4).
 */
import { useState } from "react";
import { Loader2, Plus, Star, UserPlus, Users } from "lucide-react";
import { ContentCard } from "@/components/dashboard/DivisionLayout";
import { Button } from "@/components/ui/button";
import { OpsSelect } from "@/components/ui/ops-select";
import { Empty, Pill } from "@/components/agency/partner/partner-ui";
import { usePartnerAssignments, useAssignmentActions } from "@/lib/data/use-partner-assignments";
import { useAgencyPermissions } from "@/lib/data/agency-permissions";
import { ASSIGNMENT_ROLE_LABEL, type AssignmentRole } from "@/lib/data/partner-assignments";
import type { AgencyPerson, AgencyTeam } from "@/lib/data/agency-workforce";
import type { PartnerService } from "@/lib/data/partner-services";
import { formatDate } from "@/lib/format-date";
import { cn } from "@/lib/utils";

const ROLES: AssignmentRole[] = [
  "account_manager", "operations_manager", "processor", "support", "specialist", "assigned",
];

export function PartnerAssignments({ groupId, people, teams, services }: {
  groupId: string;
  people: AgencyPerson[];
  teams: AgencyTeam[];
  services: PartnerService[];
}) {
  const assignments = usePartnerAssignments(groupId);
  const actions = useAssignmentActions(groupId);
  const perms = useAgencyPermissions();
  const canAssign = perms.can("partners.assignments");

  const [adding, setAdding] = useState(false);
  const [kind, setKind] = useState<"team" | "user">("team");
  const [who, setWho] = useState("__none__");
  const [role, setRole] = useState<AssignmentRole>("assigned");
  const [serviceId, setServiceId] = useState("__all__");
  const [primary, setPrimary] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const rows = assignments.data ?? [];
  const liveRows = rows.filter((a) => !a.endedOn);
  const past = rows.filter((a) => a.endedOn);

  const nameOf = (a: { userId: string | null; teamId: string | null }) =>
    a.userId
      ? people.find((p) => p.userId === a.userId)?.name ?? "Somebody"
      : teams.find((t) => t.id === a.teamId)?.name ?? "A team";
  const serviceName = (id: string | null) =>
    id ? services.find((s) => s.id === id)?.name ?? "a service" : null;

  return (
    <ContentCard
      title="Who works this account"
      action={canAssign && (
        <Button size="sm" variant="ghost" onClick={() => { setError(null); setAdding((v) => !v); }}>
          <Plus className="mr-1.5 h-3.5 w-3.5" /> Assign
        </Button>
      )}
    >
      {adding && canAssign && (
        <div className="mb-3 space-y-2 rounded-lg border border-border bg-muted/30 p-3">
          <div className="flex flex-wrap items-end gap-2">
            <OpsSelect aria-label="Assign a team or a person" size="sm" value={kind}
              onValueChange={(v) => { setKind(v as "team" | "user"); setWho("__none__"); }}
              options={[
                { value: "team", label: "A team" },
                { value: "user", label: "One person" },
              ]} />
            <OpsSelect aria-label={kind === "team" ? "Which team" : "Which person"} size="sm"
              value={who} onValueChange={setWho}
              options={[
                { value: "__none__", label: kind === "team" ? "Choose a team" : "Choose a person" },
                ...(kind === "team"
                  ? teams.filter((t) => !t.archived).map((t) => ({ value: t.id, label: t.name }))
                  : people.map((p) => ({ value: p.userId, label: p.name }))),
              ]} />
            <OpsSelect aria-label="Assignment role" size="sm" value={role}
              onValueChange={(v) => setRole(v as AssignmentRole)}
              options={ROLES.map((r) => ({ value: r, label: ASSIGNMENT_ROLE_LABEL[r] }))} />
            <OpsSelect aria-label="Which service" size="sm" value={serviceId} onValueChange={setServiceId}
              options={[
                { value: "__all__", label: "The whole account" },
                ...services.map((s) => ({ value: s.id, label: s.name })),
              ]} />
            {kind === "user" && role === "account_manager" && (
              <label className="flex items-center gap-1.5 text-xs text-foreground">
                <input type="checkbox" checked={primary} onChange={(e) => setPrimary(e.target.checked)} />
                Primary
              </label>
            )}
            <Button size="sm" disabled={who === "__none__" || actions.assign.isPending}
              onClick={async () => {
                setError(null);
                try {
                  await actions.assign.mutateAsync({
                    ...(kind === "team" ? { teamId: who } : { userId: who }),
                    role,
                    serviceId: serviceId === "__all__" ? null : serviceId,
                    isPrimary: kind === "user" && role === "account_manager" && primary,
                  });
                  setWho("__none__"); setPrimary(false); setAdding(false);
                } catch (e) { setError((e as Error).message); }
              }}>
              {actions.assign.isPending && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />} Assign
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setAdding(false)}>Cancel</Button>
          </div>
          <p className="text-[11px] text-muted-foreground">
            Assigning a <strong>team</strong> is usually the right choice: everybody who joins it
            gains this partner and everybody who leaves loses it, with nothing to clean up here.
            {primary && " Making somebody primary ends the current account manager's assignment."}
          </p>
          {error && <p className="text-xs text-red-700">{error}</p>}
        </div>
      )}

      {assignments.isLoading ? (
        <p className="py-4 text-center text-sm text-muted-foreground">
          <Loader2 className="mr-2 inline h-4 w-4 animate-spin" /> Loading…
        </p>
      ) : liveRows.length === 0 ? (
        <Empty title="Nobody is assigned"
          hint="Only an owner or administrator can see this partner until somebody is. Assign a team to put it in front of the people who work it." />
      ) : (
        <ul className="divide-y divide-border/50">
          {liveRows.map((a) => (
            <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <span className="flex min-w-0 items-center gap-2">
                {a.teamId ? <Users className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                          : <UserPlus className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />}
                <span className="min-w-0">
                  <span className="flex flex-wrap items-center gap-1.5 text-sm font-medium text-foreground">
                    {nameOf(a)}
                    {a.isPrimary && <Star className="h-3 w-3 fill-amber-400 text-amber-500" aria-label="Primary account manager" />}
                    <Pill tone="border-border bg-muted text-muted-foreground">
                      {ASSIGNMENT_ROLE_LABEL[a.role]}
                    </Pill>
                  </span>
                  <span className="block text-[11px] text-muted-foreground">
                    {serviceName(a.serviceId) ?? "The whole account"} · since {formatDate(a.startedOn)}
                    {a.teamId && " · inherited by everyone on the team"}
                  </span>
                </span>
              </span>
              {canAssign && (
                <Button size="sm" variant="ghost" className="h-7 px-2 text-xs"
                  onClick={() => actions.end.mutate(a.id)}>
                  End
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}

      {past.length > 0 && (
        <details className="mt-3">
          <summary className="cursor-pointer text-xs font-medium text-muted-foreground hover:text-foreground">
            {past.length} past assignment{past.length === 1 ? "" : "s"}
          </summary>
          <ul className="mt-1.5 space-y-1">
            {past.map((a) => (
              <li key={a.id} className={cn("text-xs text-muted-foreground")}>
                {nameOf(a)} · {ASSIGNMENT_ROLE_LABEL[a.role]} ·{" "}
                {formatDate(a.startedOn)} to {formatDate(a.endedOn)}
              </li>
            ))}
          </ul>
        </details>
      )}
    </ContentCard>
  );
}
