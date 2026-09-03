import { Database, FlaskConical } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Labels where a panel's numbers come from. Demo data must never be presented
 * as if it were real operational data.
 */
export const DataSourceBadge = ({
  source,
  className,
}: {
  source: "live" | "demo";
  className?: string;
}) => (
  <span
    className={cn(
      "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
      source === "live"
        ? "border-emerald-500/30 bg-emerald-500/10 text-status-success"
        : "border-amber-500/30 bg-amber-500/10 text-status-warning",
      className,
    )}
    title={
      source === "live"
        ? "Live data from the database"
        : "Sample data — no backend connected"
    }
  >
    {source === "live" ? (
      <>
        <Database className="h-3 w-3" /> Live
      </>
    ) : (
      <>
        <FlaskConical className="h-3 w-3" /> Sample data
      </>
    )}
  </span>
);
