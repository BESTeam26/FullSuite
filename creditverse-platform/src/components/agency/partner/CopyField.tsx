import { useEffect, useRef, useState } from "react";
import { Check, Copy } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * One value with a copy button — the thing the team does twenty times a day.
 *
 * The value stays selectable text rather than living only inside the button,
 * because `navigator.clipboard` is unavailable on an insecure origin and in
 * some locked-down browsers. When the write fails the field says so and the
 * text is still there to select by hand; it never silently does nothing.
 */
export const CopyField = ({
  label,
  value,
  mono = true,
  className,
}: {
  label: string;
  value: string;
  mono?: boolean;
  className?: string;
}) => {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");
  const timer = useRef<number>();

  useEffect(() => () => window.clearTimeout(timer.current), []);

  const copy = async () => {
    window.clearTimeout(timer.current);
    try {
      await navigator.clipboard.writeText(value);
      setState("copied");
    } catch {
      setState("failed");
    }
    timer.current = window.setTimeout(() => setState("idle"), 2500);
  };

  return (
    <div className={cn("min-w-0", className)}>
      <div className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div className="flex items-center gap-1">
        <span
          className={cn(
            "min-w-0 flex-1 truncate text-xs text-foreground",
            mono && "font-mono",
          )}
          title={value}
        >
          {value}
        </span>
        <button
          type="button"
          onClick={() => void copy()}
          aria-label={`Copy ${label}`}
          className={cn(
            "shrink-0 rounded-md p-1.5 text-muted-foreground transition-colors",
            "hover:bg-muted hover:text-foreground",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
          )}
        >
          {state === "copied" ? (
            <Check className="h-3.5 w-3.5 text-status-success" />
          ) : (
            <Copy className="h-3.5 w-3.5" />
          )}
        </button>
      </div>
      {/* Reserved height, so confirming a copy never nudges the row below. */}
      <div className="h-4 text-[10px]" aria-live="polite">
        {state === "copied" && <span className="text-status-success">Copied</span>}
        {state === "failed" && (
          <span className="text-status-warning">
            Could not copy — select the text above
          </span>
        )}
      </div>
    </div>
  );
};
