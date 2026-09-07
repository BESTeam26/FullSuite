/**
 * Assembling a dispute letter, in the shape the BES letter library uses.
 *
 * The library's letters all share one anatomy, and it is a good one — every
 * block earns its place:
 *
 *   consumer block · date · recipient block · RE: line · salutation
 *   opening        which report, which date, what is being asked, one statute
 *   ITEM TABLE     disputed | reported as | my records show | evidence | action
 *   conditionals   paragraphs that appear only when a fact supports them
 *   closing        reinvestigate, correct or delete, send written results
 *   enclosures     what is in the envelope
 *   sign-off       signature, printed name
 *   footer         the draft-for-verification notice
 *
 * The ITEM TABLE is the part that matters most, and it is why this composer
 * exists rather than a pile of prose templates. Four columns force the letter
 * to be specific:
 *
 *   "Currently reported as"     comes from the imported report
 *   "My records show"           comes from the consumer's own evidence
 *   "Enclosed evidence"         names the document, or says none
 *   "Requested action"          correction, or deletion, never both
 *
 * A letter that cannot fill those columns has nothing to say, and the
 * specification's instruction — never write "there are multiple inaccuracies"
 * — is enforced by the shape rather than by a reviewer catching it.
 *
 * ── What this will not do ───────────────────────────────────────────────────
 *
 * It will not invent an address. The library prints "VERIFY CURRENT ADDRESS
 * BEFORE MAILING" against every bureau address, and the specification forbids
 * hardcoding one. An unverified address comes through as a blank the sender
 * must fill, because a letter to a stale dispute address is a wasted round and
 * a wasted 30 days.
 *
 * It will not leave a placeholder in a finished letter. Unfilled brackets are
 * returned as `unresolved`, and a letter with any is not ready to send.
 */
import type { Confidence, Finding } from "./condition-detector";
import type { RoundDefinition } from "./escalation-ladder";

export interface ConsumerBlock {
  fullName: string;
  street: string;
  cityStateZip: string;
  phone?: string;
  email?: string;
}

export interface RecipientBlock {
  name: string;
  /** Null when it has not been verified. The letter says so rather than guessing. */
  disputeAddress: string | null;
  cityStateZip: string | null;
}

export interface DisputedItem {
  /** "Account with ABC Bank ending in 1234" — masked, always. */
  label: string;
  /** Exactly what the report says today. */
  reportedAs: string;
  /** What the consumer's own records show. Absent when they have no record. */
  recordsShow?: string;
  /** The document in the envelope that supports it. */
  evidence?: string;
  requestedAction: string;
  /** Only confirmed findings become assertions; apparent ones become questions. */
  findings: Finding[];
}

export interface ComposeInput {
  consumer: ConsumerBlock;
  recipient: RecipientBlock;
  round: RoundDefinition;
  /** Which bureau's report, and when it was pulled. */
  reportName: string;
  reportDate: string;
  letterDate: string;
  items: DisputedItem[];
  /** Standing blocks from the library — the ID purge notice and the like. */
  standingBlocks?: string[];
  enclosures?: string[];
  /** A reference the bureau gave us, when we have one. */
  referenceNumber?: string;
}

export interface ComposedLetter {
  subject: string;
  blocks: string[];
  /** Questions raised from apparent findings, kept separate from assertions. */
  questions: string[];
  /** Anything the sender must supply before this can go out. */
  unresolved: string[];
  ready: boolean;
}

const MASKED = /\b\d{5,}\b/;

/** The one-line RE:, built from the round and the items rather than typed. */
function subjectLine(input: ComposeInput): string {
  const what = input.items.length === 1 ? input.items[0].label : `${input.items.length} items`;
  const ref = input.referenceNumber ? `, Reference ${input.referenceNumber}` : "";
  return `RE: ${input.round.name}: ${what}${ref}`;
}

/**
 * The item table, as lines. Rendered to a real table by whatever produces the
 * document; kept as data here so the same letter can become HTML, DOCX or
 * plain text without three copies of the wording.
 */
export function itemRows(items: DisputedItem[]): string[][] {
  return items.map((i) => [
    i.label,
    i.reportedAs,
    i.recordsShow ?? "Not stated",
    i.evidence ?? "None enclosed",
    i.requestedAction,
  ]);
}

export const ITEM_TABLE_HEADERS = [
  "Item disputed",
  "Currently reported as",
  "My records show",
  "Enclosed evidence",
  "Requested action",
];

export function composeLetter(input: ComposeInput): ComposedLetter {
  const unresolved: string[] = [];
  const blocks: string[] = [];

  /* ---- Who it is from ---- */
  const from = [input.consumer.fullName, input.consumer.street, input.consumer.cityStateZip,
                input.consumer.phone, input.consumer.email].filter(Boolean) as string[];
  if (!input.consumer.fullName.trim()) unresolved.push("The consumer's full name.");
  if (!input.consumer.street.trim()) unresolved.push("The consumer's address.");
  blocks.push(from.join("\n"));
  blocks.push(input.letterDate);

  /* ---- Who it is to. An unverified address is stated, never invented. ---- */
  if (!input.recipient.disputeAddress) {
    unresolved.push(
      `The current dispute address for ${input.recipient.name}. Check the address printed on the consumer's own report or the bureau's current page — a letter to a stale address costs the round and thirty days.`,
    );
    blocks.push(`${input.recipient.name}\n[DISPUTE ADDRESS — VERIFY BEFORE MAILING]`);
  } else {
    blocks.push([input.recipient.name, input.recipient.disputeAddress, input.recipient.cityStateZip]
      .filter(Boolean).join("\n"));
  }

  const subject = subjectLine(input);
  blocks.push(subject);
  blocks.push("To Whom It May Concern:");

  /* ---- Opening. One statute, the strongest that fits this round. ---- */
  const cite = input.round.legalBasis[0];
  blocks.push(
    `I am writing about information on my ${input.reportName} credit report dated ${input.reportDate}. ` +
    `I am asking you to ${input.round.asksFor[0].toLowerCase()}${cite ? ` under ${cite}` : ""}.`,
  );

  /* ---- The items. Only CONFIRMED findings are stated as fact. ---- */
  const questions: string[] = [];
  for (const item of input.items) {
    if (MASKED.test(item.label)) {
      unresolved.push(`"${item.label}" appears to contain a full account number. Mask all but the last four digits.`);
    }
    const stated = item.findings.filter((f) => f.confidence === "confirmed");
    if (stated.length === 0 && item.findings.length > 0) {
      /* Nothing confirmed. The item may still be raised — as a question. */
      unresolved.push(
        `${item.label}: nothing is confirmed, only ${item.findings.length} apparent issue(s). ` +
        `Raise it as a question or gather the fact that would settle it; do not assert it.`,
      );
    }
    for (const f of item.findings) {
      if (f.confidence === "apparent") {
        questions.push(`${item.label}: ${f.observation}${f.needs ? ` Please explain ${f.needs}` : ""}`);
      }
    }
  }

  /* ---- Conditional paragraphs. Only when the round actually reaches them. ---- */
  if (input.round.recipients.includes("cra") && input.round.number >= 3) {
    blocks.push(
      "Please forward the enclosed documentation to the furnisher with your notice of this dispute.",
    );
  }

  /* ---- Closing, from what this round is asking for. ---- */
  const asks = input.round.asksFor.map((a) => `- ${a}`).join("\n");
  blocks.push(`I am asking for the following:\n${asks}\n\nPlease send me the results in writing.`);

  for (const b of input.standingBlocks ?? []) blocks.push(b);

  const enclosures = input.enclosures ?? [];
  blocks.push(enclosures.length > 0
    ? `Enclosures:\n${enclosures.map((e) => `- ${e}`).join("\n")}`
    : "Enclosures: none");

  blocks.push(`Sincerely,\n\n${input.consumer.fullName}`);

  /* ---- Anything still bracketed is not ready to send. ---- */
  const bracketed = blocks.join("\n").match(/\[[A-Z][^\]]*\]/g) ?? [];
  for (const b of new Set(bracketed)) unresolved.push(`Unfilled placeholder: ${b}`);

  if (input.items.length === 0) unresolved.push("The letter disputes nothing. Add at least one item.");

  /* THE ONE HARD RULE ABOUT EVIDENCE (CR-4a).
     BES never requires a document before a dispute may proceed — a consumer's
     own statement is a complete basis, and evidence often lives outside BES
     entirely. What a letter may never do is claim an enclosure that is not in
     the envelope. "The enclosed statement shows…" is a statement about a
     document; "I paid this in full in March" is the consumer speaking and
     needs nothing attached. */
  const enclosed = new Set(enclosures.map((e) => e.trim().toLowerCase()));
  for (const item of input.items) {
    const named = item.evidence?.trim();
    if (!named) continue;
    if (!enclosed.has(named.toLowerCase())) {
      unresolved.push(
        `"${item.label}" names evidence that is not enclosed: "${named}". Attach it, or remove the reference — a letter cannot describe an enclosure the envelope does not contain.`,
      );
    }
  }

  return { subject, blocks, questions, unresolved, ready: unresolved.length === 0 };
}

/** Confidence a reviewer sees on the queue card, in plain words. */
export const CONFIDENCE_LABELS: Record<Confidence, string> = {
  confirmed: "Confirmed by the report",
  apparent: "Worth asking about",
  not_an_error: "Checked — normal reporting",
};
