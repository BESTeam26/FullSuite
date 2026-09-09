/**
 * The BES roster — who is here, what they may do, and who has left.
 *
 * ── LEAVING IS NOT DELETING ────────────────────────────────────────────────
 *
 * Dee's rule, from the first time this came up: "do not solve inactive users
 * by deleting their membership or changing their role." Both destroy
 * something. Deleting cascades away who worked what; demoting rewrites what
 * they WERE when they did it. Historical attribution does not change when a
 * current assignment does (rule 4).
 *
 * So somebody who leaves is marked inactive. They keep their role and their
 * name on every record they touched, and disappear from the places a CURRENT
 * person belongs: the roster, the assignee pickers, the team lists.
 *
 * ── TWO RULES THE DATABASE ENFORCES, NOT THIS SCREEN ───────────────────────
 *
 * An owner cannot be deactivated, and the last active owner cannot be demoted
 * — an agency with no owner cannot appoint one. Both live in the RPC, so a
 * request that skipped this screen is refused just the same.
 */
import { useState } from "react";
import { Link } from "react-router-dom";
import { Loader2, Search, UserMinus, Undo2, X } from "lucide-react";
import { ContentCard } from "@/components/dashboard/DivisionLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { OpsSelect } from "@/components/ui/ops-select";
import { Empty, Pill } from "@/components/agency/partner/partner-ui";
import { useAgencyMembers, useMemberActions, useTeamActions } from "@/lib/data/use-agency-teams";
import { useOrganizationTree } from "@/lib/data/use-organization-structure";
import { useWorkforce } from "@/lib/data/use-workforce";
import { useAuth } from "@/lib/auth/auth-context";
import { OwnerDeleteButton } from "@/components/agency/OwnerDeleteButton";
import { formatDate } from "@/lib/format-date";
import type { Enums } from "@/lib/supabase/database.types";
import { ACCESS_PROFILES, ACCESS_PROFILE_LABELS, memberAccessLabel } from "@/lib/data/agency-invitations";

const ROLES: { value: Enums<"agency_role">; label: string }[] = [
  { value: "agency_admin", label: "Agency Admin" },
  { value: "agency_user", label: "Agency User" },
];
const PROFILE_OPTIONS = ACCESS_PROFILES.map((v) => ({ value: v, label: ACCESS_PROFILE_LABELS[v] }));

export function PeopleManager() {
  const { agencyMembership, user } = useAuth();
  const canManage = agencyMembership?.role === "agency_owner"
    || agencyMembership?.role === "agency_admin";
  const members = useAgencyMembers();
  const wf = useWorkforce();
  const actions = useMemberActions();
  const teamActions = useTeamActions();
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(null);

  const liveTeams = (wf.data?.teams ?? []).filter((t) => !t.archived);
  const teamsOf = new Map<string, { id: string; name: string; isLead: boolean }[]>();
  for (const t of liveTeams) {
    for (const m of t.members) {
      teamsOf.set(m.userId, [...(teamsOf.get(m.userId) ?? []), { id: t.id, name: t.name, isLead: m.isLead }]);
    }
  }
  /* One person, many teams (Dee, §7). The dropdown ADDS a membership rather
     than replacing one, because a second team is an addition to where somebody
     works, not a correction of it. */
  const tree = useOrganizationTree();
  const placeOf = (userId: string) => {
    const onTeams = teamsOf.get(userId) ?? [];
    const first = onTeams[0];
    const dept = (tree.data?.departments ?? []).find(
      (d) => d.id === (tree.data?.teams ?? []).find((t) => t.id === first?.id)?.departmentId);
    const div = (tree.data?.divisions ?? []).find((v) => v.id === dept?.divisionId);
    return { division: div?.name ?? null, department: dept?.name ?? null };
  };

  const all = members.data ?? [];
  const needle = search.trim().toLowerCase();
  const match = (m: { name: string; email: string }) =>
    !needle || `${m.name} ${m.email}`.toLowerCase().includes(needle);
  const active = all.filter((m) => m.status === "active" && match(m));
  const inactive = all.filter((m) => m.status === "inactive" && match(m));

  const change = async (fn: () => Promise<unknown>) => {
    setError(null);
    try { await fn(); } catch (e) { setError((e as Error).message); }
  };

  return (
    <div className="space-y-3">
      <ContentCard
        title={`Agency staff · ${active.length}`}
        action={
          <div className="relative">
            <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input className="h-8 w-48 pl-7" value={search} onChange={(e) => setSearch(e.target.value)}
              placeholder="Find somebody" aria-label="Find somebody" />
          </div>
        }
      >
        {error && <p className="mb-2 text-xs text-red-700">{error}</p>}

        {members.isLoading ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            <Loader2 className="mr-2 inline h-4 w-4 animate-spin" /> Loading the roster…
          </p>
        ) : active.length === 0 ? (
          <Empty title={needle ? "Nobody matches" : "No staff visible to you"} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[36rem] text-left text-sm">
              <thead>
                <tr className="border-b border-border/60 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                  <th className="py-2 pr-2">Name</th>
                  <th className="py-2 pr-2">Role</th>
                  <th className="py-2 pr-2">Division · department</th>
                  <th className="py-2 pr-2">Teams</th>
                  <th className="py-2 pr-2">Since</th>
                  <th className="py-2" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                {active.map((m) => (
                  <tr key={m.membershipId} className="transition-colors hover:bg-muted/40">
                    <td className="py-2 pr-2">
                      <Link to={`/app/people/${m.userId}`} className="block font-medium text-foreground hover:underline">
                        {m.name}
                      </Link>
                      <span className="block text-xs text-muted-foreground">{m.email}</span>
                    </td>
                    <td className="py-2 pr-2">
                      {canManage ? (
                        <span className="flex flex-wrap items-center gap-1.5">
                          <OpsSelect aria-label={`Security role for ${m.name}`} size="sm" value={m.role}
                            onValueChange={(v) => change(() => actions.setRole.mutateAsync({
                              membershipId: m.membershipId, role: v as Enums<"agency_role">,
                            }))}
                            options={ROLES} />
                          {/* The PRESET an Agency User starts from — not a second
                              security role, and meaningless for admins, whose role
                              already grants everything. */}
                          {m.role === "agency_user" && (
                            <OpsSelect aria-label={`Access profile for ${m.name}`} size="sm"
                              value={m.accessProfile ?? "custom"}
                              onValueChange={(v) => change(() => actions.setProfile.mutateAsync({
                                membershipId: m.membershipId, profile: v as Enums<"access_profile">,
                              }))}
                              options={PROFILE_OPTIONS} />
                          )}
                        </span>
                      ) : (
                        <Pill tone="border-border bg-muted text-foreground">{memberAccessLabel(m.role, m.accessProfile)}</Pill>
                      )}
                    </td>
                    <td className="py-2 pr-2 text-xs text-muted-foreground">
                      {[placeOf(m.userId).division, placeOf(m.userId).department]
                        .filter(Boolean).join(" · ") || "—"}
                    </td>
                    <td className="py-2 pr-2">
                      <span className="flex flex-wrap items-center gap-1">
                        {(teamsOf.get(m.userId) ?? []).map((t) => (
                          <span key={t.id} className="flex items-center gap-0.5">
                            <Pill tone="border-border bg-muted text-foreground">
                              {t.name}{t.isLead && " · lead"}
                            </Pill>
                            {canManage && (
                              <button type="button" aria-label={`Take ${m.name} off ${t.name}`}
                                className="text-muted-foreground transition-colors hover:text-foreground"
                                onClick={() => change(() => teamActions.removeMember.mutateAsync({
                                  teamId: t.id, userId: m.userId,
                                }))}>
                                <X className="h-3 w-3" />
                              </button>
                            )}
                          </span>
                        ))}
                        {(teamsOf.get(m.userId) ?? []).length === 0 && (
                          <span className="text-xs text-muted-foreground">Not on a team</span>
                        )}
                        {canManage && (
                          <OpsSelect aria-label={`Add ${m.name} to a team`} size="inline"
                            value="__add__"
                            onValueChange={(teamId) => {
                              if (teamId === "__add__") return;
                              void change(() => teamActions.addMember.mutateAsync({
                                teamId, userId: m.userId,
                              }));
                            }}
                            options={[
                              { value: "__add__", label: "+ team" },
                              ...liveTeams
                                .filter((t) => !(teamsOf.get(m.userId) ?? []).some((x) => x.id === t.id))
                                .map((t) => ({ value: t.id, label: t.name })),
                            ]} />
                        )}
                      </span>
                    </td>
                    <td className="py-2 pr-2 text-xs text-muted-foreground">{formatDate(m.since)}</td>
                    <td className="py-2 text-right">
                      {canManage && m.userId !== user?.id && !m.isOwner && m.role !== "agency_owner" && (
                        <span className="flex items-center justify-end gap-1">
                          <Button size="sm" variant="ghost" className="h-7 px-2 text-xs"
                            onClick={() => change(() => actions.setStatus.mutateAsync({
                              membershipId: m.membershipId, status: "inactive",
                            }))}>
                            <UserMinus className="mr-1 h-3.5 w-3.5" /> Deactivate
                          </Button>
                          {/* Owner only, and absent for everybody else — Dee's
                              rule: no other administrator may delete a people
                              record. Deactivating is what an admin has. */}
                          <OwnerDeleteButton table="agency_memberships" id={m.membershipId}
                            name={m.name} className="h-7 px-2 text-xs" />
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <p className="mt-3 text-[11px] text-muted-foreground">
          Deactivating keeps somebody's role and everything they ever did — it only takes them out
          of the roster, the assignee pickers and the team lists. Nobody is deleted, and history
          never changes hands.
        </p>
      </ContentCard>

      {inactive.length > 0 && (
        <ContentCard title={`No longer active · ${inactive.length}`}>
          <ul className="divide-y divide-border/50">
            {inactive.map((m) => (
              <li key={m.membershipId} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span className="min-w-0">
                  <span className="block text-sm text-foreground">{m.name}</span>
                  <span className="block text-xs text-muted-foreground">
                    {memberAccessLabel(m.role, m.accessProfile)} · left {formatDate(m.deactivatedAt)}
                  </span>
                </span>
                {canManage && (
                  <Button size="sm" variant="ghost" className="h-7 px-2 text-xs"
                    onClick={() => change(() => actions.setStatus.mutateAsync({
                      membershipId: m.membershipId, status: "active",
                    }))}>
                    <Undo2 className="mr-1 h-3.5 w-3.5" /> Bring back
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
