/**
 * What audiences may the signed-in user post to, for this record?
 *
 * One hook, so no component works it out for itself (rule 13). It combines the
 * two facts the rule needs — who the author is, and whether a live fulfillment
 * relationship exists — and defers the rule itself to `allowedVisibilities()`.
 *
 * The engagement list is already cached by `useFulfillment`, so asking here
 * costs no extra request no matter how many timelines are open (rule 14).
 */
import { useMemo } from "react";
import { useAuth } from "@/lib/auth/auth-context";
import { useAgency } from "@/lib/agency-context";
import { useFulfillment } from "@/lib/data/use-fulfillment";
import {
  allowedVisibilities,
  defaultVisibility,
  type ActivitySurface,
  type ActivityVisibility,
  type AuthorKind,
} from "@/lib/data/activity";
import type { FulfillmentService } from "@/lib/data/fulfillment-engagements";

export interface ActivityVisibilityOptions {
  /** Levels this author may create, in the order the picker shows them. */
  allowed: ActivityVisibility[];
  /** What the picker starts on for this author, surface and relationship. */
  fallback: ActivityVisibility;
  author: AuthorKind;
  surface: ActivitySurface;
}

export function useActivityVisibility(
  /** The partner this record belongs to — organization or outsourcing group. */
  scopeId: string | undefined,
  service: FulfillmentService,
): ActivityVisibilityOptions {
  const { isAgencyStaff } = useAuth();
  const { viewMode } = useAgency();
  const { mayFulfil } = useFulfillment();
  // Agency staff write as BES; everyone else writes as their organization.
  const author: AuthorKind = isAgencyStaff ? "bes" : "organization";
  /* The organization view is the customer's surface: no BES-internal voice
     there, and shared-with-BES by default when BES fulfils for them. */
  const surface: ActivitySurface = viewMode === "subaccount" ? "organization" : "agency";
  const engaged = mayFulfil(scopeId, service);
  const allowed = useMemo(
    () => allowedVisibilities(author, engaged, surface),
    [author, engaged, surface],
  );
  const fallback = useMemo(
    () => defaultVisibility(author, engaged, surface),
    [author, engaged, surface],
  );
  return { allowed, fallback, author, surface };
}
