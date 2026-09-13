/**
 * The partner's own conversations — reads and writes.
 *
 * Everything here is either a plain select against a policy-gated table or a
 * definer function that checks the caller itself (0333). Nothing filters for
 * privacy: a conversation that is not this partner's does not arrive, and a
 * direct message a contact is not in does not arrive for them either.
 */
import { requireSupabase } from "@/lib/supabase/client";
import type { PortalTopicKey } from "@/lib/portal/portal-conversations";

/** One live engagement, as the portal is allowed to see it. */
export interface PortalService {
  engagementId: string;
  module: string;
  moduleLabel: string;
  serviceLabel: string;
  status: string;
  startedOn: string | null;
  endsOn: string | null;
  milestone: string | null;
  openItems: number;
  linkKind: string | null;
}

export async function fetchMyPartnerServices(): Promise<PortalService[]> {
  const { data, error } = await requireSupabase().rpc("my_partner_services" as never);
  if (error) throw error;
  return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
    engagementId: r.engagement_id as string,
    module: r.module as string,
    moduleLabel: r.module_label as string,
    serviceLabel: r.service_label as string,
    status: r.status as string,
    startedOn: (r.started_on as string) ?? null,
    endsOn: (r.ends_on as string) ?? null,
    milestone: (r.milestone as string) ?? null,
    openItems: Number(r.open_items ?? 0),
    linkKind: (r.link_kind as string) ?? null,
  }));
}

/** A BES person this partner may write to directly. Name and role, nothing else. */
export interface PartnerTeamMember {
  userId: string;
  name: string;
  roleLabel: string | null;
  isPrimary: boolean;
}

export async function fetchMyPartnerTeam(): Promise<PartnerTeamMember[]> {
  const { data, error } = await requireSupabase().rpc("my_partner_team" as never);
  if (error) throw error;
  return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
    userId: r.user_id as string,
    name: r.name as string,
    roleLabel: (r.role_label as string) ?? null,
    isPrimary: !!r.is_primary,
  }));
}

/**
 * Open — or find — one of the four standing conversations.
 *
 * Find-or-create lives in the database rather than here, because both sides
 * press it: an agent opening Support from the partner profile and the partner
 * opening Support from their portal must land in the same row, and a check
 * written twice in two languages is a check that will disagree one day.
 */
export async function openPartnerTopic(groupId: string, topic: PortalTopicKey): Promise<string> {
  const { data, error } = await requireSupabase()
    .rpc("partner_topic_channel" as never, { p_group: groupId, p_topic: topic } as never);
  if (error) throw error;
  return data as unknown as string;
}

export async function openPartnerDirect(groupId: string, otherUserId: string): Promise<string> {
  const { data, error } = await requireSupabase()
    .rpc("partner_direct_channel" as never, { p_group: groupId, p_other: otherUserId } as never);
  if (error) throw error;
  return data as unknown as string;
}
