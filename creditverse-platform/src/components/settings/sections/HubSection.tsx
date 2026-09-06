/**
 * Organization Hub settings — layer two of rule 18.
 *
 * The owner switches on the modules their company uses. A module outside the
 * subscription is shown as an upgrade, never as a toggle that quietly does
 * nothing; a module that is not built yet says so. The database refuses
 * anything the subscription does not include, whatever this screen sends.
 */
import { Building2, Lock, Sparkles } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { SectionCard } from "@/components/settings/shared";
import { errorMessage } from "@/lib/data/error-message";
import { useOrganizationHub } from "@/lib/data/use-hub";
import { HUB_PACKAGE_LABELS, HUB_PACKAGE_PITCH, groupByPackage, moduleState } from "@/lib/hub/hub-modules";

export function HubSection({ organizationId, canEdit }: { organizationId: string | null; canEdit: boolean }) {
  const hub = useOrganizationHub(organizationId);
  const groups = groupByPackage(hub.rows);

  return (
    <div className="space-y-4">
      <SectionCard
        icon={Building2}
        title="Organization Hub"
        description="The company side of your workspace: announcements, people, departments, knowledge and the rest. Switch on what your company uses; the sidebar follows."
      >
        {!organizationId ? (
          <p className="text-xs text-muted-foreground">Open an organization to change its hub.</p>
        ) : hub.isLoading ? (
          <div className="h-40 animate-pulse rounded-lg bg-muted/40" aria-busy="true" />
        ) : hub.error ? (
          <p role="alert" className="text-sm text-status-danger">Could not load the hub: {hub.error}</p>
        ) : (
          <div className="space-y-5">
            {groups.map(([pkg, rows]) => {
              const entitled = rows.some((r) => r.entitled);
              return (
                <section key={pkg}>
                  <div className="mb-1.5 flex flex-wrap items-center gap-2">
                    <h3 className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">{HUB_PACKAGE_LABELS[pkg]}</h3>
                    {!entitled && (
                      <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-[10px] font-bold text-amber-700">
                        <Lock className="h-2.5 w-2.5" /> Not in your plan
                      </span>
                    )}
                  </div>
                  {!entitled && <p className="mb-1.5 text-[11px] text-muted-foreground">{HUB_PACKAGE_PITCH[pkg]} Ask your account manager to add it.</p>}
                  <ul className="divide-y divide-border/60 rounded-lg border border-border">
                    {rows.map((row) => {
                      const state = moduleState(row);
                      const busy = hub.set.isPending && hub.set.variables?.key === row.key;
                      return (
                        <li key={row.key} className="flex flex-wrap items-center gap-3 px-3 py-2.5">
                          <div className="min-w-0 flex-1">
                            <p className="flex flex-wrap items-center gap-2 text-sm font-semibold text-foreground">
                              {row.label}
                              {row.alwaysOn && <span className="rounded-full border border-border px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">Always on</span>}
                              {state === "coming" && <span className="rounded-full border border-border px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">Coming soon</span>}
                            </p>
                            <p className="text-xs text-muted-foreground">{row.description}</p>
                          </div>
                          {state === "not-entitled" ? (
                            <span className="text-[11px] font-semibold text-amber-700">Upgrade</span>
                          ) : state === "coming" ? (
                            <span className="text-[11px] text-muted-foreground">Not built yet</span>
                          ) : (
                            <Switch
                              checked={row.enabled}
                              disabled={!canEdit || row.alwaysOn || busy || hub.set.isPending}
                              aria-label={row.label}
                              onCheckedChange={(v) => hub.set.mutate({ key: row.key, enabled: v })}
                            />
                          )}
                        </li>
                      );
                    })}
                  </ul>
                </section>
              );
            })}
          </div>
        )}
        {hub.set.error && <p role="alert" className="mt-2 text-xs text-status-danger">{errorMessage(hub.set.error, "That change could not be saved.")}</p>}
        {!canEdit && organizationId && <p className="mt-2 text-[11px] text-muted-foreground">Your role can see these settings but not change them.</p>}
      </SectionCard>

      <SectionCard icon={Sparkles} title="How this works" description="Three things decide what each person sees.">
        <ol className="list-decimal space-y-1 pl-5 text-xs text-foreground">
          <li><span className="font-semibold">Your plan</span> decides which packages you own.</li>
          <li><span className="font-semibold">You</span> decide which of those your company actually uses.</li>
          <li><span className="font-semibold">Each person's role</span> decides what they can open.</li>
        </ol>
        <p className="mt-2 text-[11px] text-muted-foreground">A module that fails any of the three is not shown and not served — no empty pages, no dead links.</p>
      </SectionCard>
    </div>
  );
}
