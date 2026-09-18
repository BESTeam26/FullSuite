/**
 * Time & Attendance — one module, several sections.
 *
 * Dee, 2026-09-18: "Consolidate My Time, Attendance, Time Off, Team Time and
 * Leave Management into one collapsible FullSuite module… Do not create a
 * second left navigation rail if FullSuite's current module tree already
 * supports child routes."
 *
 * So there is no in-page rail: the sections live in the dark global sidebar
 * under the parent, exactly as Finance does. This file is the router — it
 * resolves the URL segment to a section this person may open, and renders it.
 *
 * A segment nobody may open and a segment that does not exist get the SAME
 * answer, deliberately: a "you are not allowed" page tells somebody the
 * section exists.
 */
import { Navigate, useParams } from "react-router-dom";
import { Clock } from "lucide-react";
import { HqPageShell } from "@/pages/app/HqPages";
import { useAgencyAccessContext } from "@/lib/agency/use-access-context";
import { timeSectionFor } from "@/lib/time/time-sections";
import { TimeOverview } from "@/pages/app/time/TimeOverview";
import { AttendancePage } from "@/pages/app/time/AttendancePage";
import { TimeOffPage } from "@/pages/app/time/TimeOffPage";
import { TeamManagement } from "@/pages/app/time/TeamManagement";
import { MyTimeSection } from "@/pages/app/MyTimePage";

export const TimeAttendancePage = () => {
  const { section: slug } = useParams();
  /*
   * The SAME authority the route guard reads. `manages` is the admin role or
   * the explicit ops.manage capability — the grant `is_manager_of` consults in
   * the database — and `leadsTeam` is a real `team_memberships.is_lead`
   * relationship, not a rank. So the menu and the door cannot disagree.
   */
  const { ctx } = useAgencyAccessContext();
  const manages = ctx.role === "agency_admin" || ctx.can("ops.manage");
  const section = timeSectionFor(slug, { manages, leadsTeam: ctx.leadsTeam });

  /* An unknown or unauthorized segment falls back to the module root rather
     than to a dead page. */
  if (!section) return <Navigate to="/app/time" replace />;

  return (
    <HqPageShell title="Time & Attendance" description={section.description} icon={Clock}>
      {section.slug === "" && <TimeOverview />}
      {section.slug === "my-time" && <MyTimeSection />}
      {section.slug === "attendance" && <AttendancePage />}
      {section.slug === "time-off" && <TimeOffPage />}
      {section.slug === "team" && <TeamManagement />}
    </HqPageShell>
  );
};

export default TimeAttendancePage;
