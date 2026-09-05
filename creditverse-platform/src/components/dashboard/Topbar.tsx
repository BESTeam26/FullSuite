import { useUnreadNotificationCount } from "@/lib/data/use-notifications";
import { Link } from "react-router-dom";
import {
  Bell,
  Plus,
  Building2,
  Layers,
  Menu,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { CopilotLauncher } from "@/components/copilot/CopilotLauncher";
import { useAgency } from "@/lib/agency-context";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/lib/auth/auth-context";
import { useSidebarState } from "@/components/dashboard/sidebar-state";
import { GlobalSearch } from "@/components/dashboard/GlobalSearch";

export const Topbar = () => {
  const agencyContext = useAgency();
  const { displayName, mode, isAgencyStaff } = useAuth();
  const { setMobileOpen } = useSidebarState();

  const viewMode = agencyContext?.viewMode || "agency";
  const unreadNotifications = useUnreadNotificationCount();
  const activeSubAccount = agencyContext?.activeSubAccount || null;
  const switchToAgencyView = agencyContext?.switchToAgencyView || (() => {});

  return (
    <header className="flex h-16 items-center justify-between gap-3 border-b border-border bg-background px-4 md:gap-4 md:px-6">
      {/* Small screens only: the main menu lives in a drawer. */}
      <button
        type="button"
        onClick={() => setMobileOpen(true)}
        aria-label="Open menu"
        className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border text-foreground transition-colors hover:bg-muted lg:hidden"
      >
        <Menu className="h-4 w-4" />
      </button>
      {/* Inline search over everything in the organization; results drop
          down under the field — no modal. */}
      <div className="flex min-w-0 flex-1 items-center">
        <GlobalSearch className="w-full max-w-md" />
      </div>

      <div className="flex items-center gap-3">
        {/* View Mode Indicator Badge */}
        {viewMode === "agency" ? (
          <Badge className="bg-gradient-gold text-charcoal font-bold flex items-center gap-1.5 px-3 py-1">
            <Building2 className="h-3.5 w-3.5" /> Agency Owner HQ
            {mode === "demo" ? " · Demo" : ""}
          </Badge>
        ) : isAgencyStaff ? (
          /* Only BES staff have an agency view to return to. The Organization
             ID lives in Settings, not in the chrome. */
          <Button
            variant="ghost"
            size="sm"
            onClick={switchToAgencyView}
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            <Layers className="h-3.5 w-3.5 mr-1" /> Return to Agency View
          </Button>
        ) : null}

        <CopilotLauncher />

        <Button
          size="sm"
          className="bg-emerald-700 hover:bg-emerald-800 text-white font-medium shadow-sm"
        >
          <Plus className="h-4 w-4 mr-1" />{" "}
          {viewMode === "agency" ? "Add Organization" : "New Client"}
        </Button>

        {/* The dot means exactly one thing: unread rows in `notifications`
            for this user, under their own RLS. Same query as the sidebar. */}
        <Link
          to="/app/notifications"
          aria-label={
            unreadNotifications > 0
              ? `Notifications, ${unreadNotifications} unread`
              : "Notifications"
          }
          title="Notifications"
          className="relative rounded-lg p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          <Bell className="h-5 w-5" />
          {unreadNotifications > 0 && (
            <span className="absolute right-1.5 top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold leading-none text-primary-foreground">
              {unreadNotifications > 99 ? "99+" : unreadNotifications}
            </span>
          )}
        </Link>

        <div className="flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-gold font-bold text-charcoal text-sm">
            {viewMode === "agency"
              ? "HQ"
              : activeSubAccount?.code.slice(0, 2) || "SA"}
          </div>
          <div className="hidden text-sm leading-tight sm:block">
            <p className="font-medium">
              {viewMode === "agency"
                ? displayName
                : activeSubAccount?.ownerName}
            </p>
            <p className="text-xs text-muted-foreground">
              {viewMode === "agency"
                ? "Blessed Empire Services HQ"
                : activeSubAccount?.name}
            </p>
          </div>
        </div>
      </div>
    </header>
  );
};
