/**
 * Running a Metro 2 section against a real report, and grouping what comes
 * back the way a reviewer has to act on it.
 *
 * Section A's rules were built and tested as pure functions with nothing
 * calling them. This is the thing that calls them — and it is deliberately
 * separate from `condition-detector`, because the two answer different
 * questions:
 *
 *   condition-detector  →  what is WRONG WITH THIS ACCOUNT's reporting, in
 *                          terms the reason catalogue can turn into a letter
 *   this                →  which FIELDS carry a defect, with the catalogue
 *                          reference, the permitted claim and the recipient
 *
 * A Metro 2 finding belongs in the letter's disputed-field table, not in the
 * reason it was written. Folding it into `ReasonCondition` would make a field
 * defect masquerade as an argument, which is exactly the confusion the
 * "data observation → Metro 2 relationship → apparent defect → legal
 * applicability → claim → recipient" chain exists to prevent.
 */
import type { Confidence } from "@/lib/dispute/condition-detector";
import { runRule, type Metro2Rule, type PermittedClaim, type RuleProvenance } from "./types";

export interface Metro2Finding {
  ruleId: string;
  title: string;
  provenance: RuleProvenance;
  /** "evaluated" with a confidence, or "unknown" with what was missing. */
  confidence: Confidence | null;
  observation: string;
  /** For an apparent finding: the fact that would settle it either way. */
  needs?: string;
  /** For unknown: the fields that were not reported. */
  missing?: string[];
  claim: PermittedClaim;
  guardrails: string[];
}

export interface Metro2SectionResult {
  /** Defects the report itself establishes. Safe to assert. */
  confirmed: Metro2Finding[];
  /** Defects that look present but need one more fact. Ask, do not assert. */
  apparent: Metro2Finding[];
  /**
   * Rules that could not be judged, and what was missing.
   *
   * Kept and surfaced rather than dropped. An unknown is a reason to go and
   * find the fact — and, crucially, it must never quietly become a confirmed
   * defect or a clean bill of health.
   */
  unknown: Metro2Finding[];
  /** Considered and ruled out, so nobody disputes correct reporting. */
  notAnError: Metro2Finding[];
}

const empty = (): Metro2SectionResult => ({ confirmed: [], apparent: [], unknown: [], notAnError: [] });

/**
 * Run every rule in a section over one input.
 *
 * Pure and total: every rule lands in exactly one bucket, and a rule that
 * cannot be judged lands in `unknown` rather than being silently absent.
 * "Nothing was reported" and "nothing is wrong" must never look the same.
 */
export function runSection<T extends object>(rules: Metro2Rule<T>[], input: T): Metro2SectionResult {
  const result = empty();
  for (const rule of rules) {
    const outcome = runRule(rule, input);
    const finding: Metro2Finding = {
      ruleId: rule.id,
      title: rule.title,
      provenance: rule.provenance,
      confidence: outcome.confidence ?? null,
      observation: outcome.observation,
      needs: outcome.needs,
      missing: outcome.missing,
      claim: rule.claim,
      guardrails: rule.guardrails,
    };
    if (outcome.evaluability === "unknown") result.unknown.push(finding);
    else if (outcome.confidence === "confirmed") result.confirmed.push(finding);
    else if (outcome.confidence === "apparent") result.apparent.push(finding);
    else result.notAnError.push(finding);
  }
  return result;
}

/**
 * The rows a letter's disputed-field table may carry.
 *
 * Confirmed findings only. An apparent one belongs in the questions section
 * and an unknown belongs in nobody's letter at all — asserting either as a
 * disputed field is the false-positive the catalogue's guardrails exist to
 * stop.
 */
export function assertableClaims(result: Metro2SectionResult): { ruleId: string; assertion: string; recipient: PermittedClaim["recipient"]; citations: string[] }[] {
  return result.confirmed.map((f) => ({
    ruleId: f.ruleId,
    assertion: f.claim.assertion,
    recipient: f.claim.recipient,
    citations: f.claim.citations,
  }));
}

/** The questions an apparent finding permits. Asked, never asserted. */
export function permittedQuestions(result: Metro2SectionResult): { ruleId: string; question: string; needs?: string }[] {
  return result.apparent.map((f) => ({ ruleId: f.ruleId, question: f.claim.question, needs: f.needs }));
}

/**
 * Claims for one recipient. A furnisher duty aimed at a bureau gets the letter
 * dismissed and takes the rest of it down with it, so this filter is not a
 * convenience.
 */
export function claimsFor(
  result: Metro2SectionResult,
  recipient: "cra" | "furnisher" | "collector",
): Metro2Finding[] {
  return result.confirmed.filter((f) => f.claim.recipient === recipient || f.claim.recipient === "either");
}

/** What is still needed before the section can be judged completely. */
export function outstandingFacts(result: Metro2SectionResult): string[] {
  const facts = new Set<string>();
  for (const f of result.unknown) for (const m of f.missing ?? []) facts.add(m);
  for (const f of result.apparent) if (f.needs) facts.add(f.needs);
  return [...facts];
}
