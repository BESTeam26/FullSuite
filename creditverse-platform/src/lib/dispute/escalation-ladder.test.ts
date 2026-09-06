/**
 * The ladder's whole job is refusing to escalate before the record earns it.
 * These cover the refusals more carefully than the permissions, because a
 * round sent too early is the failure mode that costs a case its credibility.
 */
import { describe, expect, it } from "vitest";
import {
  ESCALATION_LADDER, availableRound, getRound, roundAvailability, type CaseRecord,
} from "./escalation-ladder";

describe("the ladder itself", () => {
  it("runs 1 to 12 with no gaps", () => {
    expect(ESCALATION_LADDER.map((r) => r.number)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
  });

  it("escalates the recipient, not the volume", () => {
    expect(getRound(1)?.recipients).toEqual(["cra"]);
    expect(getRound(3)?.recipients).toContain("furnisher");
    expect(getRound(4)?.recipients).toContain("furnisher_compliance");
    expect(getRound(8)?.recipients).toContain("furnisher_executive");
    expect(getRound(12)?.recipients).toEqual(["counsel"]);
  });

  it("NEVER addresses a regulator — those rounds produce guidance for the consumer", () => {
    /* The platform does not file with the CFPB, the FTC, a state AG or the
       BBB. It explains the channel and hands over the record; the consumer
       decides and files in their own name. */
    for (const r of ESCALATION_LADDER) {
      expect(r.recipients.some((x) => x.startsWith("regulator"))).toBe(false);
    }
    expect(getRound(9)?.recipients).toEqual(["consumer_guidance"]);
    expect(getRound(10)?.recipients).toEqual(["consumer_guidance"]);
  });

  it("puts a person in front of every round past the routine ones", () => {
    for (const r of ESCALATION_LADDER.filter((r) => r.number >= 4)) {
      expect(r.humanReview).toBe(true);
    }
  });

  it("never takes a legal step without the consumer", () => {
    for (const r of ESCALATION_LADDER) {
      if (r.recipients.includes("counsel")) expect(r.consumerAuthorisation).toBe(true);
    }
    /* And the reverse: no ordinary dispute round demands authorisation it
       does not need, which would stall a routine correction. */
    expect(getRound(1)?.consumerAuthorisation).toBe(false);
    expect(getRound(3)?.consumerAuthorisation).toBe(false);
  });

  it("reaches for willfulness only where the record can carry it", () => {
    const willful = ESCALATION_LADDER.filter((r) => r.legalBasis.some((c) => c.includes("1681n")));
    expect(willful.map((r) => r.number)).toEqual([11]);
    expect(getRound(11)?.requires).toContain("willfulness_record");
    expect(getRound(11)?.requires).toContain("human_review_complete");
  });
});

describe("what the record has earned", () => {
  it("opens nothing at all when nothing is confirmed", () => {
    expect(availableRound({})).toBeNull();
    expect(roundAvailability({})[0].missing).toEqual(["confirmed_finding"]);
  });

  it("opens round 1 on a single confirmed error", () => {
    expect(availableRound({ confirmed_finding: true })?.number).toBe(1);
  });

  it("refuses the method of verification before a result exists", () => {
    const record: CaseRecord = { confirmed_finding: true };
    const r2 = roundAvailability(record).find((r) => r.round.number === 2)!;
    expect(r2.available).toBe(false);
    expect(r2.missing).toContain("prior_cra_result");
  });

  it("opens it once the bureau has answered and the item survived", () => {
    const r2 = roundAvailability({
      confirmed_finding: true, prior_cra_result: true, still_reported_after_result: true,
    }).find((r) => r.round.number === 2)!;
    expect(r2.available).toBe(true);
  });

  it("cannot be reached by sending letters — only by accumulating answers", () => {
    /* Twelve letters sent and nothing answered still earns round 1. */
    expect(availableRound({ confirmed_finding: true })?.number).toBe(1);
  });

  it("opens reinsertion out of order, because reinsertion happens out of order", () => {
    const record: CaseRecord = { deleted_then_reinserted: true, no_reinsertion_notice: true };
    const r7 = roundAvailability(record).find((r) => r.round.number === 7)!;
    const r5 = roundAvailability(record).find((r) => r.round.number === 5)!;
    expect(r7.available).toBe(true);
    expect(r5.available).toBe(false);
    expect(availableRound(record)?.number).toBe(7);
  });

  it("offers regulator guidance only once the record would survive a complaint", () => {
    const early: CaseRecord = { confirmed_finding: true };
    expect(roundAvailability(early).find((r) => r.round.number === 9)!.available).toBe(false);
    const earned: CaseRecord = { compliance_contact_exhausted: true, still_reported_after_result: true };
    expect(roundAvailability(earned).find((r) => r.round.number === 9)!.available).toBe(true);
  });

  it("holds pre-litigation back on all three of its gates", () => {
    const r11 = roundAvailability({ confirmed_finding: true }).find((r) => r.round.number === 11)!;
    expect(r11.missing).toEqual(["willfulness_record", "consumer_authorised_legal", "human_review_complete"]);
  });
});
