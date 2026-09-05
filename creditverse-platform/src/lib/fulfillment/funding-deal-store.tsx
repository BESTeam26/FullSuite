/**
 * Funding Deal Store — mutable deal records + deal-level activity.
 *
 * The main FundingOps client store owns clients + client activity. This store
 * owns the DEAL records (lender submissions) so agents can actually move a
 * deal through its lifecycle and edit its fields — the core operational action
 * that was missing.
 *
 *   updateDealStatus(dealId, newStatus)   → move one lender deal's status
 *   updateDeal(dealId, patch)             → edit lender/program/amount/rate/term
 *
 * Every change is logged as an activity entry against the deal's client, so it
 * shows up in the Deal Workspace + Client Workspace activity timelines.
 */

import {
  createContext,
  useEffect,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { seedFundingDeals } from "@/lib/fulfillment/fundingops-seed";
import { useAuth } from "@/lib/auth/auth-context";
import {
  fetchAllFundingDeals,
  updateFundingDealStatus,
} from "@/lib/data/funding-clients";
import type {
  FundingDeal,
  DealStatus,
} from "@/lib/fulfillment/fundingops-domain";
import { dealCode } from "@/components/dashboard/fulfillment/funding-deal-data";
import type { FundingActivityEntry } from "@/lib/fulfillment/fundingops-store-types";

const nowISO = () => new Date().toISOString();
const newActId = () =>
  `dact-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

export interface DealActivityEntry extends FundingActivityEntry {
  pinned?: boolean;
  mark?: "urgent" | "resolved" | "flagged" | "info";
}

interface FundingDealStoreValue {
  deals: FundingDeal[];
  dealActivity: DealActivityEntry[];
  getDeal: (dealId: string) => FundingDeal | undefined;
  getDealActivity: (dealId: string) => DealActivityEntry[];
  updateDealStatus: (
    dealId: string,
    newStatus: DealStatus,
    actor: string,
  ) => void;
  updateDeal: (
    dealId: string,
    patch: Partial<
      Pick<FundingDeal, "lender" | "program" | "amount" | "rate" | "term">
    >,
    actor: string,
  ) => void;
  addDealActivity: (
    dealId: string,
    action: string,
    detail: string,
    actor: string,
  ) => void;
  togglePin: (dealId: string, activityId: string) => void;
  setMark: (
    dealId: string,
    activityId: string,
    mark?: "urgent" | "resolved" | "flagged" | "info",
  ) => void;
}

const FundingDealStoreContext = createContext<FundingDealStoreValue | null>(
  null,
);

export function FundingDealStoreProvider({
  children,
}: {
  children: ReactNode;
}) {
  const { mode, status } = useAuth();
  const live = mode === "live" && status === "signed-in";

  /* Dual-mode, like the client store: live mode loads deals from the database
     once and keeps them in the same local shape the rest of this store already
     works with, so behaviour below is identical in both modes. */
  const [deals, setDeals] = useState<FundingDeal[]>(() =>
    live ? [] : seedFundingDeals.map((d) => ({ ...d })),
  );
  const [dealActivity, setDealActivity] = useState<DealActivityEntry[]>([]);

  useEffect(() => {
    if (!live) return;
    let cancelled = false;
    fetchAllFundingDeals()
      .then((rows) => {
        if (!cancelled) setDeals(rows);
      })
      .catch(() => {
        // A deal list that cannot load must not take the workspace down.
      });
    return () => {
      cancelled = true;
    };
  }, [live]);

  const getDeal = useCallback(
    (dealId: string) => deals.find((d) => d.id === dealId),
    [deals],
  );

  const getDealActivity = useCallback(
    (dealId: string) => dealActivity.filter((a) => a.clientId === dealId),
    [dealActivity],
  );

  const updateDealStatus = useCallback(
    (dealId: string, newStatus: DealStatus, actor: string) => {
      if (live) {
        // Fire-and-forget: the optimistic update below is what the operator
        // sees; a failed write surfaces on the next load rather than blocking.
        void updateFundingDealStatus(
          dealId,
          newStatus as Parameters<typeof updateFundingDealStatus>[1],
        ).catch(() => {});
      }
      setDeals((prev) => {
        const deal = prev.find((d) => d.id === dealId);
        if (!deal || deal.status === newStatus) return prev;
        setDealActivity((a) => [
          {
            id: newActId(),
            timestamp: nowISO(),
            clientId: dealId,
            actor,
            action: "Deal status changed",
            detail: `${dealCode(deal)} (${deal.lender}): ${deal.status} → ${newStatus}`,
            field: "dealStatus",
            previousValue: deal.status,
            newValue: newStatus,
          },
          ...a,
        ]);
        return prev.map((d) =>
          d.id === dealId ? { ...d, status: newStatus } : d,
        );
      });
    },
    [],
  );

  const updateDeal = useCallback(
    (
      dealId: string,
      patch: Partial<
        Pick<FundingDeal, "lender" | "program" | "amount" | "rate" | "term">
      >,
      actor: string,
    ) => {
      setDeals((prev) =>
        prev.map((d) => {
          if (d.id !== dealId) return d;
          const changes = (Object.keys(patch) as (keyof typeof patch)[])
            .filter((k) => String(d[k] ?? "—") !== String(patch[k] ?? "—"))
            .map((k) => `${k}: ${d[k] ?? "—"} → ${patch[k] ?? "—"}`);
          if (!changes.length) return d;
          setDealActivity((a) => [
            {
              id: newActId(),
              timestamp: nowISO(),
              clientId: dealId,
              actor,
              action: "Deal updated",
              detail: `${dealCode(d)} (${d.lender}): ${changes.join(", ")}`,
              field: "dealEdit",
            },
            ...a,
          ]);
          return { ...d, ...patch };
        }),
      );
    },
    [],
  );

  const addDealActivity = useCallback(
    (dealId: string, action: string, detail: string, actor: string) => {
      setDealActivity((prev) => [
        {
          id: newActId(),
          timestamp: nowISO(),
          clientId: dealId,
          actor,
          action,
          detail,
        },
        ...prev,
      ]);
    },
    [],
  );

  const togglePin = useCallback((dealId: string, activityId: string) => {
    setDealActivity((prev) =>
      prev.map((a) => (a.id === activityId ? { ...a, pinned: !a.pinned } : a)),
    );
  }, []);

  const setMark = useCallback(
    (
      dealId: string,
      activityId: string,
      mark?: "urgent" | "resolved" | "flagged" | "info",
    ) => {
      setDealActivity((prev) =>
        prev.map((a) => (a.id === activityId ? { ...a, mark } : a)),
      );
    },
    [],
  );

  const value = useMemo<FundingDealStoreValue>(
    () => ({
      deals,
      dealActivity,
      getDeal,
      getDealActivity,
      updateDealStatus,
      updateDeal,
      addDealActivity,
      togglePin,
      setMark,
    }),
    [
      deals,
      dealActivity,
      getDeal,
      getDealActivity,
      updateDealStatus,
      updateDeal,
      addDealActivity,
      togglePin,
      setMark,
    ],
  );

  return (
    <FundingDealStoreContext.Provider value={value}>
      {children}
    </FundingDealStoreContext.Provider>
  );
}

export function useFundingDealStore(): FundingDealStoreValue {
  const ctx = useContext(FundingDealStoreContext);
  if (ctx) return ctx;
  const noop = () => {};
  return {
    deals: [],
    dealActivity: [],
    getDeal: () => undefined,
    getDealActivity: () => [],
    updateDealStatus: noop,
    updateDeal: noop,
    addDealActivity: noop,
    togglePin: noop,
    setMark: noop,
  };
}
