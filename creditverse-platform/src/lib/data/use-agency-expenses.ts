import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth/auth-context";
import { useAgencyPermissions } from "@/lib/data/agency-permissions";
import {
  fetchExpenseTemplates, fetchExpenses, generateMonthlyExpenses,
  markExpensePaid, saveExpense, saveExpenseTemplate,
} from "@/lib/data/agency-expenses";

const live = (a: ReturnType<typeof useAuth>) => a.mode === "live" && a.status === "signed-in";

export function useExpenses(year: number, month: number) {
  const auth = useAuth();
  const perms = useAgencyPermissions();
  const allowed = perms.can("expenses.view");
  const q = useQuery({
    queryKey: ["agency", "expenses", year, month],
    queryFn: () => fetchExpenses(year, month),
    enabled: live(auth) && allowed,
    staleTime: 60_000,
  });
  return { ...q, allowed };
}

export function useExpenseTemplates() {
  const auth = useAuth();
  const perms = useAgencyPermissions();
  return useQuery({
    queryKey: ["agency", "expense-templates"],
    queryFn: fetchExpenseTemplates,
    enabled: live(auth) && perms.can("expenses.view"),
    staleTime: 300_000,
  });
}

export function useExpenseActions() {
  const qc = useQueryClient();
  const auth = useAuth();
  const agencyId = auth.agencyId ?? "";
  const refresh = () => { void qc.invalidateQueries({ queryKey: ["agency", "expenses"] }); };
  return {
    save: useMutation({
      mutationFn: (v: Omit<Parameters<typeof saveExpense>[0], "agencyId">) =>
        saveExpense({ ...v, agencyId }),
      onSuccess: refresh,
    }),
    markPaid: useMutation({
      mutationFn: (v: { id: string; paidOn: string; receiptUrl?: string }) =>
        markExpensePaid(v.id, v.paidOn, v.receiptUrl),
      onSuccess: refresh,
    }),
    saveTemplate: useMutation({
      mutationFn: (v: Omit<Parameters<typeof saveExpenseTemplate>[0], "agencyId">) =>
        saveExpenseTemplate({ ...v, agencyId }),
      onSuccess: () => {
        refresh();
        void qc.invalidateQueries({ queryKey: ["agency", "expense-templates"] });
      },
    }),
    generate: useMutation({
      mutationFn: (v: { year: number; month: number }) =>
        generateMonthlyExpenses(agencyId, v.year, v.month),
      onSuccess: refresh,
    }),
  };
}
