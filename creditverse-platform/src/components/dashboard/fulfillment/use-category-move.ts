/**
 * Moving an account between operational categories, from the sidebar.
 *
 * ── WHAT A MOVE IS, AND IS NOT ─────────────────────────────────────────────
 *
 * It changes where an ACTIVE service engagement is filed, and pins it there
 * (`category_source = 'manual'`) so the automatic derivation stops correcting
 * it. It changes nothing else — not the service, the module, the engagement's
 * status, the partner's identity, nor anything about SaaS tenancy,
 * subscriptions or entitlements, which are a separate automatic capability
 * this file never touches (Dee, 2026-09-11).
 *
 * The whole operation is one database function. The browser does not check the
 * permission, write the activity entry or decide whether the category belongs
 * to the module — `set_engagement_category` does all three, so a person who
 * types the call by hand meets the same rules as a person who drags (rule 1).
 *
 * ── OPTIMISTIC, WITH A ROLLBACK THAT ACTUALLY WORKS ────────────────────────
 *
 * Dee: "Use optimistic UI only if rollback is reliable." The optimism is one
 * entry in a local map, applied over the fetched data. Success refetches and
 * the entry is dropped; failure drops the entry immediately and says why. It
 * cannot half-apply, because it never edits the cached rows — the fetched data
 * remains the only version of the truth and the override is a lens over it.
 */
import { useCallback, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth/auth-context";
import { useAgencyPermissions } from "@/lib/data/agency-permissions";
import {
  fetchModuleCategories,
  followAutomaticPlacement,
  moveEngagementToCategory,
  type FulfillmentService,
  type ModuleCategory,
} from "@/lib/data/module-categories";
import type { OpsPartner } from "@/lib/fulfillment/ops-client-domain";

export interface CategoryMove {
  categories: ModuleCategory[];
  /** Only somebody who may manage partner operations can reorganise. */
  canMove: boolean;
  /** The category a row is in right now, optimistic move included. */
  categoryIdOf: (partner: OpsPartner) => string | null;
  /** The engagement being dragged, or null. */
  draggingId: string | null;
  setDraggingId: (id: string | null) => void;
  move: (partner: OpsPartner, categoryId: string) => void;
  followAuto: (partner: OpsPartner) => void;
  isMoving: boolean;
}

export function useCategoryMove(module: FulfillmentService): CategoryMove {
  const auth = useAuth();
  const live = auth.mode === "live" && auth.status === "signed-in";
  const perms = useAgencyPermissions();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [optimistic, setOptimistic] = useState<Record<string, string>>({});
  const [draggingId, setDraggingId] = useState<string | null>(null);

  const categoriesQ = useQuery({
    queryKey: ["module-categories", module],
    queryFn: () => fetchModuleCategories(module),
    enabled: live,
    staleTime: 5 * 60_000,
  });

  /* The engagements are what carry the category, so their cache is what has to
     be refetched — not the partner list, which is composed from it. */
  const refresh = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ["fulfillment", "engagements"] });
  }, [queryClient]);

  const mutation = useMutation({
    mutationFn: ({ engagementId, categoryId }: { engagementId: string; categoryId: string | null }) =>
      categoryId === null
        ? followAutomaticPlacement(engagementId)
        : moveEngagementToCategory(engagementId, categoryId),
    onSuccess: (_data, vars) => {
      refresh();
      /* Held until the refetch lands, so the row does not flick back to where
         it came from for a frame while the new data is in flight. */
      window.setTimeout(
        () => setOptimistic((o) => { const { [vars.engagementId]: _drop, ...rest } = o; return rest; }),
        600,
      );
    },
    onError: (error: Error, vars) => {
      setOptimistic((o) => { const { [vars.engagementId]: _drop, ...rest } = o; return rest; });
      toast({
        title: "That move did not save",
        description: `${error.message}. The account is back where it was.`,
        variant: "destructive",
      });
    },
  });

  const categoryIdOf = useCallback(
    (partner: OpsPartner) =>
      (partner.engagementId ? optimistic[partner.engagementId] : undefined) ??
      partner.operationalCategoryId ??
      null,
    [optimistic],
  );

  const move = useCallback(
    (partner: OpsPartner, categoryId: string) => {
      if (!partner.engagementId) return;
      if (categoryIdOf(partner) === categoryId) return;
      setOptimistic((o) => ({ ...o, [partner.engagementId as string]: categoryId }));
      mutation.mutate({ engagementId: partner.engagementId, categoryId });
    },
    [categoryIdOf, mutation],
  );

  const followAuto = useCallback(
    (partner: OpsPartner) => {
      if (!partner.engagementId) return;
      /* No optimistic guess: only the database knows what the derivation says. */
      mutation.mutate({ engagementId: partner.engagementId, categoryId: null });
    },
    [mutation],
  );

  return useMemo(
    () => ({
      categories: categoriesQ.data ?? [],
      canMove: live && perms.can("partners.operations"),
      categoryIdOf,
      draggingId,
      setDraggingId,
      move,
      followAuto,
      isMoving: mutation.isPending,
    }),
    [categoriesQ.data, live, perms, categoryIdOf, draggingId, move, followAuto, mutation.isPending],
  );
}
