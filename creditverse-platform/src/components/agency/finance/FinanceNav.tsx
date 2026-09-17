/**
 * The Finance module's own navigation.
 *
 * Dee, 2026-09-17: "When Finance is selected in the global sidebar, open a
 * Finance secondary navigation similar to our other operational modules."
 *
 * It renders only the sections this person may open — and that is presentation.
 * The security is Row Level Security and the owner-gated permission keys, which
 * refuse the same person whether or not a link was drawn for them.
 */
import { NavLink } from "react-router-dom";
import { cn } from "@/lib/utils";
import { GROUP_LABEL, type FinanceSection } from "@/lib/finance/finance-sections";

const GROUP_ORDER: FinanceSection["group"][] = ["workspace", "attention", "settings"];

export function FinanceNav({ sections }: { sections: FinanceSection[] }) {
  if (sections.length === 0) return null;

  return (
    <nav
      aria-label="Finance sections"
      /* A rail on a desktop, a scrolling strip on a phone. Dee: "Mobile:
         financial summary becomes horizontally scrollable/stacked." */
      className="mb-4 flex gap-1 overflow-x-auto border-b border-border pb-px lg:mb-0 lg:w-48 lg:shrink-0
                 lg:flex-col lg:gap-0 lg:overflow-visible lg:border-b-0 lg:border-r lg:pb-0 lg:pr-3"
    >
      {GROUP_ORDER.map((group) => {
        const inGroup = sections.filter((s) => s.group === group);
        if (inGroup.length === 0) return null;
        const heading = GROUP_LABEL[group];
        return (
          <div key={group} className="contents lg:block">
            {heading && (
              <p className="hidden px-2.5 pb-1 pt-4 text-[10px] font-bold uppercase tracking-wider text-muted-foreground lg:block">
                {heading}
              </p>
            )}
            {inGroup.map((s) => (
              <NavLink
                key={s.slug || "overview"}
                to={s.slug ? `/app/finance/${s.slug}` : "/app/finance"}
                end={s.slug === ""}
                className={({ isActive }) =>
                  cn(
                    "shrink-0 whitespace-nowrap rounded-lg px-2.5 py-1.5 text-xs font-semibold transition-colors",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    /* The strip marks the current item with an underline; the
                       rail with a filled pill. Both keep their contrast on
                       hover rather than washing the label out (rule 15). */
                    "border-b-2 lg:border-b-0",
                    isActive
                      ? "border-primary bg-primary/10 text-primary lg:bg-primary lg:text-primary-foreground"
                      : "border-transparent text-muted-foreground hover:bg-muted hover:text-foreground",
                  )
                }
              >
                {s.label}
              </NavLink>
            ))}
          </div>
        );
      })}
    </nav>
  );
}
