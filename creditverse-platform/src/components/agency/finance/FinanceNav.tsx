/**
 * The Finance sections, on a small screen.
 *
 * Dee, 2026-09-17: the sections belong in the dark global sidebar, nested
 * under Finance — which is where they are. But below `lg` that sidebar is a
 * drawer behind a hamburger, so moving between Payments and Attention would
 * mean opening a drawer every time. This is the same list as a scrolling strip
 * for exactly those widths, and it disappears the moment the sidebar is
 * visible: two navigations on screen at once is one too many.
 */
import { NavLink } from "react-router-dom";
import { cn } from "@/lib/utils";
import type { FinanceSection } from "@/lib/finance/finance-sections";

export function FinanceNav({ sections }: { sections: FinanceSection[] }) {
  if (sections.length === 0) return null;

  return (
    <nav
      aria-label="Finance sections"
      className="mb-4 flex gap-1 overflow-x-auto border-b border-border pb-px lg:hidden"
    >
      {sections.map((s) => (
        <NavLink
          key={s.slug || "overview"}
          to={s.slug ? `/app/finance/${s.slug}` : "/app/finance"}
          end={s.slug === ""}
          className={({ isActive }) =>
            cn(
              "shrink-0 whitespace-nowrap border-b-2 px-2.5 py-1.5 text-xs font-semibold transition-colors",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              isActive
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )
          }
        >
          {s.label}
        </NavLink>
      ))}
    </nav>
  );
}
