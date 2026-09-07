/**
 * Per-user access, the way GHL does it: pick a person, flip what they may do.
 *
 * ── WHAT A SWITCH HERE ACTUALLY IS ─────────────────────────────────────────
 *
 * An EXCEPTION, not the whole answer. Precedence, resolved identically here
 * and in `agency_can`:
 *
 *   owner / admin → everything
 *   → this person's own explicit grant or denial
 *     → their agency's default for that role
 *       → the platform default for that role
 *         → no
 *
 * Which is why each row says where its answer came from. A manager who cannot
 * see partner financials is not "switched off" — they are at their role's
 * default, and knowing the difference is what stops somebody flipping a switch
 * that was never on.
 *
 * ── ALL ACCESS ─────────────────────────────────────────────────────────────
 *
 * Grants every capability in the catalogue as explicit exceptions. It does NOT
 * bypass tenant or partner isolation, suspension, archive state, or an
 * unfinished module — those are not capabilities and are not reachable from
 * here. A capability answers "may this person do X"; it never answers "whose
 * rows are these", which is RLS's question and stays RLS's question.
 *
 * ── AND IT IS NOT THE PROTECTION ───────────────────────────────────────────
 *
 * Every switch writes through `set_agency_permission`, which re-checks that
 * the caller is an agency admin and records who changed what. Turning a switch
 * off does not hide a field — the financial tables live behind their own
 * policies, so an unauthorized query returns nothing to hide.
 */
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, ShieldCheck, Search } from "lucide-react";
import { ContentCard } from "@/components/dashboard/DivisionLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Pill } from "@/components/agency/partner/partner-ui";
import {
  AGENCY_PERMISSIONS, clearAgencyPermission, effectiveAgencyPermission,
  fetchAgencyAccess, fetchPermissionCatalogue, setAgencyPermission,
  useAgencyPermissions,
} from "@/lib/data/agency-permissions";
import { useAuth } from "@/lib/auth/auth-context";
import { cn } from "@/lib/utils";

const ROLE_LABEL: Record<string, string> = {
  agency_owner: "Owner",
  agency_admin: "Administrator",
  agency_manager: "Manager",
  agency_team_lead: "Team lead",
  agency_agent: "Agent",
};

export function AgencyAccessPanel() {
  const auth = useAuth();
  const qc = useQueryClient();
  const perms = useAgencyPermissions();
  const agencyId = auth.agencyId ?? "";
  const isAdmin = auth.agencyMembership?.role === "agency_owner"
    || auth.agencyMembership?.role === "agency_admin";

  const access = useQuery({
    queryKey: ["agency", "access", agencyId],
    queryFn: () => fetchAgencyAccess(agencyId),
    enabled: !!agencyId && isAdmin,
    staleTime: 30_000,
  });
  const catalogue = useQuery({
    queryKey: ["agency", "permission-catalogue"],
    queryFn: fetchPermissionCatalogue,
    enabled: !!agencyId && isAdmin,
    staleTime: 600_000,
  });

  const [selected, setSelected] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const change = useMutation({
    mutationFn: async (v: { membershipId: string; key: string; allowed: boolean | null }) => {
      if (v.allowed === null) return clearAgencyPermission(v.membershipId, v.key);
      return setAgencyPermission(v.membershipId, v.key, v.allowed);
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["agency", "access"] });
      /* The person changed may be the person looking: their own resolved
         capabilities have to be refetched or the menu goes stale. */
      void qc.invalidateQueries({ queryKey: ["agency", "my-permissions"] });
    },
  });

  const grouped = useMemo(() => {
    const byModule = new Map<string, typeof catalogue.data extends undefined ? never : NonNullable<typeof catalogue.data>["keys"]>();
    for (const k of catalogue.data?.keys ?? []) {
      byModule.set(k.module, [...(byModule.get(k.module) ?? []), k]);
    }
    return [...byModule.entries()];
  }, [catalogue.data]);

  if (!isAdmin) {
    /* Not "you are not allowed to see this" — the panel is simply not part of
       the page for anybody else (Dee: if they don't have access, do not show
       it). This branch exists because the component may still be mounted while
       the role resolves. */
    return null;
  }
  if (perms.loading || access.isLoading || catalogue.isLoading) {
    return (
      <ContentCard title="Access">
        <p className="py-6 text-center text-sm text-muted-foreground">
          <Loader2 className="mr-2 inline h-4 w-4 animate-spin" /> Loading access…
        </p>
      </ContentCard>
    );
  }

  const people = (access.data ?? []).filter((p) =>
    !search.trim() || `${p.name} ${p.email}`.toLowerCase().includes(search.trim().toLowerCase()));
  const person = (access.data ?? []).find((p) => p.membershipId === selected) ?? null;
  const roleDefaults = catalogue.data?.roleDefaults ?? {};
  const roleHoldsEverything = person?.role === "agency_owner" || person?.role === "agency_admin";

  const allOn = person
    ? (catalogue.data?.keys ?? []).every((k) =>
        effectiveAgencyPermission(person.role, k.key, person.overrides, roleDefaults).allowed)
    : false;

  return (
    <ContentCard
      title={<span className="flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-muted-foreground" /> Access</span>}
    >
      <div className="grid gap-3 lg:grid-cols-[16rem_1fr]">
        <div>
          <div className="relative mb-2">
            <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input className="h-8 pl-7" value={search} onChange={(e) => setSearch(e.target.value)}
              placeholder="Find a person" aria-label="Find a person" />
          </div>
          <ul className="max-h-96 space-y-0.5 overflow-y-auto">
            {people.map((p) => (
              <li key={p.membershipId}>
                <button type="button" onClick={() => setSelected(p.membershipId)}
                  className={cn(
                    "w-full rounded-lg px-2.5 py-1.5 text-left transition-colors",
                    selected === p.membershipId
                      ? "bg-primary text-primary-foreground"
                      : "text-foreground hover:bg-muted",
                  )}>
                  <span className="block truncate text-sm font-medium">{p.name}</span>
                  <span className={cn("block truncate text-[11px]",
                    selected === p.membershipId ? "text-primary-foreground/80" : "text-muted-foreground")}>
                    {ROLE_LABEL[p.role] ?? p.role}
                    {Object.keys(p.overrides).length > 0 &&
                      ` · ${Object.keys(p.overrides).length} exception${Object.keys(p.overrides).length === 1 ? "" : "s"}`}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>

        {!person ? (
          <p className="self-center py-8 text-center text-sm text-muted-foreground">
            Choose somebody to see what they can do.
          </p>
        ) : (
          <div>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-muted/30 px-3 py-2">
              <span>
                <span className="block text-sm font-semibold text-foreground">{person.name}</span>
                <span className="block text-xs text-muted-foreground">
                  {person.email} · {ROLE_LABEL[person.role] ?? person.role}
                </span>
              </span>
              <span className="flex items-center gap-2">
                <span className="text-xs font-medium text-foreground">All access</span>
                <Switch
                  checked={allOn}
                  disabled={roleHoldsEverything || change.isPending}
                  aria-label={`Give ${person.name} every capability`}
                  onCheckedChange={async (on) => {
                    for (const key of AGENCY_PERMISSIONS) {
                      await change.mutateAsync({ membershipId: person.membershipId, key, allowed: on });
                    }
                  }}
                />
              </span>
            </div>

            {roleHoldsEverything && (
              <p className="mb-3 rounded-lg border border-blue-500/30 bg-blue-500/10 px-3 py-2 text-xs text-blue-900">
                An {ROLE_LABEL[person.role]?.toLowerCase()} holds every agency capability through their
                role, so there is nothing to switch. Removing one would mean changing their role — and
                the database refuses an exception on an owner or administrator rather than pretending
                to apply it.
              </p>
            )}

            <div className="space-y-3">
              {grouped.map(([module, keys]) => (
                <div key={module}>
                  <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{module}</p>
                  <ul className="divide-y divide-border/50 rounded-lg border border-border">
                    {keys.map((k) => {
                      const state = effectiveAgencyPermission(person.role, k.key, person.overrides, roleDefaults);
                      return (
                        <li key={k.key} className="flex items-start justify-between gap-3 px-3 py-2">
                          <span className="min-w-0">
                            <span className="flex flex-wrap items-center gap-1.5 text-sm font-medium text-foreground">
                              {k.label}
                              {k.securityRelevant && (
                                <Pill tone="border-amber-500/40 bg-amber-500/10 text-amber-800">sensitive</Pill>
                              )}
                              {state.source === "granted" && (
                                <Pill tone="border-emerald-500/30 bg-emerald-500/10 text-emerald-700">granted to them</Pill>
                              )}
                              {state.source === "denied" && (
                                <Pill tone="border-red-500/40 bg-red-500/10 text-red-800">denied for them</Pill>
                              )}
                            </span>
                            {k.description && (
                              <span className="block text-[11px] text-muted-foreground">{k.description}</span>
                            )}
                            {state.source === "default" && (
                              <span className="block text-[11px] text-muted-foreground">
                                {state.allowed ? "On" : "Off"} because that is what a{" "}
                                {(ROLE_LABEL[person.role] ?? person.role).toLowerCase()} gets by default.
                              </span>
                            )}
                          </span>
                          <span className="flex shrink-0 items-center gap-2">
                            {state.source !== "default" && !roleHoldsEverything && (
                              <Button size="sm" variant="ghost" className="h-6 px-2 text-[11px]"
                                onClick={() => change.mutate({
                                  membershipId: person.membershipId, key: k.key, allowed: null,
                                })}>
                                Use the default
                              </Button>
                            )}
                            <Switch
                              checked={state.allowed}
                              disabled={roleHoldsEverything || change.isPending}
                              aria-label={`${k.label} for ${person.name}`}
                              onCheckedChange={(on) => change.mutate({
                                membershipId: person.membershipId, key: k.key, allowed: on,
                              })}
                            />
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))}
            </div>

            {change.error && (
              <p className="mt-2 text-xs text-red-700">{(change.error as Error).message}</p>
            )}
            <p className="mt-3 text-[11px] text-muted-foreground">
              Every change is recorded with who made it. These switches decide what somebody may DO;
              which records they see is decided separately by their role, scope and assignment, and
              is re-checked by the database on every request.
            </p>
          </div>
        )}
      </div>
    </ContentCard>
  );
}
