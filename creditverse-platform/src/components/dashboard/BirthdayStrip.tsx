/**
 * Birthdays coming up for the organization in view — but only when the
 * organization has switched greetings on, and only for people who chose to
 * show theirs. Clients appear when the client greeting is on too.
 */
import { BirthdayList, type BirthdayRow } from "@/components/dashboard/BirthdayList";
import { useClientBirthdays, useOrganizationAutomations, useTeamBirthdays } from "@/lib/data/use-greetings";

export function BirthdayStrip({ organizationId, organizationName }: { organizationId: string; organizationName: string }) {
  const automations = useOrganizationAutomations(organizationId);
  const teamOn = automations.isOn("birthday_greeting_team");
  const clientOn = automations.isOn("birthday_greeting_client");
  const team = useTeamBirthdays(organizationId, teamOn);
  const clients = useClientBirthdays(organizationId, clientOn);

  if (!teamOn && !clientOn) return null;
  const rows: BirthdayRow[] = [
    ...(team.data ?? []),
    ...(clients.data ?? []).map((c) => ({ ...c, note: "client" })),
  ].sort((a, b) => a.daysAway - b.daysAway || a.name.localeCompare(b.name));

  return <BirthdayList title="Birthdays" from={organizationName} rows={rows} />;
}
