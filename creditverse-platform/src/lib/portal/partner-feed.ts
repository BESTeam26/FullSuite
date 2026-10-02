/**
 * The partner's Updates feed, shaped for the screen (Dee, 2026-10-01,
 * PARTNER_PORTAL_DOCTRINE.md: "Updates should be the clean external activity
 * feed … Not raw system logs.").
 *
 * Pure shaping. What a partner may see is decided by my_partner_feed() in the
 * database, scoped to their own partner; nothing here widens or narrows it.
 */

/** The kinds the database writes, one per line of the feed. */
export type FeedKind =
  | "client_status" | "client_added"
  | "project" | "milestone" | "deliverable"
  | "billing" | "account";

/** The filter groups — the same four names my_partner_feed(p_kind) accepts. */
export type FeedGroup = "clients" | "projects" | "billing" | "account";

export interface PartnerFeedItem {
  kind: FeedKind;
  happenedAt: string;
  title: string;
  detail: string | null;
  /** A portal route, or a delivery link BES attached to a milestone. */
  href: string | null;
}

export const FEED_GROUPS: readonly { key: FeedGroup; label: string }[] = [
  { key: "clients", label: "Clients" },
  { key: "projects", label: "Projects" },
  { key: "billing", label: "Billing" },
  { key: "account", label: "Account" },
];

const KIND_LABEL: Record<FeedKind, string> = {
  client_status: "Client update",
  client_added: "New client",
  project: "Project",
  milestone: "Milestone",
  deliverable: "Deliverable",
  billing: "Billing",
  account: "Account",
};

export const feedKindLabel = (kind: string) => KIND_LABEL[kind as FeedKind] ?? "Update";

/** A delivery link leaves the portal; every other href is a portal route. */
export const isExternalHref = (href: string | null): boolean => !!href && /^https?:\/\//i.test(href);

export function toFeedItem(row: Record<string, unknown>): PartnerFeedItem {
  return {
    kind: row.kind as FeedKind,
    happenedAt: row.happened_at as string,
    title: row.title as string,
    detail: (row.detail as string) ?? null,
    href: (row.href as string) ?? null,
  };
}

/** Stable key: the feed has no ids, and one moment can carry several lines. */
export const feedItemKey = (item: PartnerFeedItem, index: number) =>
  `${item.kind}|${item.happenedAt}|${index}`;
