/**
 * The Partner Portal's frame: a sidebar of pages, a top bar, and one content
 * area.
 *
 * Dee, 2026-09-13: "I want a modern multi-page Partner Portal, not a long
 * single page… Do NOT create one giant scrolling page."
 *
 * The navigation is computed from `navFor`, which is pure and tested, so what
 * a partner can see is decided in one readable place rather than in JSX
 * conditions scattered down a file. Hiding a link is presentation only — every
 * page behind it is gated by the database as the signed-in contact, and a
 * suspended partner who types a URL is refused by the read, not by the menu.
 */
import { useMemo, useState, type ReactNode } from "react";
import { Link, useLocation } from "react-router-dom";
import {
  Bell, ClipboardList, FileSignature, FolderOpen, LayoutDashboard, Loader2, Megaphone,
  Menu, MessagesSquare, Search, Settings, Share2, Users, Wallet, Workflow, X,
} from "lucide-react";
import { useAuth } from "@/lib/auth/auth-context";
import { cn } from "@/lib/utils";
import { activePage, badgeFor, navFor, type PortalSummary } from "@/lib/portal/portal-nav";
import { useSeo } from "@/lib/use-seo";

const ICONS: Record<string, typeof Users> = {
  LayoutDashboard, Users, Workflow, ClipboardList, MessagesSquare,
  Wallet, FileSignature, FolderOpen, Share2, Megaphone, Settings,
};

/** Two initials for the avatar, so the bar needs no image request. */
const initials = (name: string): string =>
  name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase() ?? "").join("") || "?";

export function PortalShell({
  summary,
  title,
  description,
  actions,
  children,
}: {
  summary: PortalSummary;
  title: string;
  description?: string;
  /** Page-level controls, beside the heading. */
  actions?: ReactNode;
  children: ReactNode;
}) {
  const { displayName, signOut } = useAuth();
  const { pathname } = useLocation();
  /*
   * The portal never set a document title, so a partner who arrived through
   * /login kept a tab reading "Sign in — BES" for the whole session. The agency
   * app does this in DashboardLayout; the portal simply had no equivalent.
   *
   * noindex because a signed-in partner's account pages are not for crawlers.
   */
  useSeo({
    title: `${title} — ${summary.partnerName}`,
    description: description ?? "Your BES partner account.",
    canonical: pathname,
    noindex: true,
  });
  const [menuOpen, setMenuOpen] = useState(false);
  const nav = useMemo(() => navFor(summary), [summary]);
  const current = activePage(pathname);

  const links = (onNavigate?: () => void) => (
    <ul className="space-y-0.5">
      {nav.map((item) => {
        const Icon = ICONS[item.icon] ?? LayoutDashboard;
        const badge = badgeFor(item, summary);
        const active = current === item.id;
        return (
          <li key={item.id}>
            <Link
              to={item.path}
              onClick={onNavigate}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring focus-visible:ring-offset-2 focus-visible:ring-offset-sidebar",
                active
                  ? "bg-sidebar-accent font-semibold text-sidebar-accent-foreground"
                  : "text-sidebar-foreground/80 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground",
              )}
            >
              <Icon className="h-4 w-4 shrink-0" />
              <span className="min-w-0 flex-1 truncate">{item.label}</span>
              {badge !== null && (
                <span className={cn(
                  "shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-bold tabular-nums",
                  item.badge === "overdue"
                    ? "bg-red-500 text-white"
                    : "bg-sidebar-primary text-sidebar-primary-foreground",
                )}>
                  {badge}
                </span>
              )}
            </Link>
          </li>
        );
      })}
    </ul>
  );

  return (
    <div className="flex min-h-screen bg-background">
      {/* ── Sidebar ─────────────────────────────────────────────────────── */}
      <aside
        data-bes-chrome="dark"
        className="hidden w-60 shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground lg:flex"
      >
        <div className="flex items-center gap-2.5 border-b border-sidebar-border px-4 py-4">
          <img src="/bes-logo.png" alt="BES" className="h-8 w-8 shrink-0 object-contain"
            onError={(e) => { e.currentTarget.hidden = true; }} />
          <div className="min-w-0">
            <p className="truncate text-sm font-bold text-sidebar-foreground">BES</p>
            <p className="truncate text-[11px] text-sidebar-foreground/60">Partner Portal</p>
          </div>
        </div>
        <nav aria-label="Partner Portal" className="flex-1 overflow-y-auto p-2">{links()}</nav>
        <div className="border-t border-sidebar-border p-3">
          <p className="truncate text-xs font-medium text-sidebar-foreground">{summary.partnerName}</p>
          <p className="truncate text-[11px] text-sidebar-foreground/60">{displayName}</p>
          <button type="button" onClick={() => void signOut()}
            className="mt-1.5 text-[11px] text-sidebar-foreground/70 hover:text-sidebar-foreground hover:underline">
            Sign out
          </button>
        </div>
      </aside>

      {/* ── Main ────────────────────────────────────────────────────────── */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-border bg-card px-4 py-3">
          <button
            type="button"
            aria-label={menuOpen ? "Close menu" : "Open menu"}
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((o) => !o)}
            className="rounded-lg p-1.5 text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring lg:hidden"
          >
            {menuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>

          <div className="relative hidden min-w-0 max-w-sm flex-1 sm:block">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <input
              type="search"
              placeholder="Search clients, invoices, files"
              aria-label="Search"
              className="h-8 w-full rounded-lg border border-border bg-background pl-8 pr-3 text-xs text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>

          <div className="ml-auto flex items-center gap-2">
            <Link
              to="/partner/actions"
              aria-label={`Actions needed${summary.actionsNeeded > 0 ? `, ${summary.actionsNeeded}` : ""}`}
              className="relative rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <Bell className="h-4 w-4" />
              {summary.actionsNeeded > 0 && (
                <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
                  {summary.actionsNeeded}
                </span>
              )}
            </Link>
            <Link
              to="/partner/messages"
              aria-label={`Messages${summary.unreadMessages > 0 ? `, ${summary.unreadMessages} unread` : ""}`}
              className="relative rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <MessagesSquare className="h-4 w-4" />
              {summary.unreadMessages > 0 && (
                <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-primary-foreground">
                  {summary.unreadMessages}
                </span>
              )}
            </Link>
            <div className="hidden text-right sm:block">
              <p className="text-xs font-semibold text-foreground">{summary.partnerName}</p>
              <p className="text-[11px] text-muted-foreground">Partner</p>
            </div>
            <span
              aria-hidden
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground"
            >
              {initials(displayName)}
            </span>
          </div>
        </header>

        {menuOpen && (
          <nav
            aria-label="Partner Portal"
            data-bes-chrome="dark"
            className="border-b border-sidebar-border bg-sidebar text-sidebar-foreground p-2 lg:hidden"
          >
            {links(() => setMenuOpen(false))}
          </nav>
        )}

        <main className="min-w-0 flex-1 p-4 md:p-6">
          <div className="mx-auto max-w-5xl">
            <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <h1 className="text-xl font-bold text-foreground">{title}</h1>
                {description && <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>}
              </div>
              {actions}
            </div>
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}

/** The frame, before the partner is known. Keeps the layout rather than flashing. */
export function PortalShellLoading() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
    </div>
  );
}
