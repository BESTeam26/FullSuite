/**
 * The shape every Metro 2 defect rule takes.
 *
 * Dee's instruction for this work, quoted because it decides the whole design:
 *
 *   "do NOT bulk-convert the entire document into vague AI rules. Each defect
 *    must become an explicit, testable field relationship with: source/
 *    provenance → required fields → evaluation conditions → confirmed/apparent/
 *    unknown classification → false-positive guardrails → permitted claim
 *    language → applicable recipient → tests."
 *
 * So a rule is not a sentence with a regular expression attached. It is a
 * small, complete argument, and every part of it is on the type below.
 *
 * ── Three lines that never move ────────────────────────────────────────────
 *
 * UNKNOWN NEVER BECOMES CONFIRMED. If a required field is absent, the rule
 * cannot be evaluated and says so. It does not fall back to "probably fine" or
 * "probably wrong" — an unevaluable rule contributes nothing to a letter.
 *
 * AN INFERRED CODE IS NEVER A DISPLAYED ONE. A consumer report prints
 * "Paid, was charge-off", not "64". A rule that needs the raw code may only
 * reach `confirmed` when the code was actually displayed.
 *
 * A DATA INCONSISTENCY IS NOT A LEGAL CLAIM. The chain runs
 *
 *   data observation → Metro 2 relationship → apparent defect →
 *   legal applicability → dispute claim → recipient → letter language
 *
 * and each arrow is a separate decision. `claim` and `recipient` below exist
 * so the last two are never inferred from the first.
 */
import type { Confidence } from "@/lib/dispute/condition-detector";

/** Where the rule came from, so any claim can be traced back. */
export interface RuleProvenance {
  /** Section letter and numbered item in the BES Metro 2 defect catalogue. */
  catalogue: string;
  /** What the underlying source actually is. Metro 2 is a FORMAT, not a law. */
  sourceKind: "metro2_format" | "cra_guidance" | "statute" | "regulation";
  note?: string;
}

/**
 * Whether a rule could even be judged. Separate from the verdict on purpose:
 * "I could not tell" and "there is nothing wrong" are different answers, and
 * collapsing them is how a missing field becomes a clean bill of health.
 */
export type Evaluability = "evaluated" | "unknown";

export interface PermittedClaim {
  /** What may be ASSERTED, in the consumer's voice. Never a legal conclusion. */
  assertion: string;
  /** What may be ASKED when the finding is only apparent. */
  question: string;
  /**
   * Who this is properly addressed to. A furnisher duty aimed at a bureau, or
   * a collector provision aimed at an original creditor, gets a letter
   * dismissed and takes the rest of it down with it.
   */
  recipient: "cra" | "furnisher" | "collector" | "either";
  /**
   * Cited only where the facts reach the provision. Empty is common and
   * correct: most defects are argued from the report, not from a statute.
   */
  citations: string[];
}

export interface Metro2Rule<TInput> {
  id: string;
  title: string;
  provenance: RuleProvenance;
  /** Field names that must be present for the rule to be evaluable at all. */
  requires: (keyof TInput)[];
  /** Things that look like this defect and are not. Applied before any verdict. */
  guardrails: string[];
  claim: PermittedClaim;
  /** Pure. No dates, no randomness, no I/O — the same input always agrees. */
  evaluate: (input: TInput) => RuleOutcome;
}

export interface RuleOutcome {
  evaluability: Evaluability;
  /** Only meaningful when evaluated. */
  confidence?: Confidence;
  /** Plain and checkable against the report. Never a conclusion. */
  observation: string;
  /** For an apparent finding: the fact that would settle it. */
  needs?: string;
  /** For unknown: what is missing. */
  missing?: string[];
}

/** Nothing could be judged here, and that is the answer. */
export function cannotEvaluate(missing: string[]): RuleOutcome {
  return {
    evaluability: "unknown",
    observation: `Not enough is reported to judge this: ${missing.join(", ")} missing.`,
    missing,
  };
}

export function confirmed(observation: string): RuleOutcome {
  return { evaluability: "evaluated", confidence: "confirmed", observation };
}

export function apparent(observation: string, needs: string): RuleOutcome {
  return { evaluability: "evaluated", confidence: "apparent", observation, needs };
}

export function notAnError(observation: string): RuleOutcome {
  return { evaluability: "evaluated", confidence: "not_an_error", observation };
}

/**
 * Run a rule, refusing to evaluate it when a field it needs is absent.
 *
 * The guard is here rather than in each rule so it cannot be forgotten: this
 * is the single place UNKNOWN is produced, and there is no path from here to
 * `confirmed` without every required field being present.
 */
export function runRule<T extends object>(rule: Metro2Rule<T>, input: T): RuleOutcome {
  const missing = rule.requires.filter((k) => {
    const v = input[k];
    return v === undefined || v === null || v === "";
  }) as string[];
  if (missing.length > 0) return cannotEvaluate(missing);
  return rule.evaluate(input);
}
