/**
 * Team Members — the organization's roster, GHL-style (Dee's ask): a list to
 * add and manage people; a member page with User Info and Roles & Permissions
 * (role, the assigned-only scope switch, and what the role may do in each
 * entitled product). Per-member overrides, Copy Permission and invitation
 * delivery/acceptance arrive with ARCHITECTURE_PROPOSAL_TEAM_PERMISSIONS.md;
 * everything here writes real rows the membership policies judge.
 *
 * BES HQ renders the same section for any organization (People & Access), so
 * BES can support and control organization teams as GHL does for agencies.
 */
import { useMemo, useState } from "react";
import { formatDate } from "@/lib/format-date";
import { ArrowLeft, Link2, Loader2, Mail, Search, ShieldCheck, Trash2, UserPlus, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { OpsSelect } from "@/components/ui/ops-select";
import { Switch } from "@/components/ui/switch";
import { SeatUsageCard } from "@/components/settings/sections/SeatUsageCard";
import { SectionCard } from "@/components/settings/shared";
import { useAgency } from "@/lib/agency-context";
import { useAuth } from "@/lib/auth/auth-context";
import { errorMessage } from "@/lib/data/error-message";
import { roleAccessKey } from "@/lib/data/role-access";
import type { OrgRole, TeamMember } from "@/lib/data/team-members";
import { useOrganizationRoleAccess } from "@/lib/data/use-role-access";
import { useTeamMembers } from "@/lib/data/use-team-members";
import { MemberPermissionTree } from "@/components/settings/sections/MemberPermissionTree";
import { CONFIGURABLE_ROLES, ORG_ROLE_LABELS, defaultRoleAccess, departmentsFor, type OpsProduct, type RoleAccess } from "@/lib/fulfillment/role-access-defaults";
import { workspaceViewOptions } from "@/lib/fulfillment/workspace-views";
import { cn } from "@/lib/utils";
import { sendInvitationEmail } from "@/lib/data/emails";

const ROLE_OPTIONS = (Object.keys(ORG_ROLE_LABELS) as OrgRole[]).map((r) => ({ value: r, label: ORG_ROLE_LABELS[r] }));
const PRODUCT_LABEL: Record<OpsProduct, string> = { creditOps: "CreditOps", fundingOps: "FundingOps" };

interface Props { organizationId: string; organizationName: string }

export function TeamMembersSection({ organizationId, organizationName }: Props) {
  const team = useTeamMembers(organizationId);
  const auth = useAuth();
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<OrgRole>("credit_processor");
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [sent, setSent] = useState<string | null>(null);
  const [resending, setResending] = useState<string | null>(null);

  const resend = async (invitationId: string) => {
    setResending(invitationId);
    const outcome = await sendInvitationEmail(invitationId);
    setResending(null);
    setSent(
      outcome.status === "sent"
        ? "Activation email sent again."
        : outcome.status === "not_connected"
          ? "Email is not connected yet — copy the link instead."
          : outcome.message,
    );
  };

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return team.members.filter((m) => !q || m.name.toLowerCase().includes(q) || m.email.toLowerCase().includes(q) || ORG_ROLE_LABELS[m.role].toLowerCase().includes(q));
  }, [team.members, query]);
  const member = team.members.find((m) => m.membershipId === selected) ?? null;

  if (!team.live) {
    return <SectionCard icon={Users} title="Team Members" description="Team management reads the live database. Demo mode shows nothing here."><p className="text-xs text-muted-foreground">Sign in to a live organization.</p></SectionCard>;
  }
  if (member) return <MemberPage member={member} organizationId={organizationId} onBack={() => setSelected(null)} />;

  const submitInvite = () => {
    setSent(null);
    if (!auth.user || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(inviteEmail.trim())) { setError("Enter a valid email address."); return; }
    setError(null);
    /* The invitation is recorded first and emailed second: if email is not
       connected the person still has an invitation and the link can be
       copied, rather than the whole action failing. */
    team.invite.mutate({ organizationId, email: inviteEmail, role: inviteRole, invitedBy: auth.user.id }, {
      onSuccess: async (invitationId) => {
        setInviteEmail("");
        setInviteOpen(false);
        const outcome = await sendInvitationEmail(invitationId);
        setSent(
          outcome.status === "sent"
            ? `An email asking them to activate is on its way, branded as ${organizationName}.`
            : outcome.status === "not_connected"
              ? "Invitation recorded. Email is not connected yet, so copy the link from Pending invitations and send it yourself."
              : `Invitation recorded, but the email did not go: ${outcome.message}`,
        );
      },
      onError: (e) => setError(errorMessage(e, "Could not record the invitation.")),
    });
  };

  return (
    <div className="space-y-4">
      {/* Seats first: an invitation can be refused by the plan, and the reason
          should be on screen before the button is pressed rather than after. */}
      <SeatUsageCard organizationId={organizationId} />
      <SectionCard icon={Users} title="Team Members" description={`Add and manage the people of ${organizationName}. Roles decide what each person may do; the assigned-only switch decides what they see.`}
        action={<Button size="sm" onClick={() => setInviteOpen((v) => !v)}><UserPlus className="mr-1 h-4 w-4" /> Invite team member</Button>}>
        {sent && <p role="status" className="mb-3 text-xs text-status-success">{sent}</p>}
        {inviteOpen && (
          <div className="mb-4 grid gap-2 rounded-xl border border-border bg-background p-3 md:grid-cols-[1.6fr_1.2fr_auto] md:items-end">
            <label className="block"><span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Email</span>
              <input value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} placeholder="person@company.com" className="mt-1 w-full rounded-lg border border-border bg-background px-2.5 py-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary" /></label>
            <label className="block"><span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Role</span>
              <OpsSelect value={inviteRole} onValueChange={(v) => setInviteRole(v as OrgRole)} options={ROLE_OPTIONS} aria-label="Invitation role" /></label>
            <Button size="sm" onClick={submitInvite} disabled={team.invite.isPending}>{team.invite.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="mr-1 h-4 w-4" />} Send invitation</Button>
            <p className="text-[11px] text-muted-foreground md:col-span-3">They get an email in your branding asking them to activate their account. The invitation counts against your seats from now, lasts seven days, and can only be accepted by this email address.</p>
          </div>
        )}
        <div className="relative mb-3 max-w-sm">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search by name, email or role" className="w-full rounded-lg border border-border bg-background py-2 pl-9 pr-3 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary" />
        </div>
        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full text-left text-xs">
            <thead className="bg-muted/50 text-[11px] uppercase tracking-wider text-muted-foreground">
              <tr><th className="px-4 py-2 font-bold">Member</th><th className="px-4 py-2 font-bold">Role</th><th className="px-4 py-2 font-bold">Data visibility</th><th className="px-4 py-2 font-bold">Primary product</th><th className="px-4 py-2 font-bold">Since</th></tr>
            </thead>
            <tbody>
              {team.isLoading && <tr><td colSpan={5} className="px-4 py-6 text-center text-muted-foreground"><Loader2 className="mr-1 inline h-4 w-4 animate-spin" /> Loading team…</td></tr>}
              {!team.isLoading && rows.length === 0 && <tr><td colSpan={5} className="px-4 py-6 text-center text-muted-foreground">No team members match.</td></tr>}
              {rows.map((m) => (
                <tr key={m.membershipId} className="border-t border-border/60 hover:bg-muted/30">
                  <td className="px-4 py-2">
                    <button type="button" onClick={() => setSelected(m.membershipId)} className="text-left font-semibold text-primary hover:underline">{m.name}</button>
                    <p className="text-[11px] text-muted-foreground">{m.email}{m.userId === auth.user?.id && " · you"}</p>
                  </td>
                  <td className="px-4 py-2 text-foreground">{ORG_ROLE_LABELS[m.role]}</td>
                  <td className="px-4 py-2 text-foreground">{m.role === "org_admin" || m.role === "org_manager" ? "Everything in the organization" : m.assignedOnly ? "Assigned records only" : "All records in their departments"}</td>
                  <td className="px-4 py-2 text-foreground">{m.product ? m.product : "—"}</td>
                  <td className="px-4 py-2 text-muted-foreground">{formatDate(m.since)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {error && <p role="alert" className="mt-2 text-xs text-status-danger">{error}</p>}
        {team.error && <p role="alert" className="mt-2 text-xs text-status-danger">Could not load the team.</p>}
      </SectionCard>

      {team.invitations.length > 0 && (
        <SectionCard icon={Mail} title="Pending invitations" description="Invitations not yet accepted; they count against your seats. Resend the activation email, or copy the link and send it yourself — either way it only works for the invited email address.">
          <ul className="divide-y divide-border/60">
            {team.invitations.map((i) => (
              <li key={i.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-xs">
                <span><span className="font-semibold text-foreground">{i.email}</span><span className="text-muted-foreground"> · {i.role ? ORG_ROLE_LABELS[i.role] : "—"} · expires {formatDate(i.expiresAt)}</span></span>
                <button type="button" onClick={() => void resend(i.id)} disabled={resending === i.id} className="inline-flex items-center gap-1 text-[11px] font-semibold text-primary hover:underline disabled:opacity-60">{resending === i.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Mail className="h-3.5 w-3.5" />} Resend email</button>
                <button type="button" onClick={() => { void navigator.clipboard?.writeText(`${window.location.origin}/accept-invitation/${i.token}`); setCopied(i.id); window.setTimeout(() => setCopied(null), 2000); }} className="inline-flex items-center gap-1 text-[11px] font-semibold text-primary hover:underline"><Link2 className="h-3.5 w-3.5" /> {copied === i.id ? "Link copied" : "Copy invite link"}</button>
                <button type="button" onClick={() => team.cancel.mutate(i.id)} className="inline-flex items-center gap-1 text-[11px] font-semibold text-muted-foreground hover:text-status-danger"><Trash2 className="h-3.5 w-3.5" /> Cancel</button>
              </li>
            ))}
          </ul>
        </SectionCard>
      )}
    </div>
  );
}

/** BES HQ: the same roster for any organization — control and support, as GHL gives an agency over its locations. */
export function OrganizationTeamsSection() {
  const { organizations } = useAgency();
  const [orgId, setOrgId] = useState<string>(organizations[0]?.id ?? "");
  const org = organizations.find((o) => o.id === orgId) ?? null;
  return (
    <div className="space-y-4">
      <SectionCard icon={Users} title="Organization teams" description="Every organization's team members and invitations, for support and control. Changes here are the same audited membership writes an organization admin makes.">
        <label className="block max-w-md">
          <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Organization</span>
          <OpsSelect value={orgId} onValueChange={setOrgId} options={organizations.map((o) => ({ value: o.id, label: `${o.name} · ${o.publicId}` }))} aria-label="Organization" />
        </label>
      </SectionCard>
      {org && <TeamMembersSection key={org.id} organizationId={org.id} organizationName={org.name} />}
    </div>
  );
}

function MemberPage({ member, organizationId, onBack }: { member: TeamMember; organizationId: string; onBack: () => void }) {
  const team = useTeamMembers(organizationId);
  const auth = useAuth();
  const { isProductOn } = useAgency();
  const configured = useOrganizationRoleAccess(organizationId);
  const [role, setRole] = useState<OrgRole>(member.role);
  const [assignedOnly, setAssignedOnly] = useState(member.assignedOnly);
  const [error, setError] = useState<string | null>(null);
  const isSelf = member.userId === auth.user?.id;
  const dirty = role !== member.role || assignedOnly !== member.assignedOnly;
  const isAdminRole = role === "org_admin" || role === "org_manager";

  const save = () => {
    setError(null);
    team.update.mutate([member.membershipId, { role, assignedOnly }], { onError: (e) => setError(errorMessage(e, "Could not save the membership.")) });
  };
  const remove = () => {
    if (!window.confirm(`Remove ${member.name} from this organization? Their work history stays attributed to them.`)) return;
    team.remove.mutate(member.membershipId, { onSuccess: onBack, onError: (e) => setError(errorMessage(e, "Could not remove the member.")) });
  };

  const products = (["creditOps", "fundingOps"] as OpsProduct[]).filter((p) => isProductOn(p));

  return (
    <div className="space-y-4">
      <button type="button" onClick={onBack} className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"><ArrowLeft className="h-3.5 w-3.5" /> Back to team</button>
      <div className="grid gap-4 lg:grid-cols-[1fr_2fr]">
        <SectionCard icon={Users} title="User Info">
          <dl className="space-y-2 text-xs">
            <div><dt className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Name</dt><dd className="text-foreground">{member.name}</dd></div>
            <div><dt className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Email</dt><dd className="text-foreground">{member.email}</dd></div>
            <div><dt className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Member since</dt><dd className="text-foreground">{formatDate(member.since)}</dd></div>
          </dl>
          {!isSelf && (
            <button type="button" onClick={remove} disabled={team.remove.isPending} className="mt-4 inline-flex items-center gap-1 rounded-lg border border-red-500/30 px-2.5 py-1.5 text-xs font-bold text-red-700 hover:bg-red-500/10 disabled:opacity-60">
              <Trash2 className="h-3.5 w-3.5" /> Remove from organization
            </button>
          )}
        </SectionCard>

        <SectionCard icon={ShieldCheck} title="Roles and Permissions" description={isSelf ? "You cannot change your own role or scope; another admin does that." : undefined}>
          <div className="space-y-4">
            <label className="block">
              <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">User role</span>
              <OpsSelect value={role} onValueChange={(v) => setRole(v as OrgRole)} options={ROLE_OPTIONS} disabled={isSelf} aria-label="User role" />
            </label>
            <label className="flex items-center gap-3 text-xs text-foreground">
              <Switch checked={assignedOnly && !isAdminRole} onCheckedChange={(v) => setAssignedOnly(v)} disabled={isSelf || isAdminRole} aria-label="Restrict data visibility to only assigned data" />
              <span>Restrict data visibility to only assigned data{isAdminRole && <span className="text-muted-foreground"> — admins and managers always see the whole organization</span>}</span>
            </label>

            <div className="space-y-3 border-t border-border/60 pt-3">
              <p className="text-[11px] text-muted-foreground">What this role may do in each product. Role defaults are edited in <span className="font-semibold text-foreground">Roles &amp; access</span>; per-member overrides and Copy Permission arrive with the Team Permissions proposal.</p>
              {products.length === 0 && <p className="text-xs text-muted-foreground">No CreditOps or FundingOps entitlement on this organization.</p>}
              {products.map((product) => {
                const access: RoleAccess = configured.rows[roleAccessKey(role, product)] ?? defaultRoleAccess(role, product);
                const on = isAdminRole || access.departments.length > 0 || access.canAccessManagement;
                const configurable = (CONFIGURABLE_ROLES[product] as OrgRole[]).includes(role);
                return (
                  <div key={product} className={cn("rounded-xl border p-3", on ? "border-border bg-background" : "border-border/60 bg-muted/30")}>
                    <div className="flex items-center gap-2">
                      <Switch checked={on} disabled aria-label={`${PRODUCT_LABEL[product]} access`} />
                      <p className="text-sm font-bold text-foreground">{PRODUCT_LABEL[product]}</p>
                      <span className="ml-auto text-[10px] text-muted-foreground">{isAdminRole ? "full access by role" : configurable ? (configured.rows[roleAccessKey(role, product)] ? "Configured" : "Default") : "not a role of this product"}</span>
                    </div>
                    {!isAdminRole && configurable && (
                      <div className="mt-2 grid gap-3 sm:grid-cols-2">
                        <div>
                          <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Departments</p>
                          {departmentsFor(product).map((d) => <label key={d} className="mt-1 flex items-center gap-2 text-xs text-foreground"><Checkbox checked={access.departments.includes(d)} disabled /> {d}</label>)}
                        </div>
                        <div>
                          <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Workspace views</p>
                          {workspaceViewOptions(product).map((v) => <label key={v.id} className="mt-1 flex items-center gap-2 text-xs text-foreground"><Checkbox checked={access.views.length === 0 || access.views.includes(v.id)} disabled /> {v.label}</label>)}
                          <p className="mt-2 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Capabilities</p>
                          <label className="mt-1 flex items-center gap-2 text-xs text-foreground"><Checkbox checked={access.canLogWork} disabled /> Log work</label>
                          <label className="mt-1 flex items-center gap-2 text-xs text-foreground"><Checkbox checked={access.canEditProgress} disabled /> Edit department / stage progress</label>
                          <label className="mt-1 flex items-center gap-2 text-xs text-foreground"><Checkbox checked={access.canAccessManagement} disabled /> Management layer</label>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            <MemberPermissionTree member={member} organizationId={organizationId} role={member.role} members={team.members} canEdit={!isSelf} />

            <div className="flex items-center justify-end gap-2 border-t border-border/60 pt-3">
              <Button variant="outline" size="sm" onClick={() => { setRole(member.role); setAssignedOnly(member.assignedOnly); }} disabled={!dirty}>Cancel</Button>
              <Button size="sm" onClick={save} disabled={!dirty || isSelf || team.update.isPending}>{team.update.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save"}</Button>
            </div>
            {error && <p role="alert" className="text-xs text-status-danger">{error}</p>}
          </div>
        </SectionCard>
      </div>
    </div>
  );
}
