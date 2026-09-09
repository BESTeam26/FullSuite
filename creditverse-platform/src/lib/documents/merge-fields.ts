/**
 * The canonical merge-field registry (D-004) — every token the document
 * builder offers, with the sample value the editor previews it with.
 *
 * This is the allowlist the picker inserts from and the preview renders from.
 * The database's `render_document` is the authority at send time: it resolves
 * from `document_context_for`, which reads the same namespaces from canonical
 * records. Keep the two in step by keeping the namespaces here identical to
 * the keys that function emits — never by inventing a token the database will
 * leave unresolved.
 *
 * Two kinds, kept apart (the template directive's §2):
 *   custom_values.*  reusable configuration that reads through to the agency
 *   everything else  merge fields that resolve from the current record
 * Signature fields resolve at SIGNING, not at sending, and are the only
 * tokens allowed to survive rendering.
 */
export type MergeCategory =
  | "Business" | "Signer" | "Team member" | "Partner" | "Contact" | "Agreement" | "Date" | "Signature";

export interface MergeField {
  token: string;
  label: string;
  category: MergeCategory;
  /** Which audiences resolve it: member documents get user.*, partner documents get partner.* and contact.* */
  audiences: ("member" | "partner" | "client" | "any")[];
  sample: string;
  /** Filled by the signer, at signing. */
  atSigning?: boolean;
}

const ALL: MergeField["audiences"] = ["member", "partner", "client", "any"];

export const MERGE_FIELDS: MergeField[] = [
  { token: "custom_values.company_name", label: "Company name", category: "Business", audiences: ALL, sample: "Blessed Empire Services" },
  { token: "custom_values.legal_business_name", label: "Legal business name", category: "Business", audiences: ALL, sample: "Blessed Empire Services LLC" },
  { token: "custom_values.tagline", label: "Tagline", category: "Business", audiences: ALL, sample: "Beyond Outsourcing. Your Business Growth Engine." },
  { token: "custom_values.support_email", label: "Support email", category: "Business", audiences: ALL, sample: "support@blessedempireservices.com" },
  { token: "custom_values.support_phone", label: "Support phone", category: "Business", audiences: ALL, sample: "(555) 010-2000" },
  { token: "custom_values.website_url", label: "Website", category: "Business", audiences: ALL, sample: "https://bescrm.net" },

  { token: "signer.name", label: "Signer's full name", category: "Signer", audiences: ALL, sample: "Rowell Christian Pena" },
  { token: "signer.email", label: "Signer's email", category: "Signer", audiences: ALL, sample: "rowell@example.com" },

  { token: "user.name", label: "Team member name", category: "Team member", audiences: ["member", "any"], sample: "Rowell Christian Pena" },
  { token: "user.first_name", label: "Team member first name", category: "Team member", audiences: ["member", "any"], sample: "Rowell" },
  { token: "user.email", label: "Team member email", category: "Team member", audiences: ["member", "any"], sample: "rowell@example.com" },
  { token: "user.position", label: "Position", category: "Team member", audiences: ["member", "any"], sample: "Operations Manager" },

  { token: "partner.name", label: "Partner name", category: "Partner", audiences: ["partner", "any"], sample: "Bizhub" },
  { token: "partner.company_name", label: "Partner company", category: "Partner", audiences: ["partner", "any"], sample: "BizHub Financial LLC" },
  { token: "partner.primary_contact", label: "Partner primary contact", category: "Partner", audiences: ["partner", "any"], sample: "Lloyd Argame" },
  { token: "partner.email", label: "Partner email", category: "Partner", audiences: ["partner", "any"], sample: "ops@bizhub.example" },

  { token: "contact.name", label: "Contact name", category: "Contact", audiences: ["partner", "client", "any"], sample: "Xavier Coleman" },
  { token: "contact.first_name", label: "Contact first name", category: "Contact", audiences: ["partner", "client", "any"], sample: "Xavier" },
  { token: "contact.email", label: "Contact email", category: "Contact", audiences: ["partner", "client", "any"], sample: "xavier@example.com" },

  { token: "agreement.effective_date", label: "Effective date", category: "Agreement", audiences: ALL, sample: "September 9, 2026" },
  { token: "today", label: "Today's date", category: "Date", audiences: ALL, sample: "September 9, 2026" },
  { token: "current_year", label: "Current year", category: "Date", audiences: ALL, sample: "2026" },

  { token: "signature", label: "Signature (typed name, filled when they sign)", category: "Signature", audiences: ALL, sample: "Rowell Christian Pena", atSigning: true },
  { token: "signed_date", label: "Date signed (filled when they sign)", category: "Signature", audiences: ALL, sample: "September 9, 2026", atSigning: true },
];

export const SIGNATURE_TOKENS = new Set(MERGE_FIELDS.filter((f) => f.atSigning).map((f) => f.token));

const TOKEN = /\{\{\s*([a-z_][a-z0-9_]*(?:\.[a-z_][a-z0-9_]*)*)\s*\}\}/gi;

const escapeHtml = (v: string) =>
  v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

/**
 * Preview rendering — the same rule as the database's `render_document`:
 * replace known tokens with escaped values, leave unknown ones in place. The
 * editor uses this with SAMPLE values so a template can be checked without
 * sending anything (§10 of the template directive).
 */
export function renderPreview(body: string, values: Record<string, string>): string {
  return body.replace(TOKEN, (whole, token: string) => {
    const value = values[token.toLowerCase()];
    return value === undefined ? whole : escapeHtml(value);
  });
}

/** Tokens the body uses that this registry does not know. */
export function unknownTokens(body: string): string[] {
  const known = new Set(MERGE_FIELDS.map((f) => f.token));
  const seen = new Set<string>();
  for (const m of body.matchAll(TOKEN)) {
    const t = m[1].toLowerCase();
    if (!known.has(t)) seen.add(t);
  }
  return [...seen].sort();
}

/**
 * Sample values for every field this audience can resolve. A template written
 * for "any" audience previews everything; a member template previews the
 * member fields and never the partner ones, so its preview cannot show a value
 * the database will refuse to resolve at send.
 */
export function sampleValues(audience: MergeField["audiences"][number]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const f of MERGE_FIELDS) {
    if (audience === "any" || f.audiences.includes(audience)) out[f.token] = f.sample;
  }
  return out;
}

/** A starter body — so the first template is not a blank page. */
export const SAMPLE_AGREEMENT = `<h2>Independent Contractor Agreement</h2>
<p>This Agreement is entered into as of {{agreement.effective_date}} between <strong>{{custom_values.legal_business_name}}</strong> ("the Company") and <strong>{{user.name}}</strong> ("the Contractor").</p>
<p>The Contractor will provide services in the position of {{user.position}} and agrees to keep all client, partner and company information confidential.</p>
<p>Questions about this agreement go to {{custom_values.support_email}}.</p>
<p><em>Signed:</em> {{signature}}<br/><em>Date:</em> {{signed_date}}</p>`;
