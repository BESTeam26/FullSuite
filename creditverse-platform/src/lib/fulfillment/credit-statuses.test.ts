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
import {
  CREDIT_STATUSES, creditStatusOptionsFor, departmentStatuses, roundFromStatus,
} from "@/lib/fulfillment/department-domain";
import { Constants } from "@/lib/supabase/database.types";

const ENUM: readonly string[] = Constants.public.Enums.fulfillment_client_status;

describe("Dee's credit status list", () => {
  /* Dee gave the whole list on 2026-09-22 rather than corrections to it:
     "Clear Status that reflect the actual workflow." Four groups, in this
     order — getting them in, the twelve rounds, not workable, no longer
     active. This is a PRODUCT DECISION, so it is pinned literally. */
  it("is Dee's workflow, in her order and her words", () => {
    expect([...CREDIT_STATUSES]).toEqual([
      "New Client",
      "Incomplete Onboarding",
      "Ready for Round 1",
      "Ready for Processing",
      "Prio Processing",
      "Round 1 Sent", "Round 2 Sent", "Round 3 Sent", "Round 4 Sent",
      "Round 5 Sent", "Round 6 Sent", "Round 7 Sent", "Round 8 Sent",
      "Round 9 Sent", "Round 10 Sent", "Round 11 Sent", "Round 12 Sent",
      "Ready for Credit Review",
      "Monitoring Issue 1", "Monitoring Issue 2", "Monitoring Issue 3",
      "Outsourcing - Unpaid",
      "For Partner Confirmation",
      "Non Workable",
      "Program Completed",
      "Graduated",
      "Inactive / Canceled",
    ]);
  });

  it("keeps Dee's four already-locked stages under their locked names, not a second spelling", () => {
    /* Dee wrote these; the system already had them. Adding her wording as
       well would split one pipeline stage across two values. */
    for (const duplicate of ["New Client Onboarded", "Round 1 Ready"]) {
      expect(CREDIT_STATUSES, duplicate).not.toContain(duplicate);
    }
    for (const kept of ["New Client", "Ready for Round 1", "Incomplete Onboarding", "Ready for Processing"]) {
      expect(CREDIT_STATUSES, kept).toContain(kept);
    }
  });

  /* Dee, 2026-09-23: "should agents be able to set Prio Processing by hand? —
     YES." It is offered again, and this pins the REASON so nobody culls it a
     second time as a leftover: it is live, it routes to Dispute exactly as
     Ready for Processing does, it carries a 24-hour SLA instead of 72, the
     sweep escalates into it after five unresolved days, and assignment hands
     these out before anything else. */
  it("offers Prio Processing, beside the ordinary processing stage", () => {
    expect(CREDIT_STATUSES).toContain("Prio Processing");
    expect(CREDIT_STATUSES.indexOf("Prio Processing"))
      .toBe(CREDIT_STATUSES.indexOf("Ready for Processing") + 1);
    expect(ENUM, "the database must accept it").toContain("Prio Processing");
  });

  it("runs the rounds from 1 to 12 with none missing", () => {
    const rounds = CREDIT_STATUSES.map(roundFromStatus).filter((n): n is number => n !== null);
    expect(rounds).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
  });

  it("reads the round out of the stage, and out of nothing else", () => {
    expect(roundFromStatus("Round 7 Sent")).toBe(7);
    expect(roundFromStatus("Round 12 Sent")).toBe(12);
    /* Not a stage that merely mentions a round. */
    expect(roundFromStatus("Ready for Round 1")).toBeNull();
    expect(roundFromStatus("Round Sent - Awaiting Results")).toBeNull();
    expect(roundFromStatus(null)).toBeNull();
  });

  it("every value is one the database will actually accept", () => {
    /* The whole point of this file. A value the dropdown offers and the enum
       refuses is a control that fails when somebody uses it. */
    for (const s of CREDIT_STATUSES) {
      expect(ENUM, `"${s}" is not a fulfillment_client_status value`).toContain(s);
    }
  });

  it("drops every older spelling of a state that now has one name", () => {
    /* All of these were renamed or retired on 2026-09-22. They remain in the
       database type for the records that hold them; none is offered. */
    for (const old of ["On Hold (Non Workable)", "CMS Issue 1", "CMS Issue 2", "CMS Issue 3",
                       "Results Available for Review", "Completed", "Archived",
                       "Ready for Reimport / Review", "Ready For Reimport/ Credit Update",
                       "Waiting for Partner Approval", "For Complaints"]) {
      expect(CREDIT_STATUSES, old).not.toContain(old);
    }
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

  it("offers no QA and none of the legacy one-word states", () => {
    /* Graduated moved the other way on 2026-09-22 — it is now one of the
       three archive states Dee named, so it IS offered. */
    for (const s of ["Ready for QA", "Archived", "Monitoring Issue", "Attention", "In Dispute"]) {
      expect(CREDIT_STATUSES, s).not.toContain(s);
    }
    expect(CREDIT_STATUSES).toContain("Graduated");
  });

  /* It was ten until the GHL pipeline landed. The point of the check never
     was the number ten — it was that the list is a PRODUCT DECISION and not
     the enum, which still carries every legacy value the ClickUp and GHL
     imports left behind. */
  it("is Dee's chosen pipeline, not the whole enum", () => {
    expect(CREDIT_STATUSES.length).toBeLessThan(ENUM.length);
    const offered = new Set(CREDIT_STATUSES);
    /* Legacy values the enum accepts and the pipeline deliberately does not. */
    for (const legacy of ["NEW ONBOARDING", "INCOMPLETE ONBOARDING", "LETTERS MAILED",
                          "BUREAU CALLING NEEDED", "SUPPORT NEW", "In Processing", "Onboarding"]) {
      expect(offered.has(legacy), legacy).toBe(false);
    }
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

/**
 * The round follows the stage (Dee, 2026-09-20).
 *
 * The database enforces it on every write; these check the rule the UI reads
 * to decide whether the round is still the agent's to choose. A control that
 * offers a choice the database then discards is worse than no control.
 */
describe("the round follows the stage", () => {
  it("every numbered stage governs its own round", () => {
    for (let n = 1; n <= 12; n += 1) {
      expect(roundFromStatus(`Round ${n} Sent`)).toBe(n);
    }
  });

  it("leaves the round alone for every stage that names none", () => {
    const governing = new Set(Array.from({ length: 12 }, (_, i) => `Round ${i + 1} Sent`));
    for (const s of CREDIT_STATUSES) {
      if (governing.has(s)) continue;
      expect(roundFromStatus(s), `"${s}" must not govern the round`).toBeNull();
    }
  });

  it("does not govern the round for a client in Support or Complaints", () => {
    /* The point of keeping the round: a client on round 2 whose results came
       back is still on round 2 while somebody reads them. */
    for (const s of ["Results Available for Review", "CMS Issue 2", "For Complaints",
                     "Ready For Reimport/ Credit Update", "On Hold (Non Workable)"]) {
      expect(roundFromStatus(s), s).toBeNull();
    }
  });
});

describe("the three redundant statuses Dee retired (2026-09-22)", () => {
  /* "In dispute Mailed and round sent awaiting results are the same, I need
     only the Actual Round 1-10 Sent… Delete Ready for reimport/ Credit update
     as this is duplicate." */
  const retired = ["In Dispute Mailed", "Round Sent - Awaiting Results",
                   "Ready For Reimport/ Credit Update"];

  it("are no longer offered", () => {
    for (const s of retired) expect(CREDIT_STATUSES).not.toContain(s);
  });

  it("but still read back for a record that holds one", () => {
    /* Dropped from the list, not from the database type. A dropdown that does
       not contain what the record says is a dropdown that appears to have
       already changed it (rule 11). */
    for (const s of retired) expect(creditStatusOptionsFor(s)[0]).toBe(s);
  });

  it("and the one that is NOT a duplicate survives", () => {
    /* "Ready for Reimport / Review" — spaces around the slash, two live
       clients on it — is a different status and was not touched. */
    expect(creditStatusOptionsFor(null)).not.toContain("Ready For Reimport/ Credit Update");
    /* It survived the cull and was then renamed, on 2026-09-22, to the words
       Dee actually uses. */
    expect(CREDIT_STATUSES.includes("Ready for Credit Review")).toBe(true);
  });

  it("leaves the twelve numbered rounds as the only in-flight stages", () => {
    const rounds = CREDIT_STATUSES.filter((s) => /^Round \d+ Sent$/.test(s));
    expect(rounds).toHaveLength(12);
    expect(rounds[0]).toBe("Round 1 Sent");
  });
});
