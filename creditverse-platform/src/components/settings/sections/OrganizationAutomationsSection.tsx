/**
 * Organization automations the customer switches on for themselves. Today:
 * birthday greetings for the team and for clients in their portal. Each row
 * says plainly what turning it on does and what it needs.
 */
import { Cake, Loader2, Sparkles, Users } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { SectionCard } from "@/components/settings/shared";
import { errorMessage } from "@/lib/data/error-message";
import { useOrganizationAutomations } from "@/lib/data/use-greetings";
import type { AutomationKey } from "@/lib/data/greetings";

const ROWS: { key: AutomationKey; icon: typeof Cake; label: string; detail: string; note: string }[] = [
  {
    key: "birthday_greeting_team",
    icon: Users,
    label: "Team birthday greetings",
    detail: "Show birthdays on Home so the team can wish each other well.",
    note: "Only people who added a birthday and ticked \"let my team wish me a happy birthday\" appear. The month and day are shown; never a year.",
  },
  {
    key: "birthday_greeting_client",
    icon: Cake,
    label: "Client birthday greetings",
    detail: "Greet a client on their birthday in their portal, and show the team who is celebrating.",
    note: "Reads the date of birth on the client's record. Clients with no date of birth are simply not greeted.",
  },
];

export function OrganizationAutomationsSection({ organizationId, canEdit }: { organizationId: string | null; canEdit: boolean }) {
  const automations = useOrganizationAutomations(organizationId);

  return (
    <SectionCard icon={Sparkles} title="Automations" description="Small things the platform does for you once you switch them on.">
      {!organizationId ? (
        <p className="text-xs text-muted-foreground">Open an organization to change its automations.</p>
      ) : automations.isLoading ? (
        <div className="h-24 animate-pulse rounded-lg bg-muted/40" aria-busy="true" />
      ) : (
        <ul className="divide-y divide-border/60">
          {ROWS.map((row) => {
            const Icon = row.icon;
            const on = automations.isOn(row.key);
            const busy = automations.set.isPending && automations.set.variables?.key === row.key;
            return (
              <li key={row.key} className="flex flex-wrap items-start gap-3 py-3">
                <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"><Icon className="h-4 w-4" /></span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-foreground">{row.label}</p>
                  <p className="text-xs text-muted-foreground">{row.detail}</p>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">{row.note}</p>
                </div>
                <div className="flex items-center gap-2">
                  {busy && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
                  <Switch
                    checked={on}
                    disabled={!canEdit || automations.set.isPending}
                    aria-label={row.label}
                    onCheckedChange={(v) => automations.set.mutate({ key: row.key, enabled: v })}
                  />
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {automations.set.error && <p role="alert" className="mt-2 text-xs text-status-danger">{errorMessage(automations.set.error, "That change could not be saved.")}</p>}
      {!canEdit && <p className="mt-2 text-[11px] text-muted-foreground">Your role can see these settings but not change them.</p>}
    </SectionCard>
  );
}
