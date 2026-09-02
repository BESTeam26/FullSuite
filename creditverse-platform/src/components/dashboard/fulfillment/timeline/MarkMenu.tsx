/**
 * Mark selector popover — ClickUp / Slack-style colored tags.
 * Lets a user attach a colored "mark" (Important, Question, Follow-up,
 * Resolved, Idea) to any comment.
 */
import { useState, useRef, useEffect } from "react";
import { Tag } from "lucide-react";
import { COMMENT_MARKS } from "@/lib/fulfillment/creditops-client-store";
import { cn } from "@/lib/utils";

export function MarkMenu({
  current,
  onPick,
}: {
  current?: string;
  onPick: (id: string | undefined) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node))
        setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "rounded p-1.5 hover:bg-muted hover:text-foreground",
          current && "text-primary",
        )}
        title="Mark comment"
      >
        <Tag className="h-4 w-4" />
      </button>
      {open && (
        <div className="absolute bottom-full left-0 z-20 mb-1 w-40 rounded-lg border border-border bg-popover p-1.5 shadow-lg">
          <p className="px-1 pb-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
            Mark as
          </p>
          {COMMENT_MARKS.map((m) => (
            <button
              key={m.id}
              onClick={() => {
                onPick(current === m.id ? undefined : m.id);
                setOpen(false);
              }}
              className={cn(
                "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-[11px] font-medium hover:bg-muted",
                current === m.id && "bg-muted",
              )}
            >
              <span className={cn("h-2.5 w-2.5 rounded-full", m.dot)} />
              {m.label}
            </button>
          ))}
          {current && (
            <button
              onClick={() => {
                onPick(undefined);
                setOpen(false);
              }}
              className="mt-1 w-full rounded-md px-2 py-1.5 text-[11px] font-medium text-destructive hover:bg-destructive/10"
            >
              Clear mark
            </button>
          )}
        </div>
      )}
    </div>
  );
}
