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

export const PORTAL_TOPIC_KEYS = ["general", "creditops", "marketing", "support"] as const;
export type PortalTopicKey = (typeof PORTAL_TOPIC_KEYS)[number];

export interface PortalTopic {
  key: PortalTopicKey;
  label: string;
  /** Said under the name, so a partner knows which one to write in. */
  purpose: string;
  /**
   * The modules that make this conversation relevant. `null` means always:
   * every partner can talk about their account in general, and every partner
   * can ask for help — including one whose services have all ended, who is
   * precisely the person most likely to need to.
   */
  modules: string[] | null;
}

export const PORTAL_TOPICS: PortalTopic[] = [
  {
    key: "general",
    label: "General",
    purpose: "Anything about the account",
    modules: null,
  },
  {
    key: "creditops",
    label: "CreditOps",
    purpose: "Client processing, disputes and results",
    modules: ["creditops"],
  },
  {
    key: "marketing",
    label: "Marketing",
    purpose: "Content, campaigns and approvals",
    modules: ["sales_marketing"],
  },
  {
    key: "support",
    label: "Support",
    purpose: "Access, billing and anything that is not working",
    modules: null,
  },
];

/** The conversations to offer a partner whose live engagements are these. */
export function topicsFor(liveModules: string[]): PortalTopic[] {
  const live = new Set(liveModules);
  return PORTAL_TOPICS.filter((t) => t.modules === null || t.modules.some((m) => live.has(m)));
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
