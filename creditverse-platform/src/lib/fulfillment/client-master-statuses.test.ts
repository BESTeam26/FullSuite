/**
 * The Credit Status list is Dee's, and it is short.
 *
 * Dee: "I have a very simple Status list I have reiterated to you before.
 * This is not the long list. Credit Status only is for the general Dispute
 * Status of the client. Support and Bureau Calling and QA are not part of
 * these."
 *
 * I had derived it from the whole `fulfillment_client_status` enum, which is a
 * union of every department's states plus legacy values — so the dropdown
 * offered Ready for QA, Monitoring Issue, Graduated and Archived. These tests
 * pin the list to the Status Guide's `dispute` category, which is where Dee's
 * vocabulary was already written down.
 */
import { describe, expect, it } from "vitest";
import { creditStatuses, creditStatusOptionsFor } from "@/lib/fulfillment/department-domain";
import { Constants } from "@/lib/supabase/database.types";

const ENUM = Constants.public.Enums.fulfillment_client_status;
const list = creditStatuses(ENUM);

describe("what Credit Status offers", () => {
  it("is Dee's dispute list, in the workflow's own order", () => {
    expect(list).toEqual([
      "NEW ONBOARDING",
      "INCOMPLETE ONBOARDING",
      "Ready for Round 1",
      "Ready for Processing",
      "Round Sent - Awaiting Results",
      "Ready for Reimport / Review",
      "Waiting for Partner Approval",
      "Completed",
    ]);
  });

  it("contains the four values 0188 restored", () => {
    for (const s of ["Ready for Round 1", "Round Sent - Awaiting Results",
                     "Ready for Reimport / Review", "Waiting for Partner Approval"]) {
      expect(list, s).toContain(s);
    }
  });

  it("excludes QA, Support and Bureau Calling — they are departments", () => {
    for (const s of ["Ready for QA", "SUPPORT NEW", "SUPPORT RESOLVED",
                     "BC NEEDED", "BC IN PROGRESS", "BC COMPLETED",
                     "LETTERS MAILED", "CFPB FILED"]) {
      expect(list, s).not.toContain(s);
    }
  });

  it("excludes archiving — that is the Lifecycle control's job", () => {
    expect(list).not.toContain("Archived");
    expect(list).not.toContain("Graduated");
  });

  it("is eight long, not thirty-three", () => {
    expect(list).toHaveLength(8);
    expect(ENUM.length).toBeGreaterThan(30);
  });

  it("maps the guide's uppercase codes onto the labels the column stores", () => {
    /* The guide writes "READY FOR ROUND 1"; the column holds "Ready for
       Round 1". Matching case-sensitively would silently drop half the list. */
    expect(list).toContain("Ready for Round 1");
    expect(list).not.toContain("READY FOR ROUND 1");
  });
});

describe("a record whose value predates the list", () => {
  it("still offers what the record actually says", () => {
    /* Dee's screenshot showed "Onboarding" — a legacy value not in the
       dispute list. A dropdown that omits it looks as if it already changed
       it. */
    const options = creditStatusOptionsFor("Onboarding", ENUM);
    expect(options[0]).toBe("Onboarding");
    expect(options).toHaveLength(list.length + 1);
  });

  it("does not duplicate a value that IS in the list", () => {
    expect(creditStatusOptionsFor("Completed", ENUM)).toEqual(list);
  });

  it("handles a client with no status at all", () => {
    expect(creditStatusOptionsFor(null, ENUM)).toEqual(list);
  });
});
