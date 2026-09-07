/**
 * Small pieces every partner tab shares.
 *
 * Here rather than repeated in ten files so a label, a pill and an empty state
 * look the same on every tab, and so changing one changes all of them.
 */
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function Detail({ label, value, hint, className }: {
  label: string;
  value: ReactNode;
  hint?: string;
  className?: string;
}) {
  const empty = value === null || value === undefined || value === "";
  return (
    <div className={className}>
      <dt className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 text-sm text-foreground">
        {empty ? <span className="italic text-muted-foreground">Not recorded</span> : value}
      </dd>
      {hint && <p className="mt-0.5 text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

export function Pill({ tone, children }: { tone: string; children: ReactNode }) {
  return (
    <span className={cn("inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-bold", tone)}>
      {children}
    </span>
  );
}

export function Empty({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="py-8 text-center">
      <p className="text-sm font-medium text-foreground">{title}</p>
      {hint && <p className="mx-auto mt-1 max-w-md text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}
