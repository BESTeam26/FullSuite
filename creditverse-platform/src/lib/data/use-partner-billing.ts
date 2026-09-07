/**
 * Financial data for one partner, and for the agency.
 *
 * Every query is gated on the capability rather than left to come back empty.
 * RLS refuses either way, but an empty list and "you may not see this" look
 * identical from here — and the screens above simply are not rendered without
 * the capability, so a hook that fired anyway would be a request nobody reads.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth/auth-context";
import { useAgencyPermissions } from "@/lib/data/agency-permissions";
import {
  cancelScheduleEntry, createInstalmentPlan, createInvoice, fetchFinancialInputs,
  fetchInvoiceLines, fetchPartnerInvoices, fetchPartnerPayments, fetchPartnerSchedule,
  markInvoiceSent, recordPayment, refundPayment, voidInvoice,
} from "@/lib/data/partner-billing";
import type { Month } from "@/lib/partners/billing-engine";

const live = (a: ReturnType<typeof useAuth>) => a.mode === "live" && a.status === "signed-in";

export const invoicesKey = (g: string) => ["partner", "invoices", g] as const;
export const paymentsKey = (g: string) => ["partner", "payments", g] as const;
export const scheduleKey = (g: string) => ["partner", "schedule", g] as const;
export const financeKey = (m: Month) => ["agency", "finance", m.year, m.month] as const;

export function usePartnerInvoices(groupId: string | null) {
  const auth = useAuth();
  const perms = useAgencyPermissions();
  const allowed = perms.can("partners.invoices.view");
  const q = useQuery({
    queryKey: invoicesKey(groupId ?? ""),
    queryFn: () => fetchPartnerInvoices(groupId!),
    enabled: live(auth) && !!groupId && allowed,
    staleTime: 30_000,
  });
  return { ...q, allowed };
}

export function useInvoiceLines(invoiceId: string | null) {
  const auth = useAuth();
  return useQuery({
    queryKey: ["partner", "invoice-lines", invoiceId ?? ""],
    queryFn: () => fetchInvoiceLines(invoiceId!),
    enabled: live(auth) && !!invoiceId,
    staleTime: 60_000,
  });
}

export function usePartnerPayments(groupId: string | null) {
  const auth = useAuth();
  const perms = useAgencyPermissions();
  const allowed = perms.can("partners.financials.view");
  const q = useQuery({
    queryKey: paymentsKey(groupId ?? ""),
    queryFn: () => fetchPartnerPayments(groupId!),
    enabled: live(auth) && !!groupId && allowed,
    staleTime: 30_000,
  });
  return { ...q, allowed };
}

export function usePartnerSchedule(groupId: string | null) {
  const auth = useAuth();
  const perms = useAgencyPermissions();
  const allowed = perms.can("partners.financials.view");
  const q = useQuery({
    queryKey: scheduleKey(groupId ?? ""),
    queryFn: () => fetchPartnerSchedule(groupId!),
    enabled: live(auth) && !!groupId && allowed,
    staleTime: 30_000,
  });
  return { ...q, allowed };
}

/**
 * The bounded inputs the agency financial dashboard computes from.
 *
 * The arithmetic is NOT here and not in SQL — it is in `billing-engine`, unit
 * tested against Dee's nine cases. One implementation, so the dashboard and a
 * partner profile cannot disagree about what MRR means.
 */
export function useFinancialInputs(month: Month) {
  const auth = useAuth();
  const perms = useAgencyPermissions();
  const allowed = perms.can("finance.dashboard.view");
  const q = useQuery({
    queryKey: financeKey(month),
    queryFn: () => fetchFinancialInputs(month),
    enabled: live(auth) && allowed,
    staleTime: 60_000,
  });
  return { ...q, allowed, permissionsLoading: perms.loading };
}

export function usePartnerBillingActions(groupId: string) {
  const qc = useQueryClient();
  const auth = useAuth();
  const agencyId = auth.agencyId ?? "";
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ["partner"] });
    void qc.invalidateQueries({ queryKey: ["agency", "finance"] });
  };
  return {
    createInvoice: useMutation({
      mutationFn: (v: Omit<Parameters<typeof createInvoice>[0], "agencyId" | "groupId">) =>
        createInvoice({ ...v, agencyId, groupId }),
      onSuccess: refresh,
    }),
    sendInvoice: useMutation({ mutationFn: markInvoiceSent, onSuccess: refresh }),
    voidInvoice: useMutation({
      mutationFn: (v: { id: string; reason: string }) => voidInvoice(v.id, v.reason),
      onSuccess: refresh,
    }),
    recordPayment: useMutation({
      mutationFn: (v: Omit<Parameters<typeof recordPayment>[0], "agencyId" | "groupId">) =>
        recordPayment({ ...v, agencyId, groupId }),
      onSuccess: refresh,
    }),
    refundPayment: useMutation({
      mutationFn: (v: { id: string; refundCents: number; note?: string }) =>
        refundPayment(v.id, v.refundCents, v.note),
      onSuccess: refresh,
    }),
    createInstalments: useMutation({
      mutationFn: (v: Omit<Parameters<typeof createInstalmentPlan>[0], "agencyId" | "groupId">) =>
        createInstalmentPlan({ ...v, agencyId, groupId }),
      onSuccess: refresh,
    }),
    cancelScheduled: useMutation({ mutationFn: cancelScheduleEntry, onSuccess: refresh }),
  };
}
