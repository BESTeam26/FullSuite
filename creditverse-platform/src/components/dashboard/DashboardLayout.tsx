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
                <Outlet />
              </main>
            </div>
          </div>
        </div>
      </SidebarStateProvider>
    </ViewAsProvider>
  );
};
