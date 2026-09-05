import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Card frame every dashboard chart sits in: title row (with optional icon and right-side extra), then the body. */
export function ChartCard({ title, icon: Icon, extra, children, className }: { title: string; icon?: LucideIcon; extra?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cn("rounded-2xl border border-border bg-card p-4 shadow-sm", className)}>
      <div className="flex items-center justify-between gap-2">
        <h2 className="inline-flex items-center gap-2 text-sm font-bold text-foreground">{Icon && <Icon className="h-4 w-4 text-status-warning" />}{title}</h2>
        {extra}
      </div>
      <div className="mt-3">{children}</div>
    </section>
  );
}
