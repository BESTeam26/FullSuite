/**
 * Which conversations a partner is offered, and what they are called.
 *
 * Dee, 2026-09-13: "DMs and channels — general, creditops, marketing,
 * support. Channels are shown only when they are relevant to the partner's
 * active services."
 *
 * ── WHY THIS IS NOT IN THE DATABASE ─────────────────────────────────────────
 *
 * The database decides WHO MAY TALK TO WHOM, and it does (0333): a partner
 * contact reaches only their own partner's conversations, and a direct message
 * reaches only its two people. Whether a CreditOps channel is worth OFFERING
 * to a partner who buys no CreditOps is a different kind of question — it is a
 * product judgement about relevance, it changes when the product does, and
 * getting it wrong produces an untidy menu rather than a leak.
 *
 * Keeping the two apart is what lets this file be a plain function with tests
 * instead of a policy, and stops the authorization rule acquiring a second,
 * slightly different copy in SQL (rules 1, 5 and 9).
 *
 * ── RELEVANCE COMES FROM ENGAGEMENTS, NOT FROM SERVICE NAMES ────────────────
 *
 * `my_partner_services()` already returns the live engagement per module —
 * the same record that authorizes the work. So "does this partner do
 * marketing?" is answered by the thing that makes it true, not by matching
 * words in a service's name.
 */

/*
 * Dee, 2026-10-01 (PARTNER_PORTAL_DOCTRINE.md, Messages): "General · Support ·
 * Projects · Billing · Direct messages to assigned BES contacts." CreditOps
 * and Marketing (the 09-13 menu) are no longer OFFERED, but a conversation
 * that exists in one is still shown with its history — see topicsToShow.
 */
export const PORTAL_TOPIC_KEYS = ["general", "support", "projects", "billing", "creditops", "marketing"] as const;
export type PortalTopicKey = (typeof PORTAL_TOPIC_KEYS)[number];

export interface PortalTopic {
  key: PortalTopicKey;
  label: string;
  /** Said under the name, so a partner knows which one to write in. */
  purpose: string;
  /**
   * The modules that make this conversation relevant. `null` means always:
   * every partner can talk about their account in general, ask for help and
   * ask about money — including one whose services have all ended, who is
   * precisely the person most likely to need to.
   */
  modules: string[] | null;
  /** False for the retired 09-13 topics: kept when they exist, never offered new. */
  offered: boolean;
  /** Where the conversation's subject lives in the portal, for the header link. */
  link: { label: string; to: string } | null;
}

export const PORTAL_TOPICS: PortalTopic[] = [
  { key: "general", label: "General", purpose: "Anything about the account",
    modules: null, offered: true, link: { label: "Actions needed", to: "/partner/actions" } },
  { key: "support", label: "Support", purpose: "Access and anything that is not working",
    modules: null, offered: true, link: null },
  { key: "projects", label: "Projects", purpose: "Builds, campaigns, milestones and approvals",
    modules: ["bes_crm", "sales_marketing"], offered: true, link: { label: "View projects", to: "/partner/services" } },
  { key: "billing", label: "Billing", purpose: "Invoices, payments and your plan",
    modules: null, offered: true, link: { label: "View invoices", to: "/partner/billing" } },
  { key: "creditops", label: "CreditOps", purpose: "Client processing, disputes and results",
    modules: ["creditops"], offered: false, link: { label: "View clients", to: "/partner/clients" } },
  { key: "marketing", label: "Marketing", purpose: "Content, campaigns and approvals",
    modules: ["sales_marketing"], offered: false, link: { label: "View projects", to: "/partner/services" } },
];

/** The header link for a conversation's topic, or none. */
export const topicLink = (topic: string | null | undefined) =>
  PORTAL_TOPICS.find((t) => t.key === topic)?.link ?? null;

/** The conversations to offer a partner whose live engagements are these. */
export function topicsFor(liveModules: string[]): PortalTopic[] {
  const live = new Set(liveModules);
  return PORTAL_TOPICS.filter((t) => t.offered && (t.modules === null || t.modules.some((m) => live.has(m))));
}

/**
 * A conversation that EXISTS is always offered, whatever the services say.
 *
 * A partner whose marketing engagement ended last month still has the
 * marketing conversation, with everything that was said in it. Hiding it would
 * not close it — it would only make the history unreachable from the one
 * screen that should hold it (rule 11: history is the record).
 */
export function topicsToShow(liveModules: string[], existingTopics: string[]): PortalTopic[] {
  const existing = new Set(existingTopics);
  const relevant = new Set(topicsFor(liveModules).map((t) => t.key));
  return PORTAL_TOPICS.filter((t) => relevant.has(t.key) || existing.has(t.key));
}
