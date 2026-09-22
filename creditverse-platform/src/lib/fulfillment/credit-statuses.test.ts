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
  /* Extended 2026-09-20 to Dee's GHL pipeline. The original ten are all still
     here; four of them ARE pipeline stages under the names the system locked,
     and are not repeated under Dee's wording. */
  it("is the GHL pipeline, in Dee's order, with the locked names kept", () => {
    expect([...CREDIT_STATUSES]).toEqual([
      "New Client",
      "Incomplete Onboarding",
      "Ready for Round 1",
      "Ready for Processing",
      "Prio Processing",
      "Round 1 Sent", "Round 2 Sent", "Round 3 Sent", "Round 4 Sent",
      "Round 5 Sent", "Round 6 Sent", "Round 7 Sent", "Round 8 Sent",
      "Round 9 Sent", "Round 10 Sent", "Round 11 Sent", "Round 12 Sent",
      "CMS Issue 1", "CMS Issue 2", "CMS Issue 3",
      "Results Available for Review",
      "For Complaints",
      "On Hold (Non Workable)",
      "For Partner Confirmation",
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

  it("keeps Dee's spelling exactly, parenthesis and all", () => {
    expect(CREDIT_STATUSES).toContain("On Hold (Non Workable)");
    /* Not the tidier variants that already exist in the enum. The reimport
       pair used to be here too; Dee retired her own spelling of it on
       2026-09-22 as a duplicate, so neither is offered now. */
    expect(CREDIT_STATUSES).not.toContain("Ready for Reimport / Review");
    expect(CREDIT_STATUSES).not.toContain("Ready For Reimport/ Credit Update");
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

  /* It was ten until the GHL pipeline landed. The point of the check never
     was the number ten — it was that the list is a PRODUCT DECISION and not
     the enum, which still carries every legacy value the ClickUp and GHL
     imports left behind. */
  it("is Dee's chosen pipeline, not the whole enum", () => {
    expect(CREDIT_STATUSES.length).toBeLessThan(ENUM.length);
    const offered = new Set(CREDIT_STATUSES);
    /* Legacy values the enum accepts and the pipeline deliberately does not. */
    for (const legacy of ["NEW ONBOARDING", "INCOMPLETE ONBOARDING", "LETTERS MAILED",
                          "BC NEEDED", "SUPPORT NEW", "In Processing", "Onboarding"]) {
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
    expect(CREDIT_STATUSES.includes("Results Available for Review")).toBe(true);
  });

  it("leaves the twelve numbered rounds as the only in-flight stages", () => {
    const rounds = CREDIT_STATUSES.filter((s) => /^Round \d+ Sent$/.test(s));
    expect(rounds).toHaveLength(12);
    expect(rounds[0]).toBe("Round 1 Sent");
  });
});
