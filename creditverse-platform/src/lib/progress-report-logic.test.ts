import { describe, it, expect } from "vitest";
import {
  generateProgressUpdate,
  sampleProgressReport,
  fmtMoney,
  type ProgressReportData,
} from "./progress-report-logic";

const clone = (d: ProgressReportData): ProgressReportData => JSON.parse(JSON.stringify(d));

describe("generateProgressUpdate (sample report)", () => {
  const out = generateProgressUpdate(sampleProgressReport);
  const s = out.sections;

  it("reports per-bureau score movement with signed deltas", () => {
    expect(s.scoreMovement.split("\n")).toEqual([
      "Equifax: 716 → 733 (+17)",
      "Experian: 672 → 684 (+12)",
      "TransUnion: 692 → 705 (+13)",
    ]);
  });

  it("lists only Deleted and Positive rows as confirmed deletions", () => {
    const lines = s.deletionsConfirmed.split("\n");
    expect(lines).toHaveLength(9); // 4 EQ positive + 2 EX deleted + 3 TU deleted
    expect(lines).toContain("• Capital One — Equifax: Updated to positive standing");
    expect(lines).toContain("• Employers — AC Kelly Production — Experian: Removed from report");
    expect(s.deletionsConfirmed).not.toContain("FB&T/Mercury");
  });

  it("lists newly added items with their bureau and category", () => {
    const lines = s.newlyAdded.split("\n");
    expect(lines).toHaveLength(4);
    expect(lines[0]).toBe(
      "• Previous Address — PO Box 1521, Lawrenceville GA — Experian (PERSONAL Information)",
    );
  });

  it("formats utilization with money values and the prior percentage", () => {
    expect(s.utilization).toContain("Blended average usage: 9%");
    expect(s.utilization).toContain(
      "Equifax: using 27% of $11,050.00 available (balance $2,939.00, previous 25%)",
    );
  });

  it("lists the five FICO factors in weight order", () => {
    const lines = s.ficoFactors.split("\n");
    expect(lines).toHaveLength(5);
    expect(lines[0]).toBe("35% — Payment History");
    expect(lines[4]).toBe("10% — Applying for New Credit");
  });

  it("writes an upbeat summary when every bureau rose", () => {
    expect(s.overallSummary).toContain("5 items came off or were corrected");
    expect(s.overallSummary).toContain("32 disputes remain open");
    expect(s.overallSummary).not.toContain("not every bureau moved the same amount");
    expect(s.clientFacingSummary.startsWith("Hi Kevin, here is where things stand as of Aug 29th, 2026.")).toBe(true);
    expect(s.clientFacingSummary).toContain("Great progress this round.");
  });

  it("computes grand totals for the affiliate summary", () => {
    expect(s.affiliateSummary).toContain("Deleted/updated this round: 5 (grand total 6)");
    expect(s.affiliateSummary).toContain("Disputes on-going: 32 (grand total 56)");
    expect(s.affiliateSummary).toContain("Un-disputed negative remaining: 19");
  });

  it("builds the SMS and assembles the full text in section order", () => {
    expect(s.clientSms).toContain("Hi Kevin!");
    expect(s.clientSms).toContain("August 2026");
    expect(s.clientSms).toContain("5 items resolved");
    expect(s.heading).toBe("📊 Credit Progress Update – August 2026");
    expect(s.signOff).toBe("Client Success Team");

    expect(out.full.startsWith(s.heading)).toBe(true);
    expect(out.full.endsWith(s.signOff)).toBe(true);
    const order = ["📊 Score Movement", "Deletions Confirmed", "Newly Added Items", "Credit Utilization", "FICO Factors", "Overall Summary", "Client-Facing Summary", "Affiliate Summary", "Client SMS Update"];
    const positions = order.map((h) => out.full.indexOf(h));
    expect(positions.every((p) => p >= 0)).toBe(true);
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
  });
});

describe("generateProgressUpdate (edge cases)", () => {
  it("uses singular wording and a softer tone when a bureau dropped", () => {
    const d = clone(sampleProgressReport);
    d.totals.deletedThisRound = 1;
    d.totals.newItemsAddedThisRound = 1;
    d.bureaus[1].score = 660; // Experian falls from 672
    const s = generateProgressUpdate(d).sections;
    expect(s.scoreMovement).toContain("Experian: 672 → 660 (-12)");
    expect(s.overallSummary).toContain("1 item came off");
    expect(s.overallSummary).toContain("1 new item appeared");
    expect(s.overallSummary).toContain("not every bureau moved the same amount");
    expect(s.clientFacingSummary).toContain("Solid, steady progress this round.");
    expect(s.clientSms).toContain("1 item resolved");
  });

  it("falls back to explicit 'none' sentences when there are no deletions or new items", () => {
    const d = clone(sampleProgressReport);
    d.bureaus.forEach((b) => {
      b.deletionRows = b.deletionRows.filter((r) => r.status === "Negative");
      b.newDisputeRows = [];
    });
    const s = generateProgressUpdate(d).sections;
    expect(s.deletionsConfirmed).toBe("No confirmed deletions were recorded this round.");
    expect(s.newlyAdded).toBe("No new negative items appeared on this round's report.");
  });
});

describe("fmtMoney", () => {
  it("formats with a dollar sign, thousands separator and two decimals", () => {
    expect(fmtMoney(1234.5)).toBe("$1,234.50");
    expect(fmtMoney(0)).toBe("$0.00");
  });
});
