/**
 * The Agent Profile header — Dee's mockup, 2026-09-19: photo, name, status,
 * position, division · joined · team (lead), work email, and the person's
 * own quote. Every fact is a canonical record: the membership, the profile,
 * the team rows, the position holders. Edit Profile opens the ONE profile
 * editor (Settings → Account) for the person themselves; a manager changes
 * position and reporting on the Overview's placement card. Message opens the
 * one direct conversation with the person.
 */
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { BadgeCheck, Loader2, Mail, MessageSquare, Pencil, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Pill } from "@/components/agency/partner/partner-ui";
import { useAvatarUrls } from "@/lib/data/use-account";
import { openDirectChannel } from "@/lib/data/channels";
import { useToast } from "@/hooks/use-toast";
import { orgDivisionLabel } from "@/lib/agency/division-label";
import { formatDate } from "@/lib/format-date";
import type { AgencyMember } from "@/lib/data/agency-teams";
import { cn } from "@/lib/utils";
import { EditMemberProfileDialog } from "@/components/people/profile/EditMemberProfileDialog";

export const initialsOf = (name: string) =>
  name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? "").join("") || "?";

export function ProfileHeader({ member, position, division, team, leadName, isSelf, canEdit }: {
  member: AgencyMember;
  position: string | null;
  division: string | null;
  team: string | null;
  leadName: string | null;
  isSelf: boolean;
  /** The person themselves or management within scope — the same predicate the database applies. */
  canEdit: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const avatars = useAvatarUrls([member.avatarPath]);
  const url = member.avatarPath ? avatars.data?.[member.avatarPath] : undefined;
  const navigate = useNavigate();
  const { toast } = useToast();
  const [opening, setOpening] = useState(false);
  const message = async () => {
    setOpening(true);
    try {
      const id = await openDirectChannel(member.userId);
      navigate(`/app/channels?channel=${id}`);
    } catch (e) {
      toast({ title: "Could not open the conversation", description: (e as Error).message, variant: "destructive" });
    } finally { setOpening(false); }
  };
  const active = member.status === "active";

  return (
    <div className="rounded-2xl border border-border bg-card p-4 md:p-5">
      <div className="flex flex-col gap-4 md:flex-row md:items-start">
        <span className={cn("flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-primary/10 text-2xl font-bold text-primary md:h-28 md:w-28")}>
          {url ? <img src={url} alt="" className="h-full w-full object-cover" /> : initialsOf(member.name)}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-extrabold text-foreground">{member.preferredName || member.name}</h1>
            <Pill tone={active ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-800" : "border-border bg-muted text-muted-foreground"}>
              {active ? "Active" : `Left ${member.deactivatedAt ? formatDate(member.deactivatedAt) : ""}`}
            </Pill>
            {member.isOwner && <Pill tone="border-primary/40 bg-primary/10 text-foreground">Owner</Pill>}
          </div>
          <p className="mt-0.5 text-base font-semibold text-foreground">{position ?? member.profileTitle ?? "No position yet"}</p>
          <p className="mt-1 flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
            {division && <span>{orgDivisionLabel(division)}</span>}
            {division && <span aria-hidden>|</span>}
            <span>Joined {formatDate(member.hiredOn ?? member.since)}</span>
            {member.employeeCode && <><span aria-hidden>|</span><span className="inline-flex items-center gap-1"><BadgeCheck className="h-3.5 w-3.5" aria-hidden /> Employee ID: <span className="font-semibold text-foreground">{member.employeeCode}</span></span></>}
          </p>
          <p className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
            <span className="inline-flex items-center gap-1.5 text-foreground"><Mail className="h-3.5 w-3.5 text-muted-foreground" aria-hidden /> {member.email}</span>
            {team && (
              <span className="inline-flex items-center gap-1.5 text-foreground">
                <Users className="h-3.5 w-3.5 text-muted-foreground" aria-hidden /> {team}{leadName ? ` (${leadName})` : ""}
              </span>
            )}
          </p>
        </div>
        <div className="flex w-full shrink-0 flex-col gap-2 md:w-64">
          {member.tagline ? (
            <blockquote className="rounded-xl border border-border bg-muted/40 px-4 py-3 text-xs italic text-muted-foreground">“{member.tagline}”</blockquote>
          ) : canEdit ? (
            <p className="rounded-xl border border-dashed border-border px-4 py-3 text-xs text-muted-foreground">
              {isSelf ? "Add a line under your name from Edit Profile." : "No quote yet — add one from Edit Profile."}
            </p>
          ) : null}
          <div className="flex flex-wrap gap-2">
            {canEdit && (
              <Button variant="outline" size="sm" className="h-9 flex-1 text-xs" onClick={() => setEditing(true)}>
                <Pencil className="mr-1.5 h-3.5 w-3.5" aria-hidden /> Edit Profile
              </Button>
            )}
            {!isSelf && (
              <Button variant="outline" size="sm" className="h-9 flex-1 text-xs" onClick={message} disabled={opening || !active}>
                {opening ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" aria-hidden /> : <MessageSquare className="mr-1.5 h-3.5 w-3.5" aria-hidden />} Message
              </Button>
            )}
          </div>
          {canEdit && <EditMemberProfileDialog member={member} open={editing} onClose={() => setEditing(false)} />}
        </div>
      </div>
    </div>
  );
}
