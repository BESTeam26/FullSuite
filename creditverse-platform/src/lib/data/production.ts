/**
 * Production — the canonical, service-aware write path.
 *
 * One table (`production_logs`), one engine (EOD derives from it), and a
 * service dimension that decides which record the unit was produced on:
 *   creditops  → a fulfillment client (+ department)
 *   fundingops → a funding client, optionally a deal (+ funding department)
 *   bes_crm / talentops / workspaces → a work item
 *
 * Tenancy (agency, organization, outsourcing group) is derived by the database
 * from that subject; the client never sends it. `requestId` is minted once per
 * submission intent and reused across retries: the unique index on
 * (agency_id, request_id) makes the insert exactly-once, and 23505 means an
 * earlier attempt already landed.
 */
import { supabase } from "@/lib/supabase/client";
import type { Enums } from "@/lib/supabase/database.types";

export type ProductionService = Enums<"fulfillment_service">;

interface Base {
  requestId: string;
  agencyId: string;
  employeeId: string;
  actions: string[];
  workNotes?: string;
  /** Defaults to the department key, then "Work item". */
  unitType?: string;
  quantity?: number;
  /** Must exist in production_departments for the service; null when the service has no taxonomy. */
  departmentKey?: string | null;
}

export type LogProductionInput =
  | (Base & { service: "creditops"; fulfillmentClientId: string })
  | (Base & { service: "fundingops"; fundingClientId: string; fundingDealId?: string | null })
  | (Base & { service: "bes_crm" | "talentops"; workItemId: string });

export async function logProduction(input: LogProductionInput): Promise<void> {
  const subject =
    input.service === "creditops"
      ? { client_id: input.fulfillmentClientId }
      : input.service === "fundingops"
        ? { funding_client_id: input.fundingClientId, funding_deal_id: input.fundingDealId ?? null }
        : { work_item_id: input.workItemId };

  const { error } = await supabase.from("production_logs").insert({
    request_id: input.requestId,
    agency_id: input.agencyId,
    employee_id: input.employeeId,
    service: input.service,
    // Legacy reader column; the derive trigger overwrites it from `service`.
    division_id: input.service,
    department_key: input.departmentKey ?? null,
    ...subject,
    production_unit_type: input.unitType ?? input.departmentKey ?? "Work item",
    production_unit_quantity: input.quantity ?? 1,
    actions: input.actions,
    work_notes: input.workNotes ?? null,
    work_date: new Date().toISOString().slice(0, 10),
  });
  if (error && error.code === "23505") return;
  if (error) throw error;
}
