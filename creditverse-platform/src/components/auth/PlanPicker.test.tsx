import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

vi.mock("@/lib/data/plans", () => ({
  fetchPublicPlans: async () => [
    { key: "creditops", label: "CreditOps", products: ["creditOps"], trialDays: 30 },
    { key: "growth", label: "CreditOps + FundingOps", products: ["creditOps", "fundingOps", "workspaces"], trialDays: 30 },
  ],
}));
const { PlanPicker } = await import("./PlanPicker");

describe("PlanPicker", () => {
  it("lists the public plans from data with their products and trial length", async () => {
    const qc = new QueryClient();
    render(<QueryClientProvider client={qc}><PlanPicker value="creditops" onChange={() => {}} /></QueryClientProvider>);
    await waitFor(() => expect(screen.getAllByRole("radio")).toHaveLength(2));
    const [first, second] = screen.getAllByRole("radio");
    expect(first.textContent).toMatch(/^CreditOps/);
    expect(first.getAttribute("aria-checked")).toBe("true");
    expect(second.textContent).toMatch(/CreditOps \+ FundingOps/);
    expect(second.getAttribute("aria-checked")).toBe("false");
    expect(screen.getByText(/Custom Workspaces/)).toBeTruthy();
    expect(screen.getAllByText(/30-day trial/).length).toBe(2);
  });
});
