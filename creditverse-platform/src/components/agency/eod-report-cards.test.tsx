/**
 * A lead of two scopes sees two documents — and both are the database's.
 *
 * Dee, 2026-09-30: Rowell "is responsible for both: CreditOps Division, BES
 * CRM Division… Do not force his reporting/visibility into only one
 * division because one seat happens to be newer." The hook is mocked to
 * answer with two documents; the card must draw one titled card per scope
 * and never drop, merge or re-add them.
 */
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { EodReportDoc, MyEodReport, EodRoutedReport } from "@/lib/data/use-eod-report";

const doc = (id: string, name: string, total: number): EodReportDoc => ({
  level: "division",
  work_date: "2026-09-30",
  timezone: "America/New_York",
  scope: { id, name, service: null },
  lead: { id: "rowell", name: "Rowell Christian Pena" },
  categories: [{ key: "u", label: "Units", position: 1 }],
  rows: [],
  groups: [],
  totals: { categories: { u: total }, total, members: 0, submitted: 0, not_submitted: 0 },
  attention: [],
  children: [],
  built_at: "2026-09-30T22:00:00Z",
});

const mine: MyEodReport = {
  docs: [doc("crm", "BES CRM", 7), doc("cops", "CreditOps", 41)],
  level: "division",
  stored: true,
  submittedAt: "2026-09-30T22:05:00Z",
  error: null,
  routing: { reason: "executive", toName: "Aaron Gallardo" },
};
const routed: EodRoutedReport[] = [{
  eodId: "e1", employeeId: "daniel", employeeName: "Daniel Charles P. Macasiab",
  level: "department", submittedAt: "2026-09-30T21:00:00Z", error: null,
  docs: [
    { ...doc("cm", "Complaints & Mailing", 5), level: "department" },
    { ...doc("dd", "Dispute Department", 36), level: "department" },
  ],
}];

vi.mock("@/lib/data/use-eod-report", async (orig) => ({
  ...(await orig<typeof import("@/lib/data/use-eod-report")>()),
  useMyEodReport: () => ({ isLoading: false, isError: false, data: mine }),
  useEodReportsRoutedToMe: () => ({ isLoading: false, isError: false, data: routed }),
}));

import { EodReportCard, EodRoutedReportsCard } from "./EodReportCard";

describe("a lead of two scopes", () => {
  it("gets one card per scope, both named, neither dropped", () => {
    render(<EodReportCard date="2026-09-30" />);
    expect(screen.getByText("Division EOD Report — BES CRM")).toBeInTheDocument();
    expect(screen.getByText("Division EOD Report — CreditOps")).toBeInTheDocument();
    /* Each card carries its own document's total, not a merged one. */
    expect(screen.getAllByText("7").length).toBeGreaterThan(0);
    expect(screen.getAllByText("41").length).toBeGreaterThan(0);
    expect(screen.queryByText("48")).not.toBeInTheDocument();
    expect(screen.getAllByText(/Goes to/).length).toBe(2);
  });
});

describe("the reports addressed to me", () => {
  it("draws every document the rung below filed, naming who filed it", () => {
    render(<EodRoutedReportsCard date="2026-09-30" />);
    expect(screen.getByText("Department EOD Report — Complaints & Mailing")).toBeInTheDocument();
    expect(screen.getByText("Department EOD Report — Dispute Department")).toBeInTheDocument();
    expect(screen.getAllByText("Daniel Charles P. Macasiab").length).toBe(2);
  });
});
