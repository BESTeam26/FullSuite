/**
 * Which partner the tree should highlight while a client is open.
 *
 * Dee, 2026-09-29: "keep the currently selected Partner highlighted in the
 * Partner list while viewing one of their clients. For example, if Aaron
 * Rubio belongs to Credit by Nainoa, Credit by Nainoa should remain
 * selected/highlighted while Aaron's workspace is open."
 *
 * The URL names the client; the client names the partner. So the highlight
 * is derived from the record, never from anything the link happened to
 * carry — a client opened from a queue, a notification or a pasted address
 * highlights the same partner as one opened from that partner's list.
 *
 * Pure, so it is testable without a store or a router. Returns null when the
 * client is not (yet) in the store — the caller falls back to the URL
 * selection rather than highlighting nothing, so the tree never flickers
 * empty while the store fills.
 */
import { clientGroupKey, type OpsClient, type OpsPartner } from "@/lib/fulfillment/ops-client-domain";
import type { CreditOpsSelection } from "@/components/dashboard/fulfillment/CreditOpsTreeSidebar";

/* `mode` is what decides the scope: a `saas_pulled` file belongs to its
   organization, anything else to its outsourcing group (`clientGroupKey`). */
type ClientLike = Pick<OpsClient, "id" | "mode" | "organizationId" | "outsourcingGroupId">;
type PartnerLike = Pick<OpsPartner, "id" | "scopeId">;

export function partnerForClient(
  clients: readonly ClientLike[],
  partners: readonly PartnerLike[],
  clientId: string | null | undefined,
): CreditOpsSelection | null {
  if (!clientId) return null;
  const client = clients.find((c) => c.id === clientId);
  if (!client) return null;
  const key = clientGroupKey(client as OpsClient);
  const owner = partners.find((p) => p.scopeId === key);
  return owner ? { kind: "partner", partnerId: owner.id } : null;
}
