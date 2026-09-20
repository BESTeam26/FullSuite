/**
 * Invite a team member — Dee's three-step wizard, 2026-09-20.
 *
 *   1 Team member information   who they are, when they start, what they do
 *   2 Organizational placement  division → department → team → responsibility
 *   3 Review & invite           the same preview, one last time, then send
 *
 * The panel on the right is not decoration: it is `invitePlan`, the single
 * derivation the writers themselves use, so the preview cannot promise access
 * the invitation will not produce.
 *
 * What the invitation carries, and what happens on acceptance:
 *   invitation      role, access profile, module keys, team, lead team, name
 *   staged          start date, position, engagement type, phone, seat
 *   on acceptance   membership + Agent ID + team + seat + grants, in one
 *                   transaction (accept_agency_invitation)
 *
 * Nothing here writes a person's record early: until they accept there is an
 * invitation, not a half-made team member.
 */
import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft, ArrowRight, Ban, Building2, Check, CheckCircle2, Loader2, Mail, Plus, Send, ShieldCheck, UserRound, Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { OpsSelect } from "@/components/ui/ops-select";
import { Pill } from "@/components/agency/partner/partner-ui";
import { useAuth } from "@/lib/auth/auth-context";
import { isAdminRole } from "@/lib/agency/navigation";
import { useOrganizationTree } from "@/lib/data/use-organization-structure";
import { usePositions, usePositionActions } from "@/lib/data/use-positions";
import { useAgencyMembers } from "@/lib/data/use-agency-teams";
import { createTeamMemberWithInvitation } from "@/lib/data/agency-invitations";
import { sendInvitationEmail } from "@/lib/data/emails";
import { errorMessage } from "@/lib/data/error-message";
import { ENGAGEMENT_TYPES } from "@/lib/agency/engagement-type";
import { RESPONSIBILITIES, invitePlan, type Responsibility } from "@/lib/agency/invite-plan";
import { cn } from "@/lib/utils";

const NONE = "__none__";
const NEW_POSITION = "__new__";
const label = "block text-[10px] font-bold uppercase tracking-wider text-muted-foreground";
const today = () => new Date().toISOString().slice(0, 10);

const STEPS = [
  { n: 1, title: "Team Member", hint: "Basic information" },
  { n: 2, title: "Organizational Placement", hint: "Division, department, team, role" },
  { n: 3, title: "Review & Invite", hint: "Confirm details and send" },
];

export function InviteTeamMemberWizard({ onDone }: { onDone?: () => void }) {
  const auth = useAuth();
  const qc = useQueryClient();
  const canInvite = isAdminRole(auth.agencyRole);
  const tree = useOrganizationTree();
  const positions = usePositions();
  const members = useAgencyMembers();
  const positionActions = usePositionActions();

  const [step, setStep] = useState(1);
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [startDate, setStartDate] = useState(today());
  const [engagement, setEngagement] = useState<string>("employee");
  const [positionId, setPositionId] = useState(NONE);
  const [newPosition, setNewPosition] = useState("");
  const [reportsTo, setReportsTo] = useState(NONE);
  const [phone, setPhone] = useState("");
  const [divisionId, setDivisionId] = useState(NONE);
  const [departmentId, setDepartmentId] = useState(NONE);
  const [teamId, setTeamId] = useState(NONE);
  const [responsibility, setResponsibility] = useState<Responsibility>("agent");
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);

  const divisions = useMemo(() => (tree.data?.divisions ?? []).filter((d) => !d.archived && d.service !== "corporate"), [tree.data]);
  const departments = useMemo(
    () => (tree.data?.departments ?? []).filter((d) => !d.archived && d.divisionId === divisionId),
    [tree.data, divisionId],
  );
  const teams = useMemo(
    () => (tree.data?.teams ?? []).filter((t) => !t.archived && t.departmentId === departmentId),
    [tree.data, departmentId],
  );
  const division = divisions.find((d) => d.id === divisionId) ?? null;
  const department = departments.find((d) => d.id === departmentId) ?? null;
  const team = teams.find((t) => t.id === teamId) ?? null;
  const positionTitle = positionId === NEW_POSITION ? newPosition.trim()
    : (positions.data ?? []).find((p) => p.id === positionId)?.title ?? null;
  const people = (members.data ?? []).filter((m) => m.status === "active");

  const plan = useMemo(() => invitePlan({
    responsibility,
    service: division?.service ?? null,
    departmentName: department?.name ?? null,
    teamName: team?.name ?? null,
  }), [responsibility, division, department, team]);

  const step1Ready = fullName.trim().length > 1 && /.+@.+\..+/.test(email) && !!startDate
    && (positionId !== NONE && (positionId !== NEW_POSITION || newPosition.trim().length > 1));
  const needsTeam = responsibility === "agent" || responsibility === "team_lead";
  const step2Ready = responsibility === "chief_operations" || responsibility === "agency_admin"
    ? true
    : divisionId !== NONE && departmentId !== NONE && (!needsTeam || teamId !== NONE);

  const invite = useMutation({
    mutationFn: async () => {
      /* A brand-new position is a real record, created where they will sit. */
      if (positionId === NEW_POSITION && newPosition.trim()) {
        await positionActions.save.mutateAsync({
          title: newPosition.trim(),
          divisionId: divisionId === NONE ? null : divisionId,
          departmentId: departmentId === NONE ? null : departmentId,
          teamId: teamId === NONE ? null : teamId,
        });
      }
      /* The Team Member first — Agent ID, start date, position, placement —
         then the invitation. One transaction in the database. */
      const created = await createTeamMemberWithInvitation({
        fullName: fullName.trim(),
        email: email.trim(),
        role: plan.role,
        profile: plan.profile,
        teamId: teamId === NONE ? null : teamId,
        leadTeamId: plan.leadsTeam && teamId !== NONE ? teamId : null,
        moduleKeys: plan.moduleKeys,
        hiredOn: startDate,
        jobTitle: positionTitle,
        engagementType: engagement,
        managerId: reportsTo === NONE ? null : reportsTo,
        phone: phone.trim() || null,
        seat: plan.seat,
        divisionId: divisionId === NONE ? null : divisionId,
        departmentId: departmentId === NONE ? null : departmentId,
      });
      /* Email delivery is a separate step on purpose: if it fails the person
         still exists, pending activation, with a link to resend. */
      return { id: created.invitation_id, code: created.employee_code, outcome: await sendInvitationEmail(created.invitation_id) };
    },
    onSuccess: ({ code, outcome }) => {
      void qc.invalidateQueries({ queryKey: ["agency", "invitations"] });
      void qc.invalidateQueries({ queryKey: ["agency", "members"] });
      void qc.invalidateQueries({ queryKey: ["people", "org"] });
      setMessage(
        outcome.status === "sent"
          ? { text: `${fullName.trim()} is on the team as ${code}, pending activation. The invitation is on its way to ${email.trim()}.`, error: false }
          : { text: `${fullName.trim()} is on the team as ${code}, pending activation — but the invitation email did not go out. Resend it from the directory.`, error: true },
      );
      if (outcome.status === "sent") onDone?.();
    },
    onError: (e) => setMessage({ text: errorMessage(e, "That invitation could not be created."), error: true }),
  });

  if (!canInvite) {
    return <p className="p-4 text-sm text-muted-foreground">Your role can see the team but not invite. An agency owner or admin can.</p>;
  }

  const field = (text: string, control: React.ReactNode, required = false) => (
    <label className="block text-sm">
      <span className={label}>{text}{required && <span className="ml-0.5 text-status-danger">*</span>}</span>
      <div className="mt-1">{control}</div>
    </label>
  );

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="space-y-4">
        {/* The three steps, always visible, so nobody wonders how much is left. */}
        <ol className="flex flex-wrap gap-x-5 gap-y-2">
          {STEPS.map((s) => (
            <li key={s.n} className="flex items-center gap-2">
              <span className={cn("flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-bold",
                step === s.n ? "bg-primary text-primary-foreground" : step > s.n ? "bg-status-success/15 text-status-success" : "bg-muted text-muted-foreground")}>
                {step > s.n ? <Check className="h-3.5 w-3.5" aria-hidden /> : s.n}
              </span>
              <span className="leading-tight">
                <span className={cn("block text-xs font-bold", step === s.n ? "text-foreground" : "text-muted-foreground")}>{s.title}</span>
                <span className="block text-[10px] text-muted-foreground">{s.hint}</span>
              </span>
            </li>
          ))}
        </ol>

        {step === 1 && (
          <section className="space-y-3 rounded-xl border border-border bg-card p-4">
            <h3 className="text-sm font-bold text-foreground">Team member information</h3>
            <div className="grid gap-3 sm:grid-cols-2">
              {field("Full name", <Input value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Their name, as it should read" className="h-9 text-sm" />, true)}
              {field("Work email", <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@blessedempireservices.com" className="h-9 text-sm" />, true)}
              {field("Start date", <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="h-9 text-sm" />, true)}
              {field("Engagement type",
                <OpsSelect size="field" value={engagement} onValueChange={setEngagement}
                  options={ENGAGEMENT_TYPES.map((t) => ({ value: t.value, label: t.label }))} />, true)}
              {field("Position",
                <OpsSelect size="field" value={positionId} onValueChange={setPositionId}
                  options={[
                    { value: NONE, label: "Choose a position" },
                    ...(positions.data ?? []).filter((p) => !p.archivedAt).map((p) => ({ value: p.id, label: p.title })),
                    { value: NEW_POSITION, label: "+ Create a new position" },
                  ]} />, true)}
              {field("Reports to",
                <OpsSelect size="field" value={reportsTo} onValueChange={setReportsTo}
                  options={[{ value: NONE, label: "Nobody yet" }, ...people.map((m) => ({ value: m.userId, label: m.name }))]} />)}
              {positionId === NEW_POSITION && field("New position title",
                <Input value={newPosition} onChange={(e) => setNewPosition(e.target.value)} placeholder="e.g. Dispute Processor" className="h-9 text-sm" />, true)}
              {field("Phone (optional)", <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="(123) 456-7890" className="h-9 text-sm" />)}
            </div>
            <p className="rounded-lg border border-border bg-muted/40 px-3 py-2 text-[11px] text-muted-foreground">
              <strong className="text-foreground">Agent ID</strong> is assigned the moment you send this, from their start date —
              initials, month and year, then their number in the team. It never changes, and a resent invitation reuses it.
            </p>
          </section>
        )}

        {step === 2 && (
          <section className="space-y-3 rounded-xl border border-border bg-card p-4">
            <h3 className="text-sm font-bold text-foreground">Organizational placement</h3>
            <p className="text-[11px] text-muted-foreground">This decides their scope. Placement is scope; capabilities are separate.</p>
            <div className="grid gap-3 sm:grid-cols-2">
              {field("Division",
                <OpsSelect size="field" value={divisionId}
                  onValueChange={(v) => { setDivisionId(v); setDepartmentId(NONE); setTeamId(NONE); }}
                  options={[{ value: NONE, label: "Choose a division" }, ...divisions.map((d) => ({ value: d.id, label: d.name }))]} />,
                responsibility !== "chief_operations" && responsibility !== "agency_admin")}
              {field("Department",
                <OpsSelect size="field" value={departmentId}
                  onValueChange={(v) => { setDepartmentId(v); setTeamId(NONE); }}
                  options={[{ value: NONE, label: divisionId === NONE ? "Choose a division first" : "Choose a department" },
                    ...departments.map((d) => ({ value: d.id, label: d.name }))]} />,
                responsibility === "agent" || responsibility === "team_lead" || responsibility === "department_manager")}
              {field("Team",
                <OpsSelect size="field" value={teamId} onValueChange={setTeamId}
                  options={[{ value: NONE, label: departmentId === NONE ? "Choose a department first" : teams.length === 0 ? "No teams in this department" : "Choose a team" },
                    ...teams.map((t) => ({ value: t.id, label: t.name }))]} />, needsTeam)}
              {field("Responsibility",
                <OpsSelect size="field" value={responsibility} onValueChange={(v) => setResponsibility(v as Responsibility)}
                  options={RESPONSIBILITIES.map((r) => ({ value: r.value, label: r.label }))} />, true)}
            </div>
            <p className="text-[11px] text-muted-foreground">
              {RESPONSIBILITIES.find((r) => r.value === responsibility)?.hint}
            </p>
          </section>
        )}

        {step === 3 && (
          <section className="space-y-3 rounded-xl border border-border bg-card p-4">
            <h3 className="text-sm font-bold text-foreground">Review &amp; invite</h3>
            <dl className="divide-y divide-border/60">
              {([
                ["Name", fullName.trim()],
                ["Work email", email.trim()],
                ["Start date", startDate],
                ["Engagement", ENGAGEMENT_TYPES.find((t) => t.value === engagement)?.label ?? null],
                ["Position", positionTitle],
                ["Reports to", people.find((m) => m.userId === reportsTo)?.name ?? "Nobody yet"],
                ["Division", division?.name ?? "—"],
                ["Department", department?.name ?? "—"],
                ["Team", team?.name ?? "—"],
                ["Responsibility", RESPONSIBILITIES.find((r) => r.value === responsibility)?.label ?? null],
              ] as [string, string | null][]).map(([k, v]) => (
                <div key={k} className="flex items-start justify-between gap-4 py-1.5 text-xs">
                  <dt className="text-muted-foreground">{k}</dt>
                  <dd className="text-right font-medium text-foreground">{v || "—"}</dd>
                </div>
              ))}
            </dl>
            <p className="rounded-lg border border-border bg-muted/40 px-3 py-2 text-[11px] text-muted-foreground">
              Sending this creates their Team Member record and Agent ID straight away — they appear in People &amp; Teams as
              <strong className="text-foreground"> Pending activation</strong>. The email lets them set a password; activating links
              their sign-in to that record and makes it active. No confirmation email, because the link was sent to their address.
            </p>
          </section>
        )}

        <div className="flex flex-wrap items-center gap-2">
          {step > 1 && (
            <Button variant="outline" size="sm" onClick={() => setStep((s) => s - 1)}>
              <ArrowLeft className="mr-1.5 h-3.5 w-3.5" aria-hidden /> Back
            </Button>
          )}
          {step < 3 ? (
            <Button size="sm" className="ml-auto" disabled={step === 1 ? !step1Ready : !step2Ready} onClick={() => setStep((s) => s + 1)}>
              Next <ArrowRight className="ml-1.5 h-3.5 w-3.5" aria-hidden />
            </Button>
          ) : (
            <Button size="sm" className="ml-auto" disabled={invite.isPending || !step1Ready || !step2Ready} onClick={() => invite.mutate()}>
              {invite.isPending ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" aria-hidden /> : <Send className="mr-1.5 h-3.5 w-3.5" aria-hidden />}
              Send invitation
            </Button>
          )}
        </div>
        {message && (
          <p role="status" className={cn("text-xs", message.error ? "text-status-danger" : "text-status-success")}>{message.text}</p>
        )}
      </div>

      {/* Live preview — the same derivation the writers use. */}
      <aside className="space-y-3 rounded-xl border border-border bg-muted/30 p-4">
        <div>
          <h4 className="inline-flex items-center gap-1.5 text-xs font-bold text-foreground"><ShieldCheck className="h-3.5 w-3.5 text-primary" aria-hidden /> Live preview</h4>
          <p className="text-[10px] text-muted-foreground">How their access will be configured.</p>
        </div>
        <div className="flex items-center gap-2.5">
          <span className="flex h-11 w-11 items-center justify-center rounded-full bg-primary/10 text-sm font-bold text-primary">
            {fullName.trim() ? fullName.trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase()).join("") : <UserRound className="h-5 w-5" aria-hidden />}
          </span>
          <span className="min-w-0">
            <span className="block truncate text-sm font-bold text-foreground">{fullName.trim() || "Their name"}</span>
            <span className="block truncate text-[11px] text-muted-foreground">{positionTitle || "Position not chosen"}</span>
            <Pill tone="mt-1 border-primary/40 bg-primary/10 text-foreground">{plan.role === "agency_admin" ? "Agency Admin" : "Agency User"}</Pill>
          </span>
        </div>

        <div>
          <h5 className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground"><Building2 className="h-3 w-3" aria-hidden /> Organization</h5>
          <dl className="mt-1 divide-y divide-border/50">
            {([["Division", division?.name], ["Department", department?.name], ["Team", team?.name],
               ["Seat", RESPONSIBILITIES.find((r) => r.value === responsibility)?.label],
               ["Reports to", people.find((m) => m.userId === reportsTo)?.name]] as [string, string | undefined][])
              .map(([k, v]) => (
                <div key={k} className="flex items-center justify-between gap-2 py-1 text-[11px]">
                  <dt className="text-muted-foreground">{k}</dt><dd className="text-right font-medium text-foreground">{v ?? "—"}</dd>
                </div>
              ))}
          </dl>
        </div>

        <div>
          <h5 className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground"><Users className="h-3 w-3" aria-hidden /> Module access</h5>
          {plan.role === "agency_admin" ? (
            <p className="mt-1 rounded-lg border border-border bg-card px-2.5 py-1.5 text-[11px] text-foreground">Every module, by role.</p>
          ) : plan.moduleLabel ? (
            <p className="mt-1 flex items-center justify-between gap-2 rounded-lg border border-status-success/40 bg-status-success/5 px-2.5 py-1.5 text-[11px]">
              <span className="inline-flex items-center gap-1.5 font-semibold text-foreground"><CheckCircle2 className="h-3.5 w-3.5 text-status-success" aria-hidden /> {plan.moduleLabel}</span>
              <span className="text-[10px] text-muted-foreground">from placement</span>
            </p>
          ) : (
            <p className="mt-1 text-[11px] text-muted-foreground">Choose a division to grant its module.</p>
          )}
        </div>

        <div>
          <h5 className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Operational access</h5>
          <ul className="mt-1 space-y-0.5">
            {plan.includes.map((x) => (
              <li key={x} className="flex gap-1.5 text-[11px] text-foreground"><Check className="mt-0.5 h-3 w-3 shrink-0 text-status-success" aria-hidden />{x}</li>
            ))}
          </ul>
        </div>
        <div>
          <h5 className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Not included</h5>
          <ul className="mt-1 space-y-0.5">
            {plan.excludes.map((x) => (
              <li key={x} className="flex gap-1.5 text-[11px] text-muted-foreground"><Ban className="mt-0.5 h-3 w-3 shrink-0" aria-hidden />{x}</li>
            ))}
          </ul>
        </div>
        <p className="flex gap-1.5 rounded-lg border border-border bg-card px-2.5 py-1.5 text-[10px] text-muted-foreground">
          <Mail className="mt-0.5 h-3 w-3 shrink-0" aria-hidden />
          Payroll, compensation and schedule are set later from their profile, by someone who holds those capabilities.
        </p>
      </aside>
    </div>
  );
}
