/**
 * Who is in a conversation — people, and teams.
 *
 * ── WHY A TEAM IS A FIRST-CLASS MEMBER ─────────────────────────────────────
 *
 * Dee, §12: "Do NOT require Dee to manually add every Team member
 * individually if the Channel membership is based on canonical Team
 * membership. When Team membership changes: new Team member inherits access,
 * removed Team member loses inherited access."
 *
 * So adding Team Daniel to #creditops is ONE row, and the eleven people on
 * that team are in the conversation because they are on the team — not
 * because somebody copied the roster across and will have to remember to
 * uncopy it. Nobody has to clean up after a leaver, in any channel (§32).
 *
 * The database is the authority on all of this: `channel_teams_insert` asks
 * `channel_manager`, so this panel is a convenience for somebody who already
 * has the right, never the thing that grants it. Only a manager of the
 * conversation is shown it at all.
 */
import { Loader2, UserMinus, UserPlus, Users, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { OpsSelect } from "@/components/ui/ops-select";
import { useWorkforce } from "@/lib/data/use-workforce";
import { useChannelActions, useChannelMembers, useChannelTeams } from "@/lib/data/use-channels";
import type { Channel } from "@/lib/data/channels";
import { useState } from "react";

export function ChannelPeoplePanel({
  channel, onClose,
}: { channel: Channel; onClose: () => void }) {
  const workforce = useWorkforce();
  const members = useChannelMembers(channel.id);
  const teams = useChannelTeams(channel.id);
  const actions = useChannelActions();
  const [addUser, setAddUser] = useState("");
  const [addTeam, setAddTeam] = useState("");

  const people = workforce.data?.people ?? [];
  const allTeams = (workforce.data?.teams ?? []).filter((t) => !t.archived);
  const memberIds = new Set((members.data ?? []).map((m) => m.userId));
  const teamIds = new Set((teams.data ?? []).map((t) => t.teamId));

  const available = people.filter((p) => !memberIds.has(p.userId));
  const availableTeams = allTeams.filter((t) => !teamIds.has(t.id));
  const nameOf = (userId: string) =>
    people.find((p) => p.userId === userId)?.name ?? "Someone";
  const teamNameOf = (id: string) => allTeams.find((t) => t.id === id)?.name ?? "A team";

  const busy = actions.addMember.isPending || actions.removeMember.isPending
    || actions.addTeam.isPending || actions.removeTeam.isPending;
  const error = (actions.addMember.error ?? actions.addTeam.error
    ?? actions.removeMember.error ?? actions.removeTeam.error) as Error | null;

  return (
    <div className="border-b border-border bg-muted/30 p-3">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
          Who is in this conversation
        </p>
        <button type="button" onClick={onClose} aria-label="Close people panel"
          className="rounded p-0.5 text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      {channel.openToScope && (
        /* Said plainly: adding people to an all-hands conversation is not
           wrong, but it is also not what decides who is in it. */
        <p className="mb-2 rounded-lg border border-border bg-card px-2.5 py-1.5 text-[11px] text-muted-foreground">
          Everyone with access to {channel.partnerName ?? channel.organizationName ?? "BES"} is
          already in this conversation. The people below are named on it as well.
        </p>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <section>
          <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">People</p>
          <ul className="mb-2 space-y-0.5">
            {(members.data ?? []).map((m) => (
              <li key={m.userId} className="flex items-center justify-between gap-2 rounded px-1.5 py-1 text-xs text-foreground">
                <span className="truncate">
                  {nameOf(m.userId)}
                  {m.isManager && <span className="ml-1.5 text-[10px] font-bold text-primary">manager</span>}
                </span>
                <button type="button" aria-label={`Remove ${nameOf(m.userId)}`}
                  disabled={busy}
                  onClick={() => actions.removeMember.mutate({ channelId: channel.id, userId: m.userId })}
                  className="shrink-0 rounded p-0.5 text-muted-foreground transition-colors hover:text-status-danger focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-50">
                  <UserMinus className="h-3.5 w-3.5" />
                </button>
              </li>
            ))}
            {(members.data ?? []).length === 0 && (
              <li className="px-1.5 text-xs text-muted-foreground">Nobody named yet.</li>
            )}
          </ul>
          <div className="flex gap-1.5">
            <OpsSelect size="sm" value={addUser} onValueChange={setAddUser}
              aria-label="Add a person" placeholder="Add a person"
              options={available.map((p) => ({ value: p.userId, label: p.name }))} />
            <Button size="sm" variant="outline" disabled={!addUser || busy}
              onClick={() => {
                actions.addMember.mutate({ channelId: channel.id, userId: addUser });
                setAddUser("");
              }}>
              {actions.addMember.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <UserPlus className="h-3.5 w-3.5" />}
              <span className="sr-only">Add person</span>
            </Button>
          </div>
        </section>

        <section>
          <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Teams</p>
          <ul className="mb-2 space-y-0.5">
            {(teams.data ?? []).map((t) => (
              <li key={t.teamId} className="flex items-center justify-between gap-2 rounded px-1.5 py-1 text-xs text-foreground">
                <span className="flex min-w-0 items-center gap-1.5">
                  <Users className="h-3 w-3 shrink-0 text-muted-foreground" />
                  <span className="truncate">{teamNameOf(t.teamId)}</span>
                </span>
                <button type="button" aria-label={`Remove ${teamNameOf(t.teamId)}`}
                  disabled={busy}
                  onClick={() => actions.removeTeam.mutate({ channelId: channel.id, teamId: t.teamId })}
                  className="shrink-0 rounded p-0.5 text-muted-foreground transition-colors hover:text-status-danger focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-50">
                  <UserMinus className="h-3.5 w-3.5" />
                </button>
              </li>
            ))}
            {(teams.data ?? []).length === 0 && (
              <li className="px-1.5 text-xs text-muted-foreground">No team on this conversation.</li>
            )}
          </ul>
          <div className="flex gap-1.5">
            <OpsSelect size="sm" value={addTeam} onValueChange={setAddTeam}
              aria-label="Add a team" placeholder="Add a team"
              options={availableTeams.map((t) => ({ value: t.id, label: t.name }))} />
            <Button size="sm" variant="outline" disabled={!addTeam || busy}
              onClick={() => {
                actions.addTeam.mutate({ channelId: channel.id, teamId: addTeam });
                setAddTeam("");
              }}>
              {actions.addTeam.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <UserPlus className="h-3.5 w-3.5" />}
              <span className="sr-only">Add team</span>
            </Button>
          </div>
          <p className="mt-1.5 text-[10px] leading-snug text-muted-foreground">
            Adding a team means whoever is on it, now and later. Somebody leaving the team
            leaves this conversation with it.
          </p>
        </section>
      </div>

      {error && (
        <p role="alert" className="mt-2 text-xs text-status-danger">{error.message}</p>
      )}
    </div>
  );
}
