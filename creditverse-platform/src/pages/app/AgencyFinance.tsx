/**
 * BES Finance — the owner's money, in one screen.
 *
 * ── SEVEN NUMBERS, NEVER ONE ───────────────────────────────────────────────
 *
 * The spreadsheet this replaces has one "expected collection" column beside a
 * dozen service lines, and answering "how much recurring business do we have"
 * means reading it and doing arithmetic in your head. Worse, it cannot
 * distinguish a $3,000 build from a $299 subscription, so any total including
 * both is meaningless.
 *
 * So this shows fixed MRR, variable recurring, expected, invoiced, collected,
 * outstanding and overdue as SEPARATE figures, plus expenses and net cash. The
 * arithmetic is `billing-engine`, unit tested against Dee's nine cases — this
 * file only arranges what it returns.
 *
 * ── NOT ACCOUNTING ─────────────────────────────────────────────────────────
 *
 * Net cash here is collected minus expenses actually paid, in the month the
 * money moved. It is an operating figure, and it says so on the card: no
 * accruals, no depreciation, no tax. Dee, 2026-09-07: "the goal is NOT to
 * build Xero."
 */
import { useState } from "react";
import { Banknote, Loader2 } from "lucide-react";
import { HqPageShell } from "@/pages/app/HqPages";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { FinanceFigures } from "@/components/agency/finance/FinanceFigures";
import { ReceivablesTable } from "@/components/agency/finance/ReceivablesTable";
import { ExpensesPanel } from "@/components/agency/finance/ExpensesPanel";
import { PayrollPanel } from "@/components/agency/finance/PayrollPanel";
import { useFinancialInputs } from "@/lib/data/use-partner-billing";
import { useExpenses } from "@/lib/data/use-agency-expenses";
import { useAgencyPermissions } from "@/lib/data/agency-permissions";
import {
  financialPosition, netCashForMonth, rollUpExpenses, type Month,
} from "@/lib/partners/billing-engine";

const MONTH_NAMES = ["January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"];

export const AgencyFinance = () => {
  const perms = useAgencyPermissions();
  const today = new Date().toISOString().slice(0, 10);
  const [month, setMonth] = useState<Month>({
    year: Number(today.slice(0, 4)), month: Number(today.slice(5, 7)),
  });
  const inputs = useFinancialInputs(month);
  const expenses = useExpenses(month.year, month.month);
  /* The tab exists only for someone who may use it (rule 3). */
  const payroll = perms.can("payroll.view") || perms.can("payroll.manage");
  const [tab, setTab] = useState("receivables");

  if (perms.loading) {
    return (
      <HqPageShell title="Finance" description="Checking your access…" icon={Banknote}>
        <p className="py-10 text-center text-sm text-muted-foreground">
          <Loader2 className="mr-2 inline h-4 w-4 animate-spin" /> Loading…
        </p>
      </HqPageShell>
    );
  }

  const data = inputs.data;
  const position = data
    ? financialPosition(data.terms, data.schedule, data.invoices, data.payments, month, today)
    : null;
  const expenseRoll = rollUpExpenses(
    (expenses.data ?? []).map((e) => ({
      id: e.id, amountCents: e.amountCents, dueDate: e.dueDate,
      paidOn: e.paidOn, status: e.status,
    })),
    month, today,
  );
  const netCash = position ? netCashForMonth(position.collectedCents, expenseRoll.paidCents) : 0;

  const step = (by: number) => setMonth((m) => {
    const n = m.month + by;
    if (n < 1) return { year: m.year - 1, month: 12 };
    if (n > 12) return { year: m.year + 1, month: 1 };
    return { year: m.year, month: n };
  });

  return (
    <HqPageShell
      title="Finance"
      description="What BES is owed, what came in, and what went out."
      icon={Banknote}
      actions={
        <div className="flex items-center gap-1">
          <Button size="sm" variant="ghost" onClick={() => step(-1)} aria-label="Previous month">‹</Button>
          <span className="min-w-32 text-center text-sm font-semibold text-foreground">
            {MONTH_NAMES[month.month - 1]} {month.year}
          </span>
          <Button size="sm" variant="ghost" onClick={() => step(1)} aria-label="Next month">›</Button>
        </div>
      }
    >
      {inputs.isLoading ? (
        <p className="py-10 text-center text-sm text-muted-foreground">
          <Loader2 className="mr-2 inline h-4 w-4 animate-spin" /> Working out the month…
        </p>
      ) : !position ? (
        <p className="py-10 text-center text-sm text-muted-foreground">
          No financial data could be loaded for this month.
        </p>
      ) : (
        <>
          <FinanceFigures position={position} expenses={expenseRoll} netCash={netCash} />

          <Tabs value={tab} onValueChange={setTab} className="mt-4">
            <TabsList className="h-8 bg-muted/60">
              <TabsTrigger value="receivables" className="text-[11px]">Receivables</TabsTrigger>
              <TabsTrigger value="expenses" className="text-[11px]">Expenses</TabsTrigger>
              {payroll && <TabsTrigger value="payroll" className="text-[11px]">Payroll</TabsTrigger>}
            </TabsList>
            <TabsContent value="receivables" className="mt-3">
              <ReceivablesTable
                invoices={data?.invoices ?? []}
                schedule={data?.schedule ?? []}
                partnerNames={data?.partnerNames ?? {}}
                month={month}
                today={today}
              />
            </TabsContent>
            <TabsContent value="expenses" className="mt-3">
              <ExpensesPanel month={month} />
            </TabsContent>
            {payroll && (
              <TabsContent value="payroll" className="mt-3">
                <PayrollPanel />
              </TabsContent>
            )}
          </Tabs>
        </>
      )}
    </HqPageShell>
  );
};
