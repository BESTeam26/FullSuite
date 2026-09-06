import { describe, expect, it } from "vitest";
import {
  REQUEST_STATUS_ORDER,
  isOutstanding,
  nextStatuses,
  transitionAllowed,
  type RequestStatus,
} from "./stipulation-lifecycle";

/**
 * These assertions mirror `document_request_transition_allowed()` in migration
 * 0113 exactly. If the database rule changes, this test is the thing that has
 * to change with it — which is the point of writing it down twice.
 */
describe("stipulation lifecycle", () => {
  it("walks the happy path in order and no further", () => {
    for (let i = 0; i < REQUEST_STATUS_ORDER.length - 1; i++) {
      expect(transitionAllowed(REQUEST_STATUS_ORDER[i], REQUEST_STATUS_ORDER[i + 1])).toBe(true);
    }
  });

  it("never lets a requirement skip to satisfied", () => {
    const notSubmitted: RequestStatus[] = ["open", "assigned", "waiting_on_client", "received", "under_review"];
    for (const s of notSubmitted) expect(transitionAllowed(s, "satisfied")).toBe(false);
    /* Only the lender having it and accepting it satisfies a stipulation. */
    expect(transitionAllowed("submitted_to_lender", "satisfied")).toBe(true);
  });

  it("lets real work go backwards where real work goes backwards", () => {
    expect(transitionAllowed("under_review", "waiting_on_client")).toBe(true);
    expect(transitionAllowed("submitted_to_lender", "under_review")).toBe(true);
    expect(transitionAllowed("received", "waiting_on_client")).toBe(true);
  });

  it("treats satisfied as terminal", () => {
    expect(nextStatuses("satisfied")).toEqual([]);
    for (const s of REQUEST_STATUS_ORDER) expect(transitionAllowed("satisfied", s)).toBe(false);
    expect(transitionAllowed("satisfied", "waived")).toBe(false);
  });

  it("offers waive from every live state, and only un-waives to Requested", () => {
    for (const s of REQUEST_STATUS_ORDER.filter((x) => x !== "satisfied")) {
      expect(nextStatuses(s)).toContain("waived");
    }
    expect(nextStatuses("waived")).toEqual(["open"]);
  });

  it("never offers a transition to itself", () => {
    for (const s of [...REQUEST_STATUS_ORDER, "waived" as RequestStatus]) {
      expect(transitionAllowed(s, s)).toBe(false);
      expect(nextStatuses(s)).not.toContain(s);
    }
  });

  it("counts only work still to be done as outstanding", () => {
    expect(isOutstanding("open")).toBe(true);
    expect(isOutstanding("submitted_to_lender")).toBe(true);
    expect(isOutstanding("satisfied")).toBe(false);
    expect(isOutstanding("waived")).toBe(false);
  });
});
