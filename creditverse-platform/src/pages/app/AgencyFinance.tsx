/**
 * BES Finance — a financial operations workspace, not one page with tabs.
 *
 * Dee's redesign, 2026-09-17: "Redesign the entire FullSuite Finance module,
 * not only Invoice Detail… Finance should feel like Stripe's clarity plus
 * FullSuite operational context."
 *
 * So Finance now has its own secondary navigation and its own URLs —
 * `/app/finance/invoices`, `/app/finance/attention` — which is what makes
 * "drill from Finance → Partner → Invoice without losing context" possible,
 * and what lets the Overview's Needs Attention tiles link into a filtered
 * queue somebody can bookmark.
 *
 * ── THE PAGE DOES NOT DECIDE WHO SEES WHAT ────────────────────────────────
 *
 * `FINANCE_SECTIONS` names the capabilities that reach each section, and this
 * file asks. A section this person may not open is not rendered AND its URL
 * answers the same as a URL that does not exist — Dee: "Agency Admin alone
 * does NOT grant financial access."
 *
 * That is presentation. The database refuses the same person at
 * `finance_overview`, `finance_payments`, `match_partner_payment` and every
 * policy behind them, whether or not a link was ever drawn.
 *
 * ── STILL NOT ACCOUNTING ──────────────────────────────────────────────────
 *
 * Net cash is collected minus expenses paid, in the month the money moved. No
 * accruals, no depreciation, no tax, no chart of accounts. Dee, twice, a year
 * apart: "the goal is NOT to build Xero", and "FullSuite should first be your
 * operational finance system."
 */
import { useState } from "react";
import { useParams } from "react-router-dom";
import { Banknote, Loader2, Plus } from "lucide-react";
import { HqPageShell } from "@/pages/app/HqPages";
import { Button } from "@/components/ui/button";
import { FinanceNav } from "@/components/agency/finance/FinanceNav";
import { FinanceOverviewPage } from "@/components/agency/finance/FinanceOverviewPage";
import { PartnerBillingHealth } from "@/components/agency/finance/PartnerBillingHealth";
import { BillingAttentionQueue } from "@/components/agency/finance/BillingAttentionQueue";
import { PaymentsLedger } from "@/components/agency/finance/PaymentsLedger";
import { PaymentMatching } from "@/components/agency/finance/PaymentMatching";
import { FinanceReports } from "@/components/agency/finance/FinanceReports";
import { PayrollPanel } from "@/components/agency/finance/PayrollPanel";
import { ReceivablesTable } from "@/components/agency/finance/ReceivablesTable";
import { ExpensesPanel } from "@/components/agency/finance/ExpensesPanel";
import { AllInvoicesPanel } from "@/components/agency/finance/AllInvoicesPanel";
import { useFinancialInputs } from "@/lib/data/use-partner-billing";
import { useAgencyPermissions } from "@/lib/data/agency-permissions";
import type { Month } from "@/lib/partners/billing-engine";
import { financeSectionFor, visibleFinanceSections } from "@/lib/finance/finance-sections";

const MONTH_NAMES = ["January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"];

/** Invoices and Expenses are still month-scoped; the rest are not. */
const NEEDS_MONTH = new Set(["invoices", "expenses"]);

export const AgencyFinance = () => {
  const perms = useAgencyPermissions();
  const { section: slug } = useParams<{ section?: string }>();
  const today = new Date().toISOString().slice(0, 10);
  const [month, setMonth] = useState<Month>({
    year: Number(today.slice(0, 4)), month: Number(today.slice(5, 7)),
  });

  /* Only fetched for the sections that use it. Rule 14: do not preload a tab
     nobody opened. */
  const wantsMonth = NEEDS_MONTH.has(slug ?? "");
  const inputs = useFinancialInputs(wantsMonth ? month : { year: 0, month: 1 });

  if (perms.loading) {
    return (
      <HqPageShell title="Finance" description="Checking your access…" icon={Banknote}>
        <p className="py-10 text-center text-sm text-muted-foreground">
          <Loader2 className="mr-2 inline h-4 w-4 animate-spin" /> Loading…
        </p>
      </HqPageShell>
    );
  }

  const can = (k: string) => perms.can(k as never);
  const sections = visibleFinanceSections(can);
  const current = financeSectionFor(slug, can);

  if (sections.length === 0) {
    return (
      <HqPageShell
        title="Finance"
        description="Financial access is granted explicitly, and separately from administration."
        icon={Banknote}
      >
        <p className="rounded-xl border border-border bg-card py-10 text-center text-sm text-muted-foreground">
          You don't have a financial capability, so there is nothing here for you yet. The owner
          grants these one at a time.
        </p>
      </HqPageShell>
    );
  }

  if (!current) {
    /* A section that does not exist and a section this person may not open get
       the same answer, deliberately: the second leaks less. */
    return (
      <HqPageShell title="Finance" description="That page isn't here." icon={Banknote}>
        <FinanceNav sections={sections} />
        <p className="rounded-xl border border-border bg-card py-10 text-center text-sm text-muted-foreground">
          There's no such Finance page. Pick one from the list.
        </p>
      </HqPageShell>
    );
  }

  const step = (by: number) => setMonth((m) => {
    const n = m.month + by;
    if (n < 1) return { year: m.year - 1, month: 12 };
    if (n > 12) return { year: m.year + 1, month: 1 };
    return { year: m.year, month: n };
  });

  return (
    <HqPageShell
      title="Finance"
      description={current.description}
      icon={Banknote}
      actions={
        <div className="flex flex-wrap items-center gap-2">
          {wantsMonth && (
            <div className="flex items-center gap-1">
              <Button size="sm" variant="ghost" onClick={() => step(-1)} aria-label="Previous month">‹</Button>
              <span className="min-w-32 text-center text-sm font-semibold text-foreground">
                {MONTH_NAMES[month.month - 1]} {month.year}
              </span>
              <Button size="sm" variant="ghost" onClick={() => step(1)} aria-label="Next month">›</Button>
            </div>
          )}
          {can("partners.invoices.manage") && (
            <Button size="sm" asChild>
              <a href="/app/partners"><Plus className="mr-1 h-3.5 w-3.5" /> Create invoice</a>
            </Button>
          )}
        </div>
      }
    >
      <div className="lg:flex lg:gap-5">
        <FinanceNav sections={sections} />
        <div className="min-w-0 flex-1">
          {current.slug === "" && <FinanceOverviewPage />}
          {current.slug === "invoices" && (
            inputs.isLoading ? (
              <p className="py-10 text-center text-sm text-muted-foreground">
                <Loader2 className="mr-2 inline h-4 w-4 animate-spin" /> Working out the month…
              </p>
            ) : (
              <div className="space-y-4">
                <AllInvoicesPanel />
                <ReceivablesTable
                  invoices={inputs.data?.invoices ?? []}
                  schedule={inputs.data?.schedule ?? []}
                  partnerNames={inputs.data?.partnerNames ?? {}}
                  month={month}
                  today={today}
                />
              </div>
            )
          )}
          {current.slug === "payments" && <PaymentsLedger />}
          {current.slug === "billing" && <PartnerBillingHealth />}
          {current.slug === "expenses" && <ExpensesPanel month={month} />}
          {current.slug === "payroll" && <PayrollPanel />}
          {current.slug === "reports" && <FinanceReports />}
          {current.slug === "attention" && <BillingAttentionQueue />}
          {current.slug === "matching" && <PaymentMatching />}
          {(current.slug === "payment-methods" || current.slug === "billing-settings") && (
            <div className="rounded-xl border border-dashed border-border bg-card p-6 text-center">
              <p className="text-sm font-semibold text-foreground">
                {current.label} lives on each partner, for now
              </p>
              <p className="mx-auto mt-1 max-w-md text-xs text-muted-foreground">
                Payment methods, instructions and billing terms are configured per partner, on the
                partner's Billing tab — which is where they are actually different. A company-wide
                default here is worth building once there is a setting that is genuinely the same
                for everybody.
              </p>
              <Button className="mt-3" size="sm" variant="outline" asChild>
                <a href="/app/partners">Open BES Partners</a>
              </Button>
            </div>
          )}
        </div>
      </div>
    </HqPageShell>
  );
};
