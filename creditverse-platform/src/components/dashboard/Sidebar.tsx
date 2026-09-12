import { useEffect, useMemo } from "react";
import { PanelResizer } from "@/components/dashboard/PanelResizer";
import { usePanelWidth } from "@/lib/agency/use-panel-width";
import { useAgency } from "@/lib/agency-context";
import { Link, useLocation } from "react-router-dom";
import { PrefetchLink } from "@/components/nav/PrefetchLink";
import { prefetchVisibleRoutes } from "@/lib/nav/prefetch-visible";
import {
  LayoutDashboard,
  Building2,
  AlertTriangle,
  ListTodo,
  Clock,
  Timer,
  Bell,
  FileText,
  Landmark,
  FolderOpen,
  Workflow,
  UserCheck,
  Users,
  Network,
  Handshake,
  Gift,
  Send,
  BadgeDollarSign,
  CircleDollarSign,
  RefreshCw,
  Briefcase,
  BarChart3,
  Banknote,
  HandCoins,
  MessagesSquare,
  Scale,
  BookOpen,
  Megaphone,
  Calendar,
  Settings,
  LifeBuoy,
  Receipt,
  LogOut,
  Zap,
  LayoutGrid,
  PanelLeftClose,
  PanelLeftOpen,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { SubAccountSwitcher } from "@/components/dashboard/SubAccountSwitcher";
import { useMyWork, useAttention } from "@/lib/data/use-work";
import { useChannels } from "@/lib/data/use-channels";
import { totalUnread } from "@/lib/communication/channel-groups";
import { useUnreadNotificationCount } from "@/lib/data/use-notifications";
import { useAuth } from "@/lib/auth/auth-context";
import { usePermissions, type PermissionKeyName } from "@/lib/auth/use-permission";
import { accessTo, routeFor } from "@/lib/agency/navigation";
import { Eye } from "lucide-react";
import { useAgencyAccessContext } from "@/lib/agency/use-access-context";
import { useAgencyPermissions, type AgencyPermission } from "@/lib/data/agency-permissions";
import { useHubNavigation } from "@/lib/data/use-hub";
import { HUB_MODULE_ICONS } from "@/lib/hub/hub-icons";
import { useSidebarState } from "@/components/dashboard/sidebar-state";

const SETTINGS_KEYS: readonly PermissionKeyName[] = ["settings.manage", "team.manage", "team.permissions", "billing.view", "creditops.letters.templates"];

type NavItem = {
  label: string;
  icon: React.ElementType;
  href: string;
  badge?: number;
  show?: boolean;
  /** Hidden for members without any of these keys (interface mirror of member_can). */
  permission?: PermissionKeyName | readonly PermissionKeyName[];
};

type NavGroup = {
  label: string;
  items: NavItem[];
  show?: boolean;
};

const SIDEBAR_DEFAULT = 256;   /* 16rem, the width it has always been */
const SIDEBAR_MIN = 200;       /* below this the labels start truncating */
const SIDEBAR_MAX = 420;

export const Sidebar = () => {
  const { pathname, search } = useLocation();
  const agencyContext = useAgency();
  const { signOut, mode, displayName, user, agencyMembership } = useAuth();
  const { collapsed, toggleCollapsed, mobileOpen, setMobileOpen } =
    useSidebarState();
  const panel = usePanelWidth({
    id: "sidebar",
    userId: user?.id ?? null,
    defaultWidth: SIDEBAR_DEFAULT,
    min: SIDEBAR_MIN,
    max: SIDEBAR_MAX,
  });
  const sidebarWidth = {
    ...panel,
    nudge: (d: number) => panel.setWidth(panel.width + d),
  };

  const viewMode = agencyContext?.viewMode || "agency";
  const permissions = usePermissions();
  const agencyPermissions = useAgencyPermissions();
  /* ONE context, shared with RequireAgencyRoute — the menu and the door
     cannot disagree about who may be where, because they no longer each build
     the answer. It is also where View As substitutes the previewed person, so
     the menu is exact during a preview without this file knowing one exists
     (§37). */
  const { ctx: navContext } = useAgencyAccessContext();
  /* The company side of the sidebar is composed from the organization's hub:
     entitled, switched on, and permitted (rule 18). Home and My Work already
     sit at the top, so they are not repeated here. */
  const hubNav = useHubNavigation();
  const companyItems: NavItem[] = hubNav.modules
    .filter((m) => m.key !== "home" && m.key !== "my_work")
    .map((m) => ({ label: m.label, icon: HUB_MODULE_ICONS[m.key] ?? Building2, href: m.route.href }));
  const subAccounts = agencyContext?.subAccounts || [];
  const isProductOn = agencyContext?.isProductOn || (() => false);
  const activeSubAccount = agencyContext?.activeSubAccount || null;
  const activeOrganization = agencyContext?.activeOrganization || null;
  /**
   * Badges read the same hooks their pages read.
   *
   * They used to count `agencyContext.agencyWork`, which is the seed array —
   * so the chrome and the screens disagreed: My Work showed 2 while the page
   * said "nothing assigned", and Attention showed nothing while six items were
   * blocked or overdue. Both hooks are already cached under their own query
   * keys (`["work","mine",userId]`, `["work","attention"]`) and are the very
   * queries the pages use, so this adds no request — the sidebar simply reads
   * the answer the page already fetched.
   */
  const myWork = useMyWork();
  const attention = useAttention();

  const attentionCount = attention.items.length;
  /* The same `["channels"]` query the Communication screen uses, so the badge
     and the page render from ONE request rather than two (rule 14). An
     administrative row is never counted: being able to inspect a conversation
     is not a message waiting for you (§17). */
  const unreadMessages = totalUnread(useChannels().data ?? []);
  const unreadNotifications = useUnreadNotificationCount();
  const myWorkCount = myWork.items.length;

  const isActive = (href: string) => {
    if (href === "/app") return pathname === "/app";
    /* An organization's Home is its ID route; nothing nests under it. */
    if (href.startsWith("/app/org/")) return pathname === href;
    /*
     * Some entries differ only by a query string — the FundingOps record
     * surfaces are one page with the view in the URL. Comparing the path alone
     * would light all of them at once, and comparing nothing would light none:
     * either way the selected item stops being obvious, which rule 15 does not
     * allow.
     */
    const [hrefPath, hrefQuery] = href.split("?");
    if (hrefQuery) return pathname === hrefPath && search === `?${hrefQuery}`;
    if (pathname === hrefPath) return !search || !SEARCH_SCOPED.has(hrefPath);
    return pathname.startsWith(hrefPath + "/");
  };

  /* Paths whose sidebar entries are distinguished by their query string. The
     bare entry is active only when no view is selected. */
  const SEARCH_SCOPED = new Set(["/app/funding-deals"]);

  /* Agency HQ navigation — BES employees only */
  const agencyNavGroups: NavGroup[] = [
    {
      label: "HQ",
      items: [
        { label: "Home", icon: LayoutDashboard, href: "/app" },
        {
          label: "Organizations",
          icon: Building2,
          href: "/app/subaccounts",
          badge: subAccounts.length,
        },
        /*
         * BES PARTNERS sits beside Organizations, not inside it, because the
         * two answer different questions. Organizations = who buys the
         * software. BES Partners = who BES actually does work for. A company
         * can be either, both, or (model 3) a partner with no SaaS tenant at
         * all — which is why a partner is not a subclass of an organization.
         */
        { label: "BES Partners", icon: Handshake, href: "/app/bes-partners" },
        {
          label: "Attention Center",
          icon: AlertTriangle,
          href: "/app/attention",
          badge: attentionCount,
        },
        /* Directly under Attention Center, at Dee's request: it is opened more
           than anything else here. One conversation space — BES team channels,
           partner conversations and the organization channels shared with BES,
           each the same row its owner sees rather than a copy (0190, 0191). */
        {
          label: "Communication",
          icon: MessagesSquare,
          href: "/app/channels",
          badge: unreadMessages,
        },
      ],
    },
    {
      label: "My Work",
      items: [
        {
          label: "My Work",
          icon: ListTodo,
          href: "/app/my-work",
          badge: myWorkCount,
        },
        { label: "My Time", icon: Clock, href: "/app/my-time" },
        { label: "End of Day", icon: Timer, href: "/app/eod" },
        {
          label: "Notifications",
          icon: Bell,
          href: "/app/notifications",
          badge: unreadNotifications,
        },
      ],
    },
    {
      label: "Managed Operations",
      items: [
        { label: "CreditOps", icon: FileText, href: "/app/creditops" },
        { label: "FundingOps", icon: Landmark, href: "/app/fundingops" },
        { label: "BES CRM", icon: Workflow, href: "/app/bes-crm" },
        { label: "TalentOps", icon: UserCheck, href: "/app/talentops" },
      ],
    },
    {
      label: "Workforce",
      items: [
        /* Two doors, deliberately (Dee's People Hub doctrine): People is the
           person — profile, access, schedule, compensation, insights — and
           Teams is the structure. Workforce and HR dissolved into them. */
        { label: "Team Members", icon: Users, href: "/app/people" },
        { label: "Teams", icon: Network, href: "/app/teams" },
      ],
    },
    {
      label: "Management",
      items: [
        { label: "Reports", icon: BarChart3, href: "/app/reporting", permission: "reports.view" },
        /* BES's own money — partner receivables and agency expenses. Distinct
           from "Organization billing", which is SaaS subscription metering for
           customers. Same word, two revenue streams; naming them apart is how
           somebody stops opening the wrong one. */
        { label: "Finance", icon: Banknote, href: "/app/finance" },
        { label: "Organization billing", icon: Receipt, href: "/app/billing" },
        /* Compliance & Legal and Access preview were removed from the
           navigation on Dee's word, 2026-09-12: "I don't need access preview,
           and the compliance and legal should be removed here as well."
           Both routes still exist and still enforce their own access — this
           is a navigation change, not a deletion, so nothing that links to
           either breaks and neither becomes reachable by anybody new. */
      ],
    },
    {
      label: "Company",
      items: [
        { label: "Knowledge Base", icon: BookOpen, href: "/app/education" },
        { label: "Announcements", icon: Megaphone, href: "/app/announcements" },
        { label: "Calendar", icon: Calendar, href: "/app/calendar" },
      ],
    },
    {
      label: "System",
      items: [
        { label: "Agency Settings", icon: Settings, href: "/app/settings" },
        { label: "Support", icon: LifeBuoy, href: "/app/support" },
      ],
    },
  ];

  /* Organization navigation — product-aware, only activated modules.
     ONE Home: the organization dashboard at its ID route. CreditOps and
     FundingOps each expose their real workspace (the same components BES
     uses, scoped to this organization) and their reports. */
  const homeHref = activeOrganization?.publicId
    ? `/app/org/${activeOrganization.publicId}`
    : "/app";
  const subAccountNavGroups: NavGroup[] = [
    {
      label: activeSubAccount?.name || "Organization",
      items: [
        { label: "Home", icon: LayoutDashboard, href: homeHref },
        {
          label: "My Work",
          icon: ListTodo,
          href: "/app/my-work",
          badge: myWorkCount,
        },
        {
          label: "Workspaces",
          icon: LayoutGrid,
          href: "/app/workspaces",
          show: isProductOn("workspaces"),
        },
      ],
    },
    {
      /*
       * CLIENTS IS ORGANIZATION-LEVEL, not a CreditOps tab.
       *
       * The boundary Dee drew, and the one the data has enforced since C1:
       *
       *   Client      who the person is
       *   CreditOps   what credit repair work is being done for them
       *   FundingOps  what funding work is being done for them
       *
       * The same Alice can be a credit client, a funding client, both, or
       * neither yet. Putting Clients under CreditOps said the opposite — that
       * a person only exists once credit work starts — and made "she also
       * needs funding" look like a reason to create her again.
       *
       * Visible whenever the organization runs EITHER service, because the
       * client list is the relationship layer under both.
       */
      label: "Clients",
      show: isProductOn("creditOps") || isProductOn("fundingOps"),
      items: [
        { label: "All Clients", icon: Users, href: "/app/clients", permission: ["creditops.clients.view", "fundingops.files.view"] },
      ],
    },
    {
      label: "CreditOps",
      show: isProductOn("creditOps"),
      items: [
        { label: "Dashboard", icon: LayoutGrid, href: "/app/dispute-dashboard", permission: "creditops.clients.view" },
        /* Credit Cases is not "Clients moved back". All Clients answers "who
           are our customers"; this answers "who are we doing credit repair
           work for right now", which needs lifecycle, status and round —
           columns that have no business on a canonical person. */
        { label: "Credit Cases", icon: Users, href: "/app/creditops/cases", permission: "creditops.clients.view" },
        { label: "Workspace", icon: FileText, href: "/app/operations" },
        { label: "Reports", icon: BarChart3, href: "/app/reporting", permission: "reports.view" },
      ],
    },
    {
      label: "FundingOps",
      show: isProductOn("fundingOps"),
      items: [
        { label: "Dashboard", icon: LayoutGrid, href: "/app/funding-dashboard", permission: "fundingops.files.view" },
        { label: "Funding Files", icon: FolderOpen, href: "/app/funding-files", permission: "fundingops.files.view" },
        /* Lender Intelligence is a FundingOps domain capability in its own
           right — a catalogue with provenance, searched and matched against.
           It is not a task board and not a tab on one client. */
        { label: "Lender Intelligence", icon: Landmark, href: "/app/lenders", permission: "fundingops.files.view" },
        /* The cross-file record surfaces. Each is a thing a funding team goes
           looking for by name — "where are my offers?" — rather than a tab
           they should have to reach through Deals. They are one page with the
           view in the URL, not five pages: the records are one query each over
           the same canonical tables. */
        { label: "Deals", icon: Briefcase, href: "/app/funding-deals", permission: "fundingops.files.view" },
        { label: "Submissions", icon: Send, href: "/app/funding-deals?view=submissions", permission: "fundingops.files.view" },
        { label: "Offers", icon: BadgeDollarSign, href: "/app/funding-deals?view=offers", permission: "fundingops.files.view" },
        { label: "Funded Deals", icon: CircleDollarSign, href: "/app/funding-deals?view=funded", permission: "fundingops.files.view" },
        { label: "Commissions", icon: HandCoins, href: "/app/commissions", permission: "fundingops.commissions.view" },
        { label: "Renewals", icon: RefreshCw, href: "/app/funding-deals?view=renewals", permission: "fundingops.files.view" },
        /* The Workspace runs the PEOPLE doing the funding work — queues,
           assignments, hand-offs, SLA. Distinct from the domain screens
           above, which are the work itself. */
        { label: "Workspace", icon: FileText, href: "/app/funding-workspace" },
        { label: "Reports", icon: BarChart3, href: "/app/reporting", permission: "reports.view" },
      ],
    },
    {
      /* DIY Credit is a BES service the organization resells under its own
         brand — a module like CreditOps and FundingOps, gated by entitlement,
         never a "BES" portal link. */
      label: "DIY Credit",
      show: isProductOn("diyCredit"),
      items: [
        { label: "Client Portal", icon: Zap, href: "/app/diy-management" },
        { label: "Referrals", icon: Gift, href: "/app/diy-referrals" },
        { label: "Preview Portal", icon: UserCheck, href: "/diy" },
      ],
    },
    {
      label: "Production",
      items: [
        { label: "Time Tracking", icon: Clock, href: "/app/my-time" },
        { label: "End of Day", icon: Timer, href: "/app/eod" },
      ],
    },
    {
      /* Company: whatever this organization's hub actually has. */
      label: "Company",
      show: companyItems.length > 0,
      items: companyItems,
    },
    {
      label: "Organization",
      items: [
        /* Channels are the organization's own. Everyone who is in one may open
           it; the database decides which ones arrive, so no permission key
           gates the entry — an empty list is the honest answer for somebody in
           no channels. */
        {
          label: "Communication",
          icon: MessagesSquare,
          href: "/app/channels",
          badge: unreadMessages,
        },
        { label: "Commissions", icon: HandCoins, href: "/app/commissions", permission: "fundingops.commissions.view" },
        { label: "Compliance & Billing", icon: Scale, href: "/app/compliance", permission: "billing.view" },
        { label: "Settings", icon: Settings, href: "/app/settings", permission: SETTINGS_KEYS },
      ],
    },
  ];

  const navGroups: NavGroup[] =
    viewMode === "agency" ? agencyNavGroups : subAccountNavGroups;

  /* The menu as this person may actually see it, computed once.
     `visibleItems` is what gets rendered AND what gets warmed in the
     background — one list, so a screen can never be prefetched that the menu
     would not offer. Visibility here is presentation only; the route guard and
     row level security still decide what a screen serves (rule 1). */
  const visibleGroups = useMemo(
    () =>
      navGroups
        .map((group, index) => ({
          group,
          index,
          visibleItems:
            group.show === false
              ? []
              : group.items.filter((n) => {
                  if (n.show === false) return false;
                  if (n.permission && !permissions.can(n.permission)) return false;
                  /* Agency HQ items answer to the canonical navigation
                     authority, which the route guard also reads — so what the
                     menu shows and what the door opens cannot drift apart
                     (rule 3). Anything it does not define is left to the checks
                     above. */
                  if (viewMode === "agency") {
                    const spec = routeFor(n.href);
                    if (spec) {
                      const access = accessTo(spec, navContext);
                      return access === "allow" || access === "locked";
                    }
                  }
                  return true;
                }),
        }))
        .filter((g) => g.visibleItems.length > 0),
    [navGroups, permissions, viewMode, navContext],
  );

  /* Keyed by the menu's CONTENT, not by the array's identity: the permission
     helper is rebuilt on most renders, and scheduling a fresh idle pass every
     render would keep the browser busy doing nothing. */
  const visibleHrefs = visibleGroups
    .flatMap((g) => g.visibleItems.map((n) => n.href))
    .join("|");

  /* Warm those screens' code while the browser is idle, so the first click on
     each menu tab has nothing left to download. */
  useEffect(
    () => prefetchVisibleRoutes(visibleHrefs ? visibleHrefs.split("|") : []),
    [visibleHrefs],
  );

  /* Rail = collapsed on a large screen. The small-screen drawer is always
     full width, so a collapsed preference never produces an icon-only drawer. */
  const rail = collapsed && !mobileOpen;

  /* Escape closes the small-screen drawer. A drawer that covers the page
     needs a keyboard way out, and the backdrop is deliberately not one. */
  useEffect(() => {
    if (!mobileOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setMobileOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mobileOpen, setMobileOpen]);

  const itemClass = (active: boolean) =>
    cn(
      "relative flex items-center gap-3 rounded-lg py-2.5 text-sm font-medium transition-colors",
      rail ? "justify-center px-0" : "px-3",
      active
        ? "bg-sidebar-primary text-sidebar-primary-foreground"
        : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
    );

  const groupHeading = (label: string) =>
    rail ? (
      <div className="mx-2 mb-1.5 border-t border-sidebar-border" aria-hidden />
    ) : (
      <p className="px-3 pb-1.5 text-[10px] font-bold uppercase tracking-wider text-sidebar-foreground/70">
        {label}
      </p>
    );

  return (
    <>
      {mobileOpen && (
        /* The dim behind the drawer. NOT a button: as a full-screen
           `<button aria-label="Close menu">` it was a tab stop that painted
           the global focus outline around the whole viewport with nothing to
           point at, and it made "Close menu" the accessible name of two
           different controls. Escape and the × inside the drawer are the
           keyboard paths. */
        <div
          aria-hidden="true"
          onClick={() => setMobileOpen(false)}
          className="fixed inset-0 z-40 bg-black/40 lg:hidden"
        />
      )}
      <aside
        data-bes-chrome="dark"
        aria-label="Main menu"
        /* The dragged width applies only to the expanded desktop sidebar. A
           rail has one correct width, and the small-screen drawer is a drawer
           — dragging it would fight the gesture that opens it. */
        style={rail || mobileOpen ? undefined : { width: sidebarWidth.width }}
        className={cn(
          "relative shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground",
          /* No width transition while dragging, or the panel lags the pointer. */
          sidebarWidth.dragging ? "" : "transition-[width] duration-200",
          mobileOpen
            ? "fixed inset-y-0 left-0 z-50 flex w-64 shadow-xl lg:static lg:z-auto lg:shadow-none"
            : "hidden lg:flex",
          rail ? "lg:w-16" : "",
        )}
      >
        {!rail && !mobileOpen && (
          <PanelResizer
            label="Resize menu"
            dragging={sidebarWidth.dragging}
            onPointerDown={sidebarWidth.onPointerDown}
            onNudge={sidebarWidth.nudge}
            onReset={sidebarWidth.reset}
          />
        )}
        {mobileOpen && (
          <div className="flex items-center justify-end px-3 pt-3 lg:hidden">
            <button
              type="button"
              onClick={() => setMobileOpen(false)}
              aria-label="Close menu"
              className="rounded-lg p-2 text-sidebar-foreground/70 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )}
        {!rail && <SubAccountSwitcher />}

        <nav className={cn("flex-1 overflow-y-auto py-3", rail ? "px-2" : "px-3")}>
          {visibleGroups.map(({ group, index, visibleItems }) => {
            /* Keyed by position: the first group is titled with the
               organization's name, which is "Organization" until it loads and
               would then collide with the real "Organization" group. */
            return (
              <div key={index} className="pt-3 first:pt-0">
                {groupHeading(group.label)}
                {visibleItems.map((n) => {
                  const active = isActive(n.href);
                  return (
                    <PrefetchLink
                      key={n.href + n.label}
                      to={n.href}
                      title={rail ? n.label : undefined}
                      aria-label={rail ? n.label : undefined}
                      className={itemClass(active)}
                    >
                      <n.icon className="h-4 w-4 shrink-0" />
                      {!rail && <span className="flex-1 truncate">{n.label}</span>}
                      {n.badge !== undefined && n.badge > 0 && (
                        /* The active item's background IS Empire Gold, so the
                           amber badge measured 1.24:1 on it — the count was
                           invisible on exactly the row you were looking at. The
                           badge inverts on the active row (rule 15). In the rail
                           it sits on the icon's corner so the count survives. */
                        <span
                          className={cn(
                            "rounded-full border font-bold",
                            rail
                              ? "absolute right-0.5 top-0.5 px-1 text-[9px] leading-4"
                              : "px-2 py-0.5 text-[10px]",
                            active
                              ? "border-sidebar-primary-foreground/30 bg-sidebar-primary-foreground/15 text-sidebar-primary-foreground"
                              : "border-amber-500/30 bg-amber-500/20 text-amber-400",
                          )}
                        >
                          {n.badge}
                        </span>
                      )}
                    </PrefetchLink>
                  );
                })}
              </div>
            );
          })}

          {/* ── PORTALS ARE NOT INTERNAL WORKSPACES ────────────────────
              Dee's rule, 2026-09-12: "BES internal sidebar = internal
              operating workspaces. External portals/apps = accessible
              through their appropriate user experience, not permanently
              displayed in the BES internal sidebar."

              Partner Referral Portal, Outsourcing Portal and BES DIY Credit
              were links from this sidebar into customer-facing experiences.
              The links are gone; NOTHING else is. Every route, component,
              table, policy and permission behind them is untouched, and each
              is still reached at its own URL under its own guard — staff work
              partners through the canonical internal Partner Profile
              instead. */}

        </nav>

        <div className={cn("border-t border-sidebar-border", rail ? "p-2" : "p-3")}>
          <div className="space-y-1">
            {!rail && (
              <div className="truncate px-3 pb-1 text-[11px] text-sidebar-foreground/70">
                {displayName}
                {mode === "demo" ? " · demo session" : ""}
              </div>
            )}
            {mode === "live" ? (
              <button
                type="button"
                onClick={() => void signOut()}
                title={rail ? "Sign out" : undefined}
                className={cn(itemClass(false), "w-full")}
              >
                <LogOut className="h-4 w-4 shrink-0" />
                {!rail && "Sign out"}
              </button>
            ) : (
              <Link
                to="/"
                title={rail ? "Back to marketing site" : undefined}
                className={itemClass(false)}
              >
                <LogOut className="h-4 w-4 shrink-0" />
                {!rail && "Back to marketing site"}
              </Link>
            )}
            <button
              type="button"
              onClick={toggleCollapsed}
              aria-label={collapsed ? "Expand menu" : "Collapse menu"}
              aria-pressed={collapsed}
              title={collapsed ? "Expand menu" : "Collapse menu"}
              className={cn(itemClass(false), "hidden w-full lg:flex")}
            >
              {collapsed ? (
                <PanelLeftOpen className="h-4 w-4 shrink-0" />
              ) : (
                <PanelLeftClose className="h-4 w-4 shrink-0" />
              )}
              {!rail && "Collapse menu"}
            </button>
          </div>
        </div>
      </aside>
    </>
  );
};
