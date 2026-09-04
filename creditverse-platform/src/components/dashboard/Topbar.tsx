import { Link } from "react-router-dom";
import {
  Search,
  Bell,
  Plus,
  Building2,
  Layers,
  CheckCircle2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CopilotLauncher } from "@/components/copilot/CopilotLauncher";
import { useAgency } from "@/lib/agency-context";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/lib/auth/auth-context";

export const Topbar = () => {
  const agencyContext = useAgency();
  const { displayName, mode } = useAuth();

  const viewMode = agencyContext?.viewMode || "agency";
  const activeSubAccount = agencyContext?.activeSubAccount || null;
  const switchToAgencyView = agencyContext?.switchToAgencyView || (() => {});

  return (
    <header className="flex h-16 items-center justify-between gap-4 border-b border-border bg-background px-6">
      <div className="relative max-w-md flex-1 flex items-center gap-3">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder={
              viewMode === "agency"
                ? "Search sub-accounts, work orders, MRR..."
                : `Search ${activeSubAccount?.name || "sub-account"} clients...`
            }
            className="pl-9"
          />
        </div>
      </div>

      <div className="flex items-center gap-3">
        {/* View Mode Indicator Badge */}
        {viewMode === "agency" ? (
          <Badge className="bg-gradient-gold text-charcoal font-bold flex items-center gap-1.5 px-3 py-1">
            <Building2 className="h-3.5 w-3.5" /> Agency Owner HQ
            {mode === "demo" ? " · Demo" : ""}
          </Badge>
        ) : (
          <div className="flex items-center gap-2">
            <Badge
              variant="outline"
              className="border-emerald-500/40 text-status-success bg-emerald-500/10 font-medium flex items-center gap-1.5 px-3 py-1"
            >
              <CheckCircle2 className="h-3.5 w-3.5" /> Sub-Account:{" "}
              {activeSubAccount?.name}
            </Badge>
            <Button
              variant="ghost"
              size="sm"
              onClick={switchToAgencyView}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              <Layers className="h-3.5 w-3.5 mr-1" /> Return to Agency View
            </Button>
          </div>
        )}

        <CopilotLauncher />

        <Button
          size="sm"
          className="bg-emerald-700 hover:bg-emerald-800 text-white font-medium shadow-sm"
        >
          <Plus className="h-4 w-4 mr-1" />{" "}
          {viewMode === "agency" ? "Add Sub-Account" : "New Client"}
        </Button>

        {/* The dot was unconditional — it signalled "unread" permanently,
            with nothing behind it. The bell now simply opens the page. */}
        <Link
          to="/app/notifications"
          aria-label="Notifications"
          title="Notifications"
          className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          <Bell className="h-5 w-5" />
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
