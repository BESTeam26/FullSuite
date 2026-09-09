/**
 * People — where BES manages people (Dee, 2026-09-09, permanent):
 *
 *   PEOPLE is where BES manages people. TEAMS is structure. SETTINGS
 *   configures the system. WORKFORCE is a view of People, not another
 *   database.
 *
 * One page, two views of the SAME records: the directory (who is here, invite
 * somebody, open their profile) and Insights — the aggregate workforce facts
 * that used to be a separate top-level page, plus today's attendance and the
 * leave queue that used to live under HR. /app/workforce and /app/hr now
 * redirect here; nothing they computed was lost, only their doors.
 */
import { useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { Briefcase, CheckCircle2, Clock, UserPlus, Users } from "lucide-react";
import { HqPageShell } from "@/pages/app/HqPages";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { ContentCard, StatCard } from "@/components/dashboard/DivisionLayout";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { PeopleManager } from "@/components/agency/PeopleManager";
import { AgencyTeamInvites } from "@/components/settings/sections/AgencyTeamInvites";
import { AttendanceCard, LeaveQueue } from "@/components/agency/people/AttendanceAndLeave";
import { useWorkforce } from "@/lib/data/use-workforce";
import { useAgencyAccessContext } from "@/lib/agency/use-access-context";
import { managesAgency } from "@/lib/agency/navigation";

const DIVISION_LABEL: Record<string, string> = {
  creditops: "CreditOps", fundingops: "FundingOps", bes_crm: "BES CRM",
  talentops: "TalentOps", general: "General",
};
const fmtMinutes = (m: number) => {
  const h = Math.floor(m / 60), r = Math.round(m % 60);
  return h > 0 ? `${h}h ${r}m` : `${r}m`;
};

function WorkforceInsights() {
  const wf = useWorkforce();
  const people = wf.data?.people ?? [];
  const time = wf.data?.time ?? [];
  const clockedIn = time.filter((t) => t.running).length;
  const logged = time.reduce((s, t) => s + t.minutes, 0);
  const capacity = people.length * 40 * 60;
  const utilization = capacity > 0 ? Math.round((logged / capacity) * 100) : null;
  const byDivision = new Map<string, { agents: Set<string>; minutes: number }>();
  for (const t of wf.data?.teams ?? []) {
    const key = t.division ? DIVISION_LABEL[t.division] ?? t.division : "Unassigned";
    const row = byDivision.get(key) ?? { agents: new Set<string>(), minutes: 0 };
    for (const m of t.members) {
      row.agents.add(m.userId);
      row.minutes += time.find((x) => x.employeeId === m.userId)?.minutes ?? 0;
    }
    byDivision.set(key, row);
  }
  const today = new Date().toISOString().slice(0, 10);
  const names = new Map(people.map((p) => [p.userId, p.name]));

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="BES staff" value={people.length} icon={Users} />
        <StatCard label="Clocked in now" value={clockedIn} icon={CheckCircle2} />
        <StatCard label="Logged this week" value={fmtMinutes(logged)} icon={Clock} />
        <StatCard label="Utilization (of 40h)" value={utilization === null ? "—" : `${utilization}%`} icon={Briefcase} />
      </div>
      <ContentCard title="Time by division (this week)">
        {byDivision.size === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">No BES teams yet — divisions appear once teams exist.</p>
        ) : (
          <div className="space-y-3">
            {[...byDivision.entries()].map(([div, row]) => (
              <div key={div} className="flex items-center justify-between rounded-lg border border-border px-3 py-2 text-sm">
                <span className="font-medium text-foreground">{div}</span>
                <span className="text-muted-foreground">{row.agents.size} staff · {fmtMinutes(row.minutes)}</span>
              </div>
            ))}
          </div>
        )}
      </ContentCard>
      <AttendanceCard date={today} names={names} />
      <LeaveQueue />
    </div>
  );
}

export const PeopleHubPage = () => {
  const [params, setParams] = useSearchParams();
  const access = useAgencyAccessContext();
  const manages = useMemo(() => managesAgency(access.ctx), [access.ctx]);
  /* /app/workforce and /app/hr redirect in with ?view=insights, so an old
     bookmark lands on the facts it used to show. */
  const view = params.get("view") === "insights" ? "insights" : "directory";
  const setView = (v: string) => setParams(v === "insights" ? { view: "insights" } : {}, { replace: true });

  return (
    <HqPageShell
      title="People"
      description="Everyone who works with BES and everything connected to their working relationship."
      icon={Users}
      actions={
        manages ? (
          <Dialog>
            <DialogTrigger asChild>
              <Button size="sm"><UserPlus className="mr-1.5 h-3.5 w-3.5" /> Invite team member</Button>
            </DialogTrigger>
            <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-xl">
              <DialogHeader><DialogTitle>Invite a team member</DialogTitle></DialogHeader>
              {/* The one invitation engine — the same component Settings used,
                  so there is exactly one invite implementation (§5). */}
              <AgencyTeamInvites />
            </DialogContent>
          </Dialog>
        ) : undefined
      }
    >
      {manages ? (
        <Tabs value={view} onValueChange={setView}>
          <TabsList className="h-8 bg-muted/60">
            <TabsTrigger value="directory" className="text-[11px]">Directory</TabsTrigger>
            <TabsTrigger value="insights" className="text-[11px]">Workforce insights</TabsTrigger>
          </TabsList>
          <TabsContent value="directory" className="mt-3">
            <PeopleManager />
          </TabsContent>
          <TabsContent value="insights" className="mt-3">
            <WorkforceInsights />
          </TabsContent>
        </Tabs>
      ) : (
        <PeopleManager />
      )}
    </HqPageShell>
  );
};

export default PeopleHubPage;
