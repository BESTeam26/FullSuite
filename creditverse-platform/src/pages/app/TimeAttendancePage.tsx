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
import { MyTimeSection } from "@/pages/app/MyTimePage";

export const TimeAttendancePage = () => {
  const { section: slug } = useParams();
  /* Time & Attendance is the person's own (Dee, 2026-09-19): every section is
     for everyone, and the context is passed only so callers read like People
     & Teams does. */
  const { ctx } = useAgencyAccessContext();
  const manages = ctx.role === "agency_admin" || ctx.can("ops.manage");
  const section = timeSectionFor(slug, { manages, leadsTeam: ctx.leadsTeam });

  /* Team Management lived here until 2026-09-19; it is People & Teams now.
     Old links and bookmarks land on the new home. */
  if (slug === "team") return <Navigate to="/app/people" replace />;
  /* An unknown segment falls back to the module root rather than to a dead page. */
  if (!section) return <Navigate to="/app/time" replace />;

  /* Dee, 2026-09-19: the header names the SECTION — My Time, My Attendance,
     My Time Off — not the module. The module name is the sidebar's job. */
  return (
    <HqPageShell title={section.slug ? section.label : "Time & Attendance"} description={section.description} icon={Clock}>
      {section.slug === "" && <TimeOverview />}
      {section.slug === "my-time" && <MyTimeSection />}
      {section.slug === "attendance" && <AttendancePage />}
      {section.slug === "time-off" && <TimeOffPage />}
    </HqPageShell>
  );
};

export default TimeAttendancePage;
