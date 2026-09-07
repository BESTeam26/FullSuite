/** Plans are data: the public sign-up form lists them; products come from the plan row. */
import { supabase } from "@/lib/supabase/client";
import type { Tables } from "@/lib/supabase/database.types";

export interface Plan {
  key: string;
  label: string;
  products: string[];
  trialDays: number;
  /** Null where a plan is not sold on that interval. */
  monthlyCents: number | null;
  annualCents: number | null;
  seatsIncluded: number | null;
}

export const mapPlan = (r: Tables<"plans">): Plan => ({
  key: r.key,
  label: r.label,
  products: r.products,
  trialDays: r.trial_days,
  monthlyCents: r.monthly_cents,
  annualCents: r.annual_cents,
  seatsIncluded: r.seats_included,
});

export async function fetchPublicPlans(): Promise<Plan[]> {
  const { data, error } = await supabase.from("plans").select("*").eq("is_public", true).order("position");
  if (error) throw new Error(error.message);
  return (data ?? []).map(mapPlan);
}


/**
 * Every plan an administrator may put an organization on, public or not.
 *
 * The sign-up form shows only `is_public`; billing has to offer the private
 * ones too, because that is where a negotiated plan lives.
 */
export async function fetchAllPlans(): Promise<Plan[]> {
  const { data, error } = await supabase.from("plans").select("*").order("position");
  if (error) throw new Error(error.message);
  return (data ?? []).map(mapPlan);
}
