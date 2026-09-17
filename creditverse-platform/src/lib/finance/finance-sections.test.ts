import { describe, expect, it } from "vitest";
import {
  FINANCE_SECTIONS, financeSectionFor, visibleFinanceSections,
} from "./finance-sections";
import { AGENCY_PERMISSIONS } from "@/lib/data/agency-permissions";

const allowing = (...keys: string[]) => (k: string) => keys.includes(k);
const everything = () => true;
const nothing = () => false;

describe("the Finance sections", () => {
  it("every capability a section names is a real one the front end reads", () => {
    /* The defect this catches: `billing.view` existed in the database and not
       in AGENCY_PERMISSIONS, so `can()` answered false for everybody and the
       section was invisible to the owner. A key nobody reads is a key nobody
       has. */
    const known = new Set<string>(AGENCY_PERMISSIONS);
    const unknown = FINANCE_SECTIONS.flatMap((s) => s.any).filter((k) => !known.has(k));
    expect(unknown).toEqual([]);
  });

  it("shows nothing at all to somebody with no financial capability", () => {
    expect(visibleFinanceSections(nothing)).toEqual([]);
  });

  it("shows the whole module to somebody with everything", () => {
    expect(visibleFinanceSections(everything)).toHaveLength(FINANCE_SECTIONS.length);
  });

  it("payroll needs its own capability and nothing else opens it", () => {
    /* Dee: "Do NOT make payroll visible simply because someone has Finance
       navigation access." */
    const wideFinance = visibleFinanceSections(
      allowing("finance.dashboard.view", "billing.view", "billing.manage",
               "partners.invoices.view", "partners.invoices.manage",
               "partners.payments.record", "expenses.view"));
    expect(wideFinance.map((s) => s.slug)).not.toContain("payroll");

    const payrollOnly = visibleFinanceSections(allowing("payroll.view"));
    expect(payrollOnly.map((s) => s.slug)).toEqual(["payroll"]);
  });

  it("expenses does not come with invoices", () => {
    expect(visibleFinanceSections(allowing("expenses.view")).map((s) => s.slug)).toEqual(["expenses"]);
  });

  it("recording payments opens Payment Matching, viewing billing does not", () => {
    expect(visibleFinanceSections(allowing("partners.payments.record")).map((s) => s.slug))
      .toContain("matching");
    expect(visibleFinanceSections(allowing("billing.view")).map((s) => s.slug))
      .not.toContain("matching");
  });

  it("settings need billing.manage, not merely billing.view", () => {
    const viewer = visibleFinanceSections(allowing("billing.view")).map((s) => s.slug);
    expect(viewer).not.toContain("payment-methods");
    expect(viewer).not.toContain("billing-settings");
  });

  it("resolves a slug to its section", () => {
    expect(financeSectionFor("invoices", everything)?.label).toBe("Invoices");
    expect(financeSectionFor(undefined, everything)?.label).toBe("Overview");
  });

  it("answers null for a section this person may not open — the same answer as a slug that does not exist", () => {
    /* Deliberately indistinguishable. "You may not see this" and "there is no
       such page" leak differently, and the second leaks less. */
    expect(financeSectionFor("payroll", allowing("billing.view"))).toBeNull();
    expect(financeSectionFor("nonsense", everything)).toBeNull();
  });

  it("has no duplicate slugs, so a URL names one page", () => {
    const slugs = FINANCE_SECTIONS.map((s) => s.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });
});
