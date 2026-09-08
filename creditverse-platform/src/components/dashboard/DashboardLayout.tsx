import { Suspense } from "react";
import { Outlet } from "react-router-dom";
import { Sidebar } from "@/components/dashboard/Sidebar";
import { SidebarStateProvider } from "@/components/dashboard/sidebar-state";
import { Topbar } from "@/components/dashboard/Topbar";
import { CopilotProvider } from "@/lib/copilot-context";
import { CopilotPanel } from "@/components/copilot/CopilotPanel";
import { useSeo } from "@/lib/use-seo";
import { ViewAsProvider } from "@/lib/agency/view-as-context";
import { useOwnAccessContext } from "@/lib/agency/use-access-context";
import { ViewAsBanner } from "@/components/agency/view-as/ViewAsBanner";
import { RequireAgencyRoute } from "@/components/auth/RequireAgencyRoute";

export const DashboardLayout = () => {
  useSeo({
    title: "BES Operations",
    description: "BES operations workspace.",
    canonical: "/app",
    noindex: true,
  });
  return (
    <CopilotProvider>
      <AgencyShell />
      <CopilotPanel />
    </CopilotProvider>
  );
};

/**
 * The shell, inside the View As provider.
 *
 * Its own component because the provider needs the person's OWN role and
 * capabilities to fall back to, and reading those from the context it
 * provides would be circular.
 *
 * The banner is ABOVE the sidebar and the content, full width, so a preview
 * cannot be scrolled out of sight (§36: "Never make preview subtle").
 */
const AgencyShell = () => {
  const own = useOwnAccessContext();
  return (
    <ViewAsProvider ownRole={own.role} ownCan={own.can}>
      <SidebarStateProvider>
        <div className="flex h-screen flex-col overflow-hidden bg-background">
          <ViewAsBanner />
          <div className="flex min-h-0 flex-1 overflow-hidden">
            <Sidebar />
            <div className="flex flex-1 flex-col overflow-hidden">
              <Topbar />
              <main className="flex-1 overflow-y-auto">
                {/* ── WHY THE BOUNDARIES ARE HERE AND NOT AROUND THE SHELL ──
                    Both of these used to sit above `DashboardLayout`: one
                    Suspense wrapping the whole route tree in App.tsx, and
                    `RequireAgencyRoute` wrapping this component. So the first
                    visit to any tab suspended the ENTIRE tree — sidebar,
                    topbar and all — and painted a bare skeleton on an empty
                    background for as long as the page's chunk took to load.
                    It read as a broken app, because a navigation that removes
                    the navigation is indistinguishable from a crash.

                    Inside the shell, the same two states become ordinary: the
                    menu stays, the page area shows a skeleton or a refusal,
                    and a refused person can click somewhere else instead of
                    staring at a dead page. Authorization is unchanged — the
                    guard reads the same spec the menu does, and the database
                    still decides what rows anybody receives. */}
                <RequireAgencyRoute>
                  <Suspense fallback={<PageFallback />}>
                    <Outlet />
                  </Suspense>
                </RequireAgencyRoute>
              </main>
            </div>
          </div>
        </div>
      </SidebarStateProvider>
    </ViewAsProvider>
  );
};

/**
 * The page area while a lazy chunk arrives.
 *
 * Deliberately the same shape as the content it replaces — a heading, a row
 * of tiles, a table — so the layout does not jump when the real page lands
 * (rule 15: "Loading preserves layout"). It sits INSIDE the shell, so the
 * navigation never disappears.
 */
const PageFallback = () => (
  <div className="animate-pulse p-6 md:p-8" aria-busy="true" aria-label="Loading this page">
    <div className="mb-6 h-7 w-56 rounded-lg bg-muted" />
    <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="h-24 rounded-xl border border-border bg-card" />
      ))}
    </div>
    <div className="h-64 rounded-xl border border-border bg-card" />
  </div>
);
