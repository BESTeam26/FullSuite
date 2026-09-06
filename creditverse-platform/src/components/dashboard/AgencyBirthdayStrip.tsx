/**
 * Birthdays across BES itself, on the HQ home. Only people who chose to show
 * theirs appear, and only BES staff can read the list.
 */
import { BirthdayList } from "@/components/dashboard/BirthdayList";
import { useAgencyBirthdays } from "@/lib/data/use-greetings";

export function AgencyBirthdayStrip() {
  const birthdays = useAgencyBirthdays();
  return <BirthdayList title="Birthdays at BES" from="Blessed Empire Services" rows={birthdays.data ?? []} />;
}
