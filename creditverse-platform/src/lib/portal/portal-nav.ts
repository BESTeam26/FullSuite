/**
 * The Partner Portal's navigation, and the rules that decide what a given
 * partner sees.
 *
 * Dee, 2026-09-13, redesigning the information hierarchy:
 *
 *   "Clients comes before Billing. Invoices, Payments, Account Credit and
 *    Processing Credits all live inside Billing. Do not make Account Credit or
 *    Processing Credits separate main menu items."
 *
 * The order below is hers, unchanged, and the reason it matters is stated in
 * her own words: "the Partner relationship is operational first, financial
 * second." A portal that opens on a balance reads as a debt collector; one
 * that opens on their clients reads as the service they bought.
 *
 * ── CONDITIONAL, NOT DECORATIVE ─────────────────────────────────────────────
 *
 * A menu item nobody can use is noise, and worse, it is a promise. Referrals
 * is hidden outright because BES has no partner referral model yet — inventing
 * one so a menu could exist would be building a page that lies. Agreements
 * hides only when there has genuinely never been one.
 *
 * ── SUSPENSION NARROWS, IT DOES NOT LOCK OUT ────────────────────────────────
 *
 * A suspended partner keeps Billing, Agreements, Messages and Account Settings
 * — the things they need to fix the problem and the things that are theirs.
 * The service pages go quiet. Locking them out of the one screen where they
 * can pay is how a suspension becomes permanent.
 */

export type PortalPageId =
  | "overview" | "clients" | "services" | "actions" | "messages"
  | "billing" | "agreements" | "files" | "referrals" | "updates" | "settings";

export interface PortalNavItem {
  id: PortalPageId;
  label: string;
  path: string;
  /** Lucide icon name, resolved by the shell. */
  icon: string;
  /** Which count, if any, rides on this item. */
  badge?: "actions" | "messages" | "overdue";
  /** Still reachable while the partner is suspended for nonpayment. */
  whenSuspended: boolean;
}

/** Dee's order. Operational first, financial second. */
export const PORTAL_NAV: PortalNavItem[] = [
  { id: "overview",   label: "Overview",            path: "/partner",            icon: "LayoutDashboard", whenSuspended: true },
  { id: "clients",    label: "Clients",             path: "/partner/clients",    icon: "Users",           whenSuspended: false },
  { id: "services",   label: "Projects & Services", path: "/partner/services",   icon: "Workflow",        whenSuspended: false },
  { id: "actions",    label: "Actions Needed",      path: "/partner/actions",    icon: "ClipboardList",   badge: "actions", whenSuspended: true },
  { id: "messages",   label: "Messages",            path: "/partner/messages",   icon: "MessagesSquare",  badge: "messages", whenSuspended: true },
  { id: "billing",    label: "Billing",             path: "/partner/billing",    icon: "Wallet",          badge: "overdue", whenSuspended: true },
  { id: "agreements", label: "Agreements",          path: "/partner/agreements", icon: "FileSignature",   whenSuspended: true },
  { id: "files",      label: "Files",               path: "/partner/files",      icon: "FolderOpen",      whenSuspended: false },
  { id: "referrals",  label: "Referrals",           path: "/partner/referrals",  icon: "Share2",          whenSuspended: false },
  { id: "updates",    label: "Updates",             path: "/partner/updates",    icon: "Megaphone",       whenSuspended: true },
  { id: "settings",   label: "Account Settings",    path: "/partner/settings",   icon: "Settings",        whenSuspended: true },
];

/** What the portal knows about this partner before it draws anything. */
export interface PortalSummary {
  groupId: string;
  partnerName: string;
  suspended: boolean;
  activeClients: number;
  actionsNeeded: number;
  activeServices: number;
  unreadMessages: number;
  balanceCents: number;
  overdueInvoices: number;
  hasAgreements: boolean;
  hasAccountCredit: boolean;
  hasProcessingCredits: boolean;
  hasReferrals: boolean;
}

/**
 * The menu this partner actually gets.
 *
 * Suspension REMOVES service pages rather than disabling them: a greyed link
 * says "you are not allowed this", which is true and useless, where a shorter
 * menu plus the banner on Overview says what to do about it.
 */
export function navFor(summary: PortalSummary | null): PortalNavItem[] {
  if (!summary) return [];
  return PORTAL_NAV.filter((item) => {
    if (summary.suspended && !item.whenSuspended) return false;
    if (item.id === "referrals") return summary.hasReferrals;
    /* Kept once there is a history to read, hidden when there has genuinely
       never been one — Dee's own rule for this item. */
    if (item.id === "agreements") return summary.hasAgreements;
    return true;
  });
}

/** The number on a menu item, or null when there is nothing to say. */
export function badgeFor(item: PortalNavItem, summary: PortalSummary | null): number | null {
  if (!summary || !item.badge) return null;
  const n = item.badge === "actions" ? summary.actionsNeeded
    : item.badge === "messages" ? summary.unreadMessages
    : summary.overdueInvoices;
  return n > 0 ? n : null;
}

/** Which nav item a path belongs to — longest match, so `/partner` does not win everything. */
export function activePage(pathname: string): PortalPageId {
  const match = [...PORTAL_NAV]
    .sort((a, b) => b.path.length - a.path.length)
    .find((i) => pathname === i.path || pathname.startsWith(`${i.path}/`));
  return match?.id ?? "overview";
}
