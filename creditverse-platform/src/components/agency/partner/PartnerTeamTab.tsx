/**
 * Who at BES runs this partner.
 *
 * ── ASSIGNMENT IS WHAT MAKES A PARTNER VISIBLE ─────────────────────────────
 *
 * Not decoration. `can_see_partner()` reads these rows: an owner or admin sees
 * every partner, and everybody else sees the ones assigned to them, to a live
 * team they are on, or to a team in a department they manage. Removing an
 * assignment removes the partner from that person's list.
 *
 * A TEAM assignment is the one worth making — everybody who joins the team
 * inherits it, everybody who leaves loses it, and nobody edits partners
 * one by one (Dee, §20).
 *
 * Assignments END rather than vanish, so who ran the account in March is still
 * answerable after it changes hands.
 *
 * Three assignments that are easy to confuse:
 *
 *   ACCOUNT MANAGER / TEAM   the relationship. Set on the partner.
 *   PROCESSOR / TEAM         one service. Set on that engagement.
 *   PARTNER ASSIGNMENT       who may WORK the account. Set here.
 *
 * ClickUp conflated a third thing with both — the task assignee — so "assigned
 * to Support Team" could mean the account is theirs, the work is theirs, or
 * somebody was tagged on a card. Kept apart here, and neither of them is the
 * partner's own business owner, which is a Contact.
 */
import { useState } from "react";
import { Loader2 } from "lucide-react";
import { ContentCard } from "@/components/dashboard/DivisionLayout";
import { Button } from "@/components/ui/button";
import { OpsSelect } from "@/components/ui/ops-select";
import { Detail } from "@/components/agency/partner/partner-ui";
import { usePartnerActions } from "@/lib/data/use-agency-partners";
import { useAgencyPermissions } from "@/lib/data/agency-permissions";
import { PartnerAssignments } from "@/components/agency/partner/PartnerAssignments";
import type { AgencyPartner } from "@/lib/data/agency-partners";
import type { PartnerService } from "@/lib/data/partner-services";
import type { AgencyPerson, AgencyTeam } from "@/lib/data/agency-workforce";

export function PartnerTeamTab({ partner, services, people, teams }: {
  partner: AgencyPartner;
  services: PartnerService[];
  people: AgencyPerson[];
  teams: AgencyTeam[];
}) {
  const actions = usePartnerActions();
  const perms = useAgencyPermissions();
  const canAssign = perms.can("partners.assignments");
  const [editing, setEditing] = useState(false);
  const [manager, setManager] = useState(partner.accountManagerId ?? "__none__");
  const [team, setTeam] = useState(partner.teamId ?? "__none__");

  const name = (id: string | null) => people.find((p) => p.userId === id)?.name ?? null;
  const teamName = (id: string | null) => teams.find((t) => t.id === id)?.name ?? null;

  return (
    <div className="space-y-3">
      <PartnerAssignments groupId={partner.id} people={people} teams={teams} services={services} />
      <ContentCard
        title="Account assignment"
        action={canAssign && (
          <Button size="sm" variant="ghost" onClick={() => setEditing((v) => !v)}>
            {editing ? "Cancel" : "Change"}
          </Button>
        )}
      >
        {editing && canAssign ? (
          <div className="flex flex-wrap items-end gap-2">
            <OpsSelect aria-label="Account manager" size="field" value={manager} onValueChange={setManager}
              options={[{ value: "__none__", label: "No account manager" },
                ...people.map((p) => ({ value: p.userId, label: `${p.name} · ${p.role.replace("agency_", "")}` }))]} />
            <OpsSelect aria-label="Team" size="field" value={team} onValueChange={setTeam}
              options={[{ value: "__none__", label: "No team" },
                ...teams.filter((t) => !t.archived).map((t) => ({ value: t.id, label: t.name }))]} />
            <Button size="sm" disabled={actions.update.isPending}
              onClick={async () => {
                await actions.update.mutateAsync({
                  id: partner.id,
                  patch: {
                    accountManagerId: manager === "__none__" ? null : manager,
                    teamId: team === "__none__" ? null : team,
                  },
                });
                setEditing(false);
              }}>
              {actions.update.isPending && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />} Save
            </Button>
          </div>
        ) : (
          <dl className="grid gap-3 sm:grid-cols-2">
            <Detail label="Account manager" value={name(partner.accountManagerId)}
              hint="Owns the relationship — not necessarily the person doing the work" />
            <Detail label="Team" value={teamName(partner.teamId)} />
          </dl>
        )}
      </ContentCard>

      <ContentCard title="Who runs each service">
        {services.length === 0 ? (
          <p className="py-4 text-sm text-muted-foreground">
            No services yet, so nothing to staff. Assignment per engagement is set on the
            Services tab.
          </p>
        ) : (
          <ul className="divide-y divide-border/50">
            {services.map((s) => (
              <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span className="text-sm font-medium text-foreground">{s.name}</span>
                <span className="text-xs text-muted-foreground">
                  {[name(s.processorId), teamName(s.teamId)].filter(Boolean).join(" · ") || "Nobody assigned"}
                </span>
              </li>
            ))}
          </ul>
        )}
      </ContentCard>
    </div>
  );
}
