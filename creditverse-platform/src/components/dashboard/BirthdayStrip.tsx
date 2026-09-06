/**
 * Birthdays coming up, on the organization's Home — but only when the
 * organization has switched greetings on, and only for people who chose to
 * show theirs. Today's birthdays lead with the greeting itself.
 */
import { Cake } from "lucide-react";
import { Avatar } from "@/components/common/Avatar";
import { useAvatarUrls } from "@/lib/data/use-account";
import { useClientBirthdays, useOrganizationAutomations, useTeamBirthdays } from "@/lib/data/use-greetings";
import { birthdayGreeting, birthdayLabel, whenLabel } from "@/lib/greetings/birthday";

export function BirthdayStrip({ organizationId, organizationName }: { organizationId: string; organizationName: string }) {
  const automations = useOrganizationAutomations(organizationId);
  const teamOn = automations.isOn("birthday_greeting_team");
  const clientOn = automations.isOn("birthday_greeting_client");
  const team = useTeamBirthdays(organizationId, teamOn);
  const clients = useClientBirthdays(organizationId, clientOn);
  const avatars = useAvatarUrls((team.data ?? []).map((p) => p.avatarPath));

  const teamRows = team.data ?? [];
  const clientRows = clients.data ?? [];
  if (!teamOn && !clientOn) return null;
  if (teamRows.length === 0 && clientRows.length === 0) return null;

  const today = [...teamRows, ...clientRows].filter((p) => p.daysAway === 0);
  const soon = [...teamRows.map((p) => ({ ...p, kind: "team" as const })), ...clientRows.map((p) => ({ ...p, kind: "client" as const }))]
    .filter((p) => p.daysAway > 0)
    .sort((a, b) => a.daysAway - b.daysAway)
    .slice(0, 6);

  return (
    <section aria-labelledby="birthdays-title" className="mb-6 rounded-xl border border-amber-500/30 bg-amber-500/5 p-4">
      <p id="birthdays-title" className="flex items-center gap-2 text-sm font-bold text-foreground">
        <Cake className="h-4 w-4 text-amber-600" /> Birthdays
      </p>
      {today.length > 0 && (
        <ul className="mt-2 space-y-1.5">
          {today.map((p) => (
            <li key={p.id} className="flex items-center gap-2 text-sm text-foreground">
              <Avatar name={p.name} url={p.avatarPath ? avatars.data?.[p.avatarPath] : null} size="sm" />
              <span>{birthdayGreeting(p.name, organizationName)}</span>
            </li>
          ))}
        </ul>
      )}
      {soon.length > 0 && (
        <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
          {soon.map((p) => (
            <li key={`${p.kind}-${p.id}`}>
              <span className="font-semibold text-foreground">{p.name}</span>
              {p.kind === "client" && <span> (client)</span>} · {birthdayLabel(p.birthMonth, p.birthDay)}, {whenLabel(p.daysAway)}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
