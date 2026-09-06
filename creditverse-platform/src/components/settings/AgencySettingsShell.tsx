import { useState, type ReactNode } from "react";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import type { PermissionKeyName } from "@/lib/auth/use-permission";

export interface SettingsGroup {
  label: string;
  items: { key: string; label: string; icon: React.ElementType; permission?: PermissionKeyName | readonly PermissionKeyName[] }[];
}

export const AgencySettingsShell = ({
  groups,
  active,
  onSelect,
  children,
  eyebrow = "BES HQ · Platform Control Center",
  title = "Agency Settings",
  description = "Manage the entire SaaS — branding, Organizations, products, people, operations, billing, integrations, security, and system controls.",
}: {
  groups: SettingsGroup[];
  active: string;
  onSelect: (key: string) => void;
  children: ReactNode;
  /** Header copy. Defaults describe the agency; the organization view passes its own. */
  eyebrow?: string;
  title?: string;
  description?: string;
}) => {
  const [query, setQuery] = useState("");
  const q = query.toLowerCase();

  return (
    <div className="mx-auto max-w-7xl">
      {/* Header */}
      <div className="border-b border-border/60 pb-5">
        <span className="text-xs font-medium text-muted-foreground">{eyebrow}</span>
        <h1 className="mt-1 text-2xl font-extrabold tracking-tight text-foreground md:text-3xl">
          {title}
        </h1>
        <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>
      </div>

      <div className="mt-6 flex flex-col gap-6 lg:flex-row">
        {/* Left settings nav */}
        <aside className="lg:w-64 lg:shrink-0">
          <div className="lg:sticky lg:top-6 space-y-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search settings…"
                className="pl-9"
              />
            </div>
            <nav className="space-y-5">
              {groups.map((g) => {
                const items = g.items.filter((i) =>
                  i.label.toLowerCase().includes(q),
                );
                if (!items.length) return null;
                return (
                  <div key={g.label}>
                    <p className="mb-1.5 px-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                      {g.label}
                    </p>
                    <div className="space-y-0.5">
                      {items.map((i) => (
                        <button
                          key={i.key}
                          onClick={() => onSelect(i.key)}
                          className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm transition ${
                            active === i.key
                              ? "bg-primary/10 font-semibold text-primary"
                              : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
                          }`}
                        >
                          <i.icon className="h-4 w-4 shrink-0" />
                          <span className="truncate">{i.label}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })}
            </nav>
          </div>
        </aside>

        {/* Content */}
        <div className="min-w-0 flex-1 space-y-6 pb-16">{children}</div>
      </div>
    </div>
  );
};
