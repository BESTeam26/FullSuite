import { useUnreadNotificationCount } from "@/lib/data/use-notifications";
import { Link, useNavigate } from "react-router-dom";
import { useState } from "react";
import { NewClientDialog } from "@/components/clients/NewClientDialog";
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
import { ViewAsPicker } from "@/components/agency/view-as/ViewAsBanner";
import { PageHelp } from "@/components/dashboard/PageHelp";
import { Avatar } from "@/components/common/Avatar";
import { useAvatarUrls, useOwnProfile } from "@/lib/data/use-account";

export const Topbar = () => {
  const agencyContext = useAgency();
  const { displayName, mode, isAgencyStaff } = useAuth();
  const { setMobileOpen } = useSidebarState();

  const viewMode = agencyContext?.viewMode || "agency";
  const navigate = useNavigate();
  const [newClientOpen, setNewClientOpen] = useState(false);
  const unreadNotifications = useUnreadNotificationCount();
  const account = useOwnProfile();
  const avatars = useAvatarUrls([account.profile?.avatarPath]);
  const avatarUrl = account.profile?.avatarPath ? avatars.data?.[account.profile.avatarPath] : null;
  const myName = account.profile?.preferredName || account.profile?.fullName || displayName;
  const activeSubAccount = agencyContext?.activeSubAccount || null;
  const switchToAgencyView = agencyContext?.switchToAgencyView || (() => {});

  return (
    <header className="flex h-16 items-center justify-between gap-2 overflow-hidden border-b border-border bg-background px-3 md:gap-4 md:px-6">
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

      <div className="flex shrink-0 items-center gap-1.5 md:gap-3">
        {/* View Mode Indicator Badge */}
        {viewMode === "agency" ? (
          <Badge className="bg-gradient-gold text-charcoal font-bold flex items-center gap-1.5 px-3 py-1" title="Agency Owner HQ">
            <Building2 className="h-3.5 w-3.5" /> <span className="hidden md:inline">Agency Owner HQ</span><span className="md:hidden">HQ</span>
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
            aria-label="Return to Agency View"
            title="Return to Agency View"
          >
            <Layers className="h-3.5 w-3.5 md:mr-1" /> <span className="hidden md:inline">Return to Agency View</span>
          </Button>
        ) : null}

        {/* Only a previewer sees this, and only when not already previewing —
            the banner owns Exit (§36). */}
        <ViewAsPicker />

        <CopilotLauncher />

        <Button
          size="sm"
          onClick={() => (viewMode === "agency" ? navigate("/app/subaccounts") : setNewClientOpen(true))}
          className="bg-emerald-700 hover:bg-emerald-800 text-white font-medium shadow-sm"
          aria-label={viewMode === "agency" ? "Add Organization" : "New Client"}
          title={viewMode === "agency" ? "Add Organization" : "New Client"}
        >
          <Plus className="h-4 w-4 sm:mr-1" />
          <span className="hidden sm:inline">{viewMode === "agency" ? "Add Organization" : "New Client"}</span>
        </Button>

        <PageHelp />

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

        <div className="hidden items-center gap-2 sm:flex">
          <Avatar name={myName} url={avatarUrl} size="md" />
          <div className="hidden text-sm leading-tight sm:block">
            <p className="font-medium">
              {viewMode === "agency"
                ? myName
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
          <NewClientDialog open={newClientOpen} onOpenChange={setNewClientOpen} />
</header>
  );
};
