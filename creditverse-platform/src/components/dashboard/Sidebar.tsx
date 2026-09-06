import { useAgency } from "@/lib/agency-context";
import { Link, useLocation } from "react-router-dom";
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
  Briefcase,
  BarChart3,
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
import { useUnreadNotificationCount } from "@/lib/data/use-notifications";
import { useAuth } from "@/lib/auth/auth-context";
import { usePermissions, type PermissionKeyName } from "@/lib/auth/use-permission";
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

export const Sidebar = () => {
  const { pathname } = useLocation();
  const agencyContext = useAgency();
  const { signOut, mode, displayName } = useAuth();
  const { collapsed, toggleCollapsed, mobileOpen, setMobileOpen } =
    useSidebarState();

  const viewMode = agencyContext?.viewMode || "agency";
  const permissions = usePermissions();
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
  const unreadNotifications = useUnreadNotificationCount();
  const myWorkCount = myWork.items.length;

  const isActive = (href: string) => {
    if (href === "/app") return pathname === "/app";
    /* An organization's Home is its ID route; nothing nests under it. */
    if (href.startsWith("/app/org/")) return pathname === href;
    return pathname === href || pathname.startsWith(href + "/");
  };

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
        {
          label: "Attention Center",
          icon: AlertTriangle,
          href: "/app/attention",
          badge: attentionCount,
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
        { label: "People", icon: Users, href: "/app/people" },
        { label: "Teams", icon: Network, href: "/app/teams" },
        { label: "Workforce", icon: Briefcase, href: "/app/workforce" },
      ],
    },
    {
      label: "Management",
      items: [
        { label: "Reports", icon: BarChart3, href: "/app/reporting", permission: "reports.view" },
        { label: "Billing & Revenue", icon: Receipt, href: "/app/billing" },
        { label: "Compliance & Legal", icon: Scale, href: "/app/compliance" },
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
        /* Lender intelligence is a FundingOps capability in its own right —
           searched and matched against, not a tab on one client. */
        { label: "Lenders", icon: Landmark, href: "/app/lenders", permission: "fundingops.files.view" },
        { label: "Deals", icon: Briefcase, href: "/app/funding-deals", permission: "fundingops.files.view" },
        { label: "Workspace", icon: FileText, href: "/app/metro2" },
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
        { label: "Channels", icon: MessagesSquare, href: "/app/channels" },
        { label: "Commissions", icon: HandCoins, href: "/app/commissions", permission: "fundingops.commissions.view" },
        { label: "Compliance & Billing", icon: Scale, href: "/app/compliance", permission: "billing.view" },
        { label: "Settings", icon: Settings, href: "/app/settings", permission: SETTINGS_KEYS },
      ],
    },
  ];

  const navGroups: NavGroup[] =
    viewMode === "agency" ? agencyNavGroups : subAccountNavGroups;

  /* Rail = collapsed on a large screen. The small-screen drawer is always
     full width, so a collapsed preference never produces an icon-only drawer. */
  const rail = collapsed && !mobileOpen;

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
        <button
          type="button"
          aria-label="Close menu"
          onClick={() => setMobileOpen(false)}
          className="fixed inset-0 z-40 bg-black/40 lg:hidden"
        />
      )}
      <aside
        data-bes-chrome="dark"
        aria-label="Main menu"
        className={cn(
          "shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground transition-[width] duration-200",
          mobileOpen
            ? "fixed inset-y-0 left-0 z-50 flex w-64 shadow-xl lg:static lg:z-auto lg:shadow-none"
            : "hidden lg:flex",
          rail ? "lg:w-16" : "lg:w-64",
        )}
      >
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
          {navGroups.map((group, index) => {
            if (group.show === false) return null;
            const visibleItems = group.items.filter((n) => n.show !== false && (!n.permission || permissions.can(n.permission)));
            if (visibleItems.length === 0) return null;
            /* Keyed by position: the first group is titled with the
               organization's name, which is "Organization" until it loads and
               would then collide with the real "Organization" group. */
            return (
              <div key={index} className="pt-3 first:pt-0">
                {groupHeading(group.label)}
                {visibleItems.map((n) => {
                  const active = isActive(n.href);
                  return (
                    <Link
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
                    </Link>
                  );
                })}
              </div>
            );
          })}

          {/* BES portals are agency chrome. An organization sees only its own
              modules (rule 16: no path into BES internal operations). */}
          {viewMode === "agency" && (
          <div className="pt-4">
            {groupHeading("Portals & Apps")}
            <Link
              to="/affiliate"
              title={rail ? "Partner Referral Portal" : undefined}
              className={itemClass(false)}
            >
              <UserCheck className="h-4 w-4 shrink-0" />
              {!rail && "Partner Referral Portal"}
            </Link>
            <Link
              to="/outsourcing"
              title={rail ? "Outsourcing Portal" : undefined}
              className={itemClass(false)}
            >
              <Briefcase className="h-4 w-4 shrink-0" />
              {!rail && "Outsourcing Portal"}
            </Link>
            <Link
              to="/diy"
              title={rail ? "BES DIY Credit" : undefined}
              className={itemClass(false)}
            >
              <Zap className="h-4 w-4 shrink-0 text-amber-400" />
              {!rail && "BES DIY Credit"}
            </Link>
          </div>
          )}
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
