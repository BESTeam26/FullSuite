/**
 * Public sign-up.
 *
 * The plans, their prices and their trial lengths are rows in `plans`, read
 * by anyone (the table's own policy allows the public ones). Creating the
 * account is `auth.signUp` with the details the provisioning trigger reads on
 * email confirmation — the organization, its entitlements and the trial are
 * created there, in the database, never from the browser.
 */
import { requireSupabase } from "@/lib/supabase/client";
import type { ProductKey } from "@/lib/bes-domain";

export interface PublicPlan {
  key: string;
  label: string;
  tagline: string | null;
  monthlyCents: number;
  annualCents: number | null;
  trialDays: number;
  /** The plan grants one of its products, chosen at sign-up. */
  chooseOne: boolean;
  recommended: boolean;
  /** False for plans sold by agreement — no self-serve trial. */
  publicTrial: boolean;
  seatsIncluded: number | null;
  products: ProductKey[];
}

export async function fetchPublicPlans(): Promise<PublicPlan[]> {
  const sb = requireSupabase();
  const { data, error } = await sb
    .from("plans")
    .select("key, label, tagline, monthly_cents, annual_cents, trial_days, choose_one, is_recommended, public_trial, seats_included, products")
    .eq("is_public", true)
    .order("position");
  if (error) throw error;
  return (data ?? []).map((p) => ({
    key: p.key,
    label: p.label,
    tagline: p.tagline,
    monthlyCents: Number(p.monthly_cents ?? 0),
    annualCents: p.annual_cents === null ? null : Number(p.annual_cents),
    trialDays: Number(p.trial_days ?? 0),
    chooseOne: !!p.choose_one,
    recommended: !!p.is_recommended,
    publicTrial: !!p.public_trial,
    seatsIncluded: p.seats_included === null ? null : Number(p.seats_included),
    products: (p.products ?? []) as ProductKey[],
  }));
}

export interface SignUpInput {
  email: string;
  password: string;
  fullName: string;
  businessName: string;
  phone: string;
  planKey: string;
  /** Required when the plan says choose one. */
  selectedProduct?: ProductKey;
}

export type SignUpResult =
  | { status: "check_email"; email: string }
  | { status: "signed_in" }
  | { status: "error"; message: string };

/**
 * Everything the provisioning trigger needs travels as user metadata; nothing
 * about entitlements or trials is decided here. A blocked business or a
 * duplicate is decided at confirmation time, by the database.
 */
export async function signUpForTrial(input: SignUpInput): Promise<SignUpResult> {
  const sb = requireSupabase();
  const { data, error } = await sb.auth.signUp({
    email: input.email.trim(),
    password: input.password,
    options: {
      emailRedirectTo: `${window.location.origin}/auth/callback`,
      data: {
        full_name: input.fullName.trim(),
        business_name: input.businessName.trim(),
        phone: input.phone.trim(),
        plan: input.planKey,
        ...(input.selectedProduct ? { selected_product: input.selectedProduct } : {}),
      },
    },
  });
  if (error) return { status: "error", message: error.message };
  // A session straight away means confirmation is switched off for this project.
  return data.session ? { status: "signed_in" } : { status: "check_email", email: input.email.trim() };
}

/** Problems worth catching before a round trip. */
export function signUpProblem(input: SignUpInput, plan: PublicPlan | undefined): string | null {
  if (!input.fullName.trim()) return "Your name is needed.";
  if (!input.businessName.trim()) return "Your business name is needed — it becomes your organization.";
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(input.email.trim())) return "That email address does not look right.";
  if (input.password.length < 8) return "Use a password of at least 8 characters.";
  if (!plan) return "Choose a plan.";
  if (!plan.publicTrial) return `${plan.label} is arranged with the BES team rather than started online.`;
  if (plan.chooseOne && !input.selectedProduct) return `${plan.label} includes one product — choose CreditOps or FundingOps.`;
  return null;
}
