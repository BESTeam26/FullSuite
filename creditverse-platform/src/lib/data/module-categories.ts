/**
 * Operational categories — how BES files the active accounts inside a module.
 *
 * Two things live here and they must not be confused (Dee, 2026-09-11):
 *
 *   the CATEGORY      is how an active service engagement is displayed
 *                     operationally, derived from the service relationship;
 *   SaaS TENANCY      is a separate, automatic capability read from
 *                     `organization_subscriptions`, and nothing in this file
 *                     reads or writes it.
 *
 * Placement is automatic by default. `category_source` is `auto` until somebody
 * deliberately moves an account, and from that moment it is `manual` and the
 * derivation leaves it alone — until `followAutomaticPlacement` hands it back.
 */
import { requireSupabase } from "@/lib/supabase/client";
import type { Enums } from "@/lib/supabase/database.types";

export type FulfillmentService = Enums<"fulfillment_service">;

export interface ModuleCategory {
  id: string;
  module: FulfillmentService;
  /** Stable across renames — what code and history refer to. */
  key: string;
  label: string;
  sort: number;
  /** Where an engagement lands when no category claims it. Incomplete data,
   *  surfaced rather than guessed into a business classification. */
  isFallback: boolean;
  /** The contract term that files an account here: a weekly commitment
   *  (Managed Ops) or per client per round (Outsourcing). Null for the
   *  folders that are not a commercial arrangement. */
  commitmentModel: "weekly_retainer" | "per_client_round" | null;
  /** Membership comes from somewhere other than an engagement — CreditOps
   *  Users follows the customer's own subscription — so nothing is ever
   *  dragged into it. */
  isAutomatic: boolean;
}

/** Every live category for one module, in the order they should be shown. */
export async function fetchModuleCategories(module: FulfillmentService): Promise<ModuleCategory[]> {
  const sb = requireSupabase();
  const { data, error } = await sb
    .from("module_categories")
    .select("id, module, key, label, sort, is_fallback, commitment_model, is_automatic")
    .eq("module", module)
    .is("archived_at", null)
    .order("sort");
  if (error) throw error;
  return (data ?? []).map((r) => ({
    id: r.id as string,
    module: r.module as FulfillmentService,
    key: r.key as string,
    label: r.label as string,
    sort: r.sort as number,
    isFallback: r.is_fallback as boolean,
    commitmentModel: (r.commitment_model ?? null) as ModuleCategory["commitmentModel"],
    isAutomatic: (r.is_automatic ?? false) as boolean,
  }));
}

/**
 * Move an engagement, and pin it there.
 *
 * The database does the whole operation: it checks `partners.operations`,
 * refuses a category from another module, writes the activity entry and the
 * audit record. The browser cannot do any of that safely and does not try
 * (rule 1).
 */
export async function moveEngagementToCategory(engagementId: string, categoryId: string): Promise<void> {
  const sb = requireSupabase();
  const { error } = await sb.rpc("set_engagement_category", {
    p_engagement: engagementId,
    p_category: categoryId,
  });
  if (error) throw error;
}

/** Undo an override: back to `auto`, recomputed from the service relationship. */
export async function followAutomaticPlacement(engagementId: string): Promise<void> {
  const sb = requireSupabase();
  const { error } = await sb.rpc("follow_automatic_placement", { p_engagement: engagementId });
  if (error) throw error;
}
