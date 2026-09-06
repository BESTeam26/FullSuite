/**
 * Section A — consumer identity, ownership and liability.
 *
 * The first section of the BES Metro 2 defect catalogue, and the right one to
 * start with: an identity defect is the most consequential thing on a report,
 * because it means the tradeline may not be about this person at all.
 *
 * It is also where guessing does the most damage. "The name is spelled
 * differently" is not "the account is not mine", and a letter that makes the
 * second claim from the first evidence is both wrong and dismissible. So most
 * rules here are APPARENT, and the few that are confirmed are the ones the
 * report contradicts on its own face.
 *
 * Every rule declares what it needs. Absent a required field it returns
 * UNKNOWN — never a verdict.
 */
import {
  apparent, confirmed, notAnError, type Metro2Rule, type RuleOutcome,
} from "./types";

/** What the report and the consumer's own documents say about who this is. */
export interface IdentityInput {
  reportedName?: string;
  /** The consumer's verified legal name, from their own identification. */
  verifiedName?: string;
  reportedSsnLast4?: string;
  verifiedSsnLast4?: string;
  reportedDob?: string;
  verifiedDob?: string;
  /** Displayed ECOA code. Absent when the report only prints a label. */
  ecoaCodeDisplayed?: string;
  ecoaLabel?: string;
  /** What the account documents actually establish. */
  documentedRelationship?: "individual" | "joint" | "authorized_user" | "guarantor" | "co_signer";
  isCollection?: boolean;
  reportedDeceased?: boolean;
  /** Signed by the consumer. Never inferred from activity on the file. */
  attestedNotDeceased?: boolean;
  reportedAddress?: string;
  knownAddresses?: string[];
  /** Signed by the consumer. */
  attestedNotMine?: boolean;
}

const norm = (v?: string) => (v ?? "").trim().toLowerCase().replace(/\s+/g, " ");
const nameKey = (v?: string) => norm(v).replace(/[.,'-]/g, "");

/**
 * Is the difference between two names cosmetic?
 *
 * Catalogue A.2 is explicit: use this "only when the name is actually
 * inaccurate, not merely abbreviated or masked by the bureau." Bureaus
 * truncate, drop middle names and initialise — none of which is a defect, and
 * disputing them is how a letter loses its reader.
 */
export function namesAgree(reported: string, verified: string): boolean {
  const a = nameKey(reported).split(" ").filter(Boolean);
  const b = nameKey(verified).split(" ").filter(Boolean);
  if (a.length === 0 || b.length === 0) return false;
  if (a[a.length - 1] !== b[b.length - 1]) return false;   // surnames must match outright
  const givenA = a.slice(0, -1);
  const givenB = b.slice(0, -1);
  if (givenA.length === 0 || givenB.length === 0) return true;   // an absent middle name is not a defect
  const [ga, gb] = [givenA[0], givenB[0]];
  return ga === gb || ga.startsWith(gb) || gb.startsWith(ga);
}

const ECOA_MEANING: Record<string, NonNullable<IdentityInput["documentedRelationship"]>> = {
  "1": "individual", "2": "joint", "3": "authorized_user", "5": "co_signer", "7": "guarantor",
};

const ECOA_FROM_LABEL: Record<string, string> = {
  "individual": "1", "joint": "2", "joint account": "2",
  "authorized user": "3", "authorised user": "3",
  "co-signer": "5", "cosigner": "5", "co signer": "5", "guarantor": "7",
};

/** Withdrawn by the 2020 CRRG (catalogue A.13). Never translated to a meaning. */
export const WITHDRAWN_ECOA_CODES = ["0", "4", "6"] as const;

/** The code, and whether the report actually printed it. */
function resolveEcoa(i: IdentityInput): { code: string | null; displayed: boolean } {
  const displayed = (i.ecoaCodeDisplayed ?? "").trim();
  if (displayed) return { code: displayed, displayed: true };
  const mapped = ECOA_FROM_LABEL[norm(i.ecoaLabel)];
  return { code: mapped ?? null, displayed: false };
}

/**
 * "Not mine" is a CONSUMER ASSERTION, never a deduction.
 *
 * The most serious claim in the section and the easiest to reach for wrongly.
 * A different name, a strange address and an unfamiliar balance are three
 * reasons to ASK. Only the consumer can say the account is not theirs, and
 * until they have, this rule produces nothing.
 */
export const A1_WRONG_CONSUMER: Metro2Rule<IdentityInput> = {
  id: "A1",
  title: "The tradeline belongs to a different consumer",
  provenance: { catalogue: "A.1", sourceKind: "metro2_format" },
  requires: [],
  guardrails: [
    "NEVER inferred from report data. An unfamiliar account is not somebody else's account.",
    "A name, address or identifier mismatch supports the claim; it does not make it.",
  ],
  claim: {
    assertion: "This account is not mine. Delete it.",
    question: "Please confirm the identifying information this account was matched on.",
    recipient: "either",
    citations: [],
  },
  evaluate: (i): RuleOutcome => {
    if (!i.attestedNotMine) {
      return notAnError("The consumer has not said this account is not theirs, so no ownership claim is made.");
    }
    const support: string[] = [];
    if (i.reportedName && i.verifiedName && !namesAgree(i.reportedName, i.verifiedName)) support.push("the name differs");
    if (i.reportedSsnLast4 && i.verifiedSsnLast4 && i.reportedSsnLast4 !== i.verifiedSsnLast4) support.push("the SSN differs");
    return confirmed(
      support.length > 0
        ? `The consumer states this account is not theirs, and ${support.join(", ")}.`
        : "The consumer states this account is not theirs.",
    );
  },
};

export const A2_WRONG_NAME: Metro2Rule<IdentityInput> = {
  id: "A2",
  title: "The name on the tradeline is not the consumer's",
  provenance: { catalogue: "A.2", sourceKind: "metro2_format",
    note: "Only when the name is actually inaccurate, not abbreviated or masked." },
  requires: ["reportedName", "verifiedName"],
  guardrails: [
    "An abbreviated or initialised given name is not a defect.",
    "A missing middle name is not a defect.",
    "Bureau truncation and masking are display, not data.",
  ],
  claim: {
    assertion: "The consumer name on this account is not mine.",
    question: "Please confirm the consumer name on this account and how it was verified.",
    recipient: "either",
    citations: [],
  },
  evaluate: (i): RuleOutcome =>
    namesAgree(i.reportedName!, i.verifiedName!)
      ? notAnError(`The reported name "${i.reportedName}" is a form of "${i.verifiedName}".`)
      : apparent(
          `The tradeline reports "${i.reportedName}"; the consumer's identification says "${i.verifiedName}".`,
          "whether the furnisher holds a different name for this account, or the two are the same person recorded differently",
        ),
};

export const A4_SSN_MISMATCH: Metro2Rule<IdentityInput> = {
  id: "A4",
  title: "The Social Security number does not match the consumer",
  provenance: { catalogue: "A.4", sourceKind: "metro2_format" },
  requires: ["reportedSsnLast4", "verifiedSsnLast4"],
  guardrails: [
    "Only the last four are compared: a full number is never printed or stored for this.",
    "A masked or absent identifier is not a mismatch.",
  ],
  claim: {
    assertion: "The Social Security number attached to this account is not mine.",
    question: "Please confirm the Social Security number this account was matched on.",
    recipient: "either",
    citations: [],
  },
  evaluate: (i): RuleOutcome => {
    const r = (i.reportedSsnLast4 ?? "").replace(/\D/g, "");
    const v = (i.verifiedSsnLast4 ?? "").replace(/\D/g, "");
    if (r.length !== 4 || v.length !== 4) {
      return notAnError("The reported identifier is not four digits, so nothing is being compared.");
    }
    return r === v
      ? notAnError("The last four digits match.")
      : confirmed(`The account is matched on an SSN ending ${r}; the consumer's ends ${v}.`);
  },
};

export const A6_NO_SSN_AND_NO_DOB: Metro2Rule<IdentityInput> = {
  id: "A6",
  title: "Neither an SSN nor a date of birth is reported",
  provenance: { catalogue: "A.6 and A.7", sourceKind: "metro2_format",
    note: "The CRRG requires a date of birth when no SSN is reported, and the reverse." },
  requires: [],
  guardrails: [
    "A bureau may hold an identifier it does not display. This ASKS how the account was matched; it does not assert the furnisher sent nothing.",
  ],
  claim: {
    assertion: "",
    question: "This account shows neither a Social Security number nor a date of birth. Please explain how it was matched to me.",
    recipient: "cra",
    citations: [],
  },
  evaluate: (i): RuleOutcome => {
    const hasSsn = !!(i.reportedSsnLast4 ?? "").trim();
    const hasDob = !!(i.reportedDob ?? "").trim();
    if (hasSsn || hasDob) return notAnError("At least one identifier is reported.");
    return apparent(
      "Neither a Social Security number nor a date of birth appears on this tradeline.",
      "how the account was matched to this consumer, and whether the bureau holds an identifier it does not display",
    );
  },
};

export const A12_WRONG_ECOA: Metro2Rule<IdentityInput> = {
  id: "A12",
  title: "The ECOA relationship is wrong",
  provenance: { catalogue: "A.12", sourceKind: "metro2_format" },
  requires: ["documentedRelationship"],
  guardrails: [
    "An INFERRED code never produces a confirmed defect: a report usually prints a label, not the raw code.",
    "A label the mapping does not recognise produces nothing at all.",
    "A withdrawn code (0, 4, 6) is never translated into a relationship.",
  ],
  claim: {
    assertion: "The relationship reported on this account is not the one the account documents establish.",
    question: "Please confirm the ECOA relationship reported on this account and what it was verified against.",
    recipient: "furnisher",
    citations: [],
  },
  evaluate: (i): RuleOutcome => {
    const { code, displayed } = resolveEcoa(i);
    if (!code) return notAnError("No usable relationship is reported, so there is nothing to compare.");
    if ((WITHDRAWN_ECOA_CODES as readonly string[]).includes(code)) {
      return apparent(`This account reports ECOA code ${code}, which the 2020 CRRG withdrew.`,
                      "which relationship the furnisher intends, since this code is no longer reportable");
    }
    const reported = ECOA_MEANING[code];
    if (!reported) return notAnError(`Relationship code ${code} is not one this rule knows.`);
    if (reported === i.documentedRelationship) {
      return notAnError(`The reported relationship matches the documents (${reported}).`);
    }
    const text = `The account reports the consumer as ${reported}; the documents show ${i.documentedRelationship}.`;
    return displayed
      ? confirmed(text)
      : apparent(`${text} The code was inferred from the label "${i.ecoaLabel}", not displayed.`,
                 "the ECOA code the furnisher actually reported");
  },
};

export const A14_AUTHORIZED_USER_ON_COLLECTION: Metro2Rule<IdentityInput> = {
  id: "A14",
  title: "An authorized user is reported on a collection",
  provenance: { catalogue: "A.14", sourceKind: "metro2_format",
    note: "Debt Buyer / Collection Agency module: ECOA 3 should not be used, because an authorized user is not contractually liable." },
  requires: ["isCollection"],
  guardrails: ["Only applies to a third-party collection tradeline."],
  claim: {
    assertion: "I am reported as an authorized user on a collection account. An authorized user is not contractually liable for the debt.",
    question: "Please confirm the relationship reported on this collection and the basis for it.",
    recipient: "collector",
    citations: [],
  },
  evaluate: (i): RuleOutcome => {
    if (!i.isCollection) return notAnError("Not a collection tradeline.");
    const { code, displayed } = resolveEcoa(i);
    if (code !== "3") return notAnError("Not reported as an authorized user.");
    const text = "This collection reports the consumer as an authorized user, who is not contractually liable for the debt.";
    return displayed ? confirmed(text) : apparent(`${text} The code was inferred from a label.`, "the reported ECOA code");
  },
};

export const A16_WRONGLY_DECEASED: Metro2Rule<IdentityInput> = {
  id: "A16",
  title: "The consumer is reported as deceased",
  provenance: { catalogue: "A.16", sourceKind: "metro2_format" },
  requires: ["reportedDeceased"],
  guardrails: [
    "A deceased indicator on a JOINT account may correctly describe the other borrower.",
    "Only the consumer can say they are alive; never inferred from activity on the file.",
  ],
  claim: {
    assertion: "I am alive. This account reports me as deceased.",
    question: "Please confirm the deceased indicator on this account and the notice it was based on.",
    recipient: "either",
    citations: [],
  },
  evaluate: (i): RuleOutcome => {
    if (!i.reportedDeceased) return notAnError("No deceased indicator is reported.");
    return i.attestedNotDeceased
      ? confirmed("The account carries a deceased indicator, and the consumer states they are alive.")
      : apparent("The account carries a deceased indicator.",
                 "whether it refers to this consumer or to another borrower on a joint account");
  },
};

export const A20_ADDRESS_NOT_THE_CONSUMERS: Metro2Rule<IdentityInput> = {
  id: "A20",
  title: "The address attached is not the consumer's",
  provenance: { catalogue: "A.20", sourceKind: "metro2_format",
    note: "An address from a creditor, bill-pay service, counselor or skip trace is not the consumer's residence." },
  requires: ["reportedAddress", "knownAddresses"],
  guardrails: [
    "An OLD address is accurate historical data, not a defect. Only dispute one that was never theirs.",
    "Formatting differences are not differences.",
  ],
  claim: {
    assertion: "The address on this account has never been mine.",
    question: "Please confirm the source of the address reported with this account.",
    recipient: "cra",
    citations: [],
  },
  evaluate: (i): RuleOutcome => {
    const key = (s: string) =>
      norm(s).replace(/[.,#]/g, "").replace(/\b(street|st|avenue|ave|road|rd|apartment|apt|unit)\b/g, "").replace(/\s+/g, " ").trim();
    const known = (i.knownAddresses ?? []).map(key);
    if (known.length === 0) return notAnError("No known addresses to compare against.");
    return known.includes(key(i.reportedAddress!))
      ? notAnError("The reported address is one the consumer confirms.")
      : apparent(
          `The account reports an address the consumer does not recognise: "${i.reportedAddress}".`,
          "whether this was ever the consumer's address, or came from a creditor, a bill-pay service or a skip trace",
        );
  },
};

export const SECTION_A_RULES = [
  A1_WRONG_CONSUMER, A2_WRONG_NAME, A4_SSN_MISMATCH, A6_NO_SSN_AND_NO_DOB,
  A12_WRONG_ECOA, A14_AUTHORIZED_USER_ON_COLLECTION, A16_WRONGLY_DECEASED,
  A20_ADDRESS_NOT_THE_CONSUMERS,
];
