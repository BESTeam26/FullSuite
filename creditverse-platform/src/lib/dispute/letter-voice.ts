/**
 * Does this read like a person wrote it?
 *
 * Dee: "Use THESE as guide for writing aggressive dispute reasons and letters
 * to be more human sounding, that's why there's an emotion here. Sounding
 * frustrated for more human feel."
 *
 * That is right, and it is not in tension with the compliance rules. The two
 * things a letter must never do are assert an unconfirmed fact and promise an
 * outcome. Being annoyed is neither. A consumer who has disputed the same
 * wrong balance three times IS annoyed, and a letter that pretends otherwise
 * reads as though a machine wrote it, which is precisely what a bureau's
 * automated triage is looking for.
 *
 * So the rule this file enforces is narrow:
 *
 *   FRUSTRATION IS ABOUT TONE. THE FACT UNDERNEATH STILL HAS TO BE CONFIRMED.
 *
 * "I have told you twice and the balance is still wrong" is frustrated and
 * true. "You are willfully violating federal law" is a legal conclusion the
 * record may not support. The first is voice; the second is a claim, and
 * claims are governed elsewhere by claim_tier and the attestation gate.
 *
 * ── What gets flagged, and why each one is a tell ───────────────────────────
 *
 * The em dash is banned outright by the specification. The rest are the
 * phrases that make a letter read as generated: hedging stacks, corporate
 * throat-clearing, and the particular constructions that no annoyed person
 * has ever typed. None of them are wrong; they are just not how someone writes
 * about their own credit report.
 *
 * Nothing here rewrites anything. It reports, a person decides, and the
 * consumer signs. Dee: "Everything will be reviewed by human still and the
 * actual client. Even in DIY Credit repair."
 */

export type Voice = "plain" | "frustrated";

export interface VoiceIssue {
  kind: "banned" | "robotic" | "overlong" | "hedge";
  found: string;
  why: string;
}

/** Banned outright by the specification's formatting rules. */
const BANNED: { pattern: RegExp; found: string; why: string }[] = [
  { pattern: /—/, found: "em dash", why: "The specification bans the em dash in mailed letters." },
  { pattern: /\bguarantee(d|s)?\b/i, found: "guarantee", why: "Promising an outcome is the CROA line, at every tier." },
];

/**
 * Phrasing that marks a letter as machine-written. Each is common in generated
 * text and vanishingly rare in a letter somebody wrote about their own file.
 */
const ROBOTIC: { pattern: RegExp; found: string; why: string }[] = [
  { pattern: /\bit is important to note\b/i, found: "it is important to note", why: "Nobody writes this about their own credit report." },
  { pattern: /\bplease be advised\b/i, found: "please be advised", why: "Form-letter throat-clearing. Say the thing instead." },
  { pattern: /\bi hope this (letter |message )?finds you\b/i, found: "i hope this finds you", why: "Filler. The recipient is a dispute queue." },
  { pattern: /\bin light of the foregoing\b/i, found: "in light of the foregoing", why: "Reads as drafted by a machine imitating a lawyer." },
  { pattern: /\bit should be noted that\b/i, found: "it should be noted that", why: "Padding. Delete it and the sentence improves." },
  { pattern: /\bfurthermore,\s*(moreover|additionally)\b/i, found: "stacked connectives", why: "Two connectives in a row is a generation tell." },
  { pattern: /\bdelve\b/i, found: "delve", why: "Not a word people use about a credit report." },
  { pattern: /\bnavigate the complexities\b/i, found: "navigate the complexities", why: "Pure filler." },
  { pattern: /\bi trust (that )?you will\b/i, found: "i trust you will", why: "Reads as insincere; say what is being asked." },
];

/** Hedges that undercut a letter about a fact the report itself shows. */
const HEDGES: { pattern: RegExp; found: string; why: string }[] = [
  { pattern: /\bit (would )?(seems?|appears?) (to me )?(that )?possibly\b/i, found: "stacked hedge", why: "Hedging twice about a confirmed fact reads as unsure." },
  { pattern: /\bi (may|might) be (mistaken|wrong),? but\b/i, found: "i may be wrong but", why: "Invites the bureau to dismiss it." },
  { pattern: /\bperhaps (you )?(could|might)\b/i, found: "perhaps you could", why: "A dispute is a request under statute, not a favour." },
];

/** Long sentences read as generated. People writing angry write short. */
const MAX_WORDS_PER_SENTENCE = 42;

export function checkVoice(text: string, voice: Voice = "plain"): VoiceIssue[] {
  const issues: VoiceIssue[] = [];

  for (const b of BANNED) {
    if (b.pattern.test(text)) issues.push({ kind: "banned", found: b.found, why: b.why });
  }
  for (const r of ROBOTIC) {
    if (r.pattern.test(text)) issues.push({ kind: "robotic", found: r.found, why: r.why });
  }
  /* Hedging is a problem in a frustrated letter and merely a style note in a
     plain one, so it is only raised where it actually undercuts the writing. */
  if (voice === "frustrated") {
    for (const h of HEDGES) {
      if (h.pattern.test(text)) issues.push({ kind: "hedge", found: h.found, why: h.why });
    }
  }

  for (const sentence of text.split(/(?<=[.!?])\s+/)) {
    const words = sentence.trim().split(/\s+/).filter(Boolean).length;
    if (words > MAX_WORDS_PER_SENTENCE) {
      issues.push({
        kind: "overlong",
        found: `${words}-word sentence`,
        why: "Long sentences read as generated. Somebody annoyed about their credit report writes short ones.",
      });
    }
  }
  return issues;
}

/**
 * Guidance shown next to the editor, drawn from Dee's aggressive examples. Not
 * enforced — a writer reads it and decides. Enforcing "sound annoyed" would
 * produce exactly the fake register it is meant to avoid.
 */
export const VOICE_NOTES: Record<Voice, string[]> = {
  plain: [
    "State the error, the evidence and the correction. Nothing else is needed.",
    "One statute, the one that actually fits. Stacking them weakens all of them.",
    "Short sentences. Exact dates, exact amounts, exact months.",
  ],
  frustrated: [
    "Say how many times this has been raised, and when. The repetition is the point.",
    "Name what was ignored last time, specifically.",
    "Ask a direct question and leave it unanswered on the page. 'How did you verify this?' works.",
    "Short sentences, and shorter when the point lands.",
    "Be annoyed about the FACT, never about a claim the record cannot carry. 'I have told you twice and the balance is still wrong' is fair. 'You are willfully breaking the law' is a finding, and it needs the record for it.",
    "Write as the person whose report this is, because they are the one signing it.",
  ],
};
