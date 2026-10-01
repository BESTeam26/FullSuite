/**
 * The eight kinds of thing a partner may be asked for (PARTNER_PORTAL_DOCTRINE,
 * Dee 2026-10-01), in the partner's words. Keys are what the database says;
 * four come from asks BES raised, three are derived from canonical rows.
 */
export const ACTION_KIND_LABEL: Record<string, string> = {
  document_required: "Missing document",
  client_confirmation: "Client confirmation needed",
  partner_confirmation: "Confirmation needed",
  content_approval: "Approval needed",
  campaign_approval: "Approval needed",
  monitoring_login: "Monitoring login needed",
  billing: "Billing action",
  signature: "Agreement to sign",
  project_approval: "Project approval",
  information_request: "Information request",
  question: "Information request",
};

export const ACTION_KIND_ORDER = [
  "billing", "signature", "document_required", "client_confirmation", "partner_confirmation",
  "content_approval", "campaign_approval", "project_approval", "monitoring_login", "information_request", "question",
];

export function actionKindLabel(kind: string): string {
  return ACTION_KIND_LABEL[kind] ?? "Action needed";
}

/** What the one control on a derived row says. */
export function actionLinkLabel(kind: string): string {
  return kind === "billing" ? "View invoice" : kind === "signature" ? "Review and sign" : kind === "project_approval" ? "View project" : "Open";
}

export function sortByKindThenDate<T extends { kind: string; requestedAt: string }>(rows: readonly T[]): T[] {
  const rank = (k: string) => { const i = ACTION_KIND_ORDER.indexOf(k); return i < 0 ? ACTION_KIND_ORDER.length : i; };
  return rows.slice().sort((a, b) => rank(a.kind) - rank(b.kind) || (a.requestedAt < b.requestedAt ? 1 : -1));
}
