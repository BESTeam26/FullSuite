import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";

/* Shared building blocks for Agency Settings sections */

export const SectionCard = ({
  icon: Icon,
  title,
  description,
  action,
  children,
}: {
  icon: React.ElementType;
  title: string;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
}) => (
  <div className="rounded-2xl border border-border bg-card p-6">
    <div className="flex items-start justify-between gap-4">
      <div className="flex items-start gap-3">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <Icon className="h-4.5 w-4.5" />
        </span>
        <div>
          <h3 className="font-semibold text-foreground">{title}</h3>
          {description && (
            <p className="mt-0.5 text-xs text-muted-foreground max-w-xl">
              {description}
            </p>
          )}
        </div>
      </div>
      {action}
    </div>
    <div className="mt-5">{children}</div>
  </div>
);

export const Field = ({
  label,
  children,
  hint,
}: {
  label: string;
  children: ReactNode;
  hint?: string;
}) => (
  <div>
    <label className="text-xs font-medium text-muted-foreground">{label}</label>
    <div className="mt-1.5">{children}</div>
    {hint && <p className="mt-1 text-[11px] text-muted-foreground">{hint}</p>}
  </div>
);

export const ToggleRow = ({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description?: string;
  checked: boolean;
  onChange: () => void;
}) => (
  <div className="flex items-center justify-between rounded-xl border border-border p-4">
    <div>
      <p className="text-sm font-medium text-foreground">{label}</p>
      {description && (
        <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
      )}
    </div>
    <Switch checked={checked} onCheckedChange={onChange} />
  </div>
);

export const StatusBadge = ({ state }: { state: string }) => {
  const tone: Record<string, string> = {
    Active: "bg-emerald-500/10 text-emerald-700 border-emerald-500/30",
    Trial: "bg-blue-500/10 text-blue-700 border-blue-500/30",
    Suspended: "bg-amber-500/10 text-amber-700 border-amber-500/30",
    Cancelled: "bg-red-500/10 text-red-700 border-red-500/30",
    Connected: "bg-emerald-500/10 text-emerald-700 border-emerald-500/30",
    "Needs Attention": "bg-amber-500/10 text-amber-700 border-amber-500/30",
    Disconnected: "bg-red-500/10 text-red-700 border-red-500/30",
  };
  return (
    <Badge
      variant="outline"
      className={`text-[10px] ${tone[state] ?? "bg-muted text-muted-foreground border-border"}`}
    >
      {state}
    </Badge>
  );
};

export const SaveBar = ({
  saved,
  onSave,
}: {
  saved: boolean;
  onSave: () => void;
}) => (
  <div className="sticky bottom-0 z-10 flex items-center justify-end gap-3 border-t border-border bg-card/95 px-6 py-3 backdrop-blur">
    {saved && (
      <span className="text-xs font-medium text-emerald-600">Saved ✓</span>
    )}
    <button
      onClick={onSave}
      className="rounded-lg bg-gradient-green px-4 py-2 text-sm font-semibold text-white shadow-sm hover:opacity-90"
    >
      Save changes
    </button>
  </div>
);
