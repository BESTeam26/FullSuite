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
  Workflow,
  UserCheck,
  Users,
  Network,
  Briefcase,
  BarChart3,
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
} from "lucide-react";
import { cn } from "@/lib/utils";
import { SubAccountSwitcher } from "@/components/dashboard/SubAccountSwitcher";
import { useMyWork, useAttention } from "@/lib/data/use-work";
import { useUnreadNotificationCount } from "@/lib/data/use-notifications";
import { useAuth } from "@/lib/auth/auth-context";

type NavItem = {
  label: string;
  icon: React.ElementType;
  href: string;
  badge?: number;
  show?: boolean;
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

  const viewMode = agencyContext?.viewMode || "agency";
  const subAccounts = agencyContext?.subAccounts || [];
  const isProductOn = agencyContext?.isProductOn || (() => false);
  const activeSubAccount = agencyContext?.activeSubAccount || null;
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
    return pathname === href || pathname.startsWith(href + "/");
  };

  /* Agency HQ navigation — BES employees only */
  const agencyNavGroups: NavGroup[] = [
    {
      label: "HQ",
      items: [
        { label: "Home", icon: LayoutDashboard, href: "/app" },
        {
          label: "Sub-Accounts",
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
        { label: "Reports", icon: BarChart3, href: "/app/reporting" },
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

  /* Sub-Account navigation — product-aware, only activated modules */
  const subAccountNavGroups: NavGroup[] = [
    {
      label: activeSubAccount?.name || "Sub-Account",
      items: [
        { label: "Home", icon: LayoutDashboard, href: "/app" },
        {
          label: "Clients & Leads",
          icon: Users,
          href: "/app/clients",
          show: isProductOn("creditOps") || isProductOn("fundingOps"),
        },
        { label: "My Work", icon: ListTodo, href: "/app/my-work" },
        {
          label: "Workspaces",
          icon: LayoutGrid,
          href: "/app/workspaces",
          show: isProductOn("workspaces"),
        },
      ],
    },
    {
      label: "CreditOps",
      show: isProductOn("creditOps"),
      items: [
        { label: "Operations", icon: FileText, href: "/app/operations" },
        { label: "Reports", icon: BarChart3, href: "/app/reporting" },
      ],
    },
    {
      label: "FundingOps",
      show: isProductOn("fundingOps"),
      items: [
        { label: "Pipeline", icon: Landmark, href: "/app/metro2" },
        { label: "Reports", icon: BarChart3, href: "/app/reporting" },
      ],
    },
    {
      label: "Operations",
      items: [
        { label: "Time Tracking", icon: Clock, href: "/app/my-time" },
        { label: "End of Day", icon: Timer, href: "/app/eod" },
      ],
    },
    {
      label: "Organization",
      items: [
        { label: "Compliance & Billing", icon: Scale, href: "/app/compliance" },
        { label: "Knowledge Base", icon: BookOpen, href: "/app/education" },
        { label: "Settings", icon: Settings, href: "/app/settings" },
      ],
    },
  ];

  const navGroups: NavGroup[] =
    viewMode === "agency" ? agencyNavGroups : subAccountNavGroups;

  return (
    <aside
      data-bes-chrome="dark"
      className="hidden w-64 shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground lg:flex"
    >
      <SubAccountSwitcher />

      <nav className="flex-1 overflow-y-auto px-3 py-3">
        {navGroups.map((group) => {
          if (group.show === false) return null;
          const visibleItems = group.items.filter((n) => n.show !== false);
          if (visibleItems.length === 0) return null;
          return (
            <div key={group.label} className="pt-3 first:pt-0">
              <p className="px-3 pb-1.5 text-[10px] font-bold uppercase tracking-wider text-sidebar-foreground/70">
                {group.label}
              </p>
              {visibleItems.map((n) => {
                const active = isActive(n.href);
                return (
                  <Link
                    key={n.href + n.label}
                    to={n.href}
                    className={cn(
                      "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors relative",
                      active
                        ? "bg-sidebar-primary text-sidebar-primary-foreground"
                        : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                    )}
                  >
                    <n.icon className="h-4 w-4 shrink-0" />
                    <span className="flex-1 truncate">{n.label}</span>
                    {n.badge !== undefined && n.badge > 0 && (
                      /* The active item's background IS Empire Gold, so the
                         amber badge measured 1.24:1 on it — the count was
                         invisible on exactly the row you were looking at. The
                         badge inverts on the active row (rule 15). */
                      <span
                        className={cn(
                          "rounded-full border px-2 py-0.5 text-[10px] font-bold",
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

        <div className="pt-4">
          <p className="px-3 pb-1.5 text-[10px] font-bold uppercase tracking-wider text-sidebar-foreground/70">
            Portals & Apps
          </p>
          <Link
            to="/affiliate"
            className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-sidebar-foreground/70 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
          >
            <UserCheck className="h-4 w-4" />
            Partner Referral Portal
          </Link>
          <Link
            to="/outsourcing"
            className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-sidebar-foreground/70 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
          >
            <Briefcase className="h-4 w-4" />
            Outsourcing Portal
          </Link>
          <Link
            to="/diy"
            className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-sidebar-foreground/70 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
          >
            <Zap className="h-4 w-4 text-amber-400" />
            BES DIY Credit
          </Link>
        </div>
      </nav>

      <div className="border-t border-sidebar-border p-3">
        <div className="space-y-1">
          <div className="px-3 pb-1 text-[11px] text-sidebar-foreground/70 truncate">
            {displayName}
            {mode === "demo" ? " · demo session" : ""}
          </div>
          {mode === "live" ? (
            <button
              type="button"
              onClick={() => void signOut()}
              className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-sidebar-foreground/70 hover:bg-sidebar-accent w-full"
            >
              <LogOut className="h-4 w-4" /> Sign out
            </button>
          ) : (
            <Link
              to="/"
              className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-sidebar-foreground/70 hover:bg-sidebar-accent"
            >
              <LogOut className="h-4 w-4" /> Back to marketing site
            </Link>
          )}
        </div>
      </div>
    </aside>
  );
};
