/**
 * Inviting people onto the BES team.
 *
 * Every rule is the database's: only an owner or admin may invite, only an
 * owner may create another owner, and an invitation is accepted only by the
 * address it was sent to. This screen offers the roles the caller may
 * actually grant and shows what came back when it refuses.
 *
 * Creating the invitation and emailing it are separate steps, so a mail
 * provider that is down never costs someone their invitation — the link is
 * still there to copy, and the screen says which of the two happened rather
 * than implying an email went out.
 */
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Copy, Loader2, Mail, Send, Trash2, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SectionCard } from "@/components/settings/shared";
import { useAuth } from "@/lib/auth/auth-context";
import { formatDate } from "@/lib/format-date";
import { errorMessage } from "@/lib/data/error-message";
import { sendInvitationEmail } from "@/lib/data/emails";
import { isAdminRole } from "@/lib/agency/navigation";
import {
  INVITE_CHOICES,
  previewAccess,
  cancelAgencyInvitation,
  fetchAgencyInvitations,
  invitationLink,
  inviteAgencyMember,
  memberAccessLabel,
} from "@/lib/data/agency-invitations";
import { requireSupabase } from "@/lib/supabase/client";
import { fetchPermissionCatalogue } from "@/lib/data/agency-permissions";

/* The four module doors, by their canonical keys. */
const MODULE_CHOICES = [
  { key: "creditops.clients.view", label: "CreditOps" },
  { key: "crm.projects.view", label: "BES CRM" },
  { key: "talentops.view", label: "TalentOps" },
  { key: "fundingops.files.view", label: "FundingOps" },
];

const inputCls = "mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary";
const labelCls = "block text-[10px] font-bold uppercase tracking-wider text-muted-foreground";

export function AgencyTeamInvites() {
  const auth = useAuth();
  const qc = useQueryClient();
  const live = auth.mode === "live" && auth.status === "signed-in";
  const role = auth.agencyRole;
  const canInvite = isAdminRole(role);

  /* The same preset matrix the database resolves against, so the preview
     below cannot claim access the person will not receive. */
  const catalogue = useQuery({
    queryKey: ["agency", "permission-catalogue"],
    queryFn: fetchPermissionCatalogue,
    enabled: live && !!auth.isAgencyStaff,
    staleTime: 600_000,
  });

  const [email, setEmail] = useState("");
  /* One dropdown, two stored facts: the SECURITY ROLE stays agency_admin or
     agency_user (0234 — never a third), and the ACCESS PROFILE is the
     operational preset an Agency User starts from. Combined here because
     "Agency User · Agent" is how Dee reads a person; separate underneath
     because a preset must never be mistaken for a security role. */
  const [choiceValue, setChoiceValue] = useState("agency_user:agent");
  const chosen = INVITE_CHOICES.find((c) => c.value === choiceValue) ?? INVITE_CHOICES[0];
  const [leadTeam, setLeadTeam] = useState("");
  /* The module a person is hired to work, chosen with their access rather
     than remembered afterwards (§21/§23). Entering a module is its own named
     capability, never a profile's gift (§16). */
  const [modules, setModules] = useState<string[]>([]);
  const toggleModule = (key: string) =>
    setModules((m) => (m.includes(key) ? m.filter((k) => k !== key) : [...m, key]));

  /* Loaded only once someone picks Team Lead — the team is required then,
     and nobody else pays for the request (rule 14). */
  const teams = useQuery({
    queryKey: ["agency", "teams", "invite-picker"],
    queryFn: async () => {
      const sb = requireSupabase();
      const { data, error } = await sb
        .from("teams").select("id, name").is("archived_at", null).eq("is_fixture", false).order("name");
      if (error) throw error;
      return (data ?? []) as { id: string; name: string }[];
    },
    enabled: live && chosen.profile === "team_lead",
    staleTime: 60_000,
  });
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);

  const preview = previewAccess(chosen, catalogue.data?.profileDefaults, modules);

  const refresh = () => void qc.invalidateQueries({ queryKey: ["agency", "invitations"] });

  /**
   * Creating the invitation and emailing it are two steps on purpose: the
   * invitation exists whether or not the email goes out, so a mail provider
   * that is not connected never costs someone their invitation — the link is
   * still there to copy.
   */
  const invite = useMutation({
    mutationFn: async () => {
      const id = await inviteAgencyMember(
        email, chosen.role, chosen.profile ?? undefined,
        chosen.profile === "team_lead" ? leadTeam : undefined,
        chosen.role === "agency_user" ? modules : undefined,
      );
      return { id, outcome: await sendInvitationEmail(id) };
    },
    onSuccess: ({ outcome }) => {
      setEmail("");
      setMessage(
        outcome.status === "sent"
          ? { text: "Invitation sent. They will get a branded email asking them to activate.", error: false }
          : outcome.status === "not_connected"
            ? { text: "Invitation created. Email is not connected yet, so copy the link below and send it yourself.", error: false }
            : { text: `Invitation created, but the email did not go: ${outcome.message} Copy the link below instead.`, error: true },
      );
      refresh();
    },
    onError: (e) => setMessage({ text: errorMessage(e, "That invitation could not be created."), error: true }),
  });


  return (
    <SectionCard icon={UserPlus} title="Invite a team member" description="Bring someone onto the BES team and give them a role.">
      {!canInvite ? (
        <p className="text-xs text-muted-foreground">
          Your role can see the team but not invite. An agency owner or admin can.
        </p>
      ) : (
        <form
          className="space-y-3"
          onSubmit={(e) => { e.preventDefault(); if (email.trim()) invite.mutate(); }}
        >
          <div className="grid gap-3 sm:grid-cols-[2fr_1fr]">
            <label className="text-sm">
              <span className={labelCls}>Their work email</span>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={inputCls} required autoComplete="off" />
            </label>
            <label className="text-sm">
              <span className={labelCls}>Access</span>
              <select value={choiceValue} onChange={(e) => { setChoiceValue(e.target.value); setLeadTeam(""); }} className={inputCls}>
                {INVITE_CHOICES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
              </select>
            </label>
          </div>
          {chosen.profile === "team_lead" && (
            <label className="block text-sm sm:max-w-xs">
              <span className={labelCls}>The team they lead</span>
              <select value={leadTeam} onChange={(e) => setLeadTeam(e.target.value)} className={inputCls} required>
                <option value="" disabled>{teams.isLoading ? "Loading teams…" : "Choose a team"}</option>
                {(teams.data ?? []).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
              {teams.data && teams.data.length === 0 && (
                <span className="mt-1 block text-[11px] text-status-danger">
                  No teams exist yet — create the team first on the Teams page.
                </span>
              )}
            </label>
          )}
          <p className="text-[11px] text-muted-foreground">{chosen.hint}</p>

          {chosen.role === "agency_user" && (
            <fieldset className="rounded-lg border border-border p-2.5">
              <legend className={labelCls}>Which module do they work in?</legend>
              <div className="flex flex-wrap gap-3 pt-1">
                {MODULE_CHOICES.map((m) => (
                  <label key={m.key} className="flex items-center gap-1.5 text-xs text-foreground">
                    <input type="checkbox" checked={modules.includes(m.key)} onChange={() => toggleModule(m.key)} />
                    {m.label}
                  </label>
                ))}
              </div>
              <p className="mt-1 text-[11px] text-muted-foreground">
                Entering a module is its own permission — never granted by the profile, so a CreditOps
                agent never sees BES CRM by accident. Scope and assignment still decide the records.
              </p>
            </fieldset>
          )}

          {/* What this invitation actually produces, before it is sent (§22). */}
          <div className="rounded-lg border border-border bg-muted/30 p-2.5 text-[11px]">
            <p className="font-semibold text-foreground">{preview.headline}</p>
            <p className="mt-1 text-muted-foreground"><strong>Will see:</strong> {preview.sees.join(" · ")}</p>
            <p className="mt-0.5 text-muted-foreground"><strong>Hidden:</strong> {preview.hidden.join(" · ")}</p>
            <p className="mt-0.5 text-muted-foreground">{preview.note}</p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Button type="submit" size="sm" disabled={invite.isPending || !email.trim() || (chosen.profile === "team_lead" && !leadTeam)}>
              {invite.isPending ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Send className="mr-1 h-3.5 w-3.5" />} Send invitation
            </Button>
            {message && <p role="status" className={`text-xs ${message.error ? "text-status-danger" : "text-status-success"}`}>{message.text}</p>}
          </div>
        </form>
      )}

      <div className="mt-5">
        <PendingInvitationsList />
      </div>
    </SectionCard>
  );
}

/**
 * Pending invitations — the ONE list, used inside the invite dialog and on the
 * Team Members directory (Dee §31). Resend, copy the activation link, revoke.
 */
export function PendingInvitationsList() {
  const auth = useAuth();
  const qc = useQueryClient();
  const live = auth.mode === "live" && auth.status === "signed-in";
  const canInvite = isAdminRole(auth.agencyRole);
  const invitations = useQuery({
    queryKey: ["agency", "invitations"],
    queryFn: fetchAgencyInvitations,
    enabled: live && !!auth.isAgencyStaff,
    staleTime: 30_000,
  });
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [resending, setResending] = useState<string | null>(null);
  const refresh = () => void qc.invalidateQueries({ queryKey: ["agency", "invitations"] });

  const resend = async (id: string) => {
    setResending(id);
    const outcome = await sendInvitationEmail(id);
    setResending(null);
    setMessage(
      outcome.status === "sent"
        ? { text: "Activation email sent again.", error: false }
        : outcome.status === "not_connected"
          ? { text: "Email is not connected yet — copy the link instead.", error: false }
          : { text: outcome.message, error: true },
    );
  };
  const cancel = useMutation({
    mutationFn: cancelAgencyInvitation,
    onSuccess: () => { setMessage({ text: "Invitation revoked.", error: false }); refresh(); },
    onError: (e) => setMessage({ text: errorMessage(e, "It could not be revoked."), error: true }),
  });
  /**
   * Send every outstanding activation email, one at a time.
   *
   * Sixteen people were invited in one go; sending them one click each is
   * sixteen chances to lose count of which ones went. Sequential rather than
   * parallel on purpose: the provider rate-limits, and a burst that half
   * succeeds leaves nobody able to say who was emailed.
   *
   * The result is counted honestly — sent, not connected, failed — because
   * "done" when four bounced is the report that costs a day.
   */
  const [sendingAll, setSendingAll] = useState(false);
  const sendAll = async () => {
    const pending = invitations.data ?? [];
    if (pending.length === 0) return;
    setSendingAll(true);
    let sent = 0, notConnected = 0;
    const failed: string[] = [];
    for (const i of pending) {
      const outcome = await sendInvitationEmail(i.id);
      if (outcome.status === "sent") sent += 1;
      else if (outcome.status === "not_connected") notConnected += 1;
      else failed.push(i.email);
    }
    setSendingAll(false);
    setMessage(
      failed.length > 0
        ? { text: `${sent} sent. These did not go: ${failed.join(", ")}.`, error: true }
        : notConnected > 0
          ? { text: `Email is not connected — copy the links instead (${notConnected} waiting).`, error: false }
          : { text: `${sent} activation ${sent === 1 ? "email" : "emails"} sent.`, error: false },
    );
  };

  const copy = async (token: string) => {
    try {
      await navigator.clipboard.writeText(invitationLink(token));
      setCopied(token);
      window.setTimeout(() => setCopied(null), 2000);
    } catch {
      setMessage({ text: "The link could not be copied.", error: true });
    }
  };

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className={labelCls}>Pending invitations{invitations.data ? ` · ${invitations.data.length}` : ""}</p>
        {canInvite && (invitations.data?.length ?? 0) > 1 && (
          <Button type="button" size="sm" variant="outline" disabled={sendingAll}
            onClick={() => void sendAll()}>
            {sendingAll ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : <Mail className="mr-2 h-3.5 w-3.5" />}
            {sendingAll ? "Sending…" : `Send all ${invitations.data?.length}`}
          </Button>
        )}
      </div>
      {invitations.isLoading ? (
        <div className="mt-2 h-12 animate-pulse rounded-lg bg-muted/40" aria-busy="true" />
      ) : invitations.error ? (
        <p role="alert" className="mt-2 text-xs text-status-danger">They could not be loaded.</p>
      ) : invitations.data && invitations.data.length > 0 ? (
        <ul className="mt-2 divide-y divide-border/60 rounded-lg border border-border">
          {invitations.data.map((i) => (
            <li key={i.id} className="flex flex-wrap items-center gap-3 px-3 py-2.5 text-xs">
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-foreground">{i.email}</p>
                <p className="text-muted-foreground">
                  {i.role ? memberAccessLabel(i.role, i.accessProfile) : "No role"} · Pending invitation · expires {formatDate(i.expiresAt)}
                  {i.role === "agency_user" && i.moduleKeys.length === 0 && (
                    <span className="block text-status-warning">
                      No module granted — they will activate able to log time but with no CreditOps,
                      BES CRM or TalentOps. Grant one on their Access tab after they join, or revoke
                      and re-invite with the module ticked.
                    </span>
                  )}
                </p>
              </div>
              <Button type="button" size="sm" variant="ghost" disabled={resending === i.id}
                onClick={() => void resend(i.id)} title="Send the activation email again">
                {resending === i.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Mail className="h-3.5 w-3.5" />}
              </Button>
              <Button type="button" size="sm" variant="outline" onClick={() => void copy(i.token)}>
                {copied === i.token ? <Check className="mr-1 h-3.5 w-3.5 text-status-success" /> : <Copy className="mr-1 h-3.5 w-3.5" />}
                {copied === i.token ? "Copied" : "Copy link"}
              </Button>
              {canInvite && (
                <Button type="button" size="sm" variant="ghost" disabled={cancel.isPending} onClick={() => cancel.mutate(i.id)} title="Revoke this invitation">
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-xs text-muted-foreground">None outstanding.</p>
      )}
      {message && (
        <p role={message.error ? "alert" : "status"} className={`mt-2 text-xs ${message.error ? "text-status-danger" : "text-muted-foreground"}`}>{message.text}</p>
      )}
      <p className="mt-2 text-[11px] text-muted-foreground">
        Invitations last seven days and carry a BES-branded email asking the person to activate. The link only
        works for the address it was sent to; copying it and sending it yourself works just as well.
      </p>
    </div>
  );
}
