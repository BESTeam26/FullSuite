import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth/auth-context";
import { fetchCalendarEvents, publishDueHolidayAnnouncements, syncFederalHolidays } from "@/lib/data/agency-calendar";
import { businessToday, upcomingHolidays } from "@/lib/calendar/us-federal-holidays";

/**
 * The next U.S. holidays.
 *
 * Computed from the statute, so this never depends on a job having run — the
 * banner is right on the first load of a brand-new agency. The sync and the
 * announcements are separate, and their absence degrades nothing here.
 */
export function useUpcomingHolidays(count = 3) {
  const today = businessToday();
  return { today, holidays: upcomingHolidays(today, count) };
}

/**
 * Keep the calendar rows and the holiday announcements current.
 *
 * Both are idempotent, so this runs on load rather than on a schedule. A
 * failure is swallowed on purpose: a missing announcement must never stop
 * somebody seeing their Home page.
 */
export function useHolidayUpkeep() {
  const auth = useAuth();
  const live = auth.mode === "live" && auth.status === "signed-in";
  const agencyId = auth.agencyId ?? null;
  return useQuery({
    queryKey: ["agency", "holiday-upkeep", agencyId ?? "", businessToday()],
    queryFn: async () => {
      const year = Number(businessToday().slice(0, 4));
      const created = await syncFederalHolidays(agencyId!, year, 3).catch(() => 0);
      const announced = await publishDueHolidayAnnouncements(agencyId!).catch(() => 0);
      return { created, announced };
    },
    enabled: live && !!agencyId && auth.isAgencyStaff,
    staleTime: 6 * 60 * 60 * 1000,
    retry: false,
  });
}

export function useCalendarEvents(from: string, to: string) {
  const auth = useAuth();
  const live = auth.mode === "live" && auth.status === "signed-in";
  const agencyId = auth.agencyId ?? null;
  return useQuery({
    queryKey: ["agency", "calendar", agencyId ?? "", from, to],
    queryFn: () => fetchCalendarEvents(agencyId!, from, to),
    enabled: live && !!agencyId,
    staleTime: 300_000,
  });
}
