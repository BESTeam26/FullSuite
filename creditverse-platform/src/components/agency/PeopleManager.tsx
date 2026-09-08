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
import { Loader2, Search, UserMinus, Undo2 } from "lucide-react";
import { ContentCard } from "@/components/dashboard/DivisionLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { OpsSelect } from "@/components/ui/ops-select";
import { Empty, Pill } from "@/components/agency/partner/partner-ui";
import { useAgencyMembers, useMemberActions } from "@/lib/data/use-agency-teams";
import { useWorkforce } from "@/lib/data/use-workforce";
import { useAuth } from "@/lib/auth/auth-context";
import { formatDate } from "@/lib/format-date";
import type { Enums } from "@/lib/supabase/database.types";

const ROLES: { value: Enums<"agency_role">; label: string }[] = [
  { value: "agency_owner", label: "Owner" },
  { value: "agency_admin", label: "Administrator" },
  { value: "agency_manager", label: "Manager" },
  { value: "agency_team_lead", label: "Team lead" },
  { value: "agency_agent", label: "Agent" },
];
const ROLE_LABEL = Object.fromEntries(ROLES.map((r) => [r.value, r.label]));

export function PeopleManager() {
  const { agencyMembership, user } = useAuth();
  const canManage = agencyMembership?.role === "agency_owner"
    || agencyMembership?.role === "agency_admin";
  const members = useAgencyMembers();
  const wf = useWorkforce();
  const actions = useMemberActions();
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(null);

  const teamsOf = new Map<string, string[]>();
  for (const t of wf.data?.teams ?? []) {
    if (t.archived) continue;
    for (const m of t.members) teamsOf.set(m.userId, [...(teamsOf.get(m.userId) ?? []), t.name]);
  }

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
                  <th className="py-2 pr-2">Teams</th>
                  <th className="py-2 pr-2">Since</th>
                  <th className="py-2" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                {active.map((m) => (
                  <tr key={m.membershipId} className="transition-colors hover:bg-muted/40">
                    <td className="py-2 pr-2">
                      <span className="block font-medium text-foreground">{m.name}</span>
                      <span className="block text-xs text-muted-foreground">{m.email}</span>
                    </td>
                    <td className="py-2 pr-2">
                      {canManage ? (
                        <OpsSelect aria-label={`Role for ${m.name}`} size="sm" value={m.role}
                          onValueChange={(v) => change(() => actions.setRole.mutateAsync({
                            membershipId: m.membershipId, role: v as Enums<"agency_role">,
                          }))}
                          options={ROLES} />
                      ) : (
                        <Pill tone="border-border bg-muted text-foreground">{ROLE_LABEL[m.role]}</Pill>
                      )}
                    </td>
                    <td className="py-2 pr-2 text-xs text-muted-foreground">
                      {(teamsOf.get(m.userId) ?? []).join(", ") || "—"}
                    </td>
                    <td className="py-2 pr-2 text-xs text-muted-foreground">{formatDate(m.since)}</td>
                    <td className="py-2 text-right">
                      {canManage && m.userId !== user?.id && m.role !== "agency_owner" && (
                        <Button size="sm" variant="ghost" className="h-7 px-2 text-xs"
                          onClick={() => change(() => actions.setStatus.mutateAsync({
                            membershipId: m.membershipId, status: "inactive",
                          }))}>
                          <UserMinus className="mr-1 h-3.5 w-3.5" /> Deactivate
                        </Button>
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
                    {ROLE_LABEL[m.role]} · left {formatDate(m.deactivatedAt)}
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
