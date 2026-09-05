/**
 * Letter merge — fills a template's {{placeholders}} from facts the platform
 * holds (the report item, the attestation, the consumer record) and refuses
 * to invent anything: an unfilled placeholder is an error, not an empty
 * string. Mirrors the database gate (`letter_prohibited_phrase`,
 * `approve_dispute_letter`) so the interface can explain a refusal before the
 * database repeats it. Pure; unit-tested.
 */

export const PLACEHOLDER_PATTERN = /\{\{\s*([a-z0-9_]+)\s*\}\}/gi;

/** Same list as the SQL gate; the SQL is the one that decides. */
export const PROHIBITED_PHRASES: readonly string[] = [
  "guarantee", "willful violation", "willful noncompliance", "metro 2 violation", "fraudulent", "illegal reinsertion",
  "must delete", "must be deleted", "unverifiable because", "data breach", "you are required to ensure maximum possible accuracy",
];

export function placeholdersIn(body: string): string[] {
  const out = new Set<string>();
  for (const m of body.matchAll(PLACEHOLDER_PATTERN)) out.add(m[1].toLowerCase());
  return [...out];
}

export type MergeOutcome = { ok: true; body: string } | { ok: false; missing: string[] };

/** Fill every placeholder or report exactly which ones have no value. */
export function mergeTemplate(body: string, values: Record<string, string | null | undefined>): MergeOutcome {
  const missing: string[] = [];
  const filled = body.replace(PLACEHOLDER_PATTERN, (_, key: string) => {
    const v = values[key.toLowerCase()];
    if (v === null || v === undefined || String(v).trim() === "") { missing.push(key.toLowerCase()); return `{{${key}}}`; }
    return String(v);
  });
  return missing.length ? { ok: false, missing: [...new Set(missing)] } : { ok: true, body: filled };
}

export function prohibitedPhrase(body: string): string | null {
  const lower = body.toLowerCase();
  return PROHIBITED_PHRASES.find((p) => lower.includes(p)) ?? null;
}

export type RecipientKind = "cra" | "furnisher" | "collector" | "secondary_bureau" | "cfpb";
export type DisputeOrigin = "consumer_prepared" | "attorney_assisted" | "cro_prepared" | "cra_forwarded";

/** Recipient-fit checks the database also enforces; returned as plain sentences. */
export function citationProblems(body: string, recipient: RecipientKind, origin: DisputeOrigin): string[] {
  const problems: string[] = [];
  if (recipient === "furnisher" && /1681e\(b\)/i.test(body)) problems.push("Section 1681e(b) is a consumer reporting agency duty; it cannot be cited to a furnisher.");
  if (recipient === "furnisher" && origin === "cro_prepared" && /1022\.43/.test(body)) problems.push("A credit-repair-organization-prepared direct dispute cannot rely on 12 C.F.R. § 1022.43; use the CRA route.");
  if (recipient !== "collector" && /1692e/.test(body)) problems.push("FDCPA § 1692e applies to a debt collector, not to this recipient.");
  return problems;
}

export interface ReadinessForApproval { ready: boolean; reasons: string[] }

/** Everything the database will check, so the interface can say why before the click. */
export function approvalReadiness(input: { body: string; recipient: RecipientKind; origin: DisputeOrigin; attested: boolean }): ReadinessForApproval {
  const reasons: string[] = [];
  if (input.body.trim().length < 40) reasons.push("The letter has no body.");
  if (placeholdersIn(input.body).length) reasons.push(`Unfilled placeholders: ${placeholdersIn(input.body).join(", ")}.`);
  if (!input.attested) reasons.push("The consumer attestation (truth gate) is missing.");
  const bad = prohibitedPhrase(input.body);
  if (bad) reasons.push(`Contains a prohibited phrase: "${bad}".`);
  reasons.push(...citationProblems(input.body, input.recipient, input.origin));
  return { ready: reasons.length === 0, reasons };
}
