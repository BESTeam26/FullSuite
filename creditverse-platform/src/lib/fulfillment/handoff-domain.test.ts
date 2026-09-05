import { describe, expect, it } from "vitest";
import { canReturnToFundingOps, canSendToCreditOps } from "./handoff-domain";

const base = { fundingStatus: "Onboarding", linkedFulfillmentClientId: null, creditOpsEntitled: true, fundingOpsEntitled: true };

describe("funding readiness hand-off rules", () => {
  it("sends only early-stage funding clients, only when CreditOps is entitled", () => {
    expect(canSendToCreditOps(base).allowed).toBe(true);
    expect(canSendToCreditOps({ ...base, fundingStatus: "Submitted" }).allowed).toBe(false);
    expect(canSendToCreditOps({ ...base, creditOpsEntitled: false }).allowed).toBe(false);
    expect(canSendToCreditOps({ ...base, fundingStatus: "Credit Readiness" }).allowed).toBe(false);
  });
  it("returns only linked clients that are in credit readiness", () => {
    expect(canReturnToFundingOps({ ...base, fundingStatus: "Credit Readiness", linkedFulfillmentClientId: "fc" }).allowed).toBe(true);
    expect(canReturnToFundingOps({ ...base, fundingStatus: "Credit Readiness" }).allowed).toBe(false);
    expect(canReturnToFundingOps({ ...base, fundingStatus: "Onboarding", linkedFulfillmentClientId: "fc" }).allowed).toBe(false);
    expect(canReturnToFundingOps({ ...base, fundingStatus: "Credit Readiness", linkedFulfillmentClientId: "fc", fundingOpsEntitled: false }).allowed).toBe(false);
  });
});
