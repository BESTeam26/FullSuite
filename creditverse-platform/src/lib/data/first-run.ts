/**
 * What each person still has to do when they arrive.
 *
 * Two readers, one round trip each. The administrator's guide used to make
 * eight separate queries on Home — team, letters, KPIs, reports and the rest —
 * which is eight round trips before the page settles for the person least
 * likely to be on a fast connection at 7am (rule 14). The database answers all
 * of it in one `select`.
 */
import { requireSupabase } from "@/lib/supabase/client";
import type { GettingStartedState, MemberFirstRunState } from "@/lib/dashboard/getting-started";
import type { ProductKey } from "@/lib/bes-domain";

export type OrganizationFirstRun = Omit<GettingStartedState, "enabledModules">;

export async function fetchOrganizationFirstRun(organizationId: string): Promise<OrganizationFirstRun> {
  const sb = requireSupabase();
  const { data, error } = await sb.rpc("organization_first_run", { p_org: organizationId }).maybeSingle();
  if (error) throw error;
  return {
    brandingSet: data?.branding_set ?? false,
    teammates: data?.teammates ?? 0,
    clients: data?.clients ?? 0,
    creditReports: data?.credit_reports ?? 0,
    letterTemplates: data?.letter_templates ?? 0,
    kpisChosen: data?.kpis_chosen ?? 0,
    fundingFiles: data?.funding_files ?? 0,
    hubChoices: data?.hub_choices ?? 0,
    automations: data?.automations ?? 0,
  };
}

export async function fetchMemberFirstRun(): Promise<MemberFirstRunState> {
  const sb = requireSupabase();
  const { data, error } = await sb.rpc("member_first_run").maybeSingle();
  if (error) throw error;
  return {
    avatarSet: data?.avatar_set ?? false,
    phoneSet: data?.phone_set ?? false,
    preferredNameSet: data?.preferred_name_set ?? false,
    birthdayShared: data?.birthday_shared ?? false,
  };
}

/** The guide needs to know which module steps apply; the caller already has this. */
export function firstRunState(counts: OrganizationFirstRun, enabledModules: ProductKey[]): GettingStartedState {
  return { ...counts, enabledModules };
}
