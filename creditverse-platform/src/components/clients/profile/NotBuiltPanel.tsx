import { Construction } from "lucide-react";

/**
 * A tab that is part of the record's design but has nothing behind it yet.
 *
 * Shown rather than hidden, and honest about why (rule 12: no dishonest
 * controls). An empty panel that looks functional is worse than a missing one;
 * a panel that says what is missing is a specification.
 */
export const NotBuiltPanel = ({
  title,
  what,
  missing,
}: {
  title: string;
  what: string;
  missing: string;
}) => (
  <div className="rounded-2xl border border-dashed border-border bg-muted/30 p-6">
    <h2 className="flex items-center gap-2 text-sm font-bold text-foreground">
      <Construction className="h-4 w-4 text-muted-foreground" /> {title} — not built yet
    </h2>
    <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">{what}</p>
    <p className="mt-3 text-xs text-muted-foreground">
      <span className="font-semibold text-foreground">Still needed:</span> {missing}.
    </p>
  </div>
);
