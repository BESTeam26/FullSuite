/**
 * The BES agency row — identity and branding. One agency exists and is meant to
 * (rule 16); this is not a multi-agency surface.
 */
import { supabase } from "@/lib/supabase/client";
import type { Json } from "@/lib/supabase/database.types";

export interface AgencyBrandSettings {
  name: string;
  logoUrl: string;
  supportEmail: string;
  supportPhone: string;
  timezone: string;
  currency: string;
  platformUrl: string;
  legalUrl: string;
}

const str = (v: unknown, fallback = "") => (typeof v === "string" ? v : fallback);

export const brandSettingsFromRow = (row: { name: string; branding: Json }): AgencyBrandSettings => {
  const b = (row.branding ?? {}) as Record<string, unknown>;
  return {
    name: row.name,
    logoUrl: str(b.logoUrl),
    supportEmail: str(b.supportEmail),
    supportPhone: str(b.supportPhone),
    timezone: str(b.timezone),
    currency: str(b.currency, "USD"),
    platformUrl: str(b.platformUrl),
    legalUrl: str(b.legalUrl),
  };
};

export async function fetchAgencyBrand(agencyId: string): Promise<AgencyBrandSettings> {
  const { data, error } = await supabase
    .from("agencies")
    .select("name, branding")
    .eq("id", agencyId)
    .single();
  if (error) throw new Error(error.message);
  return brandSettingsFromRow(data);
}

/** One UPDATE under the row lock, audited; refused (42501) for non-admins. */
export async function saveAgencyBrand(agencyId: string, patch: Partial<AgencyBrandSettings>): Promise<void> {
  const { error } = await supabase.rpc("merge_agency_branding", {
    p_agency: agencyId,
    p_patch: patch as Json,
  });
  if (error) throw new Error(error.message);
}
