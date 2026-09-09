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
  AGENCY_ROLES,
  AGENCY_ROLE_HINTS,
  AGENCY_ROLE_LABELS,
  cancelAgencyInvitation,
  fetchAgencyInvitations,
  invitationLink,
  inviteAgencyMember,
  type AgencyRole,
} from "@/lib/data/agency-invitations";

const inputCls = "mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary";
const labelCls = "block text-[10px] font-bold uppercase tracking-wider text-muted-foreground";

export function AgencyTeamInvites() {
  const auth = useAuth();
  const qc = useQueryClient();
  const live = auth.mode === "live" && auth.status === "signed-in";
  const role = auth.agencyRole;
  const canInvite = isAdminRole(role);
  /* Only an owner can create another owner — the same rule the function
     enforces, so the option is not offered to someone who would be refused. */
  /* Ownership is transferred from the owner's own account, never mailed
     (0234) — so both roles are invitable and neither is ownership. */
  const grantable = AGENCY_ROLES;

  const invitations = useQuery({
    queryKey: ["agency", "invitations"],
    queryFn: fetchAgencyInvitations,
    enabled: live && !!auth.isAgencyStaff,
    staleTime: 30_000,
  });

  const [email, setEmail] = useState("");
  const [chosen, setChosen] = useState<AgencyRole>("agency_user");
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [resending, setResending] = useState<string | null>(null);

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

  const refresh = () => void qc.invalidateQueries({ queryKey: ["agency", "invitations"] });

  /**
   * Creating the invitation and emailing it are two steps on purpose: the
   * invitation exists whether or not the email goes out, so a mail provider
   * that is not connected never costs someone their invitation — the link is
   * still there to copy.
   */
  const invite = useMutation({
    mutationFn: async () => {
      const id = await inviteAgencyMember(email, chosen);
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

  const cancel = useMutation({
    mutationFn: cancelAgencyInvitation,
    onSuccess: () => { setMessage({ text: "Invitation cancelled.", error: false }); refresh(); },
    onError: (e) => setMessage({ text: errorMessage(e, "It could not be cancelled."), error: true }),
  });

  const copy = async (token: string) => {
    try {
      await navigator.clipboard.writeText(invitationLink(token));
      setCopied(token);
      window.setTimeout(() => setCopied(null), 2000);
    } catch {
      setMessage({ text: "The link could not be copied. Select it manually from the address below.", error: true });
    }
  };

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
              <span className={labelCls}>Role</span>
              <select value={chosen} onChange={(e) => setChosen(e.target.value as AgencyRole)} className={inputCls}>
                {grantable.map((r) => <option key={r} value={r}>{AGENCY_ROLE_LABELS[r]}</option>)}
              </select>
            </label>
          </div>
          <p className="text-[11px] text-muted-foreground">{AGENCY_ROLE_HINTS[chosen]}</p>
          <div className="flex flex-wrap items-center gap-3">
            <Button type="submit" size="sm" disabled={invite.isPending || !email.trim()}>
              {invite.isPending ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Send className="mr-1 h-3.5 w-3.5" />} Send invitation
            </Button>
            {message && <p role="status" className={`text-xs ${message.error ? "text-status-danger" : "text-status-success"}`}>{message.text}</p>}
          </div>
        </form>
      )}

      <div className="mt-5">
        <p className={labelCls}>Pending invitations</p>
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
                    {i.role ? AGENCY_ROLE_LABELS[i.role] : "No role"} · expires {formatDate(i.expiresAt)}
                  </p>
                </div>
                <Button
                  type="button" size="sm" variant="ghost"
                  disabled={resending === i.id}
                  onClick={() => void resend(i.id)}
                  title="Send the activation email again"
                >
                  {resending === i.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Mail className="h-3.5 w-3.5" />}
                </Button>
                <Button type="button" size="sm" variant="outline" onClick={() => void copy(i.token)}>
                  {copied === i.token ? <Check className="mr-1 h-3.5 w-3.5 text-status-success" /> : <Copy className="mr-1 h-3.5 w-3.5" />}
                  {copied === i.token ? "Copied" : "Copy link"}
                </Button>
                {canInvite && (
                  <Button type="button" size="sm" variant="ghost" disabled={cancel.isPending} onClick={() => cancel.mutate(i.id)} title="Cancel this invitation">
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-xs text-muted-foreground">None outstanding.</p>
        )}
        <p className="mt-2 text-[11px] text-muted-foreground">
          Invitations last seven days and carry a BES-branded email asking the person to activate. The link only
          works for the address it was sent to; copying it and sending it yourself works just as well.
        </p>
      </div>
    </SectionCard>
  );
}
