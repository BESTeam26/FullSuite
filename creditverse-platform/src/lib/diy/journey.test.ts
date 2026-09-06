/**
 * The gates are the point. A DIY consumer signs their own letters, so the two
 * things that must never be skippable are consent and the attestation — and
 * identity theft must never be reachable by accident.
 */
import { describe, expect, it } from "vitest";
import {
  DIY_JOURNEY, canAdvance, canEnterIdentityTheftPathway, nextAction, progress,
  stageDefinition, type JourneyState,
} from "./journey";

const state = (over: Partial<JourneyState> = {}): JourneyState => ({
  stage: "consented", roundNumber: 1, hasConsent: true, hasAttestation: false,
  unreviewedExtraction: false, identityTheftPathway: false, ...over,
});

describe("the journey covers the whole consumer arc", () => {
  it("runs enrol to compare", () => {
    expect(DIY_JOURNEY[0].stage).toBe("enrolled");
    expect(DIY_JOURNEY[DIY_JOURNEY.length - 1].stage).toBe("compared");
    expect(DIY_JOURNEY).toHaveLength(15);
  });

  it("hands the hard parts to engines that already exist", () => {
    /* DIY is a workflow over the engines, never a second dispute engine. */
    const engines = DIY_JOURNEY.map((s) => s.engine).filter(Boolean).join(" ");
    expect(engines).toContain("extraction ladder");
    expect(engines).toContain("condition detector");
    expect(engines).toContain("reason selector");
    expect(engines).toContain("letter composer");
    expect(engines).toContain("escalation ladder");
  });

  it("speaks to a consumer, not to an operator", () => {
    const words = DIY_JOURNEY.map((s) => `${s.title} ${s.detail} ${s.action}`).join(" ").toLowerCase();
    expect(words).not.toContain("furnisher");
    expect(words).not.toContain("metro 2");
    expect(words).not.toContain("tradeline");
    expect(words).not.toContain("sla");
  });
});

describe("consent gates everything", () => {
  it("blocks every step until it is on record", () => {
    const s = state({ stage: "enrolled", hasConsent: false });
    for (const to of ["report_added", "issues_identified", "approved"] as const) {
      expect(canAdvance(s, to).allowed).toBe(false);
    }
    expect(canAdvance(s, "report_added").because).toContain("Agree how this works");
  });

  it("will not mark consent that was never given", () => {
    expect(canAdvance(state({ stage: "enrolled", hasConsent: false }), "consented").allowed).toBe(false);
  });

  it("opens the journey once it is", () => {
    expect(canAdvance(state({ stage: "consented" }), "report_added").allowed).toBe(true);
  });
});

describe("the truth gate", () => {
  it("REFUSES approval before the facts are attested", () => {
    const s = state({ stage: "drafts_reviewed", hasAttestation: false });
    const t = canAdvance(s, "approved");
    expect(t.allowed).toBe(false);
    expect(t.because).toContain("Confirm the facts are true");
  });

  it("refuses sending too, not merely approving", () => {
    expect(canAdvance(state({ stage: "approved", hasAttestation: false }), "sent").allowed).toBe(false);
  });

  it("allows it once they have signed", () => {
    expect(canAdvance(state({ stage: "drafts_reviewed", hasAttestation: true }), "approved").allowed).toBe(true);
  });
});

describe("bad extraction cannot become a finding", () => {
  it("holds the journey until unclear extraction is checked", () => {
    const t = canAdvance(state({ stage: "facts_confirmed", unreviewedExtraction: true }), "issues_identified");
    expect(t.allowed).toBe(false);
    expect(t.because).toContain("unclear");
  });
});

describe("moving around", () => {
  it("goes forward one step at a time", () => {
    expect(canAdvance(state({ stage: "report_added" }), "data_reviewed").allowed).toBe(true);
    expect(canAdvance(state({ stage: "report_added" }), "plan_built").allowed).toBe(false);
    expect(canAdvance(state({ stage: "report_added" }), "plan_built").because).toContain("Check what we read");
  });

  it("always lets somebody go back and re-read", () => {
    expect(canAdvance(state({ stage: "approved", hasAttestation: true }), "drafts_reviewed").allowed).toBe(true);
  });

  it("loops to the next round after a comparison", () => {
    expect(canAdvance(state({ stage: "compared" }), "report_added").allowed).toBe(true);
    expect(nextAction(state({ stage: "compared" })).stage).toBe("report_added");
  });

  it("always names the one thing to do now", () => {
    expect(nextAction(state({ stage: "consented" })).title).toBe("Add your credit report");
  });

  it("reports progress", () => {
    expect(progress("enrolled")).toEqual({ done: 1, total: 15, percent: 7 });
    expect(progress("compared").percent).toBe(100);
  });
});

describe("identity theft is a separate, deliberate pathway", () => {
  it("is never entered from report data alone", () => {
    const t = canEnterIdentityTheftPathway({ consumerDeclared: false, hasIdentityTheftReport: true });
    expect(t.allowed).toBe(false);
    expect(t.because).toContain("only for items you say");
  });

  it("needs the Identity Theft Report, because the block rests on it", () => {
    const t = canEnterIdentityTheftPathway({ consumerDeclared: true, hasIdentityTheftReport: false });
    expect(t.allowed).toBe(false);
    expect(t.because).toContain("IdentityTheft.gov");
  });

  it("opens on both together", () => {
    expect(canEnterIdentityTheftPathway({ consumerDeclared: true, hasIdentityTheftReport: true }).allowed).toBe(true);
  });

  it("is not a stage in the ordinary journey", () => {
    expect(DIY_JOURNEY.map((s) => s.stage)).not.toContain("identity_theft" as never);
    expect(stageDefinition("attested").gates.join(" ")).toContain("never assumed");
  });
});
