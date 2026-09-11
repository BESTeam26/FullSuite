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
  MoreHorizontal,
  Search,
  Sparkles,
  X,
} from "lucide-react";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useCopilot } from "@/lib/copilot-context";
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
  /* Phone header (Dee's mobile standard §6–§7): menu · context · search icon ·
     notifications · avatar. Everything else waits in one overflow menu, and
     search opens as its own full-width row instead of eating the header. */
  const [mobileSearch, setMobileSearch] = useState(false);
  const copilot = useCopilot();
  const unreadNotifications = useUnreadNotificationCount();
  const account = useOwnProfile();
  const avatars = useAvatarUrls([account.profile?.avatarPath]);
  const avatarUrl = account.profile?.avatarPath ? avatars.data?.[account.profile.avatarPath] : null;
  const myName = account.profile?.preferredName || account.profile?.fullName || displayName;
  const activeSubAccount = agencyContext?.activeSubAccount || null;
  const switchToAgencyView = agencyContext?.switchToAgencyView || (() => {});

  return (
    <header className="border-b border-border bg-background">
    <div className="flex h-14 items-center justify-between gap-2 px-3 md:h-16 md:gap-4 md:px-6">
      {/* Small screens only: the main menu lives in a drawer. */}
      <button
        type="button"
        onClick={() => setMobileOpen(true)}
        aria-label="Open menu"
        className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-border text-foreground transition-colors hover:bg-muted lg:hidden"
      >
        <Menu className="h-4 w-4" />
      </button>
      {/* Inline search over everything in the organization; results drop
          down under the field — no modal. On phones it is a row of its own. */}
      <div className="hidden min-w-0 flex-1 items-center md:flex">
        <GlobalSearch className="w-full max-w-md" />
      </div>
      <div className="min-w-0 flex-1 md:hidden" />

      <div className="flex shrink-0 items-center gap-1 md:gap-3">
        {viewMode === "agency" ? (
          <Badge className="bg-gradient-gold text-charcoal font-bold flex items-center gap-1.5 px-2.5 py-1 md:px-3" title="Agency Owner HQ">
            <Building2 className="h-3.5 w-3.5" /> <span className="hidden md:inline">Agency Owner HQ</span><span className="md:hidden">HQ</span>
            {mode === "demo" ? " · Demo" : ""}
          </Badge>
        ) : isAgencyStaff ? (
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

        {/* Desktop keeps every control in the row. */}
        <div className="hidden items-center gap-3 md:flex">
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
        </div>

        {/* Phone: search as an icon that opens its own row. */}
        <button
          type="button"
          onClick={() => setMobileSearch((v) => !v)}
          aria-label={mobileSearch ? "Close search" : "Search"}
          aria-expanded={mobileSearch}
          className="inline-flex h-10 w-10 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:hidden"
        >
          {mobileSearch ? <X className="h-5 w-5" /> : <Search className="h-5 w-5" />}
        </button>

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
          className="relative inline-flex h-10 w-10 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          <Bell className="h-5 w-5" />
          {unreadNotifications > 0 && (
            <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold leading-none text-primary-foreground">
              {unreadNotifications > 99 ? "99+" : unreadNotifications}
            </span>
          )}
        </Link>

        {/* Phone: the secondary controls, one menu. Authorization is unchanged —
            each item is the same action as its desktop control. */}
        <div className="md:hidden">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button type="button" aria-label="More"
                className="inline-flex h-10 w-10 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                <MoreHorizontal className="h-5 w-5" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuItem className="min-h-11" onClick={() => copilot.setOpen(true)}>
                <Sparkles className="mr-2 h-4 w-4" /> Ask Lina
              </DropdownMenuItem>
              <DropdownMenuItem className="min-h-11" onClick={() => (viewMode === "agency" ? navigate("/app/subaccounts") : setNewClientOpen(true))}>
                <Plus className="mr-2 h-4 w-4" /> {viewMode === "agency" ? "Add Organization" : "New Client"}
              </DropdownMenuItem>
              <DropdownMenuItem className="min-h-11" onClick={() => navigate("/app/settings?section=account")}>
                <Building2 className="mr-2 h-4 w-4" /> My account
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <div className="flex items-center gap-2">
          <Avatar name={myName} url={avatarUrl} size="md" />
          <div className="hidden text-sm leading-tight md:block">
            <p className="font-medium">
              {viewMode === "agency"
                ? myName
                : activeSubAccount?.ownerName}
            </p>
            <p className="text-xs text-muted-foreground">
              {viewMode === "agency"
                ? "BES HQ"
                : activeSubAccount?.name}
            </p>
          </div>
        </div>
      </div>
    </div>
    {/* Phone search row: full width, same component, same authorization. */}
    {mobileSearch && (
      <div className="border-t border-border px-3 py-2 md:hidden">
        <GlobalSearch className="w-full" />
      </div>
    )}
    <NewClientDialog open={newClientOpen} onOpenChange={setNewClientOpen} />
    </header>
  );
};
