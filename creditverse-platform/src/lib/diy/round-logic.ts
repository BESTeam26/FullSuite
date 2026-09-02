// DIY Round & Escalation Path Engine
// Tracks the dispute lifecycle for a consumer self-managing their own file.
// Each stage is a lawful, factual escalation step — never "attack harder."
// All language is consumer-originated: the consumer states the facts and
// approves each communication.

export type RoundStage =
  | "initial" // Round 1 — CRA reinvestigation
  | "mov" // Round 2 — Method of Verification request
  | "furnisher" // Round 3 — Direct-to-furnisher dispute
  | "regulator" // Round 4 — CFPB / state AG / BBB complaint
  | "legal"; // Round 5 — Attorney referral / civil action

export type RoundStatus =
  "not-started" | "drafting" | "sent" | "responded" | "escalated";

export interface EscalationOption {
  to: RoundStage;
  label: string;
  when: string;
}

export interface RoundDef {
  stage: RoundStage;
  round: number;
  label: string;
  short: string;
  description: string;
  recipient: "CRA" | "Furnisher" | "Regulator" | "Attorney";
  legalBasis: string;
  timeline: string;
  actions: string[];
  escalation: EscalationOption[];
}

export const ROUND_DEFS: RoundDef[] = [
  {
    stage: "initial",
    round: 1,
    label: "Initial Dispute",
    short: "Round 1",
    description:
      "Send a factual dispute to the credit reporting agency identifying the specific item, what is inaccurate, and why. Attach your evidence and attestation.",
    recipient: "CRA",
    legalBasis:
      "FCRA § 611, 15 U.S.C. § 1681i — right to dispute accuracy & reinvestigation",
    timeline:
      "CRA must complete reinvestigation within ~30 days (45 if you add info), and report results ~5 business days after.",
    actions: [
      "Identify the exact tradeline, field, and bureau",
      "State what you believe is inaccurate in your own words",
      "Attach supporting evidence",
      "Attest that your statement is true",
      "Mail certified or submit through the CRA's dispute portal",
    ],
    escalation: [
      {
        to: "mov",
        label: "Escalate to Round 2 — Method of Verification",
        when: "Item came back 'verified' but no documented investigation was described, or the response is generic.",
      },
      {
        to: "furnisher",
        label: "Escalate to Round 3 — Direct Furnisher Dispute",
        when: "The CRA verified the item; go directly to the source that furnished it.",
      },
    ],
  },
  {
    stage: "mov",
    round: 2,
    label: "Method of Verification",
    short: "Round 2 · MOV",
    description:
      "Request the method the CRA used to verify the disputed item. A generic 'verified as accurate' with no described process is a factual basis to push further.",
    recipient: "CRA",
    legalBasis:
      "FCRA § 609, 15 U.S.C. § 1681g — right to disclosure of sources & method",
    timeline:
      "No fixed statutory clock; request in writing and log the response. Pair with a Round 3 furnisher dispute when possible.",
    actions: [
      "Quote the original dispute and the 'verified' response",
      "Request the specific records reviewed to verify the item",
      "Note the absence of a described investigation if none was given",
      "Preserve the full response for your audit trail",
    ],
    escalation: [
      {
        to: "furnisher",
        label: "Escalate to Round 3 — Direct Furnisher Dispute",
        when: "The CRA cannot describe how it verified the item.",
      },
      {
        to: "regulator",
        label: "Escalate to Round 4 — File a CFPB / state complaint",
        when: "The CRA or furnisher fails to investigate reasonably or respond.",
      },
    ],
  },
  {
    stage: "furnisher",
    round: 3,
    label: "Direct Furnisher Dispute",
    short: "Round 3",
    description:
      "Dispute directly with the furnisher (the creditor or collector that reported the item). Your dispute must identify the account and explain the basis. Use your own words — this is your dispute, not a template.",
    recipient: "Furnisher",
    legalBasis:
      "FCRA § 623(a)(8) + Regulation V (12 C.F.R. Part 1022) — furnisher direct-dispute duty",
    timeline:
      "Furnisher must complete a reasonable review of the dispute and report results, generally within the same ~30-day window.",
    actions: [
      "Identify the account by number and furnisher name",
      "Explain the specific inaccuracy in your own words",
      "Attach the same evidence you used for the CRA dispute",
      "Confirm the item across all three bureaus it reports to",
      "Keep the language consumer-originated — this is your dispute",
    ],
    escalation: [
      {
        to: "regulator",
        label: "Escalate to Round 4 — Regulator complaint (CFPB / state AG)",
        when: "Furnisher fails to conduct a reasonable review or corrects nothing.",
      },
      {
        to: "legal",
        label: "Escalate to Round 5 — Attorney referral",
        when: "A willful or patterned FCRA failure remains unresolved after documented rounds.",
      },
    ],
  },
  {
    stage: "regulator",
    round: 4,
    label: "Regulator Complaint",
    short: "Round 4",
    description:
      "File a factual, documented complaint with the CFPB and/or your state Attorney General. Reference your prior rounds, evidence, and the responses (or non-responses) you received.",
    recipient: "Regulator",
    legalBasis:
      "Consumer protection complaint rights under CFPB / state AG / FTC channels",
    timeline:
      "Agencies route complaints to the company and expect a response; no guaranteed deletion timeline.",
    actions: [
      "Compile your round history: disputes, MOV, responses",
      "Summarize the specific unresolved inaccuracy",
      "Attach evidence and the company's response letters",
      "File with the CFPB portal and your state AG as applicable",
      "Log the complaint ID for your records",
    ],
    escalation: [
      {
        to: "legal",
        label: "Escalate to Round 5 — Attorney referral",
        when: "The complaint does not resolve the issue and there is a documented FCRA failure.",
      },
    ],
  },
  {
    stage: "legal",
    round: 5,
    label: "Attorney Referral",
    short: "Round 5",
    description:
      "If documented rounds show a willful or negligent FCRA failure that remains unresolved, this is the stage to seek counsel. BES is software and education — not a law firm — so this step connects you to a licensed attorney for review.",
    recipient: "Attorney",
    legalBasis:
      "FCRA §§ 616–617, 15 U.S.C. §§ 1681n–1681o — civil liability for willful / negligent noncompliance",
    timeline:
      "Varies by counsel and jurisdiction. BES does not provide legal advice.",
    actions: [
      "Export your full case audit trail (disputes, evidence, responses)",
      "Summarize the unresolved inaccuracy and documented rounds",
      "Connect with a consumer-protection / FCRA attorney for review",
      "Do not assert liability claims without counsel review",
    ],
    escalation: [],
  },
];

export const ROUND_MAP: Record<RoundStage, RoundDef> = ROUND_DEFS.reduce(
  (acc, r) => ({ ...acc, [r.stage]: r }),
  {} as Record<RoundStage, RoundDef>,
);

export interface ItemRoundState {
  itemId: string;
  stage: RoundStage;
  status: RoundStatus;
  sentDate?: string;
  responseDate?: string;
  responseResult?:
    "deleted" | "updated" | "verified" | "no-response" | "corrected";
  history: {
    stage: RoundStage;
    status: RoundStatus;
    date: string;
    note: string;
  }[];
}

export function initialItemRound(itemId: string): ItemRoundState {
  return { itemId, stage: "initial", status: "not-started", history: [] };
}

export function stageLabel(stage: RoundStage): string {
  return ROUND_MAP[stage].short;
}
