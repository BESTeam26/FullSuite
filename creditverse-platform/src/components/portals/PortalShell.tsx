import { Link, useLocation } from "react-router-dom";
import { ArrowLeft, ShieldCheck, LucideIcon } from "lucide-react";
import { RoleSwitcher } from "@/components/portals/RoleSwitcher";
import { CopilotLauncher } from "@/components/copilot/CopilotLauncher";
import { cn } from "@/lib/utils";

export interface PortalNavItem {
  label: string;
  href: string;
  icon: LucideIcon;
}

interface PortalShellProps {
  title: string;
  subtitle: string;
  icon: LucideIcon;
  gradientClass: string;
  nav: PortalNavItem[];
  children: React.ReactNode;
}

export const PortalShell = ({
  title,
  subtitle,
  icon: Icon,
  gradientClass,
  nav,
  children,
}: PortalShellProps) => {
  const { pathname } = useLocation();

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <aside className="hidden w-64 shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground lg:flex">
        <div className="flex h-16 items-center gap-2 border-b border-sidebar-border px-6">
          <span
            className={cn(
              "flex h-8 w-8 items-center justify-center rounded-lg text-white",
              gradientClass,
            )}
          >
            <Icon className="h-4 w-4" />
          </span>
          <div>
            <span className="block text-sm font-semibold text-white">
              {title}
            </span>
            <span className="block text-[11px] text-sidebar-foreground/60">
              {subtitle}
            </span>
          </div>
        </div>
        <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
          {nav.map((n) => {
            const active = pathname === n.href;
            return (
              <Link
                key={n.href}
                to={n.href}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                  active
                    ? "bg-sidebar-primary text-sidebar-primary-foreground"
                    : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                )}
              >
                <n.icon className="h-4 w-4" />
                {n.label}
              </Link>
            );
          })}
        </nav>
        <div className="border-t border-sidebar-border p-3">
          <Link
            to="/app"
            className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-sidebar-foreground/70 hover:bg-sidebar-accent"
          >
            <ArrowLeft className="h-4 w-4" /> Back to Agency OS
          </Link>
        </div>
      </aside>

      <div className="flex flex-1 flex-col overflow-hidden">
        <header className="flex h-16 items-center justify-between gap-4 border-b border-border bg-background px-6">
          <div className="flex items-center gap-2 lg:hidden">
            <Icon className="h-5 w-5 text-emerald-600" />
            <span className="font-semibold">{title}</span>
          </div>
          <span className="hidden items-center gap-1.5 text-xs text-muted-foreground lg:flex">
            <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />
            Scoped access — this portal only shows data permitted for your role
          </span>
          <div className="flex items-center gap-3">
            <RoleSwitcher />
            <CopilotLauncher />
          </div>
        </header>
        <main className="flex-1 overflow-y-auto p-6 md:p-8">{children}</main>
      </div>
    </div>
  );
};
