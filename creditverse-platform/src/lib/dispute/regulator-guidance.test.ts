/**
 * The platform recommends and explains. It never files.
 *
 * These lock down the corrections that matter most: filing is not an
 * investigation, an Identity Theft Report is only for actual theft, and a
 * consumer is pointed at one channel that fits rather than five at once.
 */
import { describe, expect, it } from "vitest";
import {
  GUIDANCE_DISCLAIMER, REGULATOR_GUIDANCE, guidanceFor, recommendChannels, type CaseFacts,
} from "./regulator-guidance";

const facts = (over: Partial<CaseFacts> = {}): CaseFacts => ({
  disputedAtLeastOnce: false, holdsWrittenResult: false, stillWrongAfterResult: false,
  complianceContacted: false, cfpbFiled: false, cfpbResponseInadequate: false,
  attestedIdentityTheft: false, ...over,
});

describe("what each channel actually does", () => {
  it("says plainly that filing with the FTC is not an investigation", () => {
    const g = guidanceFor("ftc_complaint");
    expect(g.whatItDoesNotDo.join(" ")).toContain("does not make the FTC your representative");
    expect(g.doNotUseWhen.join(" ")).toContain("Filing is not an investigation");
  });

  it("keeps the Identity Theft Report for actual identity theft", () => {
    const g = guidanceFor("ftc_identity_theft");
    expect(g.doNotUseWhen.join(" ")).toContain("The account is yours");
    expect(g.doNotUseWhen.join(" ")).toContain("A breach is not proof");
    /* And states the thing that makes it worth doing when it does apply. */
    expect(g.whatItDoes.join(" ")).toContain("1681c-2");
    expect(g.whatItDoes.join(" ")).toContain("four business days");
  });

  it("does not oversell the CFPB", () => {
    const g = guidanceFor("cfpb");
    expect(g.whatItDoesNotDo.join(" ")).toContain("does not investigate your individual case");
    expect(g.whatItDoesNotDo.join(" ")).toContain("does not force a deletion");
  });

  it("is honest that the BBB has no authority", () => {
    expect(guidanceFor("bbb").whatItDoesNotDo.join(" ")).toContain("no statutory power");
  });

  it("gives every channel both halves — what it does and what it does not", () => {
    for (const g of REGULATOR_GUIDANCE) {
      expect(g.whatItDoes.length).toBeGreaterThan(0);
      expect(g.whatItDoesNotDo.length).toBeGreaterThan(0);
      expect(g.useWhen.length).toBeGreaterThan(0);
      expect(g.doNotUseWhen.length).toBeGreaterThan(0);
    }
  });
});

describe("what to suggest, and when", () => {
  it("suggests nothing before there is a record to complain about", () => {
    expect(recommendChannels(facts())).toEqual([]);
    expect(recommendChannels(facts({ disputedAtLeastOnce: true }))).toEqual([]);
  });

  it("suggests the CFPB once a dispute has been answered and ignored", () => {
    const r = recommendChannels(facts({
      disputedAtLeastOnce: true, holdsWrittenResult: true, stillWrongAfterResult: true,
    }));
    expect(r.map((x) => x.channel)).toEqual(["cfpb"]);
    expect(r[0].because).toContain("still wrong");
  });

  it("suggests the identity theft route only on a signed statement", () => {
    expect(recommendChannels(facts()).map((x) => x.channel)).not.toContain("ftc_identity_theft");
    expect(recommendChannels(facts({ attestedIdentityTheft: true })).map((x) => x.channel))
      .toContain("ftc_identity_theft");
  });

  it("moves to the state only after the CFPB response fell short", () => {
    const r = recommendChannels(facts({ cfpbFiled: true, cfpbResponseInadequate: true }));
    expect(r.map((x) => x.channel)).toContain("state_ag");
  });

  it("does not point a consumer at five channels at once", () => {
    /* Filing everywhere on day one is how a genuine complaint becomes noise. */
    const r = recommendChannels(facts({
      disputedAtLeastOnce: true, holdsWrittenResult: true, stillWrongAfterResult: true,
    }));
    expect(r.length).toBe(1);
  });
});

describe("the disclaimer", () => {
  it("says who files", () => {
    expect(GUIDANCE_DISCLAIMER).toContain("You file in your own name");
    expect(GUIDANCE_DISCLAIMER).toContain("not legal advice");
  });
});
