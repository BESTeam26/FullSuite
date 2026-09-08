/**
 * The Credit Status list is Dee's, and every value in it must be one the
 * database will accept.
 *
 * I got this list wrong twice by deriving it — first from the whole
 * `fulfillment_client_status` enum (which swept in Ready for QA, Monitoring
 * Issue, Graduated and Archived), then from the Status Guide's `dispute`
 * category (closer, still not it). It is not derivable: it is a product
 * decision, and Dee gave it explicitly.
 *
 * So the list is a literal, and THIS is what stops a literal from rotting: a
 * typo in it fails here rather than producing a dropdown option the database
 * refuses when somebody picks it.
 */
import { describe, expect, it } from "vitest";
import { CREDIT_STATUSES, creditStatusOptionsFor, departmentStatuses } from "@/lib/fulfillment/department-domain";
import { Constants } from "@/lib/supabase/database.types";

const ENUM: readonly string[] = Constants.public.Enums.fulfillment_client_status;

describe("Dee's credit status list", () => {
  it("is exactly the ten Dee gave, in Dee's order", () => {
    expect([...CREDIT_STATUSES]).toEqual([
      "New Client",
      "Incomplete Onboarding",
      "Ready for Round 1",
      "Ready for Processing",
      "Prio Processing",
      "For Complaints",
      "Round Sent - Awaiting Results",
      "Ready For Reimport/ Credit Update",
      "On Hold (Non Workable)",
      "For Partner Confirmation",
    ]);
  });

  it("every value is one the database will actually accept", () => {
    /* The whole point of this file. A value the dropdown offers and the enum
       refuses is a control that fails when somebody uses it. */
    for (const s of CREDIT_STATUSES) {
      expect(ENUM, `"${s}" is not a fulfillment_client_status value`).toContain(s);
    }
  });

  it("keeps Dee's spelling exactly — capital F, unspaced slash, parenthesis", () => {
    expect(CREDIT_STATUSES).toContain("Ready For Reimport/ Credit Update");
    expect(CREDIT_STATUSES).toContain("On Hold (Non Workable)");
    /* Not the tidier variants that already exist in the enum. */
    expect(CREDIT_STATUSES).not.toContain("Ready for Reimport / Review");
    expect(CREDIT_STATUSES).not.toContain("Waiting for Partner Approval");
  });

  it("contains no DEPARTMENT status — those are a different vocabulary", () => {
    const departmental = new Set([
      ...departmentStatuses("Support"),
      ...departmentStatuses("Bureau Calling"),
      ...departmentStatuses("Complaints"),
    ]);
    for (const s of CREDIT_STATUSES) {
      expect(departmental.has(s), `"${s}" is a department status`).toBe(false);
    }
  });

  it("offers no QA, no Graduated and no Archived", () => {
    for (const s of ["Ready for QA", "Graduated", "Archived", "Monitoring Issue", "Attention"]) {
      expect(CREDIT_STATUSES, s).not.toContain(s);
    }
  });

  it("is ten long, not thirty-something", () => {
    expect(CREDIT_STATUSES).toHaveLength(10);
    expect(ENUM.length).toBeGreaterThan(30);
  });
});

describe("a record whose value predates the list", () => {
  it("still offers what the record actually says, first", () => {
    /* Dee's screenshot showed "Onboarding" — a legacy value. A dropdown that
       omits it looks as if it already changed it. */
    const options = creditStatusOptionsFor("Onboarding");
    expect(options[0]).toBe("Onboarding");
    expect(options).toHaveLength(CREDIT_STATUSES.length + 1);
  });

  it("does not duplicate a value that IS on the list", () => {
    expect(creditStatusOptionsFor("Ready for Round 1")).toEqual([...CREDIT_STATUSES]);
  });

  it("handles a client with no status at all", () => {
    expect(creditStatusOptionsFor(null)).toEqual([...CREDIT_STATUSES]);
  });
});
