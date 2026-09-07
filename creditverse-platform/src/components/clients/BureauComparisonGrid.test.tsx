/**
 * The grid's job is to show what each bureau said and nothing more. These
 * tests are mostly about what it must NOT do: merge three values, fill a
 * silence, or attribute a column the source did not attribute.
 */
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { BureauComparisonGrid } from "./BureauComparisonGrid";
import type { BureauValueInput } from "@/lib/credit-report/import-parser";

const values: BureauValueInput[] = [
  {
    bureau: "EX", account_number_masked: "****0002", account_type: "Installment",
    status: "Closed", balance_cents: 303100, responsibility_raw: "Individual",
    dispute_status: "Account not disputed", account_rating: "Paid as agreed",
    creditor_type: "Auto finance", payment_frequency: "Monthly",
    last_verified: "02/2026", account_information_date: "03/2026",
    payment_history: ["2026-03:OK", "2026-01:30"],
  },
  {
    bureau: "TU", account_number_masked: "****0002", account_type: "Installment",
    status: "Closed", balance_cents: 303100,
  },
];

const row = (label: string) => screen.getByText(label).closest("tr")!;

describe("BureauComparisonGrid", () => {
  it("shows only the bureaus that reported the account", () => {
    render(<BureauComparisonGrid values={values} />);
    /* Scoped to the header row: the bureau names also appear as labels above
       each bureau's payment history. */
    const headers = [...screen.getAllByRole("columnheader")].map((h) => h.textContent);
    expect(headers).toEqual(["Field", "Experian", "TransUnion"]);
    expect(headers).not.toContain("Equifax");
  });

  it("shows every field Dee's expanded view lists", () => {
    render(<BureauComparisonGrid values={values} />);
    for (const label of [
      "Account Number", "Account Type", "Account Type Detail", "Responsibility",
      "Account Rating", "Account Status", "Payment Status", "Balance",
      "High Balance", "Credit Limit", "Past Due", "Monthly Payment", "Terms",
      "Date Opened", "Date Closed", "Last Payment", "Last Activity",
      "Last Reported", "Last Verified", "Payment Frequency", "Dispute Status",
      "Creditor Type", "Remarks",
    ]) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
  });

  it("shows the masked account number exactly as each bureau gave it", () => {
    render(<BureauComparisonGrid values={values} />);
    expect(row("Account Number").textContent).toContain("****0002");
  });

  /* A silence is a dash. Not a zero, and not "same as the others". */
  it("shows a dash where a bureau reported nothing", () => {
    render(<BureauComparisonGrid values={values} />);
    expect(row("Past Due").textContent).toContain("—");
    expect(row("Dispute Status").textContent).toContain("Account not disputed");
    expect(row("Dispute Status").textContent).toContain("—");
  });

  it("never merges two bureaus' values into one cell", () => {
    render(<BureauComparisonGrid values={[
      { bureau: "EX", balance_cents: 100000 },
      { bureau: "TU", balance_cents: 250000 },
    ]} />);
    const cells = row("Balance").querySelectorAll("td");
    expect(cells[1].textContent).toBe("$1,000");
    expect(cells[2].textContent).toBe("$2,500");
  });

  /* One value plus a silence is one bureau reporting, not a disagreement. */
  it("does not mark a row as differing when only one bureau spoke", () => {
    render(<BureauComparisonGrid values={values} />);
    expect(row("Last Verified").className).not.toMatch(/amber/);
  });

  it("marks a row where two bureaus said different things", () => {
    render(<BureauComparisonGrid values={[
      { bureau: "EX", status: "Closed" },
      { bureau: "TU", status: "Open" },
    ]} />);
    expect(row("Account Status").className).toMatch(/amber/);
  });

  it("shows payment history with its dates, per bureau", () => {
    render(<BureauComparisonGrid values={values} />);
    expect(screen.getByText(/Mar '26/)).toBeInTheDocument();
    expect(screen.getByText(/Jan '26/)).toBeInTheDocument();
    expect(screen.getByText(/Jan '26 · 30/)).toBeInTheDocument();
  });

  it("says so plainly when a bureau reported no history", () => {
    render(<BureauComparisonGrid values={values} />);
    expect(screen.getByText("No payment history reported.")).toBeInTheDocument();
  });

  /* The refusal that matters most in the UI: unattributed columns are shown
     as the source printed them, and assigned to nobody. */
  it("shows unattributed source columns without assigning them to a bureau", () => {
    render(<BureauComparisonGrid values={[]} sourceColumns={{ balance_cents: ["$4,120", "$4,120", "$3,980"] }} />);
    expect(screen.getByText(/but the source did not say which bureau is which/i)).toBeInTheDocument();
    /* Text nodes are split by JSX, so match on the container's own text. */
    const item = screen.getByText("balance_cents:").closest("li")!;
    expect(item.textContent).toContain("$4,120 · $4,120 · $3,980");
  });

  it("renders with no values at all rather than crashing", () => {
    render(<BureauComparisonGrid values={[]} />);
    expect(screen.getByText("Account Number")).toBeInTheDocument();
  });
});
