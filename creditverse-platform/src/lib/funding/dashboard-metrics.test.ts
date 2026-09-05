import { describe, expect, it } from "vitest";
import type { QueueFile } from "./action-queues";
import { activeLenders, filesByStage, formatCompactMoney, fundedInMonth, lenderDistribution, totalApproved, totalRequested } from "./dashboard-metrics";

const file = (id: string, over: Partial<QueueFile> = {}): QueueFile => ({ id, stage: "Lender Selection", secondaryStatus: "Active Funding", waitingOn: "Internal Team", lastActivityAt: "2026-09-01T00:00:00Z", assignedAgentId: null, assignedAgentName: null, openRequests: 0, offersAwaitingReview: 0, closingStatus: null, requestedAmount: 100_000, ...over });

describe("dashboard metrics", () => {
  it("sums requested only over active files and approved only over open or accepted offers", () => {
    expect(totalRequested([file("a"), file("b", { requestedAmount: 250_000 }), file("z", { secondaryStatus: "Closed", requestedAmount: 999 })])).toBe(350_000);
    expect(totalApproved([{ fileId: "a", status: "presented", amount: 80_000 }, { fileId: "a", status: "expired", amount: 50_000 }, { fileId: "b", status: "client_accepted", amount: null }])).toBe(80_000);
  });
  it("counts funded gross in the current month only", () => {
    const now = new Date("2026-09-15T00:00:00Z");
    expect(fundedInMonth([{ gross: 240_000, fundedAt: "2026-09-02T00:00:00Z" }, { gross: 100_000, fundedAt: "2026-08-30T00:00:00Z" }], now)).toBe(240_000);
  });
  it("lays files on the 17-stage spine and distributes open submissions per lender in operational order", () => {
    const stages = filesByStage([file("a"), file("b", { stage: "Offer Received" }), file("z", { secondaryStatus: "Lender Declined" })]);
    expect(stages.length).toBe(17);
    expect(stages.find((s) => s.stage === "Lender Selection")?.count).toBe(1);
    expect(stages.reduce((n, s) => n + s.count, 0)).toBe(2);
    const subs = [{ fileId: "a", lender: "Apex", status: "Submitted" }, { fileId: "b", lender: "Apex", status: "In Review" }, { fileId: "c", lender: "Beacon", status: "Declined" }, { fileId: "d", lender: "Summit", status: "Offer Received" }];
    expect(lenderDistribution(subs)).toEqual([{ lender: "Apex", count: 2 }, { lender: "Summit", count: 1 }]);
    expect(activeLenders(subs)).toBe(2);
  });
  it("formats compact money the way the tiles show it", () => {
    expect(formatCompactMoney(2_210_000)).toBe("$2.21M");
    expect(formatCompactMoney(240_000)).toBe("$240,000");
    expect(formatCompactMoney(0)).toBe("$0");
  });
});
