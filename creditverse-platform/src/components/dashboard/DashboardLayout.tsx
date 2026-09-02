import { Outlet } from "react-router-dom";
import { Sidebar } from "@/components/dashboard/Sidebar";
import { Topbar } from "@/components/dashboard/Topbar";
import { CopilotProvider } from "@/lib/copilot-context";
import { CopilotPanel } from "@/components/copilot/CopilotPanel";
import { useSeo } from "@/lib/use-seo";

export const DashboardLayout = () => {
  useSeo({
    title: "BES Operations",
    description: "BES operations workspace.",
    canonical: "/app",
    noindex: true,
  });
  return (
    <CopilotProvider>
      <div className="flex h-screen overflow-hidden bg-background">
        <Sidebar />
        <div className="flex flex-1 flex-col overflow-hidden">
          <Topbar />
          <main className="flex-1 overflow-y-auto">
            <Outlet />
          </main>
        </div>
      </div>
      <CopilotPanel />
    </CopilotProvider>
  );
};
