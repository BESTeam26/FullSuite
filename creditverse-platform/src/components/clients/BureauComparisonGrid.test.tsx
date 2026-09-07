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

/**
 * S-15 and S-16. A public record is not a tradeline and an enquiry is not
 * either — so neither shows a tradeline's field list, and neither shows a
 * payment-history block that would imply it ought to have one.
 */
describe("BureauComparisonGrid — public records", () => {
  const record: BureauValueInput[] = [
    {
      bureau: "TU", account_type: "Chapter 7 Bankruptcy", status: "Discharged",
      filed_on: "04/2019", date_closed: "09/2019", reference_number: "19-40771",
      court: "US BKPT CT OH FERNDALE", liability_cents: 4120000,
      asset_cents: 200000, exempt_cents: 200000,
    },
    { bureau: "EX", account_type: "Chapter 7 Bankruptcy", status: "Discharged", court: "U.S. Bankruptcy Court" },
  ];

  it("shows a record's own fields", () => {
    render(<BureauComparisonGrid values={record} kind="Public Record" />);
    for (const label of ["Type", "Status", "Date Filed / Reported", "Closing Date", "Reference #", "Court", "Liability", "Asset Amount", "Exempt Amount"]) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
  });

  it("shows none of a tradeline's fields", () => {
    render(<BureauComparisonGrid values={record} kind="Public Record" />);
    for (const label of ["Balance", "Credit Limit", "Past Due", "Monthly Payment", "Account Number", "Payment Status"]) {
      expect(screen.queryByText(label)).not.toBeInTheDocument();
    }
  });

  it("shows no payment-history block", () => {
    render(<BureauComparisonGrid values={record} kind="Public Record" />);
    expect(screen.queryByText("Payment history")).not.toBeInTheDocument();
  });

  /* Two bureaus wording the same court differently is a fact, and the grid
     marks it as a difference rather than picking one. */
  it("marks each bureau's own wording as a difference, not a merge", () => {
    render(<BureauComparisonGrid values={record} kind="Public Record" />);
    const courtRow = screen.getByText("Court").closest("tr")!;
    expect(courtRow.textContent).toContain("US BKPT CT OH FERNDALE");
    expect(courtRow.textContent).toContain("U.S. Bankruptcy Court");
    expect(courtRow.className).toMatch(/amber/);
  });

  it("shows a dash where a bureau stated no figure — never a zero", () => {
    render(<BureauComparisonGrid values={record} kind="Public Record" />);
    expect(screen.getByText("Liability").closest("tr")!.textContent).toContain("—");
  });
});

describe("BureauComparisonGrid — inquiries", () => {
  const inquiry: BureauValueInput[] = [{ bureau: "TU", inquiry_date: "11/04/2025" }];

  it("shows the enquiry's date", () => {
    render(<BureauComparisonGrid values={inquiry} kind="Inquiry" />);
    expect(screen.getByText("Date of Inquiry").closest("tr")!.textContent).toContain("11/04/2025");
  });

  /* THE REFUSAL, on screen. The source does not state the type, so the cell is
     a dash — never "Hard" inferred from the subscriber or the date. */
  it("shows the inquiry type as unknown, never inferred", () => {
    render(<BureauComparisonGrid values={inquiry} kind="Inquiry" />);
    const row = screen.getByText("Inquiry Type").closest("tr")!;
    expect(row.textContent).toContain("—");
    expect(row.textContent).not.toMatch(/hard|soft|promotional|review/i);
  });

  it("shows the type when the source does state it", () => {
    render(<BureauComparisonGrid values={[{ bureau: "TU", inquiry_type: "Hard" }]} kind="Inquiry" />);
    expect(screen.getByText("Inquiry Type").closest("tr")!.textContent).toContain("Hard");
  });

  it("shows none of a tradeline's fields", () => {
    render(<BureauComparisonGrid values={inquiry} kind="Inquiry" />);
    for (const label of ["Balance", "Account Status", "Payment history"]) {
      expect(screen.queryByText(label)).not.toBeInTheDocument();
    }
  });
});
