/**
 * The "?" in the top bar: a short explanation of the page in view, from
 * lib/help/page-help. One control for every screen, so help is always in the
 * same place and never in the way.
 */
import { useLocation } from "react-router-dom";
import { CircleHelp } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { helpFor } from "@/lib/help/page-help";

export function PageHelp() {
  const { pathname } = useLocation();
  const help = helpFor(pathname);
  if (!help) return null;
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={`How ${help.title} works`}
          title="How this page works"
          className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          <CircleHelp className="h-5 w-5" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 space-y-2 text-sm">
        <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">How this page works</p>
        <p className="text-base font-bold text-foreground">{help.title}</p>
        <p className="text-muted-foreground">{help.summary}</p>
        <ol className="list-decimal space-y-1 pl-5 text-foreground">
          {help.steps.map((s) => <li key={s}>{s}</li>)}
        </ol>
        {help.tip && <p className="rounded-lg bg-primary/5 px-3 py-2 text-xs text-foreground"><span className="font-bold">Good to know.</span> {help.tip}</p>}
      </PopoverContent>
    </Popover>
  );
}
