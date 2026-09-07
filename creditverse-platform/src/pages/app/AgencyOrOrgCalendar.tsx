/**
 * One route, two calendars.
 *
 * BES staff in agency view get the agency's business calendar. Somebody
 * looking at an organization gets that organization's hub calendar, still
 * behind the hub-module gate it has always had. Splitting on the viewer rather
 * than on the URL keeps `/app/calendar` meaning "my calendar" for everyone.
 */
import { lazy, Suspense } from "react";
import { useAgency } from "@/lib/agency-context";
import { useAuth } from "@/lib/auth/auth-context";
import { RequireHubModule } from "@/components/auth/RequireHubModule";

const AgencyCalendarPage = lazy(() =>
  import("./AgencyCalendarPage").then((m) => ({ default: m.AgencyCalendarPage })));
const CalendarPage = lazy(() =>
  import("./HqPages2").then((m) => ({ default: m.CalendarPage })));

export const AgencyOrOrgCalendar = () => {
  const agency = useAgency();
  const { isAgencyStaff } = useAuth();
  const viewMode = agency?.viewMode ?? "agency";

  return (
    <Suspense fallback={<div className="min-h-[60vh]" aria-busy="true" />}>
      {isAgencyStaff && viewMode === "agency" ? (
        <AgencyCalendarPage />
      ) : (
        <RequireHubModule module="calendar" label="Calendar">
          <CalendarPage />
        </RequireHubModule>
      )}
    </Suspense>
  );
};
