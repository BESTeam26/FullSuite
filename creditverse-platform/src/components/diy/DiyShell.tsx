import { type ReactNode } from "react";
import {
  LayoutDashboard,
  UploadCloud,
  Scale,
  FileText,
  Mail,
  TrendingUp,
  GraduationCap,
  FolderOpen,
  Settings,
  ShieldCheck,
  LogOut,
  GitFork,
} from "lucide-react";
import { useDiy, type DiyView } from "@/lib/diy/diy-context";
import { Link } from "react-router-dom";

const navItems: {
  key: DiyView;
  label: string;
  icon: typeof LayoutDashboard;
}[] = [
  { key: "dashboard", label: "My Credit", icon: LayoutDashboard },
  { key: "import", label: "Import Report", icon: UploadCloud },
  { key: "disputes", label: "My Disputes", icon: Scale },
  { key: "rounds", label: "Round Tracker", icon: GitFork },
  { key: "letters", label: "My Letters", icon: FileText },
  { key: "mail", label: "Mail Tracking", icon: Mail },
  { key: "progress", label: "My Progress", icon: TrendingUp },
  { key: "learn", label: "Credit Academy", icon: GraduationCap },
  { key: "documents", label: "My Documents", icon: FolderOpen },
  { key: "settings", label: "Settings", icon: Settings },
];

export const DiyShell = ({ children }: { children: ReactNode }) => {
  const { view, setView } = useDiy();

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Top bar */}
      <header className="sticky top-0 z-20 border-b border-border bg-card/95 backdrop-blur">
        <div className="flex h-16 items-center justify-between px-4 md:px-6">
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-gold text-charcoal">
              <ShieldCheck className="h-5 w-5" />
            </span>
            <div className="leading-tight">
              <p className="text-sm font-bold">BES DIY Credit</p>
              <p className="text-[10px] text-muted-foreground">
                Direct-to-consumer credit SaaS
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Link
              to="/"
              className="hidden text-xs text-muted-foreground hover:text-foreground sm:block"
            >
              BES home
            </Link>
            <span className="hidden text-xs text-muted-foreground sm:block">
              Signed in as{" "}
              <span className="font-medium text-foreground">John D.</span>
            </span>
            <button className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted">
              <LogOut className="h-3.5 w-3.5" /> Sign out
            </button>
          </div>
        </div>
      </header>

      <div className="flex">
        {/* Sidebar */}
        <aside className="sticky top-16 hidden h-[calc(100vh-4rem)] w-60 shrink-0 border-r border-border bg-card/40 p-3 md:block">
          <nav className="space-y-1">
            {navItems.map((n) => {
              const active = view === n.key;
              return (
                <button
                  key={n.key}
                  onClick={() => setView(n.key)}
                  className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors ${
                    active
                      ? "bg-gradient-gold text-charcoal shadow-glow"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground"
                  }`}
                >
                  <n.icon className="h-4 w-4" />
                  {n.label}
                </button>
              );
            })}
          </nav>
          <div className="mt-6 rounded-xl border border-border bg-card p-4">
            <p className="text-xs font-semibold text-status-warning">
              You're in control
            </p>
            <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
              Nothing is sent on your behalf without your review and approval.
              You own your facts.
            </p>
          </div>
        </aside>

        {/* Mobile nav */}
        <div className="flex w-full overflow-x-auto border-b border-border px-2 py-2 md:hidden">
          {navItems.map((n) => (
            <button
              key={n.key}
              onClick={() => setView(n.key)}
              className={`flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium ${
                view === n.key
                  ? "bg-gradient-gold text-charcoal"
                  : "text-muted-foreground"
              }`}
            >
              <n.icon className="h-3.5 w-3.5" />
              {n.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <main className="min-w-0 flex-1 p-4 md:p-8">{children}</main>
      </div>
    </div>
  );
};
