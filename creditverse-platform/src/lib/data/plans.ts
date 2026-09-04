/** Plans are data: the public sign-up form lists them; products come from the plan row. */
import { supabase } from "@/lib/supabase/client";
import type { Tables } from "@/lib/supabase/database.types";

export interface Plan {
  key: string;
  label: string;
  products: string[];
  trialDays: number;
}

export const mapPlan = (r: Tables<"plans">): Plan => ({ key: r.key, label: r.label, products: r.products, trialDays: r.trial_days });

export async function fetchPublicPlans(): Promise<Plan[]> {
  const { data, error } = await supabase.from("plans").select("*").eq("is_public", true).order("position");
  if (error) throw new Error(error.message);
  return (data ?? []).map(mapPlan);
}
