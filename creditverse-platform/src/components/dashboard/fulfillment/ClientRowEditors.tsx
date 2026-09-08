/**
 * Cells you can edit in the row, the way Dee's dispute board works.
 *
 * ── EVERY EDIT LEAVES A TRAIL ──────────────────────────────────────────────
 *
 * Changing a round, a processed date or a due date writes the record, and the
 * database trigger on `fulfillment_clients` writes the activity entry. The
 * screen never writes the log itself — that is how a timeline ends up claiming
 * a change that did not happen, which is exactly the bug the "Move to X"
 * selector had.
 *
 * ── DAYS TO UPDATE IS DERIVED ──────────────────────────────────────────────
 *
 * Due date minus today, computed on render. Storing it would be wrong by
 * tomorrow — the same reason ClickUp keeps its own "Days Active" as a formula.
 */
import { useState } from "react";
import { Loader2 } from "lucide-react";
import { OpsSelect } from "@/components/ui/ops-select";
import { formatDate } from "@/lib/format-date";
import { cn } from "@/lib/utils";

/** Whole days from today to a due date. Negative once it has passed. */
export function daysUntil(due: string | null | undefined): number | null {
  if (!due) return null;
  const at = Date.parse(`${String(due).slice(0, 10)}T00:00:00Z`);
  if (!Number.isFinite(at)) return null;
  const today = Date.parse(`${new Date().toISOString().slice(0, 10)}T00:00:00Z`);
  return Math.round((at - today) / 86_400_000);
}

/** A date cell that turns into a date input when clicked. */
export function EditableDateCell({ value, onSave, label, tone }: {
  value: string | null;
  onSave: (next: string | null) => Promise<void>;
  label: string;
  tone?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);

  if (editing) {
    return (
      <input
        type="date"
        autoFocus
        defaultValue={value ? String(value).slice(0, 10) : ""}
        aria-label={label}
        disabled={saving}
        className="w-full rounded border border-primary bg-background px-1 py-0.5 text-[11px] text-foreground focus:outline-none"
        onBlur={() => !saving && setEditing(false)}
        onKeyDown={async (e) => {
          if (e.key === "Escape") { setEditing(false); return; }
          if (e.key !== "Enter") return;
          const next = (e.currentTarget as HTMLInputElement).value || null;
          setSaving(true);
          try { await onSave(next); } finally { setSaving(false); setEditing(false); }
        }}
      />
    );
  }

  return (
    <button
      type="button"
      onClick={() => setEditing(true)}
      aria-label={`${label} — click to change`}
      className={cn(
        "w-full rounded px-1 py-0.5 text-left text-[11px] transition-colors hover:bg-muted",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
        tone ?? "text-foreground",
      )}
    >
      {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : value ? formatDate(value) : <span className="text-muted-foreground">—</span>}
    </button>
  );
}

/** A dropdown cell — the round, and anything else with a fixed vocabulary. */
export function EditableChoiceCell({ value, options, onSave, label }: {
  value: string;
  options: readonly string[];
  onSave: (next: string) => Promise<void>;
  label: string;
}) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);

  if (editing) {
    return (
      <OpsSelect
        autoFocus
        openOnMount
        size="inline"
        aria-label={label}
        value={value}
        options={options as string[]}
        onDismiss={() => setEditing(false)}
        onValueChange={async (v) => {
          setSaving(true);
          try { await onSave(v); } finally { setSaving(false); setEditing(false); }
        }}
      />
    );
  }

  return (
    <button
      type="button"
      onClick={() => setEditing(true)}
      aria-label={`${label} — click to change`}
      className="w-full rounded px-1 py-0.5 text-left text-[11px] font-semibold text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
    >
      {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : value}
    </button>
  );
}

/** Days to the next update. Read-only because it is arithmetic, not a field. */
export function DaysToUpdateCell({ dueAt }: { dueAt: string | null }) {
  const days = daysUntil(dueAt);
  if (days === null) return <span className="text-muted-foreground">—</span>;
  return (
    <span className={cn(
      "font-semibold tabular-nums",
      days < 0 ? "text-status-danger" : days <= 3 ? "text-amber-700" : "text-foreground",
    )}>
      {days < 0 ? `${Math.abs(days)}d over` : days === 0 ? "today" : `${days}d`}
    </span>
  );
}
