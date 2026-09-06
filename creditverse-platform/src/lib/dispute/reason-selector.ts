/**
 * Which reason this item gets. Deterministic, and the same every time.
 *
 * Selection is a filter and a sort, in that order, with no cleverness in
 * between — because the question "why did this letter say that?" has to have
 * an answer six months later, in front of a regulator if it comes to it.
 *
 *   1. The subject must match the item's category.
 *   2. Every condition the reason requires must have been DETECTED.
 *   3. The round must have been reached.
 *   4. The tier must be the one the organization chose.
 *   5. Every attestation the reason depends on must be signed.
 *
 * Then: the reason resting on the most detected conditions wins, because a
 * reason that names three specific contradictions is worth more than one that
 * names none. Weight breaks a tie, and the id breaks that, so the result is
 * stable rather than dependent on row order.
 *
 * An organization's own reason always beats the BES default it was copied
 * from — same rule the Letter Library already follows.
 */
import type { DisputeReason, EscalationTier, ReasonCondition, ReasonSubject, Voice } from "./reason-catalogue";

export interface SelectionInput {
  subject: ReasonSubject;
  detected: ReasonCondition[];
  round: number;
  tier: EscalationTier;
  /** Register. Omit to accept either. */
  voice?: Voice;
  /** Which attestations the consumer actually signed. */
  attested: ReasonCondition[];
  catalogue: DisputeReason[];
}

export interface SelectionResult {
  chosen: DisputeReason | null;
  /** Every reason that qualified, best first — the interface offers these. */
  candidates: DisputeReason[];
  /** Reasons that matched the item but were held back, and why. */
  withheld: { reason: DisputeReason; because: string }[];
}

export function selectReason(input: SelectionInput): SelectionResult {
  const detected = new Set(input.detected);
  const attested = new Set(input.attested);
  const candidates: DisputeReason[] = [];
  const withheld: { reason: DisputeReason; because: string }[] = [];

  for (const r of input.catalogue) {
    if (!r.isActive) continue;
    if (r.subject !== input.subject) continue;
    if (r.tier !== input.tier) continue;
    if (input.voice && r.voice !== input.voice) continue;

    if (input.round < r.fromRound) {
      withheld.push({ reason: r, because: `Held until round ${r.fromRound}.` });
      continue;
    }
    const unmet = r.requires.filter((c) => !detected.has(c));
    if (unmet.length > 0) continue; // not applicable — not "withheld", it simply does not fit

    /* The line that matters. A reason claiming identity theft or a data breach
       may only be used when the consumer has actually said so, in writing.
       Putting a factual claim in a consumer's mouth is the CROA problem
       (15 U.S.C. § 1679b), not the strong language around it. */
    const missingAttestation = r.requiresAttestation.filter((c) => !attested.has(c));
    if (missingAttestation.length > 0) {
      withheld.push({
        reason: r,
        because: `Needs the consumer to sign: ${missingAttestation.join(", ")}.`,
      });
      continue;
    }
    candidates.push(r);
  }

  candidates.sort((a, b) => {
    const specificity = b.requires.length - a.requires.length;
    if (specificity !== 0) return specificity;
    /* An organization's own wording beats the BES default. */
    const own = Number(!!b.organizationId) - Number(!!a.organizationId);
    if (own !== 0) return own;
    if (b.weight !== a.weight) return b.weight - a.weight;
    return a.id.localeCompare(b.id);
  });

  return { chosen: candidates[0] ?? null, candidates, withheld };
}

/**
 * The tier a round suggests. The organization may override it — some prefer to
 * open firmly, others to build — but a default that escalates with the round
 * is what the corpus assumes, and it stops round 5 sounding like round 1.
 */
export function suggestedTier(round: number): EscalationTier {
  if (round <= 1) return "initial";
  if (round <= 3) return "firm";
  return "aggressive";
}
