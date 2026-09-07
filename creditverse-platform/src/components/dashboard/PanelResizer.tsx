/**
 * The drag handle on a resizable panel's edge.
 *
 * Keyboard-operable, because a mouse-only resize is not a resize for everyone:
 * arrow keys nudge, Home resets. The hit area is wider than the visible line —
 * a 1px target is a target nobody hits.
 */
import { cn } from "@/lib/utils";

export function PanelResizer({
  onPointerDown,
  onNudge,
  onReset,
  dragging,
  label,
}: {
  onPointerDown: (e: React.PointerEvent) => void;
  onNudge: (delta: number) => void;
  onReset: () => void;
  dragging: boolean;
  label: string;
}) {
  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label={label}
      tabIndex={0}
      onPointerDown={onPointerDown}
      onKeyDown={(e) => {
        if (e.key === "ArrowLeft") { e.preventDefault(); onNudge(-16); }
        else if (e.key === "ArrowRight") { e.preventDefault(); onNudge(16); }
        else if (e.key === "Home") { e.preventDefault(); onReset(); }
      }}
      onDoubleClick={onReset}
      title={`${label} — drag, or use the arrow keys`}
      className={cn(
        /* Hit area 9px wide, visual line 1px. Sits over the border. */
        "group absolute inset-y-0 -right-1 z-20 hidden w-2.5 cursor-col-resize touch-none lg:block",
        "focus-visible:outline-none",
      )}
    >
      <span
        aria-hidden
        className={cn(
          "absolute inset-y-0 left-1/2 w-px -translate-x-1/2 transition-colors",
          dragging ? "bg-primary" : "bg-transparent group-hover:bg-primary/60 group-focus-visible:bg-primary",
        )}
      />
    </div>
  );
}
