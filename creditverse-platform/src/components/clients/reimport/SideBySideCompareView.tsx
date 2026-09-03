import { Button } from "@/components/ui/button";
import { RotateCcw } from "lucide-react";
import type { ClassifiedItem } from "@/lib/credit-classification";

export function SideBySideCompareView({
  classified,
  onBackToReport,
  onStartOver,
}: {
  classified: ClassifiedItem[];
  onBackToReport: () => void;
  onStartOver: () => void;
}) {
  return (
    <div className="rounded-2xl border border-border bg-card p-6">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-semibold">Side-by-side: Previous vs. New Report</h2>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={onBackToReport}>
            Back to report
          </Button>
          <Button size="sm" onClick={onStartOver} variant="outline">
            <RotateCcw className="h-3.5 w-3.5 text-muted-foreground mr-1" />{" "}
            Start over
          </Button>
        </div>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">
        Nothing has been saved yet. Compare the previous snapshot against the
        newly imported data before deciding whether to save changes.
      </p>
      <div className="mt-5 grid gap-4 md:grid-cols-2">
        <div className="rounded-xl border border-border p-4">
          <p className="mb-2 text-xs font-semibold uppercase text-muted-foreground">
            Previous report — Jul 28, 2026
          </p>
          <ul className="space-y-1.5 text-sm">
            {classified.slice(0, 6).map((i) => (
              <li
                key={i.id}
                className="flex items-center justify-between border-b border-border/50 pb-1"
              >
                <span>{i.name}</span>
                <span className="text-xs text-muted-foreground">
                  {i.status}
                </span>
              </li>
            ))}
          </ul>
        </div>
        <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-4">
          <p className="mb-2 text-xs font-semibold uppercase text-status-success">
            New report — Aug 29, 2026
          </p>
          <ul className="space-y-1.5 text-sm">
            {classified.slice(0, 6).map((i) => (
              <li
                key={i.id}
                className="flex items-center justify-between border-b border-border/50 pb-1"
              >
                <span>{i.name}</span>
                <span className="text-xs font-medium text-status-success">
                  {i.category}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
