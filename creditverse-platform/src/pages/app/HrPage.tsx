/**
 * HR & People — the management home for everything about the people
 * themselves (Dee, 2026-09-09: "I don't think I want payroll and finance in
 * the same [place]"). Schedules and rates state the expectations; attendance
 * shows the derived day; the leave queue decides time off; payroll computes
 * and releases the money. Finance keeps the EXPENSE the release creates —
 * money out is finance's ledger, deciding pay is HR's.
 *
 * Leads keep their own doors on Team EOD; this page is management's.
 */
import { useState } from "react";
import { HeartHandshake } from "lucide-react";
import { HqPageShell } from "@/pages/app/HqPages";
import { Input } from "@/components/ui/input";
import { SchedulesAndRates } from "@/components/agency/people/SchedulesAndRates";
import { AttendanceCard, LeaveQueue } from "@/components/agency/people/AttendanceAndLeave";
import { PayrollPanel } from "@/components/agency/finance/PayrollPanel";
import { useTeamEod, todayLocal } from "@/lib/data/use-eod-day";
import { useAgencyPermissions } from "@/lib/data/agency-permissions";

export const HrPage = () => {
  const [date, setDate] = useState(todayLocal());
  const team = useTeamEod(date);
  const perms = useAgencyPermissions();
  const names = new Map((team.data ?? []).map((r) => [r.employeeId, r.employeeName]));

  return (
    <HqPageShell
      title="HR & People"
      description="Schedules, attendance, time off and payroll — expectations stated by a manager, everything else derived from the records"
      icon={HeartHandshake}
    >
      <div className="mb-3 flex items-center gap-2">
        <label className="text-xs text-muted-foreground" htmlFor="hr-date">Attendance date</label>
        <Input id="hr-date" type="date" value={date} onChange={(e) => setDate(e.target.value)}
          className="h-8 w-40 text-xs" />
      </div>

      <div className="space-y-4">
        <AttendanceCard date={date} names={names} />
        <LeaveQueue />
        <SchedulesAndRates />
        {(perms.can("payroll.view") || perms.can("payroll.manage")) && <PayrollPanel />}
      </div>
    </HqPageShell>
  );
};
