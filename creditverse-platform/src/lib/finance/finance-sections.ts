/**
 * The Finance workspace, as data.
 *
 * Dee's brief, 2026-09-17: Finance stops being one page with tabs and becomes
 * a module with its own secondary navigation — Overview, Invoices, Payments,
 * Billing, Expenses, Payroll, Reports, then Attention, then Settings.
 *
 * Kept as rows rather than a switch statement for the reason rule 18 gives:
 * a module is data, not a code branch. Adding a section is an entry here plus
 * its screen, never a new permission system.
 *
 * ── THE CAPABILITY IS THE POINT ───────────────────────────────────────────
 *
 * "Do not show pages a user lacks permission to access. Agency Admin alone
 * does NOT grant financial access."
 *
 * Every section names the capabilities that reach it, and `any` means any one
 * of them is enough. This decides what is RENDERED. It is not the security —
 * that is Row Level Security and the owner-gated permission keys, which refuse
 * the same person at the database whether or not a link was drawn for them.
 */
export interface FinanceSection {
  /** The URL segment. The overview is the module root and has none. */
  slug: string;
  label: string;
  /** The line under the heading on that section's own page. */
  description: string;
  group: "workspace" | "attention" | "settings";
  /** Any one of these is enough to see the section. */
  any: string[];
}

export const FINANCE_SECTIONS: FinanceSection[] = [
  {
    slug: "",
    label: "Overview",
    description: "Billing, collections, payments and operating expenses.",
    group: "workspace",
    any: ["finance.dashboard.view", "billing.view"],
  },
  {
    slug: "invoices",
    label: "Invoices",
    description: "Create, collect and track partner invoices.",
    group: "workspace",
    any: ["partners.invoices.view", "partners.invoices.manage"],
  },
  {
    slug: "payments",
    label: "Payments",
    description: "Money received across all partners.",
    group: "workspace",
    any: ["billing.view", "partners.payments.record"],
  },
  {
    slug: "billing",
    label: "Billing",
    description: "Recurring terms, collection methods and billing health.",
    group: "workspace",
    any: ["billing.view", "billing.manage"],
  },
  {
    slug: "expenses",
    label: "Expenses",
    description: "What BES spends, and what is still to pay.",
    group: "workspace",
    any: ["expenses.view"],
  },
  {
    /* Payroll is gated on its OWN capability and nothing else. Dee: "Do NOT
       make payroll visible simply because someone has Finance navigation
       access." Bryan's explicit grant is what reaches it. */
    slug: "payroll",
    label: "Payroll",
    description: "Pay periods, hours and what is owed to the team.",
    group: "workspace",
    any: ["payroll.view", "payroll.manage"],
  },
  {
    slug: "reports",
    label: "Reports",
    description: "Revenue, receivables, collections and spend.",
    group: "workspace",
    any: ["finance.dashboard.view", "billing.view"],
  },
  {
    slug: "attention",
    label: "Billing Attention",
    description: "The invoices and partners that need a person.",
    group: "attention",
    any: ["billing.view", "partners.invoices.manage"],
  },
  {
    slug: "matching",
    label: "Payment Matching",
    description: "Payments that arrived without an invoice to sit against.",
    group: "attention",
    any: ["partners.payments.record"],
  },
  {
    slug: "payment-methods",
    label: "Payment Methods",
    description: "How partners may pay, and which are automatic.",
    group: "settings",
    any: ["billing.manage"],
  },
  {
    slug: "billing-settings",
    label: "Billing Settings",
    description: "Invoice numbering, reminders, suspension and receipts.",
    group: "settings",
    any: ["billing.manage"],
  },
];

export const GROUP_LABEL: Record<FinanceSection["group"], string | null> = {
  workspace: null,
  attention: "Attention",
  settings: "Settings",
};

/** The sections this person may actually open. */
export const visibleFinanceSections = (
  can: (key: string) => boolean,
): FinanceSection[] => FINANCE_SECTIONS.filter((s) => s.any.some(can));

/** The section a URL segment names, or null when it names none or one this
 *  person may not open — which is the same answer on purpose. */
export const financeSectionFor = (
  slug: string | undefined,
  can: (key: string) => boolean,
): FinanceSection | null =>
  visibleFinanceSections(can).find((s) => s.slug === (slug ?? "")) ?? null;
