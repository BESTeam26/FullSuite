/**
 * The DIY journey — one person doing for themselves what an agent does for a
 * managed client.
 *
 * DIY is not a second dispute engine. Every step below hands off to something
 * that already exists and is already tested: the report parser, the Metro 2
 * comparison, the confirmed/apparent/not-an-error guardrails, the reason
 * selector, the batching strategies, the letter composer, the escalation
 * ladder. What DIY adds is the ORDER, the gates, and language a consumer can
 * follow without knowing what a furnisher is.
 *
 * ── The two gates ──────────────────────────────────────────────────────────
 *
 * CONSENT before any work. Nothing happens until it is on record.
 *
 * ATTESTATION before approval. A consumer signs their own dispute letter, so
 * they must first say the facts under it are true. That is the reason DIY can
 * exist at all: the person asserting the facts is the person they are about.
 * Enforced here AND independently in the database, because a gate enforced in
 * one place is a gate that can be walked around.
 *
 * ── What the consumer is never asked to decide ─────────────────────────────
 *
 * Whether something is a defect. That is the detector's answer and it is
 * deterministic. The consumer confirms FACTS about their own life — "I was
 * never late on this", "that address is not mine" — and the engine decides
 * what those facts support. Asking a consumer to grade a Metro 2 relationship
 * would be asking them to do the one part they cannot.
 */

export type DiyStage =
  | "enrolled" | "consented" | "report_added" | "data_reviewed" | "facts_confirmed"
  | "issues_identified" | "attested" | "plan_built" | "drafts_reviewed" | "approved"
  | "sent" | "awaiting_response" | "response_recorded" | "reimported" | "compared";

export interface StageDefinition {
  stage: DiyStage;
  /** What the consumer sees. Their words, not ours. */
  title: string;
  detail: string;
  action: string;
  /** The engine this step hands off to. Absent when the step is theirs alone. */
  engine?: string;
  gates: string[];
}

export const DIY_JOURNEY: StageDefinition[] = [
  { stage: "enrolled", title: "Get started",
    detail: "Your account is set up. Nothing has been sent anywhere yet.",
    action: "Tell us your name so letters can be addressed properly.", gates: [] },
  { stage: "consented", title: "Agree how this works",
    detail: "You do the disputing. We give you the tools, the wording and the tracking. You sign and send every letter yourself.",
    action: "Read and agree.",
    gates: ["Consent is on record before anything else happens."] },
  { stage: "report_added", title: "Add your credit report",
    detail: "Upload the PDF, or a CSV export. A downloaded report is read on your own computer and costs nothing.",
    action: "Upload your report.",
    engine: "extraction ladder: text layer, then local OCR, then assisted", gates: [] },
  { stage: "data_reviewed", title: "Check what we read",
    detail: "Every account, balance and date we pulled out, next to what your report shows. Fix anything we got wrong.",
    action: "Read through and correct.", engine: "credit report parser",
    gates: ["Low-confidence extraction must be reviewed before it can be used."] },
  { stage: "facts_confirmed", title: "Tell us what you know",
    detail: "Only you know whether you were actually late, whether an account is yours, or whether you gave permission for an enquiry.",
    action: "Answer the questions about your own history.",
    gates: ["A fact about you comes from you, never from the report."] },
  { stage: "issues_identified", title: "See what we found",
    detail: "What is definitely wrong, what is worth asking about, and what looks wrong but is normal reporting.",
    action: "Review the findings.", engine: "condition detector and Metro 2 status rules",
    gates: ["Only confirmed findings become a claim. Apparent ones become questions."] },
  { stage: "attested", title: "Confirm it is true",
    detail: "You are about to sign these letters. Confirm the facts in them are true to the best of your knowledge.",
    action: "Sign the statement.",
    gates: ["Nothing is approved before this.", "Identity theft is a separate pathway and is never assumed."] },
  { stage: "plan_built", title: "Your plan",
    detail: "Which bureaus, which items, how many letters and in what order.",
    action: "Choose how to split the letters.", engine: "reason selector and batching strategies", gates: [] },
  { stage: "drafts_reviewed", title: "Read your letters",
    detail: "Every letter, in full, before anything is printed. Change any wording you want.",
    action: "Read and edit.", engine: "letter composer and reason library",
    gates: ["A letter with an unfilled placeholder or an unverified address cannot be sent."] },
  { stage: "approved", title: "Approve",
    detail: "You are approving these as your own letters.", action: "Approve.",
    gates: ["Requires the attestation."] },
  { stage: "sent", title: "Send",
    detail: "Print and post them yourself, or have them mailed for you with tracking.",
    action: "Send.", engine: "mailing", gates: [] },
  { stage: "awaiting_response", title: "Waiting",
    detail: "A bureau has 30 days, or 45 if you send more evidence during the investigation. We will remind you.",
    action: "Nothing. We watch the clock.", engine: "escalation ladder timers", gates: [] },
  { stage: "response_recorded", title: "Record what came back",
    detail: "Deleted, corrected, verified, or nothing at all. What happens next depends on which.",
    action: "Tell us what you received.", gates: [] },
  { stage: "reimported", title: "Pull a fresh report",
    detail: "The response letter says one thing; the report shows another. The report is what counts.",
    action: "Upload the new report.", engine: "extraction ladder", gates: [] },
  { stage: "compared", title: "What changed",
    detail: "Line by line against last time: what came off, what changed, what did not move, and what came back.",
    action: "Review, then start the next round.",
    engine: "reporting integrity engine and reinsertion detection", gates: [] },
];

const ORDER: DiyStage[] = DIY_JOURNEY.map((s) => s.stage);

export const stageIndex = (s: DiyStage) => ORDER.indexOf(s);
export const stageDefinition = (s: DiyStage) => DIY_JOURNEY.find((d) => d.stage === s)!;

export interface JourneyState {
  stage: DiyStage;
  roundNumber: number;
  hasConsent: boolean;
  hasAttestation: boolean;
  /** Extraction that scored badly and has not been checked by the person. */
  unreviewedExtraction: boolean;
  identityTheftPathway: boolean;
}

export interface Transition {
  allowed: boolean;
  /** Why not, in the consumer's language. */
  because?: string;
}

/**
 * May this person move to that step?
 *
 * Forward one at a time, or back to anything already passed — going back to
 * re-read a letter must always be possible. After a comparison the journey
 * loops to the next round, which is the only jump.
 */
export function canAdvance(state: JourneyState, to: DiyStage): Transition {
  const from = stageIndex(state.stage);
  const next = stageIndex(to);
  if (next < 0) return { allowed: false, because: "That step does not exist." };

  if (!state.hasConsent && to !== "consented") {
    return { allowed: false, because: "Agree how this works before anything else happens." };
  }
  if (to === "consented" && !state.hasConsent) {
    return { allowed: false, because: "We have no record of your agreement yet." };
  }
  if ((to === "approved" || to === "sent") && !state.hasAttestation) {
    return { allowed: false, because: "Confirm the facts are true before approving a letter you will sign." };
  }
  if (to === "issues_identified" && state.unreviewedExtraction) {
    return { allowed: false, because: "Some of what we read was unclear. Check it before we look for problems." };
  }
  /* Going back is always allowed: re-reading a letter is not a regression. */
  if (next <= from) return { allowed: true };
  /* A finished round loops to the next one. */
  if (state.stage === "compared" && to === "report_added") return { allowed: true };
  if (next === from + 1) return { allowed: true };
  return { allowed: false, because: `Finish "${stageDefinition(ORDER[from + 1]).title}" first.` };
}

/** How far along, for the progress bar. */
export function progress(stage: DiyStage): { done: number; total: number; percent: number } {
  const done = stageIndex(stage) + 1;
  const total = ORDER.length;
  return { done, total, percent: Math.round((done / total) * 100) };
}

/** The one thing to do now. A consumer should never wonder what is next. */
export function nextAction(state: JourneyState): StageDefinition {
  if (state.stage === "compared") return stageDefinition("report_added");
  const next = ORDER[Math.min(stageIndex(state.stage) + 1, ORDER.length - 1)];
  return stageDefinition(next);
}

/**
 * Identity theft is entered deliberately and never inferred.
 *
 * An unfamiliar account is not identity theft, and a data breach in the news is
 * not proof that a particular account is fraudulent. The pathway opens only
 * when the person says so AND holds an Identity Theft Report, because the block
 * under 15 U.S.C. 1681c-2 rests on that report being true — and it is sworn.
 */
export function canEnterIdentityTheftPathway(input: {
  consumerDeclared: boolean;
  hasIdentityTheftReport: boolean;
}): Transition {
  if (!input.consumerDeclared) {
    return { allowed: false, because: "This pathway is only for items you say were not opened by you." };
  }
  if (!input.hasIdentityTheftReport) {
    return {
      allowed: false,
      because: "You need an Identity Theft Report from IdentityTheft.gov first. It is what makes a bureau block the item.",
    };
  }
  return { allowed: true };
}
