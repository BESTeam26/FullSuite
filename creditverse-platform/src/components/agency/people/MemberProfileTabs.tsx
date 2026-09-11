/**
 * The Team Member profile's tabs — every one a VIEW over canonical records.
 *
 * Nothing here owns data. Placement writes agency_memberships through
 * setMemberPlacement; teams write team_memberships through the same actions
 * the Teams page uses; assignments read partner_assignments; time reads the
 * same schedules/attendance the old HR page read. One person, one canonical
 * record, many connected views (Dee's People Hub doctrine, 2026-09-09) — the
 * profile is where they meet, never where copies of them live.
 */
import { useState } from "react";
import { Link } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { ContentCard } from "@/components/dashboard/DivisionLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { OpsSelect } from "@/components/ui/ops-select";
import { Pill } from "@/components/agency/partner/partner-ui";
import { SchedulesAndRates } from "@/components/agency/people/SchedulesAndRates";
import { useTeamActions } from "@/lib/data/use-agency-teams";
import { useAgencyPartners } from "@/lib/data/use-agency-partners";
import { useMemberAssignmentActions } from "@/lib/data/use-partner-assignments";
import { setMemberPlacement } from "@/lib/data/organization-structure";
import { useOrganizationTree } from "@/lib/data/use-organization-structure";
import {
  useMemberActivity, useMemberEod, useMemberPartnerAssignments,
} from "@/lib/data/team-member";
import { useAttendanceRange, usePayRates } from "@/lib/data/use-people";
import { useEodActivity } from "@/lib/data/use-eod-day";
import {
  MEMBER_DOCUMENT_KINDS, MEMBER_DOCUMENT_STATUSES, memberDocumentUrl,
  useMemberDocumentActions, useMemberDocuments, type MemberDocumentStatus,
} from "@/lib/data/member-documents";
import { signingLink, useDocumentActions, useDocumentTemplates, useSignatureRequests } from "@/lib/data/documents";
import { useAgencyPermissions } from "@/lib/data/agency-permissions";
import { useQueryClient } from "@tanstack/react-query";
import { formatDate } from "@/lib/format-date";
import { formatCentsIn } from "@/lib/format-money";
import { useToast } from "@/hooks/use-toast";
import type { AgencyMember } from "@/lib/data/agency-teams";
import type { AgencyPerson, AgencyTeam } from "@/lib/data/agency-workforce";

const NONE = "__none__";

/* ── Work & Organization: where the person sits ───────────────────────── */

export function WorkOrgTab({ member, people, teams }: {
  member: AgencyMember;
  people: AgencyPerson[];
  teams: AgencyTeam[];
}) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const teamActions = useTeamActions();
  const tree = useOrganizationTree();
  const [title, setTitle] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [addTeam, setAddTeam] = useState(NONE);

  const myTeams = teams.filter((t) => !t.archived && t.members.some((m) => m.userId === member.userId));
  const otherTeams = teams.filter((t) => !t.archived && !t.members.some((m) => m.userId === member.userId));
  const managerOptions = [
    { value: NONE, label: "Nobody" },
    ...people.filter((p) => p.userId !== member.userId).map((p) => ({ value: p.userId, label: p.name })),
  ];

  const place = async (patch: Parameters<typeof setMemberPlacement>[1]) => {
    setSaving(true);
    try {
      await setMemberPlacement(member.membershipId, patch);
      void qc.invalidateQueries({ queryKey: ["agency", "members"] });
      toast({ title: "Saved" });
    } catch (e) {
      toast({ title: "Could not save", description: (e as Error).message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-3">
      <ContentCard title="Position & reporting">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-sm">
            <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Position (job title)</span>
            <div className="mt-1 flex gap-2">
              <Input value={title ?? member.jobTitle ?? ""} onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Processing Team Lead" className="h-8 text-xs" />
              <Button size="sm" variant="outline" disabled={saving || title === null}
                onClick={() => void place({ jobTitle: title })}>
                {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Save"}
              </Button>
            </div>
            <span className="mt-1 block text-[11px] text-muted-foreground">
              A position describes the job. It never grants access — that is the Access tab.
            </span>
          </label>
          <label className="text-sm">
            <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Reports to</span>
            <div className="mt-1">
              <OpsSelect size="field" value={member.managerId ?? NONE}
                onValueChange={(v) => void place({ managerId: v === NONE ? null : v })}
                options={managerOptions} />
            </div>
          </label>
        </div>
      </ContentCard>

      <ContentCard title="Teams">
        {myTeams.length === 0 ? (
          <p className="py-2 text-xs text-muted-foreground">On no team yet.</p>
        ) : (
          <ul className="divide-y divide-border/50">
            {myTeams.map((t) => {
              const lead = t.members.find((m) => m.userId === member.userId)?.isLead ?? false;
              return (
                <li key={t.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-xs">
                  <span className="font-medium text-foreground">
                    {t.name}
                    {lead && <Pill tone="ml-2 border-primary/40 bg-primary/10 text-foreground">Team Lead</Pill>}
                    {tree.data && (
                      <span className="ml-2 text-muted-foreground">
                        {[t.division, t.department].filter(Boolean).join(" · ")}
                      </span>
                    )}
                  </span>
                  <span className="flex gap-1.5">
                    <Button size="sm" variant="ghost" className="h-7 text-[11px]"
                      onClick={() => teamActions.setLead.mutate({ teamId: t.id, userId: member.userId, isLead: !lead })}>
                      {lead ? "Remove lead" : "Make lead"}
                    </Button>
                    <Button size="sm" variant="ghost" className="h-7 text-[11px] text-destructive"
                      onClick={() => teamActions.removeMember.mutate({ teamId: t.id, userId: member.userId })}>
                      Remove
                    </Button>
                  </span>
                </li>
              );
            })}
          </ul>
        )}
        <div className="mt-3 flex items-center gap-2">
          <OpsSelect size="sm" value={addTeam} onValueChange={setAddTeam}
            options={[{ value: NONE, label: "Add to a team…" },
              ...otherTeams.map((t) => ({ value: t.id, label: t.name }))]} />
          <Button size="sm" variant="outline" disabled={addTeam === NONE || teamActions.addMember.isPending}
            onClick={() => { teamActions.addMember.mutate({ teamId: addTeam, userId: member.userId }); setAddTeam(NONE); }}>
            Add
          </Button>
        </div>
      </ContentCard>
    </div>
  );
}

/* ── Assignments: which partners this person may actually work ─────────── */

export function AssignmentsTab({ member, teams }: { member: AgencyMember; teams: AgencyTeam[] }) {
  const teamIds = teams
    .filter((t) => !t.archived && t.members.some((m) => m.userId === member.userId))
    .map((t) => t.id);
  const assignments = useMemberPartnerAssignments(member.userId, teamIds, true);
  const partners = useAgencyPartners();
  const actions = useMemberAssignmentActions(member.userId);
  const perms = useAgencyPermissions();
  const canAssign = perms.can("partners.assignments");
  const { toast } = useToast();
  const [picked, setPicked] = useState(NONE);

  /* Only partners they do not already reach BY NAME. A team assignment is a
     different fact and does not block a direct one — somebody may work a
     partner personally as well as through their team. */
  const directIds = new Set((assignments.data ?? []).filter((a) => a.via === "direct").map((a) => a.groupId));
  const assignable = (partners.data ?? []).filter((p) => !directIds.has(p.id));

  const assignOne = () => {
    if (picked === NONE) return;
    actions.assign.mutate({ groupId: picked }, {
      onSuccess: () => { setPicked(NONE); toast({ title: "Assigned" }); },
      onError: (e) => toast({ title: "Could not assign", description: (e as Error).message, variant: "destructive" }),
    });
  };

  const assignAll = () => {
    const ids = assignable.map((p) => p.id);
    if (ids.length === 0) return;
    actions.assignMany.mutate(ids, {
      onSuccess: (n) => toast({ title: `Assigned ${n} partner${n === 1 ? "" : "s"}` }),
      onError: (e) => toast({ title: "Could not assign them all", description: (e as Error).message, variant: "destructive" }),
    });
  };

  return (
    <ContentCard title="Partner assignments">
      <p className="mb-2 text-[11px] text-muted-foreground">
        Assignment is what makes a partner visible to {member.name}: the database resolves it two
        ways — assigned by name here, or through a team they are on. Ending one removes future
        access and keeps the history of who worked the account.
      </p>

      {canAssign && (
        <div className="mb-3 flex flex-wrap items-center gap-2 rounded-lg border border-border bg-muted/20 p-2.5">
          <OpsSelect size="sm" value={picked} onValueChange={setPicked}
            options={[{ value: NONE, label: partners.isLoading ? "Loading partners…" : "Assign a partner…" },
              ...assignable.map((p) => ({ value: p.id, label: p.name }))]} />
          <Button size="sm" variant="outline" className="h-7 text-[11px]"
            disabled={picked === NONE || actions.assign.isPending} onClick={assignOne}>
            {actions.assign.isPending && <Loader2 className="mr-1 h-3 w-3 animate-spin" />} Assign
          </Button>
          <span className="text-[11px] text-muted-foreground">or</span>
          <Button size="sm" variant="ghost" className="h-7 text-[11px]"
            disabled={assignable.length === 0 || actions.assignMany.isPending} onClick={assignAll}>
            {actions.assignMany.isPending && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}
            Assign all {assignable.length} remaining
          </Button>
        </div>
      )}
      {assignments.isLoading ? (
        <p className="py-4 text-xs text-muted-foreground"><Loader2 className="mr-1.5 inline h-3 w-3 animate-spin" /> Loading…</p>
      ) : (assignments.data ?? []).length === 0 ? (
        <p className="py-3 text-xs text-muted-foreground">No partner assignments. Work reaches them through My Work only.</p>
      ) : (
        <ul className="divide-y divide-border/50">
          {(assignments.data ?? []).map((a) => (
            <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-xs">
              <span>
                <Link to={`/app/bes-partners/${a.groupId}`} className="font-medium text-foreground hover:underline">
                  {a.partnerName}
                </Link>
                {a.service && <span className="ml-2 text-muted-foreground">{a.service}</span>}
              </span>
              <span className="flex items-center gap-2 text-muted-foreground">
                <span>
                  {a.via === "direct" ? "Assigned directly" : `Via ${a.teamName ?? "team"}`}
                  {a.startedOn ? ` · since ${formatDate(a.startedOn)}` : ""}
                </span>
                {canAssign && a.via === "direct" && (
                  <Button size="sm" variant="ghost" className="h-6 text-[11px] text-destructive"
                    disabled={actions.end.isPending}
                    onClick={() => actions.end.mutate(a.id, {
                      onSuccess: () => toast({ title: "Assignment ended", description: "Future access is removed; the history stays." }),
                      onError: (e) => toast({ title: "Could not end it", description: (e as Error).message, variant: "destructive" }),
                    })}>
                    End
                  </Button>
                )}
                {a.via === "team" && (
                  <span className="text-[10px]">edited on the team</span>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}
    </ContentCard>
  );
}

/* ── Schedule & time: the person's working pattern and attendance ──────── */

const isoDaysAgo = (n: number) => {
  const d = new Date(); d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
};

export function ScheduleTimeTab({ member }: { member: AgencyMember }) {
  const from = isoDaysAgo(6);
  const to = isoDaysAgo(0);
  const attendance = useAttendanceRange(from, to);
  const mine = (attendance.data ?? []).filter((a) => a.userId === member.userId);

  return (
    <div className="space-y-3">
      <SchedulesAndRates onlyUserId={member.userId} />
      <ContentCard title="Attendance — last 7 days">
        {attendance.isLoading ? (
          <p className="py-4 text-xs text-muted-foreground"><Loader2 className="mr-1.5 inline h-3 w-3 animate-spin" /> Loading…</p>
        ) : mine.length === 0 ? (
          <p className="py-3 text-xs text-muted-foreground">
            Nothing derived yet — attendance appears once a schedule exists and days pass.
          </p>
        ) : (
          <ul className="divide-y divide-border/50">
            {mine.map((a) => (
              <li key={a.day} className="flex items-center justify-between py-1.5 text-xs">
                <span className="text-foreground">{formatDate(a.day)}</span>
                <span className="text-muted-foreground">
                  {a.status.replace(/_/g, " ")}{a.lateMinutes ? ` · ${a.lateMinutes}m late` : ""}
                  {a.workMinutes ? ` · ${Math.floor(a.workMinutes / 60)}h ${a.workMinutes % 60}m worked` : ""}
                </span>
              </li>
            ))}
          </ul>
        )}
      </ContentCard>
    </div>
  );
}

/* ── Compensation: authorized eyes only — RLS returns nothing to others ── */

export function CompensationTab({ member }: { member: AgencyMember }) {
  const perms = useAgencyPermissions();
  const rates = usePayRates();
  const rate = (rates.data ?? []).find((r) => r.userId === member.userId);
  if (!perms.can("payroll.view") && !perms.can("payroll.manage")) return null;

  return (
    <ContentCard title="Compensation">
      {rates.isLoading ? (
        <p className="py-4 text-xs text-muted-foreground"><Loader2 className="mr-1.5 inline h-3 w-3 animate-spin" /> Loading…</p>
      ) : rate ? (
        <div className="text-sm text-foreground">
          <p className="font-semibold">
            {formatCentsIn(rate.rateCents, rate.currency)} {rate.rateType === "hourly" ? "/ hour" : "/ cutoff"}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Effective {formatDate(rate.effectiveFrom)}. Rate changes are made on the Schedule &amp; Time tab and
            keep their history; payslips live under Finance → Payroll.
          </p>
        </div>
      ) : (
        <p className="py-3 text-xs text-muted-foreground">
          No rate on file — payroll will skip this person until one is set on the Schedule &amp; Time tab.
        </p>
      )}
    </ContentCard>
  );
}

/* ── Performance / EOD: read the canonical records, never a second log ─── */

export function EodTab({ member }: { member: AgencyMember }) {
  const eod = useMemberEod(member.userId, true);
  return (
    <ContentCard title="End of Day — recent">
      {eod.isLoading ? (
        <p className="py-4 text-xs text-muted-foreground"><Loader2 className="mr-1.5 inline h-3 w-3 animate-spin" /> Loading…</p>
      ) : (eod.data ?? []).length === 0 ? (
        <p className="py-3 text-xs text-muted-foreground">No EOD submissions yet.</p>
      ) : (
        <ul className="divide-y divide-border/50">
          {(eod.data ?? []).map((e) => (
            <li key={e.id} className="py-2 text-xs">
              <div className="flex items-center justify-between">
                <span className="font-medium text-foreground">{formatDate(e.workDate)}</span>
                <Pill tone="border-border bg-muted text-foreground">
                  {e.state}{e.autoSubmitted ? " · auto" : ""}
                </Pill>
              </div>
              {e.blockers && <p className="mt-1 text-muted-foreground">Blockers: {e.blockers}</p>}
              {e.nextPriority && <p className="mt-0.5 text-muted-foreground">Next: {e.nextPriority}</p>}
            </li>
          ))}
        </ul>
      )}
    </ContentCard>
  );
}

/* ── Activity: the person's history, from the one activity log ─────────── */

export function ActivityTab({ member }: { member: AgencyMember }) {
  const activity = useMemberActivity(member.userId, true);
  return (
    <ContentCard title="History">
      {activity.isLoading ? (
        <p className="py-4 text-xs text-muted-foreground"><Loader2 className="mr-1.5 inline h-3 w-3 animate-spin" /> Loading…</p>
      ) : (activity.data ?? []).length === 0 ? (
        <p className="py-3 text-xs text-muted-foreground">No recorded changes yet.</p>
      ) : (
        <ul className="divide-y divide-border/50">
          {(activity.data ?? []).map((a) => (
            <li key={a.id} className="py-2 text-xs">
              <p className="font-medium text-foreground">{a.action}</p>
              <p className="text-muted-foreground">
                {a.previousValue && a.newValue ? `${a.previousValue} → ${a.newValue} · ` : ""}
                {a.actorName ? `by ${a.actorName} · ` : ""}{formatDate(a.at)}
              </p>
            </li>
          ))}
        </ul>
      )}
    </ContentCard>
  );
}

/* ── Documents & Agreements: the person's paper trail (§15/§16) ─────────── */

export function DocumentsTab({ member, agencyId }: { member: AgencyMember; agencyId: string }) {
  const docs = useMemberDocuments(member.userId, true);
  const actions = useMemberDocumentActions(member.userId);
  const { toast } = useToast();
  /* Sending for signature (D-005): pick an active member-audience template;
     the database renders and freezes it for THIS person and refuses an
     unfilled field; the mailer carries the link. */
  const templates = useDocumentTemplates();
  const requests = useSignatureRequests(member.userId);
  const docActions = useDocumentActions();
  const perms = useAgencyPermissions();
  const canSend = perms.can("documents.manage");
  const [templateId, setTemplateId] = useState(NONE);
  const sendable = (templates.data ?? []).filter((t) => t.status === "active" && (t.audience === "member" || t.audience === "any"));
  const sendForSig = () => {
    if (templateId === NONE) return;
    docActions.send.mutate(
      { templateId, signer: { kind: "member", userId: member.userId } },
      {
        onSuccess: (r) => {
          setTemplateId(NONE);
          toast({
            title: r.emailed ? "Sent for signature" : "Created — but the email did not go",
            description: r.emailed
              ? `${member.name} has an email with the signing link.`
              : `${r.emailError ?? ""} Copy the link from the request below and send it yourself.`,
            variant: r.emailed ? undefined : "destructive",
          });
        },
        onError: (e) => toast({ title: "Could not send", description: (e as Error).message, variant: "destructive" }),
      },
    );
  };
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState("agreement");
  const [name, setName] = useState("");
  const [status, setStatus] = useState<MemberDocumentStatus>("pending_signature");
  const [visible, setVisible] = useState(true);
  const [file, setFile] = useState<File | null>(null);

  const add = () =>
    actions.add.mutate(
      {
        agencyId, userId: member.userId, kind, name: name || file?.name || "Document",
        status, visibleToMember: visible, file: file ?? undefined,
      },
      {
        onSuccess: () => { setOpen(false); setName(""); setFile(null); toast({ title: "Document added" }); },
        onError: (e) => toast({ title: "Could not add", description: (e as Error).message, variant: "destructive" }),
      },
    );

  const download = async (path: string) => {
    try {
      window.open(await memberDocumentUrl(path), "_blank", "noopener");
    } catch (e) {
      toast({ title: "Could not open", description: (e as Error).message, variant: "destructive" });
    }
  };

  return (
    <ContentCard title="Documents & agreements">
      <p className="mb-2 text-[11px] text-muted-foreground">
        Agreements, NDAs, policies and acknowledgments, with their signature status. Visible only to
        holders of the team-member-documents capability — and to {member.name} where a document is
        marked visible to them. Nothing here deletes: superseded and archived are statuses.
      </p>
      {docs.isLoading ? (
        <p className="py-4 text-xs text-muted-foreground"><Loader2 className="mr-1.5 inline h-3 w-3 animate-spin" /> Loading…</p>
      ) : (docs.data ?? []).length === 0 ? (
        <p className="py-3 text-xs text-muted-foreground">No documents yet.</p>
      ) : (
        <ul className="divide-y divide-border/50">
          {(docs.data ?? []).map((d) => (
            <li key={d.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-xs">
              <span className="min-w-0">
                <span className="block font-medium text-foreground">{d.name}</span>
                <span className="block text-muted-foreground">
                  {MEMBER_DOCUMENT_KINDS.find((k) => k.value === d.kind)?.label ?? d.kind}
                  {d.signedAt ? ` · signed ${formatDate(d.signedAt)}` : d.sentAt ? ` · sent ${formatDate(d.sentAt)}` : ""}
                  {d.expiresOn ? ` · expires ${formatDate(d.expiresOn)}` : ""} · v{d.version}
                </span>
              </span>
              <span className="flex items-center gap-1.5">
                <OpsSelect size="inline" value={d.status}
                  onValueChange={(v) => actions.setStatus.mutate({ id: d.id, status: v as MemberDocumentStatus })}
                  options={MEMBER_DOCUMENT_STATUSES} />
                {d.filePath && (
                  <Button size="sm" variant="outline" className="h-7 text-[11px]" onClick={() => void download(d.filePath!)}>
                    Open
                  </Button>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}

      {canSend && (
        <div className="mt-3 rounded-lg border border-border bg-muted/20 p-2.5">
          <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Send for signature</p>
          <div className="mt-1.5 flex flex-wrap items-center gap-2">
            <OpsSelect size="sm" value={templateId} onValueChange={setTemplateId}
              options={[{ value: NONE, label: sendable.length === 0 ? "No active templates — build one in Settings → Documents" : "Choose a document…" },
                ...sendable.map((t) => ({ value: t.id, label: `${t.name} (v${t.version})` }))]} />
            <Button size="sm" className="h-7 text-[11px]" disabled={templateId === NONE || docActions.send.isPending} onClick={sendForSig}>
              {docActions.send.isPending && <Loader2 className="mr-1 h-3 w-3 animate-spin" />} Send to {member.name.split(" ")[0]}
            </Button>
          </div>
          {(requests.data ?? []).length > 0 && (
            <ul className="mt-2 divide-y divide-border/50 text-[11px]">
              {(requests.data ?? []).map((r) => (
                <li key={r.id} className="flex flex-wrap items-center gap-2 py-1.5">
                  <Pill tone={r.status === "signed" ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700" : "border-border bg-muted text-foreground"}>{r.status}</Pill>
                  <span className="text-foreground">{r.title}</span>
                  <span className="text-muted-foreground">
                    {r.signedAt ? `signed ${formatDate(r.signedAt)}` : `sent ${formatDate(r.sentAt)}`}
                  </span>
                  {(r.status === "sent" || r.status === "viewed") && (
                    <>
                      <button type="button" className="text-primary underline-offset-2 hover:underline"
                        onClick={() => { void navigator.clipboard.writeText(signingLink(r.token)); toast({ title: "Signing link copied" }); }}>
                        Copy link
                      </button>
                      <button type="button" className="text-destructive underline-offset-2 hover:underline"
                        onClick={() => docActions.void.mutate(r.id, { onSuccess: () => toast({ title: "Request voided" }) })}>
                        Void
                      </button>
                    </>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {!open ? (
        <Button size="sm" variant="outline" className="mt-3" onClick={() => setOpen(true)}>Add signed document</Button>
      ) : (
        <div className="mt-3 space-y-2 rounded-lg border border-border p-3">
          <div className="grid gap-2 sm:grid-cols-2">
            <label className="text-xs">
              <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Type</span>
              <OpsSelect size="field" value={kind} onValueChange={setKind}
                options={MEMBER_DOCUMENT_KINDS.map((k) => ({ value: k.value, label: k.label }))} />
            </label>
            <label className="text-xs">
              <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Status</span>
              <OpsSelect size="field" value={status} onValueChange={(v) => setStatus(v as MemberDocumentStatus)}
                options={MEMBER_DOCUMENT_STATUSES} />
            </label>
          </div>
          <label className="block text-xs">
            <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Document name</span>
            <Input value={name} onChange={(e) => setName(e.target.value)} className="h-8 text-xs"
              placeholder={file?.name ?? "e.g. Contractor Agreement 2026"} />
          </label>
          <label className="block text-xs">
            <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">File (optional — a signed PDF, for example)</span>
            <input type="file" className="mt-1 block w-full text-xs"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          </label>
          <label className="flex items-center gap-2 text-xs text-foreground">
            <input type="checkbox" checked={visible} onChange={(e) => setVisible(e.target.checked)} />
            Visible to {member.name}
          </label>
          <div className="flex gap-2">
            <Button size="sm" disabled={actions.add.isPending} onClick={add}>
              {actions.add.isPending && <Loader2 className="mr-1 h-3 w-3 animate-spin" />} Save
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
          </div>
        </div>
      )}
    </ContentCard>
  );
}

/* ── Work & Performance: today as the system observed it (Dee §18–§19) ──
   Read from the SAME derivation Agent EOD uses (`eod_day_activity`): files or
   work units worked, actions, production, handoffs, QA, time. Nothing here is
   typed by anybody, and the columns follow the person's actual work — a
   CreditOps day shows departments and rounds, a BES CRM day shows work units
   and build actions — because the activity carries them, not because a KPI
   grid demanded them. */
export function WorkPerformanceTab({ member }: { member: AgencyMember }) {
  const today = new Date().toISOString().slice(0, 10);
  const activity = useEodActivity(today, member.userId);
  const a = activity.data;
  const fmt = (m: number) => `${Math.floor(m / 60)}h ${Math.round(m % 60)}m`;
  return (
    <ContentCard title="Today — derived from the canonical work">
      {activity.isLoading ? (
        <p className="py-4 text-xs text-muted-foreground"><Loader2 className="mr-1.5 inline h-3 w-3 animate-spin" /> Loading…</p>
      ) : !a ? (
        <p className="py-3 text-xs text-muted-foreground">Nothing recorded today.</p>
      ) : (
        <div className="space-y-3 text-xs">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-6">
            {[
              ["Files / units worked", a.filesWorked],
              ["Actions completed", a.actionsCompleted],
              ["Production units", a.productionUnits],
              ["In progress", a.inProgress.length],
              ["Blocked", a.blocked.length],
              ["Time logged", fmt(a.minutesLogged)],
            ].map(([label, value]) => (
              <div key={String(label)} className="rounded-lg border border-border bg-background p-2.5">
                <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{label}</div>
                <div className="text-lg font-bold text-foreground">{value}</div>
              </div>
            ))}
          </div>
          {a.byDepartment.length > 0 && (
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">By department</p>
              <ul className="mt-1 divide-y divide-border/50">
                {a.byDepartment.map((d) => (
                  <li key={d.department} className="flex items-center justify-between py-1">
                    <span className="text-foreground">{d.department}</span>
                    <span className="text-muted-foreground">{d.files} file{d.files === 1 ? "" : "s"} · {d.actions} action{d.actions === 1 ? "" : "s"}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {a.actionBreakdown.length > 0 && (
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Actions</p>
              <p className="mt-1 text-foreground">{a.actionBreakdown.map((x) => `${x.action} ×${x.count}`).join(" · ")}</p>
            </div>
          )}
          {(a.worked.length > 0 || a.inProgress.length > 0) && (
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Current work</p>
              <ul className="mt-1 divide-y divide-border/50">
                {[...a.inProgress, ...a.worked.filter((w) => !a.inProgress.some((i) => i.id === w.id))].slice(0, 12).map((w) => (
                  <li key={w.id} className="flex items-center justify-between py-1">
                    <span className="text-foreground">{w.title}</span>
                    <span className="text-muted-foreground">{w.stage ?? ""}{w.due_at ? ` · due ${formatDate(w.due_at)}` : ""}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {a.blocked.length > 0 && (
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-status-warning">Blocked</p>
              <ul className="mt-1 divide-y divide-border/50">
                {a.blocked.map((w) => (
                  <li key={w.id} className="py-1 text-foreground">{w.title}{w.reason ? <span className="text-muted-foreground"> — {w.reason}</span> : null}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </ContentCard>
  );
}
