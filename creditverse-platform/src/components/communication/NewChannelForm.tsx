/**
 * Opening a new conversation.
 *
 * Dee, §28, verbatim about what this should ask for: name, purpose (optional),
 * type, owner context, participants, optional service scope. And §28's other
 * instruction, which is the harder one: "Keep it simple."
 *
 * So the form asks four things and infers the rest:
 *
 *   NAME          what to call it
 *   WHO IT IS FOR BES itself, or one partner. The owner context IS this
 *                 choice — there is no separate field, because a conversation
 *                 belongs to exactly one owner and asking twice is how the two
 *                 answers disagree (§29, enforced by a CHECK constraint the
 *                 form cannot talk its way past)
 *   AUDIENCE      everyone with access, or named people and teams. Explicit,
 *                 because "everyone" as the accident of an empty member list
 *                 is the shortcut §15 says not to take
 *   TEAMS         who is in it from the moment it exists (§12)
 *
 * An organization's channel is not created here at all. Organizations open
 * their own, and BES creating one inside a customer's tenant would be the
 * self-grant 0104's doctrine forbids.
 */
import { useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { OpsSelect } from "@/components/ui/ops-select";
import { useAgencyPartners } from "@/lib/data/use-agency-partners";
import { usePartnerServices } from "@/lib/data/use-partner-services";
import { useWorkforce } from "@/lib/data/use-workforce";
import { useChannelActions } from "@/lib/data/use-channels";

export interface NewChannelFormProps {
  owner: { agencyId: string | null; organizationId: string | null };
  agencyView: boolean;
  onDone: () => void;
  onCreated: (channelId: string) => void;
}

export function NewChannelForm({ owner, agencyView, onDone, onCreated }: NewChannelFormProps) {
  const actions = useChannelActions();
  /* Only fetched once somebody opens the form — the screen does not need a
     partner list to show a conversation (rule 14). */
  const partners = useAgencyPartners();
  const workforce = useWorkforce({ enabled: agencyView });

  const [name, setName] = useState("");
  const [purpose, setPurpose] = useState("");
  const [about, setAbout] = useState("bes");        // "bes" or a partner id
  const [audience, setAudience] = useState("members");
  const [serviceId, setServiceId] = useState("");
  const [teamId, setTeamId] = useState("");

  const partnerId = about === "bes" ? null : about;
  const services = usePartnerServices(partnerId ?? "");
  const teams = (workforce.data?.teams ?? []).filter((t) => !t.archived);

  const submit = async () => {
    const id = await actions.create.mutateAsync({
      name,
      kind: "topic",
      purpose: purpose.trim() || undefined,
      /* Exactly one owner. The database enforces it too — this is the
         convenient half, never the load-bearing one (§29). */
      agencyId: partnerId ? null : (agencyView ? owner.agencyId : null),
      organizationId: partnerId || agencyView ? null : owner.organizationId,
      partnerGroupId: partnerId,
      partnerServiceId: partnerId && serviceId ? serviceId : null,
      openToScope: audience === "scope",
      teamIds: teamId ? [teamId] : [],
    });
    onCreated(id);
  };

  return (
    <div className="mb-3 space-y-2 rounded-lg border border-border bg-muted/30 p-2.5">
      <Input className="h-8" value={name} onChange={(e) => setName(e.target.value)}
        placeholder="Name, e.g. creditops" aria-label="Conversation name" />
      <Input className="h-8" value={purpose} onChange={(e) => setPurpose(e.target.value)}
        placeholder="What it is for (optional)" aria-label="Conversation purpose" />

      {agencyView && (
        <OpsSelect size="sm" value={about} onValueChange={(v) => { setAbout(v); setServiceId(""); }}
          aria-label="Who this conversation is with"
          options={[
            { value: "bes", label: "BES internal" },
            ...(partners.data ?? []).map((p) => ({ value: p.id, label: `Partner · ${p.name}` })),
          ]} />
      )}

      {partnerId && (services.data ?? []).length > 0 && (
        <OpsSelect size="sm" value={serviceId} onValueChange={setServiceId}
          aria-label="Limit to one service (optional)" placeholder="About the whole account"
          options={[
            { value: "", label: "About the whole account" },
            ...(services.data ?? []).map((s) => ({ value: s.id, label: `Only ${s.name}` })),
          ]} />
      )}

      <OpsSelect size="sm" value={audience} onValueChange={setAudience}
        aria-label="Who can see it"
        options={[
          { value: "members", label: "Named people and teams only" },
          { value: "scope", label: partnerId ? "Everyone who works this partner" : "Everyone at BES" },
        ]} />

      {audience === "members" && agencyView && teams.length > 0 && (
        <OpsSelect size="sm" value={teamId} onValueChange={setTeamId}
          aria-label="Add a team" placeholder="Add a team (optional)"
          options={[{ value: "", label: "No team yet" },
                    ...teams.map((t) => ({ value: t.id, label: t.name }))]} />
      )}

      <div className="flex gap-2">
        <Button size="sm" disabled={!name.trim() || actions.create.isPending} onClick={() => void submit()}>
          {actions.create.isPending && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />} Create
        </Button>
        <Button size="sm" variant="ghost" onClick={onDone}>Cancel</Button>
      </div>

      {actions.create.isError && (
        <p role="alert" className="text-xs text-status-danger">
          {(actions.create.error as Error).message}
        </p>
      )}

      <p className="text-[11px] leading-snug text-muted-foreground">
        {partnerId
          ? "The same conversation appears in that partner's portal. One record, both sides."
          : "A BES conversation. Organizations open their own — BES cannot create one inside a customer's workspace."}
      </p>
    </div>
  );
}
