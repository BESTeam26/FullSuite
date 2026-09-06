/**
 * Birthday greetings: whose birthday is coming up, and whether the
 * organization has switched greetings on. The database answers both; this
 * layer only shapes the rows.
 */
import { requireSupabase } from "@/lib/supabase/client";
import type { BirthdayPerson } from "@/lib/greetings/birthday";

export type AutomationKey = "birthday_greeting_team" | "birthday_greeting_client";

export interface OrganizationAutomation {
  key: AutomationKey;
  enabled: boolean;
  config: Record<string, unknown>;
}

export async function fetchOrganizationAutomations(organizationId: string): Promise<OrganizationAutomation[]> {
  const sb = requireSupabase();
  const { data, error } = await sb
    .from("organization_automations")
    .select("key, enabled, config")
    .eq("organization_id", organizationId);
  if (error) throw error;
  return (data ?? []).map((r) => ({
    key: r.key as AutomationKey,
    enabled: r.enabled,
    config: (r.config ?? {}) as Record<string, unknown>,
  }));
}

export async function setOrganizationAutomation(
  organizationId: string,
  key: AutomationKey,
  enabled: boolean,
  config: Record<string, unknown> = {},
): Promise<void> {
  const sb = requireSupabase();
  const { error } = await sb.rpc("set_organization_automation", {
    p_org: organizationId,
    p_key: key,
    p_enabled: enabled,
    p_config: config as never,
  });
  if (error) throw error;
}

export interface TeamBirthday extends BirthdayPerson {
  daysAway: number;
}

export async function fetchTeamBirthdays(organizationId: string, withinDays = 14): Promise<TeamBirthday[]> {
  const sb = requireSupabase();
  const { data, error } = await sb.rpc("team_birthdays", { p_org: organizationId, p_within_days: withinDays });
  if (error) throw error;
  return (data ?? []).map((r) => ({
    id: r.user_id as string,
    name: r.name as string,
    avatarPath: (r.avatar_path as string | null) ?? null,
    birthMonth: Number(r.birth_month),
    birthDay: Number(r.birth_day),
    daysAway: Number(r.days_away),
  }));
}

export async function fetchClientBirthdays(organizationId: string, withinDays = 14): Promise<TeamBirthday[]> {
  const sb = requireSupabase();
  const { data, error } = await sb.rpc("client_birthdays", { p_org: organizationId, p_within_days: withinDays });
  if (error) throw error;
  return (data ?? []).map((r) => ({
    id: r.client_id as string,
    name: r.name as string,
    avatarPath: null,
    birthMonth: Number(r.birth_month),
    birthDay: Number(r.birth_day),
    daysAway: Number(r.days_away),
  }));
}
