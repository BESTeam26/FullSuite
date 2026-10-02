/**
 * The partner's Billing page against PARTNER_PORTAL_DOCTRINE.md (Dee,
 * 2026-10-01): open invoices · paid invoices · payment method · AutoPay ·
 * receipts · billing contact · past due notice.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { PortalBilling } from "./PortalBilling";

vi.setConfig({ testTimeout: 30_000 });
afterEach(cleanup);

vi.mock("@/lib/auth/auth-context", () => ({ useAuth: () => ({ mode: "live", status: "signed-in", user: { id: "u1" } }) }));
vi.mock("@/components/billing/PayInvoicePanel", () => ({ PayInvoicePanel: () => null }));

const state = vi.hoisted(() => ({ overdueCents: 2500, suspended: false, autopay: false }));
vi.mock("@/lib/data/portal-billing", () => ({
  creditUnitLabel: (u: string) => u,
  fetchPortalBilling: async () => ({
    groupId: "g1", partnerName: "Acme Fulfilment", balanceCents: 7500, overdueCents: state.overdueCents,
    overdueInvoices: state.overdueCents > 0 ? 1 : 0, nextBillingOn: null, nextBillingCents: 0,
    paymentMethods: "Wise", suspended: state.suspended, suspendedAt: null, suspensionDetail: null,
  }),
  fetchPortalInvoices: async () => [
    { id: "i1", invoiceNumber: "INV-0001", issueDate: "2026-09-01", dueDate: "2026-09-15", currency: "USD",
      totalCents: 2500, amountPaidCents: 0, balanceCents: 2500, status: "overdue", periodKey: null, notes: null },
    { id: "i2", invoiceNumber: "INV-0002", issueDate: "2026-09-20", dueDate: "2026-10-20", currency: "USD",
      totalCents: 5000, amountPaidCents: 0, balanceCents: 5000, status: "sent", periodKey: null, notes: null },
    { id: "i3", invoiceNumber: "INV-0000", issueDate: "2026-08-01", dueDate: "2026-08-15", currency: "USD",
      totalCents: 4000, amountPaidCents: 4000, balanceCents: 0, status: "paid", periodKey: null, notes: null },
  ],
  fetchPortalPayments: async () => [
    { id: "p1", paidOn: "2026-08-10", amountCents: 4000, currency: "USD", method: "Wise", reference: "REF-9", invoiceNumber: "INV-0000", status: "succeeded" },
  ],
  fetchPortalBillingContact: async () => ({ name: "Kaori Tan", email: "billing@acme.example" }),
  fetchPortalAccountCredit: async () => null,
  fetchPortalPaymentMethods: async () => (state.autopay ? [{ method: "authorize_net_autopay", label: "AutoPay", instructions: null, payUrl: null }] : []),
  fetchPortalProcessingCredits: async () => [],
}));

const mount = () => render(<QueryClientProvider client={new QueryClient()}><PortalBilling /></QueryClientProvider>);

describe("the partner's Billing page", () => {
  it("says plainly when something is past due, before any suspension", async () => {
    state.overdueCents = 2500; state.suspended = false;
    mount();
    expect(await screen.findByText(/Past due:/)).toBeInTheDocument();
  });

  it("shows no past-due notice when nothing is late", async () => {
    state.overdueCents = 0; state.suspended = false;
    mount();
    await screen.findByText("Open invoices");
    expect(screen.queryByText(/Past due:/)).not.toBeInTheDocument();
  });

  it("lists open invoices (soonest due first) apart from paid ones", async () => {
    state.overdueCents = 2500;
    mount();
    const open = (await screen.findByText("Open invoices")).closest("section") as HTMLElement;
    const openNumbers = within(open).getAllByText(/^INV-\d+$/).map((n) => n.textContent);
    expect(openNumbers).toEqual(["INV-0001", "INV-0002"]);
    const paid = (await screen.findByText("Paid invoices")).closest("section") as HTMLElement;
    expect(within(paid).getByText("INV-0000")).toBeInTheDocument();
    expect(within(paid).queryByRole("button", { name: "Pay" })).not.toBeInTheDocument();
  });

  it("states AutoPay on the payment-method card", async () => {
    state.autopay = true;
    mount();
    expect(await screen.findByText(/AutoPay on/)).toBeInTheDocument();
    state.autopay = false;
  });

  it("opens a receipt for a payment, from that payment's own record", async () => {
    mount();
    fireEvent.click(await screen.findByRole("button", { name: /payments/i }));
    fireEvent.click(await screen.findByRole("button", { name: "Receipt" }));
    const receipt = await screen.findByRole("dialog", { name: "Payment receipt" });
    expect(within(receipt).getByText("Acme Fulfilment")).toBeInTheDocument();
    expect(within(receipt).getByText("REF-9")).toBeInTheDocument();
    expect(within(receipt).getByRole("button", { name: /Print/ })).toBeInTheDocument();
  });

  it("names the billing contact in Billing settings", async () => {
    mount();
    fireEvent.click(await screen.findByRole("button", { name: /Billing settings/i }));
    expect(await screen.findByText(/billing@acme\.example/)).toBeInTheDocument();
  });
});
