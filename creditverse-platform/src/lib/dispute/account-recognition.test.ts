/**
 * CR-4a regression suite.
 *
 * These exist because BES shipped a screen telling staff a federal
 * identity-theft report was "Required for third-party collections". Every test
 * below is a fence around that mistake and the two habits behind it: inferring
 * a consumer's position from an account, and promoting what a consumer said
 * into something BES claims to have verified.
 */
import { describe, expect, it } from "vitest";
import type { ClassifiedItem } from "@/lib/credit-classification";
import {
  IDENTITY_THEFT_EDUCATION,
  RECOGNITION_LABEL,
  RECOGNITION_PROVENANCE,
  guidanceFor,
  identityTheftRouteAvailable,
  shouldShowIdentityTheftEducation,
  type AccountRecognition,
} from "./account-recognition";
import { FTC_CONSUMER_RESOURCES, TRAP_CHANNELS, ftcResourceFor } from "./letters-and-channels";

const item = (over: Partial<ClassifiedItem> = {}): ClassifiedItem => ({
  id: "i1", name: "LVNV FUNDING", kind: "Account", status: "Collection", bureaus: ["EQ", "EX", "TU"],
  category: "3rd-Party Collection", isNegative: true, isDerogatory: true, disposition: "dispute",
  aiReason: "", autoSelected: false, riskFlags: [], ...over,
});

const ALL: AccountRecognition[] = [
  "consumer_reports_identity_theft",
  "consumer_does_not_recognize",
  "account_recognized",
  "needs_further_review",
];

describe("a collection alone never routes to identity theft", () => {
  it("offers no identity-theft route before anyone has asked the consumer", () => {
    const g = guidanceFor(item(), undefined);
    expect(g.identityTheftRouteAvailable).toBe(false);
    expect(g.consumerResourceUrl).toBeUndefined();
  });

  it("shows education instead, naming what the account type does not establish", () => {
    expect(guidanceFor(item(), undefined).message).toBe(IDENTITY_THEFT_EDUCATION);
    expect(IDENTITY_THEFT_EDUCATION).toMatch(/does not establish identity theft/i);
    expect(IDENTITY_THEFT_EDUCATION).toMatch(/your organization's identity-theft dispute SOP/i);
  });

  it("never says an FTC report is required, in the education or the channel", () => {
    const text = `${IDENTITY_THEFT_EDUCATION} ${TRAP_CHANNELS.FTC.description} ${TRAP_CHANNELS.FTC.label}`;
    expect(text).not.toMatch(/required/i);
    expect(text).not.toMatch(/must file/i);
  });

  /* The exact defect: a category reaching the resource on its own. */
  it("refuses the FTC resource for a collection with no recorded statement", () => {
    expect(ftcResourceFor("3rd-Party Collection", undefined)).toBeNull();
    expect(ftcResourceFor("3rd-Party Collection", "needs_further_review")).toBeNull();
    expect(ftcResourceFor("Inquiry", undefined)).toBeNull();
  });

  it("refuses it for every state except a reported identity theft", () => {
    for (const r of ALL) {
      const got = ftcResourceFor("3rd-Party Collection", r);
      if (r === "consumer_reports_identity_theft") expect(got).not.toBeNull();
      else expect(got).toBeNull();
    }
  });

  it("does not block ordinary dispute work — every state still yields guidance", () => {
    for (const r of [...ALL, undefined]) {
      const g = guidanceFor(item(), r);
      expect(g.message.length).toBeGreaterThan(0);
      expect(Array.isArray(g.suggestions)).toBe(true);
    }
  });
});

describe("'does not recognize' is not identity theft", () => {
  it("keeps the route closed", () => {
    const g = guidanceFor(item(), "consumer_does_not_recognize");
    expect(g.identityTheftRouteAvailable).toBe(false);
    expect(g.consumerResourceUrl).toBeUndefined();
  });

  it("says so in words, rather than leaving the reader to infer it", () => {
    expect(guidanceFor(item(), "consumer_does_not_recognize").message)
      .toMatch(/not a claim of identity theft/i);
  });

  it("suggests the ordinary explanations before reaching for fraud", () => {
    const s = guidanceFor(item(), "consumer_does_not_recognize").suggestions.join(" ");
    expect(s).toMatch(/trading name/i);
    expect(s).toMatch(/sold or transferred/i);
  });

  it("still allows a factual dispute on the consumer's statement alone", () => {
    expect(guidanceFor(item(), "consumer_does_not_recognize").suggestions.join(" "))
      .toMatch(/may proceed on the consumer's statement alone/i);
  });
});

describe("a reported identity theft opens the route, as education", () => {
  const g = () => guidanceFor(item(), "consumer_reports_identity_theft");

  it("opens it", () => {
    expect(g().identityTheftRouteAvailable).toBe(true);
    expect(identityTheftRouteAvailable("consumer_reports_identity_theft")).toBe(true);
  });

  it("surfaces IdentityTheft.gov as somewhere the consumer may go, not a step BES demands", () => {
    expect(g().consumerResourceUrl).toBe("https://www.identitytheft.gov/");
    const s = g().suggestions.join(" ");
    expect(s).toMatch(/if they choose to/i);
    expect(s).not.toMatch(/you must/i);
  });

  it("points at the organization's SOP rather than imposing one", () => {
    expect(g().message).toMatch(/your organization's identity-theft dispute SOP/i);
    expect(g().suggestions.join(" ")).toMatch(/may require/i);
  });

  it("carries the caution on the resource itself", () => {
    const res = ftcResourceFor("3rd-Party Collection", "consumer_reports_identity_theft")!;
    expect(res.caution).toMatch(/not evidence of identity theft/i);
    expect(res.caution).toMatch(/false statement to a federal agency/i);
  });

  it("warns against a fraud claim on an inquiry the consumer holds an account with", () => {
    const res = FTC_CONSUMER_RESOURCES.find((r) => r.relevantTo === "Inquiry")!;
    expect(res.caution).toMatch(/not recognising an inquiry is not fraud/i);
  });
});

describe("a consumer assertion is never promoted into a BES conclusion", () => {
  /* The state is named for who is speaking. "identity_theft_confirmed" would
     invite every later reader to forget that a person said it. */
  it("names the state for the speaker, not for the conclusion", () => {
    expect(ALL).toContain("consumer_reports_identity_theft");
    for (const key of ALL) {
      expect(key).not.toMatch(/confirmed|verified|established|proven/);
      expect(RECOGNITION_LABEL[key]).not.toMatch(/confirmed|verified/i);
    }
  });

  it("records provenance saying BES did not verify it", () => {
    expect(RECOGNITION_PROVENANCE.consumer_reports_identity_theft)
      .toMatch(/not independently verified by BES/i);
    expect(RECOGNITION_PROVENANCE.consumer_reports_identity_theft)
      .toMatch(/consumer statement/i);
  });

  it("attributes every recorded answer to a person", () => {
    for (const key of ALL) {
      if (key === "needs_further_review") continue;
      expect(RECOGNITION_PROVENANCE[key]).toMatch(/consumer statement, recorded by the operator/i);
    }
  });

  it("describes the reported claim as the consumer's, in BES's own guidance", () => {
    const m = guidanceFor(item(), "consumer_reports_identity_theft").message;
    expect(m).toMatch(/the consumer reports/i);
    expect(m).toMatch(/BES has not verified it/i);
    expect(m).not.toMatch(/identity theft (confirmed|verified|established)/i);
  });

  it("never states fraud as a fact, in any branch", () => {
    for (const r of [...ALL, undefined]) {
      const g = guidanceFor(item(), r);
      const text = `${g.message} ${g.suggestions.join(" ")}`;
      expect(text).not.toMatch(/this account is fraudulent/i);
      expect(text).not.toMatch(/fraud confirmed/i);
      expect(text).not.toMatch(/identity theft verified/i);
    }
  });

  it("has no path from an item to a recognition — a person selects one", () => {
    /* shouldShowIdentityTheftEducation decides whether to EDUCATE, and nothing
       more. It returns a boolean about wording, never a state. */
    expect(shouldShowIdentityTheftEducation(item())).toBe(true);
    expect(shouldShowIdentityTheftEducation(item({ category: "Charge-Off" }))).toBe(false);
    expect(guidanceFor(item(), undefined).identityTheftRouteAvailable).toBe(false);
  });
});
