import { useAgency } from "@/lib/agency-context";
import { BrandLogo } from "@/components/brand/BrandLogo";
import { useAuth } from "@/lib/auth/auth-context";
import { useState } from "react";
import {
  ChevronDown,
  Sparkles,
  CheckCircle2,
  Search,
  Pin,
  Home,
  Layers,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { mayEnterOrganizations } from "@/lib/agency/navigation";
import { orgDivisionLabel } from "@/lib/agency/division-label";
import { useAgencyAccessContext } from "@/lib/agency/use-access-context";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export const SubAccountSwitcher = () => {
  const agencyContext = useAgency();
  const [subSearch, setSubSearch] = useState("");

  const viewMode = agencyContext?.viewMode || "agency";
  const activeSubAccountId = agencyContext?.activeSubAccountId || null;
  const activeSubAccount = agencyContext?.activeSubAccount || null;
  const subAccounts = agencyContext?.subAccounts || [];
  const switchToAgencyView = agencyContext?.switchToAgencyView || (() => {});
  /* Only BES staff have an agency view; organization users never see a way
     "back" to one (rule 16: they must not reach BES internal operations). */
  const { isAgencyStaff } = useAuth();
  /* The one authorization context the menu and the route guard already run
     on — no second resolution, and View As substitutes here too (rule 14). */
  const { ctx: navContext, loading: accessLoading } = useAgencyAccessContext();
  const switchToSubAccount = agencyContext?.switchToSubAccount || (() => {});
  const togglePinSubAccount = agencyContext?.togglePinSubAccount || (() => {});

  const filteredSubs = subAccounts.filter(
    (s) =>
      s.name.toLowerCase().includes(subSearch.toLowerCase()) ||
      s.code.toLowerCase().includes(subSearch.toLowerCase()) ||
      s.ownerName.toLowerCase().includes(subSearch.toLowerCase()),
  );
  const pinnedSubs = filteredSubs.filter((s) => s.isPinned);
  const otherSubs = filteredSubs.filter((s) => !s.isPinned);

  /* Who this workspace currently IS. Drawn identically whether or not it can
     be switched, so the sidebar keeps its branded header for everybody
     (rule 8) and only the affordance to leave differs. */
  const identity = (
    <div className="flex items-center gap-2.5 min-w-0">
      <BrandLogo
        preferOrganization={viewMode === "subaccount"}
        fallbackText={
          viewMode === "agency"
            ? "BES"
            : activeSubAccount?.code.slice(0, 2) || "SA"
        }
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-sidebar-accent overflow-hidden border border-amber-500/30"
      />
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-bold text-sidebar-foreground">
          {viewMode === "agency"
            ? "BES Agency HQ"
            : activeSubAccount?.name || "Organization"}
        </p>
        <p className="truncate text-[10px] text-sidebar-foreground/60 flex items-center gap-1">
          {viewMode === "agency" ? (
            <span className="text-amber-400 font-semibold flex items-center gap-0.5">
              <Sparkles className="h-2.5 w-2.5" /> Agency HQ View
            </span>
          ) : (
            <span className="text-emerald-400 font-semibold">
              {activeSubAccount?.plan}
            </span>
          )}
        </p>
      </div>
    </div>
  );

  const returnToHq = viewMode === "subaccount" && isAgencyStaff && (
    <button
      onClick={switchToAgencyView}
      className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-lg border border-amber-500/30 bg-amber-500/10 py-1.5 text-[11px] font-semibold text-amber-400 hover:bg-amber-500/20 transition-colors"
    >
      <Layers className="h-3 w-3" /> Return to Agency HQ
    </button>
  );

  /* A BES agent, a team lead and a division manager are not offered a
     customer organization to step into: the switcher asks the same question
     as the Organizations door they are already refused (rule 3 — the menu and
     the door agree, one function). An organization's own people keep it, as
     it is how somebody in two organizations moves between them; they never
     saw the HQ entry anyway. */
  /* Until the answer is known, offer nothing. `isAgencyStaff` turns true at
     the same moment the role arrives, so gating on it alone would paint the
     chevron for a split second and then take it away — revealing a control is
     fine, withdrawing one somebody may already have reached for is not
     (rule 15). Same principle as `agencyPermissions.loading`: unknown means
     no, so nothing flashes into view. */
  if (accessLoading || (isAgencyStaff && !mayEnterOrganizations(navContext))) {
    return (
      <div className="border-b border-sidebar-border p-3">
        <div className="flex w-full items-center rounded-xl border border-sidebar-border bg-sidebar-accent/30 p-2.5 text-left">
          {identity}
        </div>
        {/* Still offered: a deep link can land them inside an organization,
            and no way back is a dead end, not a boundary. */}
        {returnToHq}
      </div>
    );
  }

  return (
    <div className="border-b border-sidebar-border p-3">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button className="flex w-full items-center justify-between rounded-xl border border-sidebar-border bg-sidebar-accent/50 p-2.5 text-left transition-colors hover:bg-sidebar-accent">
            {identity}
            <ChevronDown className="h-4 w-4 shrink-0 text-sidebar-foreground/50" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="start"
          className="w-64 bg-sidebar text-sidebar-foreground border-sidebar-border"
        >
          <DropdownMenuLabel className="text-[10px] uppercase tracking-wider text-sidebar-foreground/50">
            Switch Context
          </DropdownMenuLabel>
          {isAgencyStaff && (
          <DropdownMenuItem
            onClick={switchToAgencyView}
            className={cn(
              "flex items-center gap-2.5 py-2 cursor-pointer font-medium text-xs",
              viewMode === "agency" &&
                "bg-sidebar-accent text-amber-400 font-bold",
            )}
          >
            <span className="flex h-6 w-6 items-center justify-center rounded bg-gradient-gold text-charcoal font-black text-[10px]">
              HQ
            </span>
            <div className="flex-1">
              <p>BES Agency HQ</p>
              <p className="text-[10px] text-sidebar-foreground/50">
                Master Platform Owner
              </p>
            </div>
            {viewMode === "agency" && (
              <CheckCircle2 className="h-4 w-4 text-amber-400" />
            )}
          </DropdownMenuItem>
          )}

          <DropdownMenuSeparator className="bg-sidebar-border" />
          <div className="px-3 py-1 flex items-center justify-between">
            <span className="text-[10px] uppercase tracking-wider text-sidebar-foreground/50 font-bold">
              Organizations ({subAccounts.length})
            </span>
            {viewMode === "subaccount" && isAgencyStaff && (
              <button
                onClick={switchToAgencyView}
                className="text-[10px] text-amber-400 font-semibold hover:underline flex items-center gap-1"
              >
                <Home className="h-3 w-3" /> Back to HQ
              </button>
            )}
          </div>

          <div className="px-2 pb-2">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-sidebar-foreground/40" />
              <input
                autoFocus
                value={subSearch}
                onChange={(e) => setSubSearch(e.target.value)}
                onKeyDown={(e) => e.stopPropagation()}
                placeholder="Search organizations..."
                className="w-full rounded-md border border-sidebar-border bg-sidebar/80 py-1.5 pl-8 pr-2 text-xs text-sidebar-foreground placeholder:text-sidebar-foreground/40 focus:outline-none focus:ring-1 focus:ring-amber-500/50"
              />
            </div>
          </div>

          <div className="max-h-64 overflow-y-auto space-y-2 px-1">
            {filteredSubs.length === 0 ? (
              <p className="px-2 py-4 text-center text-[11px] text-sidebar-foreground/40">
                No organizations match "{subSearch}"
              </p>
            ) : (
              <>
                {pinnedSubs.length > 0 && (
                  <div>
                    <p className="px-2 py-1 text-[9px] font-bold text-amber-400/80 uppercase tracking-widest flex items-center gap-1">
                      <Pin className="h-2.5 w-2.5" /> Pinned
                    </p>
                    {pinnedSubs.map((sub) => {
                      const active =
                        viewMode === "subaccount" &&
                        activeSubAccountId === sub.id;
                      return (
                        <div
                          key={sub.id}
                          className={cn(
                            "group flex items-center justify-between rounded-md px-2 py-1.5 text-xs transition-colors hover:bg-sidebar-accent/70 cursor-pointer",
                            active &&
                              "bg-sidebar-accent text-emerald-400 font-bold",
                          )}
                          onClick={() => switchToSubAccount(sub.id)}
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded bg-amber-500/20 text-amber-400 font-bold text-[10px]">
                              {sub.code.slice(0, 2)}
                            </span>
                            <div className="truncate">
                              <p className="truncate text-xs font-medium leading-none">
                                {sub.name}
                              </p>
                              {/* The plan is what they bought; the services
                                  are what BES is actually doing for them,
                                  derived from live engagements (Dee,
                                  2026-09-22). */}
                              <p className="text-[10px] text-sidebar-foreground/50 truncate mt-0.5">
                                {sub.plan}
                                {sub.besServices.length > 0 && (
                                  <span className="text-emerald-400/80">
                                    {" · "}{sub.besServices.map((x) => orgDivisionLabel(x) ?? x).join(" · ")}
                                  </span>
                                )}
                              </p>
                            </div>
                          </div>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              togglePinSubAccount(sub.id);
                            }}
                            className="text-amber-400 hover:text-amber-300 p-0.5"
                            title="Unpin"
                          >
                            <Pin className="h-3 w-3 fill-amber-400" />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
                <div>
                  {pinnedSubs.length > 0 && (
                    <p className="px-2 py-1 mt-1 text-[9px] font-bold text-sidebar-foreground/40 uppercase tracking-widest">
                      All Accounts
                    </p>
                  )}
                  {otherSubs.map((sub) => {
                    const active =
                      viewMode === "subaccount" &&
                      activeSubAccountId === sub.id;
                    return (
                      <div
                        key={sub.id}
                        className={cn(
                          "group flex items-center justify-between rounded-md px-2 py-1.5 text-xs transition-colors hover:bg-sidebar-accent/70 cursor-pointer",
                          active &&
                            "bg-sidebar-accent text-emerald-400 font-bold",
                        )}
                        onClick={() => switchToSubAccount(sub.id)}
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded bg-emerald-500/20 text-emerald-400 font-bold text-[10px]">
                            {sub.code.slice(0, 2)}
                          </span>
                          <div className="truncate">
                            <p className="truncate text-xs font-medium leading-none">
                              {sub.name}
                            </p>
                            {/* What BES is actually fulfilling, derived from
                                live engagements — the reason this
                                organization is in the list at all. */}
                            <p className="text-[10px] text-sidebar-foreground/50 truncate mt-0.5">
                              {sub.plan} · {sub.activeClients} clients
                            </p>
                            {sub.besServices.length > 0 && (
                              <p className="mt-0.5 flex items-center gap-1 truncate text-[10px] font-semibold text-emerald-400">
                                <span aria-hidden className="h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-400" />
                                Active Fulfillment
                                <span className="truncate font-normal text-sidebar-foreground/50">
                                  {sub.besServices.map((x) => orgDivisionLabel(x) ?? x).join(" · ")}
                                </span>
                              </p>
                            )}
                          </div>
                        </div>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            togglePinSubAccount(sub.id);
                          }}
                          className="opacity-0 group-hover:opacity-100 text-sidebar-foreground/40 hover:text-amber-400 p-0.5 transition-opacity"
                          title="Pin"
                        >
                          <Pin className="h-3 w-3" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        </DropdownMenuContent>
      </DropdownMenu>

      {returnToHq}
    </div>
  );
};
